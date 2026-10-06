/**
 * Typed intermediate representation shared by the JS and WGSL back-ends.
 *
 * Every value is a number at run time: booleans are 1/0, errors are NaN (f64 back-end) or an
 * explicit error flag (WGSL back-end). Static types are tracked by the compiler (see `Ty`).
 */

export type Ty = "num" | "bool" | "mixed";

/** Scalar operations: name → arity. Semantics in runtime.ts (JS) and wgsl.ts (GPU). */
export const SCALAR_OPS = {
  add: 2, // HyperFormula "+": result snapped to 0 when |a+b| < 1e-13·|a|
  sub: 2, // HyperFormula "-": idem
  fadd: 2, // plain addition (used by AVERAGE, NPV, SUMPRODUCT…)
  mul: 2,
  div: 2,
  pow: 2,
  neg: 1,
  eq: 2,
  ne: 2,
  lt: 2,
  gt: 2,
  le: 2,
  ge: 2,
  isnum: 1,
  not: 1,
  min: 2,
  max: 2,
  abs: 1,
  sqrt: 1,
  exp: 1,
  ln: 1,
  log10: 1,
  log: 2,
  mod: 2,
  round: 2,
  roundup: 2,
  rounddown: 2,
  int: 1,
  sign: 1,
  pmt: 5,
  pv: 5,
  fv: 5,
  nper: 5,
  ors_normal: 2,
  ors_lognormal: 2,
  ors_uniform: 2,
  ors_triangular: 3,
  ors_pert: 3,
} as const;

export type OpName = keyof typeof SCALAR_OPS;

export type FoldOp = "add" | "fadd" | "mul" | "min" | "max" | "and" | "or";

/** Vector functions: fixed scalar args + a list of items (cash flows / values). */
export type VecFn = "npv" | "irr" | "mirr" | "ors_mirr" | "payback" | "dpayback" | "pi" | "median";

export const VEC_ARGS: Record<VecFn, number> = {
  npv: 1, // rate
  irr: 1, // guess
  mirr: 2, // finance rate, reinvest rate
  ors_mirr: 2,
  payback: 0,
  dpayback: 1, // rate
  pi: 1, // rate
  median: 0,
};

/** Functions without a WGSL implementation. */
export const CPU_ONLY_VEC: ReadonlySet<VecFn> = new Set<VecFn>(["median"]);

export type IR =
  | { k: "lit"; v: number }
  /** Value slot: inputs first (0..nIn-1), then compiled cells. */
  | { k: "var"; id: number }
  | { k: "op"; op: OpName; args: IR[] }
  /** Lazy IF: c error → error; c ≠ 0 → a; else b. */
  | { k: "if"; c: IR; a: IR; b: IR }
  /** Lazy IFERROR. */
  | { k: "iferr"; a: IR; b: IR }
  /** Left fold of a binary operation over ≥ 1 items. */
  | { k: "fold"; op: FoldOp; items: IR[] }
  | { k: "vec"; fn: VecFn; args: IR[]; items: IR[] };

export const lit = (v: number): IR => ({ k: "lit", v });

export function isLit(ir: IR): ir is { k: "lit"; v: number } {
  return ir.k === "lit";
}

/** True when the expression does not reference any variable. */
export function isConstIR(ir: IR): boolean {
  switch (ir.k) {
    case "lit":
      return true;
    case "var":
      return false;
    case "op":
      return ir.args.every(isConstIR);
    case "if":
      return isConstIR(ir.c) && isConstIR(ir.a) && isConstIR(ir.b);
    case "iferr":
      return isConstIR(ir.a) && isConstIR(ir.b);
    case "fold":
      return ir.items.every(isConstIR);
    case "vec":
      return ir.args.every(isConstIR) && ir.items.every(isConstIR);
  }
}

/** Visit every node (pre-order). */
export function walkIR(ir: IR, f: (n: IR) => void): void {
  f(ir);
  switch (ir.k) {
    case "op":
      ir.args.forEach((a) => walkIR(a, f));
      break;
    case "if":
      walkIR(ir.c, f);
      walkIR(ir.a, f);
      walkIR(ir.b, f);
      break;
    case "iferr":
      walkIR(ir.a, f);
      walkIR(ir.b, f);
      break;
    case "fold":
      ir.items.forEach((a) => walkIR(a, f));
      break;
    case "vec":
      ir.args.forEach((a) => walkIR(a, f));
      ir.items.forEach((a) => walkIR(a, f));
      break;
    default:
      break;
  }
}

/** A compiled program in IR form. */
export interface ProgramIR {
  inputCount: number;
  /** Compiled cells in topological order: slot id = inputCount + index. */
  cells: { key: string; ir: IR; ty: Ty }[];
  /** One expression per forecast (usually a `var`, or a literal for constant forecasts). */
  outputs: IR[];
}
