/**
 * Compiler front-end: dependency analysis (forecasts → precedents → inputs) and typed lowering of
 * the formula ASTs to IR, with constant folding and HyperFormula-compatible coercion rules.
 */
import type { CellRef, RiskModel } from "@openrisksim/core";
import { evalIR } from "./interp";
import type { FoldOp, IR, OpName, ProgramIR, Ty, VecFn } from "./ir";
import { isConstIR, lit } from "./ir";
import type { Ast } from "./parser";
import { FormulaParseError, parseCellAddress, parseFormula, toA1 } from "./parser";
import type { AccelMessage, AccelReason, FormulaSource } from "./types";

/** Hard cap on cells expanded from one range. */
const MAX_RANGE_CELLS = 100_000;
/** Hard cap on reachable cells. */
const MAX_CELLS = 500_000;

export class CompileError extends Error {
  constructor(readonly reasons: AccelReason[]) {
    super(reasons.map((r) => `${r.cell ? r.cell + ": " : ""}${r.message.en}`).join("; "));
    this.name = "CompileError";
  }
}

const msg = (en: string, es: string): AccelMessage => ({ en, es });

/** Thrown inside the lowering of one cell. */
class CellReject extends Error {
  constructor(readonly m: AccelMessage) {
    super(m.en);
  }
}
const reject = (en: string, es: string): never => {
  throw new CellReject(msg(en, es));
};

/** Functions whose result depends on hidden references or changes on every recalculation. */
const FORBIDDEN = new Set(["INDIRECT", "OFFSET", "RAND", "RANDBETWEEN", "RANDARRAY", "NOW", "TODAY", "CELL", "INFO", "RANDOM"]);

/** Functions the compiler can lower (for docs / diagnostics). */
export const SUPPORTED_FUNCTIONS: readonly string[] = [
  "SUM", "AVERAGE", "MIN", "MAX", "COUNT", "PRODUCT", "MEDIAN", "SUMPRODUCT",
  "ABS", "SQRT", "EXP", "LN", "LOG", "LOG10", "POWER", "MOD", "ROUND", "ROUNDUP", "ROUNDDOWN", "TRUNC", "INT", "SIGN", "PI",
  "IF", "IFERROR", "AND", "OR", "NOT", "TRUE", "FALSE", "CHOOSE", "INDEX", "ISERROR", "ISNUMBER",
  "NPV", "IRR", "MIRR", "PV", "FV", "PMT", "NPER",
  "ORS.NORMAL", "ORS.LOGNORMAL", "ORS.UNIFORM", "ORS.TRIANGULAR", "ORS.PERT", "ORS.MIRR", "ORS.PAYBACK", "ORS.DPAYBACK", "ORS.PI",
];

// ---------------------------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------------------------

type ErrV = { err: string };
/** Compile-time constant. */
type CV = number | string | boolean | null | ErrV;
/** Lowered value: constant or dynamic (IR + static type). */
type LV = { c: CV } | { d: IR; t: Ty };
type Arg =
  | { kind: "scalar"; lv: LV; isRef: boolean; empty?: boolean }
  | { kind: "range"; items: LV[]; rows: number; cols: number };

const isErr = (v: CV): v is ErrV => typeof v === "object" && v !== null;
const ERR_VALUE: ErrV = { err: "#VALUE!" };
const ERR_NUM: ErrV = { err: "#NUM!" };
const isDyn = (lv: LV): lv is { d: IR; t: Ty } => "d" in lv;

/** String → number following HyperFormula for the simple cases; "unknown" for locale/date/percent text. */
function coerceString(s: string): number | "error" | "unknown" {
  const t = s.trim();
  if (s === "") return 0;
  if (t !== "" && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return Number(t);
  if (/^[\s\d.,%$€£¥+\-eE/:]+$/.test(s)) return "unknown";
  return "error";
}

/** CV → number (NaN = error). Rejects text whose numeric meaning we cannot reproduce exactly. */
function cvToNum(v: CV): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null) return 0;
  if (isErr(v)) return NaN;
  const c = coerceString(v);
  if (c === "unknown") reject(`text "${v}" used as a number`, `texto "${v}" usado como número`);
  return c === "error" ? NaN : (c as number);
}

function numToCV(x: number): CV {
  return Number.isFinite(x) ? x : ERR_NUM;
}

// ---------------------------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------------------------

interface CellNode {
  key: string;
  sheet: string;
  row: number;
  col: number;
  kind: "input" | "const" | "formula";
  input: number;
  ast: Ast | null;
  deps: string[];
  dynamic: boolean;
  state: 0 | 1 | 2;
  slot: number;
  ty: Ty;
  value?: CV;
}

export interface LoweredProgram extends ProgramIR {
  functionsUsed: string[];
  /** Keys of the compiled cells (same order as `cells`). */
  cellRefs: CellRef[];
  /** CellRefs of the inputs. */
  inputRefs: CellRef[];
}

interface HfLike {
  getNamedExpressionFormula?(name: string): string | undefined;
  getNamedExpressionValue?(name: string): unknown;
}

