/**
 * Formula tokenizer used by the formula editor (syntax colouring, reference highlighting, point
 * mode, F4, autocomplete and argument tooltips) and by the es ↔ en formula translation.
 *
 * `locale` selects the *input syntax*:
 *  - "en": `,` separates arguments, `.` is the decimal separator (the engine / .xlsx syntax);
 *  - "es": `;` separates arguments and `,` is the decimal separator inside numbers (Excel in
 *    Spanish). A `,` that is not part of a number is still accepted as a separator, and `;` is
 *    accepted in "en" too (lenient input).
 * Inside array constants (`{1,2;3,4}`) the engine syntax is always used.
 */
import { colLetters, lettersToCol, type RangeBounds } from "./a1";

export type Locale = "es" | "en";

export type TokType =
  | "eq"
  | "ws"
  | "op"
  | "lparen"
  | "rparen"
  | "sep"
  | "arraysep"
  | "lbrace"
  | "rbrace"
  | "number"
  | "string"
  | "bool"
  | "error"
  | "ref"
  | "func"
  | "name"
  | "other";

export interface RefPart {
  /** 0-based; -1 for whole-row references */
  col: number;
  /** 0-based; -1 for whole-column references */
  row: number;
  colAbs: boolean;
  rowAbs: boolean;
}

export interface RefInfo {
  /** Unquoted sheet name, or null when the reference has no sheet prefix. */
  sheet: string | null;
  kind: "cell" | "range" | "cols" | "rows";
  a: RefPart;
  b?: RefPart;
  /** Offset inside the token text where the address starts (length of `Sheet!`). */
  addrStart: number;
}

export interface Token {
  type: TokType;
  text: string;
  start: number;
  end: number;
  ref?: RefInfo;
}

export const MAX_ROW = 1048575;
export const MAX_COL = 16383;

const ERRORS = ["#¡DIV/0!", "#DIV/0!", "#¿NOMBRE?", "#NAME?", "#¡VALOR!", "#VALUE!", "#¡REF!", "#REF!", "#¡NUM!", "#NUM!", "#¡NULO!", "#NULL!", "#N/D", "#N/A", "#¡CICLO!", "#CYCLE!", "#¡ERROR!", "#ERROR!", "#¡DESBORDAMIENTO!", "#SPILL!"];

const SHEET_UNQUOTED = "[\\p{L}_][\\p{L}\\p{N}_.]*";
const SHEET_QUOTED = "'(?:[^']|'')+'";
const CELL = "(\\$?)([A-Za-z]{1,3})(\\$?)(\\d{1,7})";
const COLP = "(\\$?)([A-Za-z]{1,3})";
const ROWP = "(\\$?)(\\d{1,7})";
const SHEET_PREFIX = `(?:(${SHEET_QUOTED}|${SHEET_UNQUOTED})!)`;
// boundary: a reference cannot be followed by these characters
const BOUNDARY = "(?![\\p{L}\\p{N}_.(!$'])";

const RE_CELLRANGE = new RegExp(`${SHEET_PREFIX}?${CELL}(?::(?:${SHEET_PREFIX})?${CELL})?${BOUNDARY}`, "uy");
const RE_COLRANGE = new RegExp(`${SHEET_PREFIX}?${COLP}:(?:${SHEET_PREFIX})?${COLP}${BOUNDARY}`, "uy");
const RE_ROWRANGE = new RegExp(`${SHEET_PREFIX}?${ROWP}:(?:${SHEET_PREFIX})?${ROWP}${BOUNDARY}`, "uy");
const RE_IDENT = /[\p{L}_\\][\p{L}\p{N}_.\\]*/uy;
const RE_WS = /[ \t\r\n ]+/y;
const RE_NUM_EN = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
const RE_NUM_ES = /(?:\d+(?:[.,]\d+)?|\.\d+)(?:[eE][+-]?\d+)?/y;

function unquote(sheet: string): string {
  return sheet.startsWith("'") ? sheet.slice(1, -1).replace(/''/g, "'") : sheet;
}

