/**
 * Excel formula parser: tokenizer + Pratt (precedence-climbing) parser.
 *
 * Precedence (high → low): `:` (range) > unary `-`/`+` > `%` (postfix) > `^` > `* /` > `+ -` > `&`
 * > comparisons. Binary operators are left-associative (Excel: `2^3^2 = 64`, `-2^2 = 4`).
 */

export const MAX_ROW = 1048576; // 1-based max
export const MAX_COL = 16384; // 1-based max

export type Ast =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "err"; v: string }
  | { t: "empty" }
  /** row/col 0-based; sheet null = the formula's own sheet. */
  | { t: "ref"; sheet: string | null; row: number; col: number }
  | { t: "range"; sheet: string | null; r1: number; c1: number; r2: number; c2: number }
  | { t: "name"; name: string }
  | { t: "neg"; a: Ast }
  | { t: "plus"; a: Ast }
  | { t: "pct"; a: Ast }
  | { t: "bin"; op: BinOp; a: Ast; b: Ast }
  | { t: "call"; name: string; args: Ast[] };

export type BinOp = "+" | "-" | "*" | "/" | "^" | "&" | "=" | "<>" | "<" | ">" | "<=" | ">=";

export class FormulaParseError extends Error {
  constructor(
    message: string,
    readonly es: string,
  ) {
    super(message);
    this.name = "FormulaParseError";
  }
}

type Tok =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "err"; v: string }
  | { k: "sheet"; v: string }
  | { k: "cell"; row: number; col: number }
  | { k: "func"; v: string }
  | { k: "ident"; v: string }
  | { k: "wholecol" | "wholerow"; v: string }
  | { k: "op"; v: string }
  | { k: "eof" };

const ERRORS = ["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A", "#GETTING_DATA", "#SPILL!", "#CALC!", "#ERROR!", "#CYCLE!", "#LIC!"];

const IDENT_CHAR = /[\p{L}\p{N}_.$\\?]/u;
const CELL_RE = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/;
const COL_RE = /^\$?([A-Za-z]{1,3})$/;
const ROWS_RE = /^\$?[0-9]+:\$?[0-9]+/;

function lettersToCol(letters: string): number {
  let n = 0;
  const up = letters.toUpperCase();
  for (let i = 0; i < up.length; i++) n = n * 26 + (up.charCodeAt(i) - 64);
  return n - 1;
}

/** "B7" / "$b$7" → 0-based {row, col}, or null. */
export function parseCellAddress(a1: string): { row: number; col: number } | null {
  const m = CELL_RE.exec(a1.trim());
  if (!m) return null;
  const row = parseInt(m[2], 10) - 1;
  const col = lettersToCol(m[1]);
  if (row < 0 || row >= MAX_ROW || col < 0 || col >= MAX_COL) return null;
  return { row, col };
}