export function lowerModel(source: FormulaSource, model: RiskModel, extraInputs: CellRef[] = []): LoweredProgram {
  const sheetList = source.sheetNames();
  const sheetExact = new Set(sheetList);
  const sheetLower = new Map(sheetList.map((s) => [s.toLowerCase(), s]));
  const resolveSheet = (name: string): string | null => (sheetExact.has(name) ? name : sheetLower.get(name.toLowerCase()) ?? null);

  const cellLabel = (sheet: string, row: number, col: number) => `${sheet}!${toA1(row, col)}`;

  // ----- inputs
  const inputIndex = new Map<string, number>();
  const inputRefs: CellRef[] = [];
  const refKey = (ref: CellRef, what: string): { key: string; sheet: string; row: number; col: number } => {
    const sheet = resolveSheet(ref.sheet);
    const p = parseCellAddress(ref.address.replace(/\$/g, ""));
    if (!sheet || !p) {
      throw new CompileError([
        { cell: `${ref.sheet}!${ref.address}`, message: msg(`${what} refers to an unknown sheet or invalid address`, `${what === "Forecast" ? "El pronóstico" : "La entrada"} apunta a una hoja o dirección inválida`) },
      ]);
    }
    return { key: cellLabel(sheet, p.row, p.col), sheet, row: p.row, col: p.col };
  };
  const allInputs = [...model.assumptions.filter((a) => a.enabled).map((a) => a.cell), ...extraInputs];
  allInputs.forEach((ref, i) => {
    const k = refKey(ref, "Input");
    if (!inputIndex.has(k.key)) inputIndex.set(k.key, i);
    inputRefs.push({ sheet: k.sheet, address: toA1(k.row, k.col) });
  });
  const nIn = allInputs.length;

  // ----- defined names
  const hf = (source as unknown as { hf?: HfLike }).hf;
  const nameFormula = (name: string): string | null => {
    try {
      if (typeof source.getNamedExpression === "function") return source.getNamedExpression(name);
      if (hf && typeof hf.getNamedExpressionFormula === "function") {
        const f = hf.getNamedExpressionFormula(name);
        if (typeof f === "string") return f;
        if (typeof hf.getNamedExpressionValue === "function") {
          const v = hf.getNamedExpressionValue(name);
          if (typeof v === "number") return `=${v}`;
          if (typeof v === "boolean") return v ? "=TRUE()" : "=FALSE()";
        }
      }
    } catch {
      /* unknown name */
    }
    return null;
  };

  // ----- graph nodes
  const nodes = new Map<string, CellNode>();
  const graphReasons: AccelReason[] = [];

  const resolveNames = (ast: Ast, label: string, depth: number): Ast => {
    const rec = (a: Ast): Ast => {
      switch (a.t) {
        case "name": {
          if (depth > 8) throw new CompileError([{ cell: label, message: msg(`defined name "${a.name}" is nested too deeply`, `el nombre definido "${a.name}" está anidado demasiado`) }]);
          const f = nameFormula(a.name);
          if (f === null) {
            throw new CompileError([{ cell: label, message: msg(`unknown or unsupported name "${a.name}"`, `nombre "${a.name}" desconocido o no soportado`) }]);
          }
          let parsed: Ast;
          try {
            parsed = parseFormula(f);
          } catch (e) {
            throw new CompileError([{ cell: label, message: msg(`cannot parse defined name "${a.name}"`, `no se puede interpretar el nombre definido "${a.name}"`) }]);
          }
          return resolveNames(parsed, label, depth + 1);
        }
        case "neg":
        case "plus":
        case "pct":
          return { ...a, a: rec(a.a) };
        case "bin":
          return { ...a, a: rec(a.a), b: rec(a.b) };
        case "call":
          return { ...a, args: a.args.map(rec) };
        default:
          return a;
      }
    };
    return rec(ast);
  };

  const getNode = (sheet: string, row: number, col: number): CellNode => {
    const key = cellLabel(sheet, row, col);
    let node = nodes.get(key);
    if (node) return node;
    if (nodes.size >= MAX_CELLS) {
      throw new CompileError([{ cell: "", message: msg(`the model references more than ${MAX_CELLS} cells`, `el modelo referencia más de ${MAX_CELLS} celdas`) }]);
    }
    node = { key, sheet, row, col, kind: "const", input: -1, ast: null, deps: [], dynamic: false, state: 0, slot: -1, ty: "num" };
    nodes.set(key, node);
    const inp = inputIndex.get(key);
    if (inp !== undefined) {
      node.kind = "input";
      node.input = inp;
      node.dynamic = true;
      return node;
    }
    let formula: string | null = null;
    try {
      formula = source.getFormula({ sheet, address: toA1(row, col) });
    } catch {
      formula = null;
    }
    if (formula === null || formula === undefined || formula === "") return node;
    node.kind = "formula";
    let ast: Ast;
    try {
      ast = resolveNames(parseFormula(formula), key, 0);
    } catch (e) {
      if (e instanceof CompileError) throw e;
      const pe = e instanceof FormulaParseError ? e : null;
      throw new CompileError([
        {
          cell: key,
          message: msg(`cannot parse formula ${formula}: ${pe ? pe.message : String(e)}`, `no se puede interpretar la fórmula ${formula}: ${pe ? pe.es : String(e)}`),
        },
      ]);
    }
    node.ast = ast;
    const deps = new Set<string>();
    const walk = (a: Ast): void => {
      switch (a.t) {
        case "ref": {
          const s = a.sheet === null ? sheet : resolveSheet(a.sheet);
          if (!s) throw new CompileError([{ cell: key, message: msg(`unknown sheet "${a.sheet}"`, `hoja desconocida "${a.sheet}"`) }]);
          deps.add(cellLabel(s, a.row, a.col));
          break;
        }
        case "range": {
          const s = a.sheet === null ? sheet : resolveSheet(a.sheet);
          if (!s) throw new CompileError([{ cell: key, message: msg(`unknown sheet "${a.sheet}"`, `hoja desconocida "${a.sheet}"`) }]);
          const size = (a.r2 - a.r1 + 1) * (a.c2 - a.c1 + 1);
          if (size > MAX_RANGE_CELLS) {
            throw new CompileError([{ cell: key, message: msg(`range with ${size} cells is too large`, `el rango de ${size} celdas es demasiado grande`) }]);
          }
          for (let r = a.r1; r <= a.r2; r++) for (let c = a.c1; c <= a.c2; c++) deps.add(cellLabel(s, r, c));
          break;
        }
        case "neg":
        case "plus":
        case "pct":
          walk(a.a);
          break;
        case "bin":
          walk(a.a);
          walk(a.b);
          break;
        case "call":
          if (FORBIDDEN.has(a.name)) {
            throw new CompileError([
              {
                cell: key,
                message: msg(`${a.name} is volatile or uses hidden references and cannot be compiled`, `${a.name} es volátil o usa referencias ocultas y no se puede compilar`),
              },
            ]);
          }
          a.args.forEach(walk);
          break;
        default:
          break;
      }
    };
    walk(ast);
    node.deps = [...deps];
    return node;
  };

  // ----- iterative DFS from the forecasts (post-order = topological order)
  const order: CellNode[] = [];
  const forecastNodes: CellNode[] = model.forecasts.map((f) => {
    const k = refKey(f.cell, "Forecast");
    return getNode(k.sheet, k.row, k.col);
  });
  for (const root of forecastNodes) {
    if (root.state === 2) continue;
    const stack: { node: CellNode; i: number }[] = [{ node: root, i: 0 }];
    root.state = 1;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.i < top.node.deps.length) {
        const dk = top.node.deps[top.i++];
        let dep = nodes.get(dk);
        if (!dep) {
          const bang = dk.lastIndexOf("!");
          const p = parseCellAddress(dk.slice(bang + 1))!;
          dep = getNode(dk.slice(0, bang), p.row, p.col);
        }
        if (dep.state === 1) {
          throw new CompileError([{ cell: dep.key, message: msg("circular reference", "referencia circular") }]);
        }
        if (dep.state === 0) {
          dep.state = 1;
          stack.push({ node: dep, i: 0 });
        }
        continue;
      }
      const n = top.node;
      if (n.kind === "formula") n.dynamic = n.deps.some((d) => nodes.get(d)!.dynamic);
      n.state = 2;
      if (n.dynamic && n.kind === "formula") order.push(n);
      stack.pop();
    }
  }
  if (graphReasons.length) throw new CompileError(graphReasons);

  // ----- lowering
  const readValue = (n: CellNode): CV => {
    if (n.value !== undefined) return n.value;
    let v: CV;
    try {
      const raw = source.getValue({ sheet: n.sheet, address: toA1(n.row, n.col) });
      if (raw === null || raw === undefined) v = null;
      else if (typeof raw === "object") v = { err: String((raw as { error: string }).error) };
      else v = raw;
    } catch {
      v = { err: "#REF!" };
    }
    n.value = v;
    return v;
  };

  order.forEach((n, i) => (n.slot = nIn + i));
  const functionsUsed = new Set<string>();
  const reasons: AccelReason[] = [];
  const cells: ProgramIR["cells"] = [];

  for (const n of order) {
    try {
      const lv = new CellLowerer(n.sheet, nodes, readValue, resolveSheet, functionsUsed).lower(n.ast!);
      const { ir, ty } = toCellValue(lv);
      n.ty = ty;
      cells.push({ key: n.key, ir, ty });
    } catch (e) {
      if (e instanceof CellReject) reasons.push({ cell: n.key, message: e.m });
      else if (e instanceof CompileError) reasons.push(...e.reasons);
      else reasons.push({ cell: n.key, message: msg(String(e), String(e)) });
      cells.push({ key: n.key, ir: lit(NaN), ty: "num" });
      if (reasons.length >= 20) break;
    }
  }
  if (reasons.length) throw new CompileError(reasons);

  const outputs: IR[] = forecastNodes.map((n) => {
    if (n.kind === "input") return { k: "var", id: n.input };
    if (n.dynamic) return { k: "var", id: n.slot };
    const v = readValue(n);
    return lit(typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : NaN);
  });

  return {
    inputCount: nIn,
    cells,
    outputs,
    functionsUsed: [...functionsUsed].sort(),
    cellRefs: order.map((n) => ({ sheet: n.sheet, address: toA1(n.row, n.col) })),
    inputRefs,
  };
}