function validCol(letters: string): number {
  const c = lettersToCol(letters);
  return c >= 0 && c <= MAX_COL ? c : -1;
}

function matchRef(text: string, i: number): { len: number; ref: RefInfo } | null {
  RE_CELLRANGE.lastIndex = i;
  let m = RE_CELLRANGE.exec(text);
  if (m) {
    const ca = validCol(m[3]);
    const ra = Number(m[5]) - 1;
    const ok2 = m[7] === undefined || (validCol(m[8]) >= 0 && Number(m[10]) >= 1);
    if (ca >= 0 && ra >= 0 && ra <= MAX_ROW && ok2) {
      const sheet = m[1] !== undefined ? unquote(m[1]) : null;
      const a: RefPart = { col: ca, row: ra, colAbs: m[2] === "$", rowAbs: m[4] === "$" };
      const ref: RefInfo = { sheet, kind: "cell", a, addrStart: m[1] !== undefined ? m[1].length + 1 : 0 };
      if (m[7] !== undefined) {
        ref.kind = "range";
        ref.b = { col: validCol(m[8]), row: Number(m[10]) - 1, colAbs: m[7] === "$", rowAbs: m[9] === "$" };
      }
      return { len: m[0].length, ref };
    }
  }
  RE_COLRANGE.lastIndex = i;
  m = RE_COLRANGE.exec(text);
  if (m) {
    const ca = validCol(m[3]);
    const cb = validCol(m[6]);
    if (ca >= 0 && cb >= 0) {
      const sheet = m[1] !== undefined ? unquote(m[1]) : null;
      return {
        len: m[0].length,
        ref: {
          sheet,
          kind: "cols",
          a: { col: ca, row: -1, colAbs: m[2] === "$", rowAbs: false },
          b: { col: cb, row: -1, colAbs: m[5] === "$", rowAbs: false },
          addrStart: m[1] !== undefined ? m[1].length + 1 : 0,
        },
      };
    }
  }
  RE_ROWRANGE.lastIndex = i;
  m = RE_ROWRANGE.exec(text);
  if (m) {
    const ra = Number(m[3]) - 1;
    const rb = Number(m[6]) - 1;
    if (ra >= 0 && rb >= 0) {
      const sheet = m[1] !== undefined ? unquote(m[1]) : null;
      return {
        len: m[0].length,
        ref: {
          sheet,
          kind: "rows",
          a: { col: -1, row: ra, colAbs: false, rowAbs: m[2] === "$" },
          b: { col: -1, row: rb, colAbs: false, rowAbs: m[5] === "$" },
          addrStart: m[1] !== undefined ? m[1].length + 1 : 0,
        },
      };
    }
  }
  return null;
}

const BOOLS = new Set(["TRUE", "FALSE", "VERDADERO", "FALSO"]);

