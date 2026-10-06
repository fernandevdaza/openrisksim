/**
 * IR → JavaScript source (compiled with `new Function`). One straight-line loop body per trial,
 * constants inlined, no allocations per trial (vector functions use pre-allocated scratch arrays).
 */
import type { FoldOp, IR, ProgramIR } from "./ir";
import { RT } from "./runtime";

export type BatchFn = (I: Float64Array, O: Float64Array, n: number) => void;

function numLit(v: number): string {
  if (Number.isNaN(v)) return "NaN";
  if (Object.is(v, -0)) return "(-0)";
  return v < 0 ? `(${String(v)})` : String(v);
}

const FOLD_FN: Record<FoldOp, string> = { add: "add", fadd: "fadd", mul: "mul", min: "min", max: "max", and: "and", or: "or" };

class JsEmitter {
  private lines: string[] = [];
  private tmp = 0;
  readonly scratch: number[] = [];

  constructor(private readonly indent = "    ") {}

  private push(s: string): void {
    this.lines.push(this.indent + s);
  }

  private fresh(): string {
    return `t${this.tmp++}`;
  }

  /** Emit `ir` into a nested block; returns [block lines, result expr]. */
  private block(ir: IR): [string[], string] {
    const saved = this.lines;
    this.lines = [];
    const e = this.expr(ir);
    const out = this.lines;
    this.lines = saved;
    return [out, e];
  }

  /** Expression that is cheap to repeat (identifier or literal). */
  private simple(e: string): string {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(e) || /^\(?-?[0-9.e+-]+\)?$/.test(e) || e === "NaN") return e;
    const t = this.fresh();
    this.push(`const ${t} = ${e};`);
    return t;
  }

  expr(ir: IR): string {
    switch (ir.k) {
      case "lit":
        return numLit(ir.v);
      case "var":
        return `v${ir.id}`;
      case "op": {
        const a = ir.args.map((x) => this.expr(x));
        switch (ir.op) {
          case "neg":
            return `(-${a[0]})`;
          case "mul":
            return `fin(${a[0]} * ${a[1]})`;
          case "fadd":
            return `fin(${a[0]} + ${a[1]})`;
          case "abs":
            return `Math.abs(${a[0]})`;
          default:
            return `${ir.op}(${a.join(", ")})`;
        }
      }
      case "if": {
        const c = this.simple(this.expr(ir.c));
        const t = this.fresh();
        const [la, ea] = this.block(ir.a);
        const [lb, eb] = this.block(ir.b);
        this.push(`let ${t};`);
        this.push(`if (${c} !== ${c}) ${t} = NaN;`);
        this.push(`else if (${c} !== 0) {`);
        this.lines.push(...la.map((l) => "  " + l));
        this.push(`  ${t} = ${ea};`);
        this.push(`} else {`);
        this.lines.push(...lb.map((l) => "  " + l));
        this.push(`  ${t} = ${eb};`);
        this.push(`}`);
        return t;
      }
      case "iferr": {
        const a = this.simple(this.expr(ir.a));
        const t = this.fresh();
        const [lb, eb] = this.block(ir.b);
        this.push(`let ${t} = ${a};`);
        this.push(`if (${t} !== ${t}) {`);
        this.lines.push(...lb.map((l) => "  " + l));
        this.push(`  ${t} = ${eb};`);
        this.push(`}`);
        return t;
      }
      case "fold": {
        const t = this.fresh();
        const f = FOLD_FN[ir.op];
        const first = this.expr(ir.items[0]);
        this.push(`let ${t} = ${first};`);
        if (ir.op === "and" || ir.op === "or") this.push(`${t} = ${f}(${t}, ${t});`);
        for (let i = 1; i < ir.items.length; i++) this.push(`${t} = ${f}(${t}, ${this.expr(ir.items[i])});`);
        return t;
      }
      case "vec": {
        const items = ir.items.map((x) => this.simple(this.expr(x)));
        const args = ir.args.map((x) => this.simple(this.expr(x)));
        const t = this.fresh();
        if (ir.fn === "npv") {
          // Inline Horner, same operation order as HyperFormula's npvCore.
          const r = args[0];
          const acc = this.fresh();
          this.push(`let ${t};`);
          this.push(`if (${r} === -1) ${t} = ${items.every((x) => x !== "NaN") ? `(${items.map((x) => `${x} === 0`).join(" && ")}) ? 0 : NaN` : "NaN"};`);
          this.push(`else {`);
          this.push(`  let ${acc} = 0;`);
          for (let i = items.length - 1; i >= 0; i--) this.push(`  ${acc} += ${items[i]}; ${acc} /= 1 + ${r};`);
          this.push(`  ${t} = fin(${acc});`);
          this.push(`}`);
          return t;
        }
        const s = this.scratch.length;
        this.scratch.push(items.length);
        items.forEach((x, i) => this.push(`S${s}[${i}] = ${x};`));
        this.push(`const ${t} = vec_${ir.fn}(S${s}, ${items.length}${args.map((a) => ", " + a).join("")});`);
        return t;
      }
    }
  }

  emitStatement(s: string): void {
    this.push(s);
  }

  take(): string[] {
    const l = this.lines;
    this.lines = [];
    return l;
  }
}

/** Generate the source of a factory `(RT, S) => batch`. */
export function generateJsSource(p: ProgramIR): { source: string; scratch: number[] } {
  const nIn = p.inputCount;
  const nOut = p.outputs.length;
  const em = new JsEmitter();
  for (let i = 0; i < nIn; i++) em.emitStatement(`const v${i} = fin(I[ib + ${i}]);`);
  p.cells.forEach((c, i) => {
    const e = em.expr(c.ir);
    em.emitStatement(`const v${nIn + i} = ${e};`);
  });
  p.outputs.forEach((o, j) => {
    const e = em.expr(o);
    em.emitStatement(`O[ob + ${j}] = ${e};`);
  });
  const body = em.take();
  const helpers = Object.keys(RT).filter((k) => k !== "vec");
  const src = [
    `"use strict";`,
    `const { ${helpers.join(", ")} } = RT;`,
    `const { ${Object.keys(RT.vec).map((k) => `${k}: vec_${k}`).join(", ")} } = RT.vec;`,
    ...em.scratch.map((_, i) => `const S${i} = S[${i}];`),
    `return function batch(I, O, n) {`,
    `  for (let t = 0; t < n; t++) {`,
    `    const ib = t * ${nIn}, ob = t * ${nOut};`,
    ...body,
    `  }`,
    `};`,
  ].join("\n");
  return { source: src, scratch: em.scratch };
}

/** Compile to a batch function with `new Function`. Throws when code generation is blocked. */
export function compileJs(p: ProgramIR): { batch: BatchFn; source: string } {
  const { source, scratch } = generateJsSource(p);
  const factory = new Function("RT", "S", source) as (rt: typeof RT, s: Float64Array[]) => BatchFn;
  const batch = factory(
    RT,
    scratch.map((n) => new Float64Array(Math.max(1, n))),
  );
  return { batch, source };
}