/** Final value of a compiled cell. */
function toCellValue(lv: LV): { ir: IR; ty: Ty } {
  if (isDyn(lv)) return { ir: lv.d, ty: lv.t };
  const v = lv.c;
  if (typeof v === "string") reject("the formula produces text, which cannot be simulated", "la fórmula produce texto, que no se puede simular");
  if (typeof v === "boolean") return { ir: lit(v ? 1 : 0), ty: "bool" };
  if (v === null) return { ir: lit(0), ty: "num" };
  return { ir: lit(isErr(v) ? NaN : (v as number)), ty: "num" };
}

// ---------------------------------------------------------------------------------------------
// IR builders with constant folding
// ---------------------------------------------------------------------------------------------

function op(name: OpName, ...args: IR[]): IR {
  // algebraic identities that are exact under HyperFormula's semantics
  if (name === "add" && args[1].k === "lit" && args[1].v === 0 && args[0].k !== "lit") return args[0];
  if (name === "add" && args[0].k === "lit" && args[0].v === 0 && args[1].k !== "lit") return args[1];
  if (name === "mul" && args[1].k === "lit" && args[1].v === 1 && args[0].k !== "lit") return args[0];
  if (name === "mul" && args[0].k === "lit" && args[0].v === 1 && args[1].k !== "lit") return args[1];
  return fold({ k: "op", op: name, args });
}