/** Split a formula (with or without the leading "=") into tokens. Never throws. */
export function tokenize(text: string, locale: Locale = "en"): Token[] {
  const out: Token[] = [];
  const n = text.length;
  let i = 0;
  let braces = 0;
  const push = (type: TokType, len: number, ref?: RefInfo) => {
    const t: Token = { type, text: text.slice(i, i + len), start: i, end: i + len };
    if (ref) t.ref = ref;
    out.push(t);
    i += len;
  };
  if (text.startsWith("=")) push("eq", 1);
  while (i < n) {
    const ch = text[i];
    RE_WS.lastIndex = i;
    const ws = RE_WS.exec(text);
    if (ws) {
      push("ws", ws[0].length);
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (text[j] === '"') {
          if (text[j + 1] === '"') j += 2;
          else break;
        } else j++;
      }
      push("string", Math.min(n, j + 1) - i);
      continue;
    }
    if (ch === "#") {
      const up = text.slice(i, i + 20).toUpperCase();
      const err = ERRORS.find((e) => up.startsWith(e));
      push(err ? "error" : "other", err ? err.length : 1);
      continue;
    }
    if (ch === "{") {
      braces++;
      push("lbrace", 1);
      continue;
    }
    if (ch === "}") {
      braces = Math.max(0, braces - 1);
      push("rbrace", 1);
      continue;
    }
    if (ch === "(") {
      push("lparen", 1);
      continue;
    }
    if (ch === ")") {
      push("rparen", 1);
      continue;
    }
    // references (also "1:3" row ranges, before numbers)
    if (ch === "'" || ch === "$" || /[\p{L}_\d]/u.test(ch)) {
      const prev = out.length ? out[out.length - 1] : null;
      // "A1" right after an identifier/number is not a new reference
      if (!(prev && prev.end === i && (prev.type === "name" || prev.type === "number"))) {
        const r = matchRef(text, i);
        if (r) {
          push("ref", r.len, r.ref);
          continue;
        }
      }
    }
    if (/\d/.test(ch) || (ch === "." && /\d/.test(text[i + 1] ?? ""))) {
      const re = locale === "es" && braces === 0 ? RE_NUM_ES : RE_NUM_EN;
      re.lastIndex = i;
      const m = re.exec(text);
      if (m && m[0].length) {
        push("number", m[0].length);
        continue;
      }
    }
    if (ch === "," || ch === ";") {
      push(braces > 0 ? "arraysep" : "sep", 1);
      continue;
    }
    if (ch === "'") {
      // unterminated / unmatched quoted sheet name: consume as "other"
      let j = i + 1;
      while (j < n && text[j] !== "'") j++;
      push("other", Math.min(n, j + 1) - i);
      continue;
    }
    RE_IDENT.lastIndex = i;
    const id = RE_IDENT.exec(text);
    if (id) {
      const word = id[0];
      const next = text[i + word.length];
      if (next === "(") push("func", word.length);
      else if (BOOLS.has(word.toUpperCase())) push("bool", word.length);
      else push("name", word.length);
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") {
      push("op", 2);
      continue;
    }
    if ("+-*/^&=<>%:".includes(ch)) {
      push("op", 1);
      continue;
    }
    push("other", 1);
  }
  return out;
}

/** Function name without Excel's `_xlfn.` / `_xlws.` prefixes. */
export function stripFnPrefix(name: string): string {
  return name.replace(/^_xl(?:fn|ws|l)\./i, "");
}

// ---------------------------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------------------------

/** Quote a sheet name for a formula when needed ("Hoja 2" → "'Hoja 2'"). */
export function quoteSheet(name: string): string {
  if (/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) && !/^(R|C|RC|R\d+C\d+)$/i.test(name)) return name;
  return `'${name.replace(/'/g, "''")}'`;
}

function partText(p: RefPart): string {
  const c = p.col >= 0 ? `${p.colAbs ? "$" : ""}${colLetters(p.col)}` : "";
  const r = p.row >= 0 ? `${p.rowAbs ? "$" : ""}${p.row + 1}` : "";
  return c + r;
}

/** Text of a reference (with the sheet prefix when `sheet` is given). */
export function refToText(ref: Pick<RefInfo, "kind" | "a" | "b">, sheet?: string | null): string {
  const prefix = sheet ? `${quoteSheet(sheet)}!` : "";
  return prefix + partText(ref.a) + (ref.b && ref.kind !== "cell" ? `:${partText(ref.b)}` : "");
}

/** "B4:B9" / "C5" (relative) for bounds, with optional sheet prefix. */
export function boundsRefText(b: RangeBounds, sheet?: string | null): string {
  const single = b.r0 === b.r1 && b.c0 === b.c1;
  const ref: Pick<RefInfo, "kind" | "a" | "b"> = single
    ? { kind: "cell", a: { col: b.c0, row: b.r0, colAbs: false, rowAbs: false } }
    : { kind: "range", a: { col: b.c0, row: b.r0, colAbs: false, rowAbs: false }, b: { col: b.c1, row: b.r1, colAbs: false, rowAbs: false } };
  return refToText(ref, sheet);
}

