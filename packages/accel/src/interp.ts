/**
 * Tree-walking IR interpreter: constant folding, self-check, and the fallback when `new Function`
 * is unavailable (strict CSP).
 */
import type { IR, ProgramIR } from "./ir";
import { FOLD_IMPL, SCALAR_IMPL, VEC_IMPL } from "./runtime";

export function evalIR(ir: IR, vars: ArrayLike<number>): number {
  switch (ir.k) {
    case "lit":
      return ir.v;
    case "var":
      return vars[ir.id];
    case "op": {
      const f = SCALAR_IMPL[ir.op];
      const a = ir.args;
      switch (a.length) {
        case 1:
          return f(evalIR(a[0], vars));
        case 2:
          return f(evalIR(a[0], vars), evalIR(a[1], vars));
        case 3:
          return f(evalIR(a[0], vars), evalIR(a[1], vars), evalIR(a[2], vars));
        default:
          return f(...a.map((x) => evalIR(x, vars)));
      }
    }
    case "if": {
      const c = evalIR(ir.c, vars);
      if (c !== c) return NaN;
      return c !== 0 ? evalIR(ir.a, vars) : evalIR(ir.b, vars);
    }
    case "iferr": {
      const a = evalIR(ir.a, vars);
      return a === a ? a : evalIR(ir.b, vars);
    }
    case "fold": {
      const f = FOLD_IMPL[ir.op];
      let acc = evalIR(ir.items[0], vars);
      if (ir.op === "and" || ir.op === "or") acc = f(acc, acc);
      for (let i = 1; i < ir.items.length; i++) acc = f(acc, evalIR(ir.items[i], vars));
      return acc;
    }
    case "vec": {
      const v = new Float64Array(ir.items.length);
      for (let i = 0; i < v.length; i++) v[i] = evalIR(ir.items[i], vars);
      const a = ir.args.map((x) => evalIR(x, vars));
      return VEC_IMPL[ir.fn](v, v.length, a[0], a[1]);
    }
  }
}

/** Evaluate every slot of a program (inputs + compiled cells). */
export function evalProgramSlots(p: ProgramIR, inputs: ArrayLike<number>): Float64Array {
  const slots = new Float64Array(p.inputCount + p.cells.length);
  for (let i = 0; i < p.inputCount; i++) {
    const x = inputs[i];
    slots[i] = x - x === 0 ? x : NaN;
  }
  for (let i = 0; i < p.cells.length; i++) slots[p.inputCount + i] = evalIR(p.cells[i].ir, slots);
  return slots;
}

/** Interpreter-based batch evaluator (fallback). */
export function makeInterpreterBatch(p: ProgramIR): (I: Float64Array, O: Float64Array, n: number) => void {
  const nIn = p.inputCount;
  const nOut = p.outputs.length;
  const slots = new Float64Array(nIn + p.cells.length);
  return (I, O, n) => {
    for (let t = 0; t < n; t++) {
      const ib = t * nIn;
      for (let i = 0; i < nIn; i++) {
        const x = I[ib + i];
        slots[i] = x - x === 0 ? x : NaN;
      }
      for (let i = 0; i < p.cells.length; i++) slots[nIn + i] = evalIR(p.cells[i].ir, slots);
      for (let j = 0; j < nOut; j++) {
        const v = evalIR(p.outputs[j], slots);
        O[t * nOut + j] = v - v === 0 ? v : NaN;
      }
    }
  };
}