function foldOp(fop: FoldOp, items: IR[]): IR {
  if (items.length === 1 && fop !== "and" && fop !== "or") return items[0];
  return fold({ k: "fold", op: fop, items });
}

function fold(ir: IR): IR {
  return isConstIR(ir) ? lit(evalIR(ir, new Float64Array(0))) : ir;
}

function dyn(ir: IR, t: Ty): LV {
  if (ir.k === "lit") {
    const v = ir.v;
    if (Number.isNaN(v)) return { c: ERR_NUM };
    return { c: t === "bool" ? v !== 0 : v };
  }
  return { d: ir, t };
}

/** Static type of an LV for unification. */
function tyOf(lv: LV): Ty | "str" | "err" {
  if (isDyn(lv)) return lv.t;
  const v = lv.c;
  if (typeof v === "string") return "str";
  if (typeof v === "boolean") return "bool";
  if (isErr(v)) return "err";
  return "num";
}

function unify(a: LV, b: LV): Ty {
  const ta = tyOf(a);
  const tb = tyOf(b);
  if (ta === "str" || tb === "str") reject("a simulated value can be text, which is not supported", "un valor simulado puede ser texto, lo cual no está soportado");
  if (ta === "err") return tb as Ty;
  if (tb === "err") return ta as Ty;
  return ta === tb ? (ta as Ty) : "mixed";
}

/** LV → numeric IR (HyperFormula number coercion). */
function num(lv: LV): IR {
  if (isDyn(lv)) return lv.d;
  return lit(cvToNum(lv.c));
}

/** LV → IR keeping booleans as 0/1 (for IF branches etc.). Rejects text. */
function val(lv: LV): IR {
  if (isDyn(lv)) return lv.d;
  const v = lv.c;
  if (typeof v === "string") reject("a simulated value can be text, which is not supported", "un valor simulado puede ser texto, lo cual no está soportado");
  return lit(cvToNum(v));
}

// ---------------------------------------------------------------------------------------------
// Const comparisons (HyperFormula compare)
// ---------------------------------------------------------------------------------------------

function typeOrd(v: CV): number {
  if (typeof v === "number") return 1;
  if (typeof v === "string") return 2;
  if (typeof v === "boolean") return 3;
  return 0;
}

function constCompare(a: CV, b: CV): number | ErrV {
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  if (a === null) a = typeof b === "number" ? 0 : typeof b === "string" ? "" : typeof b === "boolean" ? false : null;
  else if (b === null) b = typeof a === "number" ? 0 : typeof a === "string" ? "" : typeof a === "boolean" ? false : null;
  if (typeof a === "string" && typeof b === "string") {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x === y ? 0 : x < y ? -1 : 1;
  }
  if (typeof a === "number" && typeof b === "number") {
    const r = evalIR({ k: "op", op: "lt", args: [lit(a), lit(b)] }, new Float64Array(0));
    const e = evalIR({ k: "op", op: "eq", args: [lit(a), lit(b)] }, new Float64Array(0));
    return e ? 0 : r ? -1 : 1;
  }
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (a === null && b === null) return 0;
  return Math.sign(typeOrd(a) - typeOrd(b));
}

const CMP_OPS: Record<string, OpName> = { "=": "eq", "<>": "ne", "<": "lt", ">": "gt", "<=": "le", ">=": "ge" };

function cmpResult(opName: string, c: number): boolean {
  switch (opName) {
    case "=":
      return c === 0;
    case "<>":
      return c !== 0;
    case "<":
      return c < 0;
    case ">":
      return c > 0;
    case "<=":
      return c <= 0;
    default:
      return c >= 0;
  }
}

function cvToString(v: CV): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  return v as string;
}

// ---------------------------------------------------------------------------------------------
// Per-cell lowering
// ---------------------------------------------------------------------------------------------

class CellLowerer {
  constructor(
    private readonly sheet: string,
    private readonly nodes: Map<string, CellNode>,
    private readonly readValue: (n: CellNode) => CV,
    private readonly resolveSheet: (s: string) => string | null,
    private readonly used: Set<string>,
  ) {}