/** Bounds covered by a reference (whole rows/columns span the full sheet). */
export function refBounds(ref: RefInfo): RangeBounds {
  const a = ref.a;
  const b = ref.b ?? ref.a;
  if (ref.kind === "cols") return { r0: 0, r1: MAX_ROW, c0: Math.min(a.col, b.col), c1: Math.max(a.col, b.col) };
  if (ref.kind === "rows") return { r0: Math.min(a.row, b.row), r1: Math.max(a.row, b.row), c0: 0, c1: MAX_COL };
  return { r0: Math.min(a.row, b.row), r1: Math.max(a.row, b.row), c0: Math.min(a.col, b.col), c1: Math.max(a.col, b.col) };
}

export interface FormulaRef {
  start: number;
  end: number;
  text: string;
  sheet: string | null;
  bounds: RangeBounds;
  ref: RefInfo;
  /** Index into the highlight palette (same reference → same colour). */
  color: number;
  /** Position among the formula's references (stable while editing a reference in place). */
  index: number;
}

/** References of a formula with their highlight colour (Excel assigns one colour per distinct reference). */
export function formulaRefs(text: string, locale: Locale): FormulaRef[] {
  if (!text.startsWith("=")) return [];
  const keys = new Map<string, number>();
  const out: FormulaRef[] = [];
  for (const t of tokenize(text, locale)) {
    if (t.type !== "ref" || !t.ref) continue;
    const bounds = refBounds(t.ref);
    const key = `${(t.ref.sheet ?? "").toLowerCase()}|${bounds.r0},${bounds.c0},${bounds.r1},${bounds.c1}`;
    let color = keys.get(key);
    if (color === undefined) {
      color = keys.size;
      keys.set(key, color);
    }
    out.push({ start: t.start, end: t.end, text: t.text, sheet: t.ref.sheet, bounds, ref: t.ref, color, index: out.length });
  }
  return out;
}

/** Excel-like reference highlight colours (light theme / dark theme). */
export const REF_COLORS = ["#2563eb", "#dc2626", "#9333ea", "#16a34a", "#d97706", "#db2777", "#0891b2", "#65a30d"];
export const REF_COLORS_DARK = ["#60a5fa", "#f87171", "#c084fc", "#4ade80", "#fbbf24", "#f472b6", "#22d3ee", "#a3e635"];

export function refColor(i: number, dark = false): string {
  const p = dark ? REF_COLORS_DARK : REF_COLORS;
  return p[i % p.length];
}

// ---------------------------------------------------------------------------------------------
// F4: cycle absolute / relative
// ---------------------------------------------------------------------------------------------

function nextAbs(p: RefPart): { colAbs: boolean; rowAbs: boolean } {
  // A1 → $A$1 → A$1 → $A1 → A1
  if (!p.colAbs && !p.rowAbs) return { colAbs: true, rowAbs: true };
  if (p.colAbs && p.rowAbs) return { colAbs: false, rowAbs: true };
  if (!p.colAbs && p.rowAbs) return { colAbs: true, rowAbs: false };
  return { colAbs: false, rowAbs: false };
}

/**
 * F4 on the reference under (or right before) the caret. Returns the new text and the span of the
 * changed reference (the caret goes to its end), or null when there is no reference there.
 */
export function cycleReference(text: string, caret: number, locale: Locale): { text: string; start: number; end: number } | null {
  const toks = tokenize(text, locale);
  const tok = toks.find((t) => t.type === "ref" && t.start < caret && caret <= t.end) ?? toks.find((t) => t.type === "ref" && t.start === caret);
  if (!tok || !tok.ref) return null;
  const ref = tok.ref;
  let a: RefPart;
  let b: RefPart | undefined;
  if (ref.kind === "cols") {
    const abs = !ref.a.colAbs;
    a = { ...ref.a, colAbs: abs };
    b = { ...ref.b!, colAbs: abs };
  } else if (ref.kind === "rows") {
    const abs = !ref.a.rowAbs;
    a = { ...ref.a, rowAbs: abs };
    b = { ...ref.b!, rowAbs: abs };
  } else {
    const nx = nextAbs(ref.a);
    a = { ...ref.a, ...nx };
    b = ref.b ? { ...ref.b, ...nx } : undefined;
  }
  const prefix = tok.text.slice(0, ref.addrStart);
  const replaced = prefix + refToText({ kind: ref.kind, a, b });
  return { text: text.slice(0, tok.start) + replaced + text.slice(tok.end), start: tok.start, end: tok.start + replaced.length };
}