export function colToLetters(col: number): string {
  let n = col + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function toA1(row: number, col: number): string {
  return colToLetters(col) + String(row + 1);
}

/** Strip Excel's future-function prefixes and upper-case. */
export function normalizeFunctionName(name: string): string {
  let n = name.toUpperCase();
  for (;;) {
    if (n.startsWith("_XLFN.")) n = n.slice(6);
    else if (n.startsWith("_XLWS.")) n = n.slice(6);
    else break;
  }
  return n;
}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  const prevAllowsOperand = (): boolean => {
    const p = toks[toks.length - 1];
    if (!p) return true;
    if (p.k === "op") return p.v !== ")" && p.v !== "%";
    return p.k === "sheet" || p.k === "func";
  };
  while (i < n) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let s = "";
      for (;;) {
        if (j >= n) throw new FormulaParseError("Unterminated string literal", "Texto sin cerrar");
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"';
            j += 2;
            continue;
          }
          break;
        }
        s += src[j++];
      }
      toks.push({ k: "str", v: s });
      i = j + 1;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      let s = "";
      for (;;) {
        if (j >= n) throw new FormulaParseError("Unterminated sheet name", "Nombre de hoja sin cerrar");
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            s += "'";
            j += 2;
            continue;
          }
          break;
        }
        s += src[j++];
      }
      j++;
      if (src[j] !== "!") throw new FormulaParseError(`Expected "!" after sheet name '${s}'`, `Se esperaba "!" tras la hoja '${s}'`);
      toks.push({ k: "sheet", v: s });
      i = j + 1;
      continue;
    }
    if (ch === "#") {
      const rest = src.slice(i).toUpperCase();
      const e = ERRORS.find((x) => rest.startsWith(x));
      if (!e) throw new FormulaParseError(`Unknown error literal at ${i}`, `Literal de error desconocido en ${i}`);
      toks.push({ k: "err", v: e });
      i += e.length;
      continue;
    }
    if ((ch >= "0" && ch <= "9") || (ch === "." && src[i + 1] >= "0" && src[i + 1] <= "9") || (ch === "$" && /[0-9]/.test(src[i + 1] ?? ""))) {
      // whole-row reference "1:3" / "$1:$3"
      if (prevAllowsOperand()) {
        const rows = ROWS_RE.exec(src.slice(i));
        if (rows) {
          toks.push({ k: "wholerow", v: rows[0] });
          i += rows[0].length;
          continue;
        }
      }
      const m = /^(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
      if (!m) throw new FormulaParseError(`Invalid number at ${i}`, `Número inválido en ${i}`);
      // A number immediately followed by letters is a cell-like token we do not know (e.g. "1A").
      toks.push({ k: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (IDENT_CHAR.test(ch)) {
      let j = i;
      while (j < n && IDENT_CHAR.test(src[j])) j++;
      const word = src.slice(i, j);
      if (src[j] === "!") {
        toks.push({ k: "sheet", v: word });
        i = j + 1;
        continue;
      }
      let k = j;
      while (k < n && (src[k] === " " || src[k] === "\t")) k++;
      if (src[k] === "(") {
        toks.push({ k: "func", v: normalizeFunctionName(word) });
        i = k + 1;
        continue;
      }
      const cell = parseCellAddress(word);
      if (cell) {
        toks.push({ k: "cell", row: cell.row, col: cell.col });
        i = j;
        continue;
      }
      const last = toks[toks.length - 1];
      if (COL_RE.test(word) && (src[j] === ":" || (last?.k === "op" && last.v === ":"))) {
        toks.push({ k: "wholecol", v: word });
        i = j;
        continue;
      }
      toks.push({ k: "ident", v: word });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "<>" || two === "<=" || two === ">=") {
      toks.push({ k: "op", v: two });
      i += 2;
      continue;
    }
    if ("+-*/^&=<>%(),:".includes(ch)) {
      toks.push({ k: "op", v: ch });
      i++;
      continue;
    }
    if (ch === "{") throw new FormulaParseError("Array constants ({…}) are not supported", "Las constantes de matriz ({…}) no están soportadas");
    if (ch === "@") throw new FormulaParseError("The implicit intersection operator (@) is not supported", "El operador de intersección implícita (@) no está soportado");
    if (ch === ";") throw new FormulaParseError('Unexpected ";" (use "," to separate arguments)', 'Carácter ";" inesperado (use "," para separar argumentos)');
    throw new FormulaParseError(`Unexpected character "${ch}"`, `Carácter inesperado "${ch}"`);
  }
  toks.push({ k: "eof" });
  return toks;
}

const BIN_BP: Record<string, number> = {
  "=": 10,
  "<>": 10,
  "<": 10,
  ">": 10,
  "<=": 10,
  ">=": 10,
  "&": 20,
  "+": 30,
  "-": 30,
  "*": 40,
  "/": 40,
  "^": 50,
};
const PCT_BP = 60;
const PREFIX_BP = 70;

class Parser {
  private pos = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok {
    return this.toks[this.pos];
  }

  private next(): Tok {
    return this.toks[this.pos++];
  }

  private isOp(v: string): boolean {
    const t = this.peek();
    return t.k === "op" && t.v === v;
  }

  private expectOp(v: string): void {
    if (!this.isOp(v)) throw new FormulaParseError(`Expected "${v}"`, `Se esperaba "${v}"`);
    this.pos++;
  }

  parseFormula(): Ast {
    const e = this.parseExpr(0);
    if (this.peek().k !== "eof") throw new FormulaParseError("Unexpected token after the end of the expression", "Símbolo inesperado al final de la expresión");
    return e;
  }

  parseExpr(minBp: number): Ast {
    let left = this.parsePrefix();
    for (;;) {
      const t = this.peek();
      if (t.k !== "op") break;
      if (t.v === "%") {
        if (PCT_BP <= minBp) break;
        this.pos++;
        left = { t: "pct", a: left };
        continue;
      }
      const bp = BIN_BP[t.v];
      if (bp === undefined || bp <= minBp) break;
      this.pos++;
      const right = this.parseExpr(bp);
      left = { t: "bin", op: t.v as BinOp, a: left, b: right };
    }
    return left;
  }

  private parsePrefix(): Ast {
    const t = this.peek();
    if (t.k === "op" && (t.v === "-" || t.v === "+")) {
      this.pos++;
      const a = this.parseExpr(PREFIX_BP);
      return t.v === "-" ? { t: "neg", a } : { t: "plus", a };
    }
    return this.parsePrimary();
  }

  private parseRefTail(sheet: string | null, row: number, col: number): Ast {
    if (this.isOp(":")) {
      const save = this.pos;
      this.pos++;
      let t = this.next();
      let sheet2: string | null = null;
      if (t.k === "sheet") {
        sheet2 = t.v;
        t = this.next();
      }
      if (t.k === "cell") {
        if (sheet2 !== null && sheet !== null && sheet2.toLowerCase() !== sheet.toLowerCase()) {
          throw new FormulaParseError("3-D references across several sheets are not supported", "Las referencias 3D entre varias hojas no están soportadas");
        }
        return {
          t: "range",
          sheet: sheet ?? sheet2,
          r1: Math.min(row, t.row),
          c1: Math.min(col, t.col),
          r2: Math.max(row, t.row),
          c2: Math.max(col, t.col),
        };
      }
      this.pos = save;
      throw new FormulaParseError("Invalid range reference", "Referencia de rango inválida");
    }
    return { t: "ref", sheet, row, col };
  }

  private parsePrimary(): Ast {
    const t = this.next();
    switch (t.k) {
      case "num":
        return { t: "num", v: t.v };
      case "str":
        return { t: "str", v: t.v };
      case "err":
        return { t: "err", v: t.v };
      case "cell":
        return this.parseRefTail(null, t.row, t.col);
      case "sheet": {
        const u = this.next();
        if (u.k === "cell") return this.parseRefTail(t.v, u.row, u.col);
        if (u.k === "wholecol" || u.k === "wholerow") {
          throw new FormulaParseError("Whole-column / whole-row references are not supported", "Las referencias a columnas/filas completas no están soportadas");
        }
        if (u.k === "ident") return { t: "name", name: u.v };
        throw new FormulaParseError(`Invalid reference after sheet "${t.v}"`, `Referencia inválida tras la hoja "${t.v}"`);
      }
      case "wholecol":
      case "wholerow":
        throw new FormulaParseError("Whole-column / whole-row references are not supported", "Las referencias a columnas/filas completas no están soportadas");
      case "ident": {
        const up = t.v.toUpperCase();
        if (up === "TRUE") return { t: "bool", v: true };
        if (up === "FALSE") return { t: "bool", v: false };
        return { t: "name", name: t.v };
      }
      case "func": {
        const args: Ast[] = [];
        if (this.isOp(")")) {
          this.pos++;
          return { t: "call", name: t.v, args };
        }
        for (;;) {
          if (this.isOp(",") || this.isOp(")")) args.push({ t: "empty" });
          else args.push(this.parseExpr(0));
          if (this.isOp(",")) {
            this.pos++;
            if (this.isOp(")")) {
              args.push({ t: "empty" });
              this.pos++;
              break;
            }
            continue;
          }
          this.expectOp(")");
          break;
        }
        return { t: "call", name: t.v, args };
      }
      case "op":
        if (t.v === "(") {
          const e = this.parseExpr(0);
          this.expectOp(")");
          return e;
        }
        throw new FormulaParseError(`Unexpected "${t.v}"`, `"${t.v}" inesperado`);
      case "eof":
        throw new FormulaParseError("Unexpected end of formula", "Fin inesperado de la fórmula");
    }
  }
}

/** Parse a formula (with or without the leading "="). Throws FormulaParseError. */
export function parseFormula(formula: string): Ast {
  let src = formula.trim();
  if (src.startsWith("=")) src = src.slice(1);
  if (!src.trim()) throw new FormulaParseError("Empty formula", "Fórmula vacía");
  return new Parser(tokenize(src)).parseFormula();
}

/** Pretty-print an AST (fully parenthesised) — used by tests and diagnostics. */
export function astToString(a: Ast): string {
  switch (a.t) {
    case "num":
      return String(a.v);
    case "str":
      return JSON.stringify(a.v);
    case "bool":
      return a.v ? "TRUE" : "FALSE";
    case "err":
      return a.v;
    case "empty":
      return "";
    case "ref":
      return `${a.sheet !== null ? `'${a.sheet}'!` : ""}${toA1(a.row, a.col)}`;
    case "range":
      return `${a.sheet !== null ? `'${a.sheet}'!` : ""}${toA1(a.r1, a.c1)}:${toA1(a.r2, a.c2)}`;
    case "name":
      return a.name;
    case "neg":
      return `(-${astToString(a.a)})`;
    case "plus":
      return `(+${astToString(a.a)})`;
    case "pct":
      return `(${astToString(a.a)}%)`;
    case "bin":
      return `(${astToString(a.a)}${a.op}${astToString(a.b)})`;
    case "call":
      return `${a.name}(${a.args.map(astToString).join(",")})`;
  }
}