  private cell(sheetName: string | null, row: number, col: number): LV {
    const s = sheetName === null ? this.sheet : this.resolveSheet(sheetName);
    if (!s) return reject(`unknown sheet "${sheetName}"`, `hoja desconocida "${sheetName}"`);
    const n = this.nodes.get(`${s}!${toA1(row, col)}`);
    if (!n) return { c: null };
    if (n.kind === "input") return { d: { k: "var", id: n.input }, t: "num" };
    if (n.dynamic) return { d: { k: "var", id: n.slot }, t: n.ty };
    return { c: this.readValue(n) };
  }

  private rangeItems(a: Extract<Ast, { t: "range" }>): LV[] {
    const out: LV[] = [];
    for (let r = a.r1; r <= a.r2; r++) for (let c = a.c1; c <= a.c2; c++) out.push(this.cell(a.sheet, r, c));
    return out;
  }

  private arg(a: Ast): Arg {
    if (a.t === "range") return { kind: "range", items: this.rangeItems(a), rows: a.r2 - a.r1 + 1, cols: a.c2 - a.c1 + 1 };
    if (a.t === "empty") return { kind: "scalar", lv: { c: null }, isRef: false, empty: true };
    // A direct reference keeps blanks as null (skipped by SUM/COUNT/…; coerced to 0 elsewhere).
    if (a.t === "ref") return { kind: "scalar", lv: this.cell(a.sheet, a.row, a.col), isRef: true };
    return { kind: "scalar", lv: this.lower(a), isRef: false };
  }

  /** Lower in scalar context. */
  lower(a: Ast): LV {
    switch (a.t) {
      case "num":
        return { c: a.v };
      case "str":
        return { c: a.v };
      case "bool":
        return { c: a.v };
      case "err":
        return { c: { err: a.v } };
      case "empty":
        return { c: null };
      case "ref": {
        const v = this.cell(a.sheet, a.row, a.col);
        // a reference to an empty cell evaluates to 0 in scalar context (evaluateNullToZero)
        return !isDyn(v) && v.c === null ? { c: 0 } : v;
      }
      case "range": {
        if (a.r1 === a.r2 && a.c1 === a.c2) return this.lower({ t: "ref", sheet: a.sheet, row: a.r1, col: a.c1 });
        return reject("a multi-cell range is used where a single value is expected", "se usa un rango de varias celdas donde se espera un único valor");
      }
      case "name":
        return reject(`unknown name "${a.name}"`, `nombre desconocido "${a.name}"`);
      case "plus":
        return this.lower(a.a);
      case "neg": {
        const x = this.lower(a.a);
        return dyn(op("neg", num(x)), "num");
      }
      case "pct": {
        const x = this.lower(a.a);
        return dyn(op("div", num(x), lit(100)), "num");
      }
      case "bin":
        return this.binary(a.op, this.lower(a.a), this.lower(a.b));
      case "call":
        this.used.add(a.name);
        return this.call(a.name, a.args);
    }
  }