// ---------------------------------------------------------------------------------------------
// Caret context
// ---------------------------------------------------------------------------------------------

export interface CaretContext {
  /** Innermost function call that contains the caret. */
  fn: { name: string; start: number; argIndex: number } | null;
  /** True when a reference can be inserted at the caret (Excel "Point" mode). */
  canInsertRef: boolean;
  /** Identifier being typed right before the caret, in a position where a function can start. */
  ident: { text: string; start: number; end: number } | null;
}

function isOperandStart(t: Token | undefined): boolean {
  return !t || t.type === "eq" || t.type === "lparen" || t.type === "sep" || (t.type === "op" && t.text !== "%") || t.type === "lbrace" || t.type === "arraysep";
}

export function caretContext(text: string, caret: number, locale: Locale): CaretContext {
  const res: CaretContext = { fn: null, canInsertRef: false, ident: null };
  if (!text.startsWith("=") || caret < 1) return res;
  const toks = tokenize(text, locale);
  const stack: { name: string | null; start: number; argIndex: number }[] = [];
  let prevSig: Token | undefined; // last non-whitespace token ending at or before the caret
  let inside: Token | undefined; // token strictly containing the caret
  let atCaret: Token | undefined; // token starting exactly at the caret
  let endingAtCaret: Token | undefined;
  let lastFunc: Token | null = null;
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.start >= caret) {
      if (t.start === caret) atCaret = t;
      break;
    }
    if (t.end > caret) {
      inside = t;
      break;
    }
    if (t.end === caret) endingAtCaret = t;
    if (t.type !== "ws") prevSig = t;
    switch (t.type) {
      case "func":
        lastFunc = t;
        break;
      case "lparen":
        stack.push({ name: lastFunc && lastFunc.end === t.start ? stripFnPrefix(lastFunc.text) : null, start: lastFunc && lastFunc.end === t.start ? lastFunc.start : t.start, argIndex: 0 });
        lastFunc = null;
        break;
      case "sep":
        if (stack.length) stack[stack.length - 1].argIndex++;
        break;
      case "rparen":
        stack.pop();
        break;
      default:
        break;
    }
  }
  for (let k = stack.length - 1; k >= 0; k--) {
    const s = stack[k];
    if (s.name) {
      res.fn = { name: s.name, start: s.start, argIndex: s.argIndex };
      break;
    }
  }
  if (!inside) {
    const nextOk = !atCaret || atCaret.type === "ws" || atCaret.type === "rparen" || atCaret.type === "sep" || atCaret.type === "rbrace" || atCaret.type === "arraysep" || (atCaret.type === "op" && atCaret.text !== ":");
    res.canInsertRef = isOperandStart(prevSig) && nextOk;
  }
  // identifier being typed (autocomplete)
  const idTok = inside ?? endingAtCaret;
  if (idTok && (idTok.type === "name" || idTok.type === "bool" || idTok.type === "func" || (idTok.type === "ref" && idTok.ref?.kind === "cell" && !idTok.ref.sheet && !idTok.text.includes("$")))) {
    const idx = toks.indexOf(idTok);
    const before = toks[idx - 1];
    const typed = text.slice(idTok.start, caret);
    if (isOperandStart(before) && typed.length > 0 && /^[\p{L}_]/u.test(typed) && text[idTok.end] !== "(") res.ident = { text: typed, start: idTok.start, end: idTok.end };
  }
  return res;
}

/** True when the editor text is a formula (Excel: starts with "="). */
export function isFormulaText(text: string): boolean {
  return text.startsWith("=");
}

/** Number of unclosed "(" (outside strings) — Excel closes them automatically on Enter. */
export function missingParens(text: string, locale: Locale): number {
  let depth = 0;
  for (const t of tokenize(text, locale)) {
    if (t.type === "lparen") depth++;
    else if (t.type === "rparen") depth = Math.max(0, depth - 1);
  }
  return depth;
}