  private binary(o: string, x: LV, y: LV): LV {
    switch (o) {
      case "+":
        return dyn(op("add", num(x), num(y)), "num");
      case "-":
        return dyn(op("sub", num(x), num(y)), "num");
      case "*":
        return dyn(op("mul", num(x), num(y)), "num");
      case "/":
        return dyn(op("div", num(x), num(y)), "num");
      case "^":
        return dyn(op("pow", num(x), num(y)), "num");
      case "&": {
        if (isDyn(x) || isDyn(y)) return reject("text concatenation (&) of simulated values is not supported", "la concatenación de texto (&) con valores simulados no está soportada");
        if (isErr(x.c)) return x;
        if (isErr(y.c)) return y;
        return { c: cvToString(x.c) + cvToString(y.c) };
      }
      default: {
        if (!isDyn(x) && !isDyn(y)) {
          const c = constCompare(x.c, y.c);
          return typeof c === "number" ? { c: cmpResult(o, c) } : { c };
        }
        const cls = (lv: LV, other: LV): "num" | "bool" | "err" => {
          if (isDyn(lv)) {
            if (lv.t === "mixed") reject("comparison of a value that can be a number or TRUE/FALSE", "comparación de un valor que puede ser número o VERDADERO/FALSO");
            return lv.t as "num" | "bool";
          }
          const v = lv.c;
          if (isErr(v)) return "err";
          if (typeof v === "number") return "num";
          if (typeof v === "boolean") return "bool";
          if (v === null) return isDyn(other) ? (other.t === "bool" ? "bool" : "num") : "num";
          return reject("comparison between text and a simulated value is not supported", "la comparación entre texto y un valor simulado no está soportada");
        };
        const cx = cls(x, y);
        const cy = cls(y, x);
        if (cx === "err") return x;
        if (cy === "err") return y;
        if (cx !== cy) return reject("comparison between a number and TRUE/FALSE is not supported", "la comparación entre un número y VERDADERO/FALSO no está soportada");
        return dyn(op(CMP_OPS[o], val(x), val(y)), "bool");
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // Argument helpers
  // ------------------------------------------------------------------------------------------

  private scalarNum(args: Ast[], i: number, def?: number): IR {
    const a = args[i];
    if (a === undefined || a.t === "empty") {
      if (def !== undefined || a !== undefined) return lit(def ?? 0);
      return reject("missing argument", "falta un argumento");
    }
    const g = this.arg(a);
    if (g.kind === "range") {
      if (g.items.length === 1) return num(this.lower({ t: "ref", sheet: (a as { sheet: string | null }).sheet, row: (a as { r1: number }).r1, col: (a as { c1: number }).c1 }));
      return reject("a range is used where a single number is expected", "se usa un rango donde se espera un único número");
    }
    return num(g.lv);
  }

  private arity(name: string, args: Ast[], min: number, max: number): void {
    if (args.length < min || args.length > max) {
      reject(`${name}: wrong number of arguments`, `${name}: número de argumentos incorrecto`);
    }
  }

  /** Items of a range / reference with "only numbers" semantics (text, logicals, blanks skipped). */
  private strictItem(lv: LV, out: IR[], countErrors = true): void {
    if (isDyn(lv)) {
      if (lv.t === "num") out.push(lv.d);
      else if (lv.t === "mixed") reject("a range contains a value that can be a number or TRUE/FALSE", "un rango contiene un valor que puede ser número o VERDADERO/FALSO");
      return;
    }
    const v = lv.c;
    if (typeof v === "number") out.push(lit(v));
    else if (isErr(v) && countErrors) out.push(lit(NaN));
  }

  /** "manyToNumbers" semantics (NPV, MEDIAN): scalars coerced, ranges only numbers. */
  private numberList(args: Ast[]): IR[] {
    const items: IR[] = [];
    for (const a of args) {
      const g = this.arg(a);
      if (g.kind === "range") g.items.forEach((lv) => this.strictItem(lv, items));
      else items.push(num(g.lv));
    }
    return items;
  }

  /** Values of a RANGE argument (IRR, MIRR, ORS.*): numbers only, errors propagate. */
  private rangeNumbers(a: Ast | undefined, fn: string): IR[] {
    if (!a) return reject(`${fn}: missing range`, `${fn}: falta el rango`);
    const g = this.arg(a);
    const items: IR[] = [];
    if (g.kind === "range") g.items.forEach((lv) => this.strictItem(lv, items));
    else if (g.isRef) this.strictItem(g.lv, items);
    else items.push(num(g.lv));
    return items;
  }

  /** Reduce-family items (SUM, MIN, …): ranges/refs strict, other scalars coerced. */
  private reduceGroups(args: Ast[], countErrors = true): { range: boolean; items: IR[] }[] {
    const groups: { range: boolean; items: IR[] }[] = [];
    for (const a of args) {
      const g = this.arg(a);
      if (g.kind === "range") {
        const items: IR[] = [];
        g.items.forEach((lv) => this.strictItem(lv, items, countErrors));
        groups.push({ range: true, items });
      } else if (g.isRef) {
        const items: IR[] = [];
        this.strictItem(g.lv, items, countErrors);
        if (items.length) groups.push({ range: false, items });
      } else {
        groups.push({ range: false, items: [num(g.lv)] });
      }
    }
    return groups;
  }

  private branch(lv: LV): IR {
    return val(lv);
  }

  // ------------------------------------------------------------------------------------------
  // Functions
  // ------------------------------------------------------------------------------------------

  private call(name: string, args: Ast[]): LV {
    const N = (i: number, def?: number) => this.scalarNum(args, i, def);
    const unaryOp = (o: OpName): LV => {
      this.arity(name, args, 1, 1);
      return dyn(op(o, N(0)), "num");
    };
    switch (name) {
      case "TRUE":
        return { c: true };
      case "FALSE":
        return { c: false };
      case "PI":
        return { c: Math.PI };
      case "ABS":
        return unaryOp("abs");
      case "SQRT":
        return unaryOp("sqrt");
      case "EXP":
        return unaryOp("exp");
      case "LN":
        return unaryOp("ln");
      case "LOG10":
        return unaryOp("log10");
      case "INT":
        return unaryOp("int");
      case "SIGN":
        return unaryOp("sign");
      case "LOG":
        this.arity(name, args, 1, 2);
        return dyn(op("log", N(0), N(1, 10)), "num");
      case "POWER":
        this.arity(name, args, 2, 2);
        return dyn(op("pow", N(0), N(1)), "num");
      case "MOD":
        this.arity(name, args, 2, 2);
        return dyn(op("mod", N(0), N(1)), "num");
      case "ROUND":
      case "ROUNDUP":
      case "ROUNDDOWN":
      case "TRUNC":
        this.arity(name, args, 1, 2);
        return dyn(op(name === "ROUND" ? "round" : name === "ROUNDUP" ? "roundup" : "rounddown", N(0), N(1, 0)), "num");
      case "PMT":
      case "PV":
      case "FV":
      case "NPER":
        this.arity(name, args, 3, 5);
        return dyn(op(name.toLowerCase() as OpName, N(0), N(1), N(2), N(3, 0), N(4, 0)), "num");
      case "ORS.NORMAL":
        this.arity(name, args, 2, 2);
        return dyn(op("ors_normal", N(0), N(1)), "num");
      case "ORS.LOGNORMAL":
        this.arity(name, args, 2, 2);
        return dyn(op("ors_lognormal", N(0), N(1)), "num");
      case "ORS.UNIFORM":
        this.arity(name, args, 2, 2);
        return dyn(op("ors_uniform", N(0), N(1)), "num");
      case "ORS.TRIANGULAR":
        this.arity(name, args, 3, 3);
        return dyn(op("ors_triangular", N(0), N(1), N(2)), "num");
      case "ORS.PERT":
        this.arity(name, args, 3, 3);
        return dyn(op("ors_pert", N(0), N(1), N(2)), "num");

      case "SUM": {
        this.arity(name, args, 1, 255);
        let acc: IR = lit(0);
        for (const g of this.reduceGroups(args)) {
          if (g.range) acc = op("add", g.items.length ? foldOp("add", g.items) : lit(0), acc);
          else for (const it of g.items) acc = op("add", acc, it);
        }
        return dyn(acc, "num");
      }
      case "PRODUCT": {
        this.arity(name, args, 1, 255);
        let acc: IR = lit(1);
        for (const g of this.reduceGroups(args)) {
          if (g.range) acc = op("mul", g.items.length ? foldOp("mul", g.items) : lit(1), acc);
          else for (const it of g.items) acc = op("mul", acc, it);
        }
        return dyn(acc, "num");
      }
      case "MIN":
      case "MAX": {
        this.arity(name, args, 1, 255);
        const items = this.reduceGroups(args).flatMap((g) => g.items);
        if (!items.length) return { c: 0 };
        return dyn(foldOp(name === "MIN" ? "min" : "max", items), "num");
      }
      case "AVERAGE": {
        this.arity(name, args, 1, 255);
        const items = this.reduceGroups(args).flatMap((g) => g.items);
        if (!items.length) return { c: { err: "#DIV/0!" } };
        return dyn(op("div", foldOp("fadd", items), lit(items.length)), "num");
      }
      case "COUNT": {
        this.arity(name, args, 1, 255);
        let k = 0;
        const dynItems: IR[] = [];
        for (const g of this.reduceGroups(args, true)) {
          for (const it of g.items) {
            if (it.k === "lit") k += Number.isNaN(it.v) ? 0 : 1;
            else dynItems.push(op("isnum", it));
          }
        }
        return dyn(dynItems.length ? foldOp("fadd", [lit(k), ...dynItems]) : lit(k), "num");
      }
      case "MEDIAN": {
        this.arity(name, args, 1, 255);
        const items = this.numberList(args);
        if (!items.length) return { c: ERR_NUM };
        return dyn(fold({ k: "vec", fn: "median", args: [], items }), "num");
      }
      case "SUMPRODUCT":
        return this.sumproduct(args);
      case "NPV": {
        this.arity(name, args, 2, 255);
        const rate = N(0);
        const items = this.numberList(args.slice(1));
        if (!items.length) return { c: 0 };
        return dyn(fold({ k: "vec", fn: "npv", args: [rate], items }), "num");
      }
      case "IRR": {
        this.arity(name, args, 1, 2);
        const items = this.rangeNumbers(args[0], name);
        return dyn(fold({ k: "vec", fn: "irr", args: [N(1, 0.1)], items }), "num");
      }
      case "MIRR":
      case "ORS.MIRR": {
        this.arity(name, args, 3, 3);
        const items = this.rangeNumbers(args[0], name);
        const fn: VecFn = name === "MIRR" ? "mirr" : "ors_mirr";
        return dyn(fold({ k: "vec", fn, args: [N(1), N(2)], items }), "num");
      }
      case "ORS.PAYBACK": {
        this.arity(name, args, 1, 1);
        return dyn(fold({ k: "vec", fn: "payback", args: [], items: this.rangeNumbers(args[0], name) }), "num");
      }
      case "ORS.DPAYBACK":
      case "ORS.PI": {
        this.arity(name, args, 2, 2);
        const fn: VecFn = name === "ORS.PI" ? "pi" : "dpayback";
        return dyn(fold({ k: "vec", fn, args: [N(0)], items: this.rangeNumbers(args[1], name) }), "num");
      }

      case "IF": {
        this.arity(name, args, 2, 3);
        const c = this.lower(args[0]);
        const lowerBranch = (i: number): LV => (i >= args.length ? { c: false } : args[i].t === "empty" ? { c: 0 } : this.lower(args[i]));
        if (!isDyn(c)) {
          const v = c.c;
          if (isErr(v)) return c;
          if (typeof v === "string") return reject("IF condition is text", "la condición de SI es texto");
          return lowerBranch(cvToNum(v) !== 0 ? 1 : 2);
        }
        const a = lowerBranch(1);
        const b = lowerBranch(2);
        const t = unify(a, b);
        return dyn(fold({ k: "if", c: c.d, a: this.branch(a), b: this.branch(b) }), t);
      }
      case "IFERROR": {
        this.arity(name, args, 2, 2);
        const a = this.lower(args[0]);
        if (!isDyn(a)) return isErr(a.c) ? this.lower(args[1]) : a;
        const b = this.lower(args[1]);
        const t = unify(a, b);
        return dyn(fold({ k: "iferr", a: a.d, b: this.branch(b) }), t);
      }
      case "ISERROR":
      case "ISERR": {
        this.arity(name, args, 1, 1);
        const x = this.lower(args[0]);
        if (!isDyn(x)) return { c: isErr(x.c) };
        return dyn(op("not", op("isnum", x.d)), "bool");
      }
      case "ISNUMBER": {
        this.arity(name, args, 1, 1);
        const x = this.lower(args[0]);
        if (!isDyn(x)) return { c: typeof x.c === "number" };
        if (x.t === "bool") return { c: false };
        if (x.t === "mixed") return reject("ISNUMBER of a value that can be a number or TRUE/FALSE", "ESNUMERO de un valor que puede ser número o VERDADERO/FALSO");
        return dyn(op("isnum", x.d), "bool");
      }
      case "NOT": {
        this.arity(name, args, 1, 1);
        const x = this.lower(args[0]);
        if (!isDyn(x) && typeof x.c === "string") return reject("NOT of text", "NO de un texto");
        return dyn(op("not", val(x)), "bool");
      }
      case "AND":
      case "OR": {
        this.arity(name, args, 1, 255);
        const items: IR[] = [];
        for (const a of args) {
          const g = this.arg(a);
          const lvs = g.kind === "range" ? g.items : [g.lv];
          const fromRef = g.kind === "range" || g.isRef;
          for (const lv of lvs) {
            if (isDyn(lv)) items.push(lv.d);
            else if (typeof lv.c === "string" || lv.c === null) {
              if (!fromRef) return reject(`${name} with a text argument`, `${name === "AND" ? "Y" : "O"} con un argumento de texto`);
            } else items.push(lit(cvToNum(lv.c)));
          }
        }
        if (!items.length) return reject(`${name} without logical values`, `${name === "AND" ? "Y" : "O"} sin valores lógicos`);
        return dyn(foldOp(name === "AND" ? "and" : "or", [lit(name === "AND" ? 1 : 0), ...items]), "bool");
      }
      case "CHOOSE": {
        this.arity(name, args, 2, 255);
        const idx = this.lower(args[0]);
        if (isDyn(idx)) return reject("CHOOSE with a simulated index is not supported", "ELEGIR con un índice simulado no está soportado");
        if (isErr(idx.c)) return idx;
        const k = cvToNum(idx.c);
        if (Number.isNaN(k)) return { c: ERR_VALUE };
        if (!Number.isInteger(k)) return reject("CHOOSE with a non-integer index", "ELEGIR con un índice no entero");
        if (k < 1 || k > args.length - 1) return { c: ERR_NUM };
        return this.lower(args[k]);
      }
      case "INDEX": {
        this.arity(name, args, 2, 3);
        const r = args[0];
        if (r.t !== "range" && r.t !== "ref") return reject("INDEX needs a range as first argument", "INDICE necesita un rango como primer argumento");
        const rg = r.t === "range" ? r : { t: "range" as const, sheet: r.sheet, r1: r.row, c1: r.col, r2: r.row, c2: r.col };
        const constIdx = (i: number): number | null => {
          if (i >= args.length || args[i].t === "empty") return null;
          const lv = this.lower(args[i]);
          if (isDyn(lv)) return reject("INDEX with a simulated position is not supported", "INDICE con una posición simulada no está soportado");
          const v = cvToNum(lv.c);
          if (!Number.isFinite(v)) return NaN;
          return Math.trunc(v);
        };
        let row = constIdx(1);
        let col = constIdx(2);
        const rows = rg.r2 - rg.r1 + 1;
        const cols = rg.c2 - rg.c1 + 1;
        if (Number.isNaN(row) || Number.isNaN(col)) return { c: ERR_VALUE };
        if (col === null) {
          if (rows === 1 && cols > 1) {
            col = row;
            row = 1;
          } else col = 1;
        }
        if (row === null) row = 1;
        if (row! < 1 || col! < 1) return reject("INDEX returning a whole row/column is not supported", "INDICE devolviendo una fila/columna completa no está soportado");
        if (row! > rows || col! > cols) return { c: { err: "#REF!" } };
        const v = this.cell(rg.sheet, rg.r1 + row! - 1, rg.c1 + col! - 1);
        return !isDyn(v) && v.c === null ? { c: 0 } : v;
      }
      default:
        return reject(`function ${name} is not supported by the compiler`, `la función ${name} no está soportada por el compilador`);
    }
  }

  private sumproduct(args: Ast[]): LV {
    this.arity("SUMPRODUCT", args, 1, 255);
    const mats: LV[][] = [];
    let size = -1;
    let shape = "";
    for (const a of args) {
      const g = this.arg(a);
      const items = g.kind === "range" ? g.items : [g.lv];
      const sh = g.kind === "range" ? `${g.rows}x${g.cols}` : "1x1";
      if (size < 0) {
        size = items.length;
        shape = sh;
      } else if (sh !== shape) return { c: ERR_VALUE };
      mats.push(items);
    }
    const terms: IR[] = [];
    for (let i = 0; i < size; i++) {
      const factors: IR[] = [];
      for (const m of mats) {
        const lv = m[i];
        if (isDyn(lv)) factors.push(lv.d);
        else {
          const v = lv.c;
          if (typeof v === "string") {
            const c = coerceString(v);
            if (c === "unknown") reject(`text "${v}" used as a number`, `texto "${v}" usado como número`);
            factors.push(lit(c === "error" ? 0 : (c as number)));
          } else factors.push(lit(cvToNum(v)));
        }
      }
      terms.push(foldOp("mul", factors));
    }
    if (!terms.length) return { c: 0 };
    return dyn(foldOp("fadd", [lit(0), ...terms]), "num");
  }
}
