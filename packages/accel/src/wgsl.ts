/**
 * IR → WGSL compute shader (f32). One invocation per trial, @workgroup_size(64).
 *
 * WGSL implementations may assume that floating-point values are never NaN/Inf, so errors are not
 * represented by NaN: every value carries an explicit boolean error flag. On output, an errored
 * value is written as a quiet-NaN bit pattern and converted to NaN on read-back.
 */
import type { FoldOp, IR, OpName, ProgramIR, VecFn } from "./ir";
import { CPU_ONLY_VEC, walkIR } from "./ir";
import type { AccelReason } from "./types";

export const WORKGROUP_SIZE = 64;
export const MAX_GPU_CELLS = 5000;
const F32_MAX = 3.4028234663852886e38;

export class WgslUnsupported extends Error {
  constructor(readonly reasons: AccelReason[]) {
    super(reasons.map((r) => r.message.en).join("; "));
  }
}

/** Reasons why a program cannot run on the GPU (empty = supported). */
export function gpuReasons(p: ProgramIR, cellKeys: string[]): AccelReason[] {
  const reasons: AccelReason[] = [];
  if (p.cells.length > MAX_GPU_CELLS) {
    reasons.push({
      cell: "",
      message: {
        en: `the model has ${p.cells.length} compiled formulas; the GPU shader is limited to ${MAX_GPU_CELLS}`,
        es: `el modelo tiene ${p.cells.length} fórmulas compiladas; el shader de GPU admite hasta ${MAX_GPU_CELLS}`,
      },
    });
  }
  const check = (ir: IR, cell: string) => {
    walkIR(ir, (n) => {
      if (reasons.length > 20) return;
      if (n.k === "vec" && CPU_ONLY_VEC.has(n.fn)) {
        reasons.push({ cell, message: { en: `${n.fn.toUpperCase()} is only available on the CPU`, es: `${n.fn.toUpperCase()} solo está disponible en la CPU` } });
      }
      if (n.k === "lit" && Number.isFinite(n.v) && Math.abs(n.v) > F32_MAX) {
        reasons.push({ cell, message: { en: `constant ${n.v} exceeds the single-precision range`, es: `la constante ${n.v} excede el rango de precisión simple` } });
      }
    });
  };
  p.cells.forEach((c, i) => check(c.ir, cellKeys[i] ?? c.key));
  p.outputs.forEach((o) => check(o, ""));
  return reasons;
}

function f32Lit(v: number): string {
  let x = Math.fround(v);
  if (Math.abs(x) < 1.1754943508222875e-38) x = 0;
  if (x === 0) return "0.0";
  const s = x.toPrecision(9);
  const t = /[.e]/.test(s) ? s : s + ".0";
  return x < 0 ? `(${t}f)` : `${t}f`;
}

interface Val {
  v: string;
  e: string;
}

const or = (...es: string[]): string => {
  const xs = es.filter((e) => e !== "false");
  if (xs.includes("true")) return "true";
  return xs.length ? xs.join(" || ") : "false";
};

const LIB = /* wgsl */ `
struct R { v: f32, e: bool }

fn bad(x: f32) -> bool { return (bitcast<u32>(x) & 0x7f800000u) == 0x7f800000u; }
fn ok(v: f32) -> R { return R(v, bad(v)); }
fn err() -> R { return R(0.0, true); }

// a^b with Excel/JS semantics; integer exponents use binary exponentiation (exact-ish, any sign).
fn xpow(a: f32, b: f32) -> R {
  if (b == floor(b) && abs(b) < 16777216.0) {
    var base = a;
    var k = u32(abs(b));
    var r = 1.0;
    loop {
      if (k == 0u) { break; }
      if ((k & 1u) == 1u) { r = r * base; }
      k = k >> 1u;
      if (k != 0u) { base = base * base; }
    }
    if (b < 0.0) {
      if (r == 0.0) { return err(); }
      r = 1.0 / r;
    }
    return ok(r);
  }
  if (a > 0.0) { return ok(pow(a, b)); }
  if (a == 0.0 && b > 0.0) { return R(0.0, false); }
  return err();
}

fn p10(d: f32) -> f32 {
  let r = xpow(10.0, d);
  return r.v;
}

fn xround(x: f32, d: f32, mode: i32) -> R {
  let m = p10(d);
  let y = abs(x) * m;
  var z: f32;
  if (mode == 0) { z = floor(y + 0.5); } else if (mode == 1) { z = ceil(y); } else { z = floor(y); }
  var r = z / m;
  if (x < 0.0) { r = -r; }
  return ok(r);
}

fn xmod(a: f32, b: f32) -> R {
  if (b == 0.0) { return err(); }
  return ok(a - b * trunc(a / b));
}

fn xlog(a: f32, b: f32) -> R {
  if (a <= 0.0 || b <= 0.0) { return err(); }
  return ok(log(a) / log(b));
}

fn xpmt(rate: f32, periods: f32, present: f32, future: f32, ty: f32) -> R {
  if (rate == 0.0) { return ok((-present - future) / periods); }
  let t = xpow(1.0 + rate, periods);
  if (t.e) { return err(); }
  let term = t.v;
  var k = 1.0;
  if (ty != 0.0) { k = 1.0 / (1.0 + rate); }
  return ok((future * rate + present * rate * term) * k / (1.0 - term));
}

fn xfv(rate: f32, periods: f32, payment: f32, value: f32, ty: f32) -> R {
  if (rate == 0.0) { return ok(-value - payment * periods); }
  let t = xpow(1.0 + rate, periods);
  if (t.e) { return err(); }
  let term = t.v;
  var k = 1.0;
  if (ty != 0.0) { k = 1.0 + rate; }
  return ok(payment * k * (1.0 - term) / rate - value * term);
}

fn xpv(rate: f32, periods: f32, payment: f32, future: f32, ty: f32) -> R {
  if (rate == -1.0) { return err(); }
  if (rate == 0.0) { return ok(-payment * periods - future); }
  let t = xpow(1.0 + rate, periods);
  if (t.e) { return err(); }
  var k = 0.0;
  if (ty != 0.0) { k = 1.0; }
  return ok(((1.0 - t.v) * payment * (1.0 + rate * k) / rate - future) / t.v);
}

fn xnper(rate: f32, payment0: f32, present: f32, future: f32, ty: f32) -> R {
  var payment = payment0;
  if (rate == 0.0) {
    if (payment == 0.0) { return err(); }
    return ok((-present - future) / payment);
  }
  if (ty != 0.0) { payment = payment * (1.0 + rate); }
  let q = (payment - future * rate) / (present * rate + payment);
  if (q <= 0.0 || 1.0 + rate <= 0.0) { return err(); }
  return ok(log(q) / log(1.0 + rate));
}
`;

const SCALAR_WGSL: Partial<Record<OpName, (a: string[]) => string>> = {
  add: (a) => `${a[0]} + ${a[1]}`,
  sub: (a) => `${a[0]} - ${a[1]}`,
  fadd: (a) => `${a[0]} + ${a[1]}`,
  mul: (a) => `${a[0]} * ${a[1]}`,
  neg: (a) => `-(${a[0]})`,
  eq: (a) => `select(0.0, 1.0, ${a[0]} == ${a[1]})`,
  ne: (a) => `select(0.0, 1.0, ${a[0]} != ${a[1]})`,
  lt: (a) => `select(0.0, 1.0, ${a[0]} < ${a[1]})`,
  gt: (a) => `select(0.0, 1.0, ${a[0]} > ${a[1]})`,
  le: (a) => `select(0.0, 1.0, ${a[0]} <= ${a[1]})`,
  ge: (a) => `select(0.0, 1.0, ${a[0]} >= ${a[1]})`,
  not: (a) => `select(0.0, 1.0, ${a[0]} == 0.0)`,
  min: (a) => `min(${a[0]}, ${a[1]})`,
  max: (a) => `max(${a[0]}, ${a[1]})`,
  abs: (a) => `abs(${a[0]})`,
  int: (a) => `trunc(${a[0]})`,
  sign: (a) => `sign(${a[0]})`,
};

/** Ops whose result may overflow → check with bad(). */
const OVERFLOW: ReadonlySet<OpName> = new Set<OpName>(["add", "sub", "fadd", "mul"]);

/** Ops implemented by an R-returning helper. */
const HELPER_R: Partial<Record<OpName, (a: string[]) => string>> = {
  pow: (a) => `xpow(${a[0]}, ${a[1]})`,
  log: (a) => `xlog(${a[0]}, ${a[1]})`,
  mod: (a) => `xmod(${a[0]}, ${a[1]})`,
  round: (a) => `xround(${a[0]}, ${a[1]}, 0)`,
  roundup: (a) => `xround(${a[0]}, ${a[1]}, 1)`,
  rounddown: (a) => `xround(${a[0]}, ${a[1]}, 2)`,
  pmt: (a) => `xpmt(${a.join(", ")})`,
  pv: (a) => `xpv(${a.join(", ")})`,
  fv: (a) => `xfv(${a.join(", ")})`,
  nper: (a) => `xnper(${a.join(", ")})`,
};

class WgslEmitter {
  private lines: string[] = [];
  private n = 0;
  private readonly helpers = new Map<string, string>();

  private push(s: string): void {
    this.lines.push("  " + s);
  }

  private fresh(): number {
    return this.n++;
  }

  private block(ir: IR): [string[], Val] {
    const saved = this.lines;
    this.lines = [];
    const r = this.expr(ir);
    const out = this.lines;
    this.lines = saved;
    return [out, r];
  }

  /** Bind a value to temporaries (so that it can be referenced repeatedly). */
  private bind(v: string, e: string, checkBad: boolean): Val {
    const k = this.fresh();
    this.push(`let t${k} = ${v};`);
    const ee = checkBad ? or(e, `bad(t${k})`) : e;
    if (ee === "false" || ee === "true") return { v: `t${k}`, e: ee };
    this.push(`let e${k} = ${ee};`);
    return { v: `t${k}`, e: `e${k}` };
  }

  private bindR(call: string, e: string): Val {
    const k = this.fresh();
    this.push(`let r${k} = ${call};`);
    return { v: `r${k}.v`, e: or(e, `r${k}.e`) === "true" ? "true" : this.bindE(or(e, `r${k}.e`)) };
  }

  private bindE(e: string): string {
    if (e === "false" || e === "true" || /^e\d+$/.test(e)) return e;
    const k = this.fresh();
    this.push(`let e${k} = ${e};`);
    return `e${k}`;
  }

  expr(ir: IR): Val {
    switch (ir.k) {
      case "lit":
        return Number.isFinite(ir.v) ? { v: f32Lit(ir.v), e: "false" } : { v: "0.0", e: "true" };
      case "var":
        return { v: `t_${ir.id}`, e: `e_${ir.id}` };
      case "op":
        return this.op(ir.op, ir.args.map((a) => this.expr(a)));
      case "if": {
        const c = this.expr(ir.c);
        const k = this.fresh();
        const [la, a] = this.block(ir.a);
        const [lb, b] = this.block(ir.b);
        this.push(`var t${k}: f32 = 0.0;`);
        this.push(`var e${k}: bool = true;`);
        this.push(`if (!(${c.e})) {`);
        this.push(`  if (${c.v} != 0.0) {`);
        this.lines.push(...la.map((l) => "    " + l));
        this.push(`    t${k} = ${a.v}; e${k} = ${a.e};`);
        this.push(`  } else {`);
        this.lines.push(...lb.map((l) => "    " + l));
        this.push(`    t${k} = ${b.v}; e${k} = ${b.e};`);
        this.push(`  }`);
        this.push(`}`);
        return { v: `t${k}`, e: `e${k}` };
      }
      case "iferr": {
        const a = this.expr(ir.a);
        if (a.e === "false") return a;
        const k = this.fresh();
        const [lb, b] = this.block(ir.b);
        this.push(`var t${k}: f32 = ${a.v};`);
        this.push(`var e${k}: bool = false;`);
        this.push(`if (${a.e}) {`);
        this.lines.push(...lb.map((l) => "  " + l));
        this.push(`  t${k} = ${b.v}; e${k} = ${b.e};`);
        this.push(`}`);
        return { v: `t${k}`, e: `e${k}` };
      }
      case "fold":
        return this.fold(ir.op, ir.items);
      case "vec":
        return this.vec(ir.fn, ir.args.map((a) => this.expr(a)), ir.items.map((a) => this.expr(a)));
    }
  }

  private op(o: OpName, a: Val[]): Val {
    const vs = a.map((x) => x.v);
    const es = or(...a.map((x) => x.e));
    switch (o) {
      case "isnum":
        return { v: `select(1.0, 0.0, ${a[0].e})`, e: "false" };
      case "div": {
        const b = this.bind(vs[1], "false", false);
        return this.bind(`${vs[0]} / select(${b.v}, 1.0, ${b.v} == 0.0)`, or(es, `${b.v} == 0.0`), true);
      }
      case "sqrt":
        return this.bind(`sqrt(max(${vs[0]}, 0.0))`, or(es, `${vs[0]} < 0.0`), false);
      case "exp":
        return this.bind(`exp(${vs[0]})`, es, true);
      case "ln":
        return this.bind(`log(max(${vs[0]}, 1e-38))`, or(es, `${vs[0]} <= 0.0`), false);
      case "log10":
        return this.bind(`log2(max(${vs[0]}, 1e-38)) * 0.30102999566`, or(es, `${vs[0]} <= 0.0`), false);
      case "ors_normal":
        return { v: vs[0], e: this.bindE(or(es, `${vs[1]} < 0.0`)) };
      case "ors_lognormal":
        return { v: vs[0], e: this.bindE(or(es, `${vs[1]} < 0.0`, `${vs[0]} <= 0.0`)) };
      case "ors_uniform":
        return this.bind(`(${vs[0]} + ${vs[1]}) / 2.0`, or(es, `${vs[0]} > ${vs[1]}`), true);
      case "ors_triangular":
        return this.bind(`(${vs[0]} + ${vs[1]} + ${vs[2]}) / 3.0`, or(es, `${vs[0]} > ${vs[1]}`, `${vs[1]} > ${vs[2]}`), true);
      case "ors_pert":
        return this.bind(`(${vs[0]} + 4.0 * ${vs[1]} + ${vs[2]}) / 6.0`, or(es, `${vs[0]} > ${vs[1]}`, `${vs[1]} > ${vs[2]}`), true);
      default:
        break;
    }
    const h = HELPER_R[o];
    if (h) return this.bindR(h(vs), es);
    const s = SCALAR_WGSL[o];
    if (!s) throw new Error(`WGSL: unsupported op ${o}`);
    return this.bind(s(vs), es, OVERFLOW.has(o));
  }

  private fold(fop: FoldOp, items: IR[]): Val {
    const k = this.fresh();
    const first = this.expr(items[0]);
    const norm = fop === "and" || fop === "or" ? `select(0.0, 1.0, ${first.v} != 0.0)` : first.v;
    this.push(`var t${k}: f32 = ${norm};`);
    this.push(`var e${k}: bool = ${first.e};`);
    for (let i = 1; i < items.length; i++) {
      const x = this.expr(items[i]);
      let v: string;
      switch (fop) {
        case "add":
        case "fadd":
          v = `t${k} + ${x.v}`;
          break;
        case "mul":
          v = `t${k} * ${x.v}`;
          break;
        case "min":
          v = `min(t${k}, ${x.v})`;
          break;
        case "max":
          v = `max(t${k}, ${x.v})`;
          break;
        case "and":
          v = `select(0.0, 1.0, t${k} != 0.0 && ${x.v} != 0.0)`;
          break;
        case "or":
          v = `select(0.0, 1.0, t${k} != 0.0 || ${x.v} != 0.0)`;
          break;
      }
      this.push(`t${k} = ${v};`);
      if (x.e !== "false") this.push(`e${k} = e${k} || ${x.e};`);
    }
    if (fop === "add" || fop === "fadd" || fop === "mul") this.push(`e${k} = e${k} || bad(t${k});`);
    return { v: `t${k}`, e: `e${k}` };
  }

  private vec(fn: VecFn, args: Val[], items: Val[]): Val {
    const n = items.length;
    const es = or(...args.map((a) => a.e), ...items.map((x) => x.e));
    if (fn === "npv") {
      const k = this.fresh();
      const r = args[0].v;
      this.push(`var t${k}: f32 = 0.0;`);
      this.push(`let q${k} = 1.0 + ${r};`);
      for (let i = n - 1; i >= 0; i--) this.push(`t${k} = (t${k} + ${items[i].v}) / q${k};`);
      return { v: `t${k}`, e: this.bindE(or(es, `q${k} == 0.0`, `bad(t${k})`)) };
    }
    if (CPU_ONLY_VEC.has(fn)) throw new Error(`WGSL: ${fn} is CPU-only`);
    const name = `${fn}_${n}`;
    if (!this.helpers.has(name)) this.helpers.set(name, vecHelper(fn, n));
    const arr = `array<f32, ${Math.max(1, n)}>(${n ? items.map((x) => x.v).join(", ") : "0.0"})`;
    return this.bindR(`${name}(${arr}${args.map((a) => ", " + a.v).join("")})`, es);
  }

  emitRaw(s: string): void {
    this.push(s);
  }

  take(): string[] {
    const l = this.lines;
    this.lines = [];
    return l;
  }

  helperSource(): string {
    return [...this.helpers.values()].join("\n");
  }
}

function vecHelper(fn: VecFn, n: number): string {
  const N = Math.max(1, n);
  const head = (extra: string) => `fn ${fn}_${n}(c0: array<f32, ${N}>${extra}) -> R {\n  var c = c0;\n  let n = ${n}u;`;
  switch (fn) {
    case "irr":
      return `${head(", guess: f32")}
  var pos = false;
  var neg = false;
  var scale = 0.0;
  for (var i = 0u; i < n; i++) {
    if (c[i] > 0.0) { pos = true; } else if (c[i] < 0.0) { neg = true; }
    scale = scale + abs(c[i]);
  }
  if (!pos || !neg || guess <= -1.0) { return err(); }
  var rate = guess;
  for (var it = 0; it < 60; it++) {
    let q = 1.0 + rate;
    var f = 0.0;
    var df = 0.0;
    var fac = 1.0;
    for (var i = 0u; i < n; i++) {
      if (bad(fac) || fac == 0.0) { return err(); }
      f = f + c[i] / fac;
      if (i > 0u) { df = df - f32(i) * c[i] / (fac * q); }
      fac = fac * q;
    }
    if (abs(f) <= 1e-7 * scale && it > 0) { return ok(rate); }
    if (abs(df) < 1e-30 || bad(df)) { return err(); }
    var next = rate - f / df;
    if (bad(next)) { return err(); }
    if (next <= -1.0) { next = (rate - 1.0) / 2.0; }
    if (abs(next - rate) <= 1e-6 * max(1.0, abs(rate))) { return ok(next); }
    rate = next;
  }
  return err();
}`;
    case "mirr":
      return `${head(", frate: f32, rrate: f32")}
  var pos = false;
  var neg = false;
  var nom = 0.0;
  var den = 0.0;
  for (var j = 0u; j < n; j++) {
    let i = n - 1u - j;
    if (c[i] > 0.0) { pos = true; nom = nom + c[i]; } else if (c[i] < 0.0) { neg = true; den = den + c[i]; }
    nom = nom / (1.0 + rrate);
    den = den / (1.0 + frate);
  }
  if (!pos || !neg || 1.0 + rrate == 0.0 || 1.0 + frate == 0.0) { return err(); }
  let g = xpow(1.0 + rrate, f32(n));
  let base = -nom * g.v / den / (1.0 + frate);
  let r = xpow(base, 1.0 / f32(n - 1u));
  return R(r.v - 1.0, r.e || g.e || bad(r.v));
}`;
    case "ors_mirr":
      return `${head(", fr: f32, rr: f32")}
  if (n < 2u) { return err(); }
  var pvNeg = 0.0;
  var fvPos = 0.0;
  var df = 1.0;
  for (var t = 0u; t < n; t++) {
    if (c[t] < 0.0) { pvNeg = pvNeg + c[t] / df; }
    df = df * (1.0 + fr);
  }
  var gf = 1.0;
  for (var j = 0u; j < n; j++) {
    let t = n - 1u - j;
    if (c[t] >= 0.0) { fvPos = fvPos + c[t] * gf; }
    gf = gf * (1.0 + rr);
  }
  if (pvNeg == 0.0 || fvPos == 0.0) { return err(); }
  let r = xpow(-fvPos / pvNeg, 1.0 / f32(n - 1u));
  return R(r.v - 1.0, r.e || bad(r.v));
}`;
    case "payback":
    case "dpayback":
      return `${head(fn === "dpayback" ? ", rate: f32" : "")}
  var cum = 0.0;
  var negative = false;
  var df = 1.0;
  for (var t = 0u; t < n; t++) {
    let x = c[t] / df;
    ${fn === "dpayback" ? "df = df * (1.0 + rate);" : ""}
    let prev = cum;
    cum = cum + x;
    if (cum < 0.0) { negative = true; } else if (negative && prev < 0.0) { return ok(f32(t) - 1.0 - prev / x); }
  }
  if (negative) { return err(); }
  return R(0.0, false);
}`;
    case "pi":
      return `${head(", rate: f32")}
  if (n == 0u || c[0] == 0.0) { return err(); }
  var s = 0.0;
  var df = 1.0;
  let k = 1.0 / (1.0 + rate);
  for (var t = 0u; t < n; t++) {
    s = s + c[t] * df;
    df = df * k;
  }
  return ok((s - c[0]) / abs(c[0]));
}`;
    default:
      throw new Error(`WGSL: no helper for ${fn}`);
  }
}

/** Generate the complete compute shader. */
export function generateWgsl(p: ProgramIR): string {
  const nIn = p.inputCount;
  const nOut = p.outputs.length;
  const em = new WgslEmitter();
  for (let i = 0; i < nIn; i++) {
    em.emitRaw(`let t_${i} = inp[ib + ${i}u];`);
    em.emitRaw(`let e_${i} = bad(t_${i});`);
  }
  p.cells.forEach((c, i) => {
    const id = nIn + i;
    const r = em.expr(c.ir);
    em.emitRaw(`let t_${id} = ${r.v};`);
    em.emitRaw(`let e_${id} = ${r.e};`);
  });
  p.outputs.forEach((o, j) => {
    const r = em.expr(o);
    em.emitRaw(`outp[ob + ${j}u] = select(${r.v}, qnan, ${r.e});`);
  });
  const body = em.take();
  return [
    `// Generated by @openrisksim/accel — ${p.cells.length} compiled cells, ${nIn} inputs, ${nOut} outputs.`,
    `struct Params { n: u32, rowStride: u32, _p0: u32, _p1: u32 }`,
    `@group(0) @binding(0) var<storage, read> inp: array<f32>;`,
    `@group(0) @binding(1) var<storage, read_write> outp: array<f32>;`,
    `@group(0) @binding(2) var<uniform> params: Params;`,
    LIB,
    em.helperSource(),
    `@compute @workgroup_size(${WORKGROUP_SIZE})`,
    `fn main(@builtin(global_invocation_id) gid: vec3<u32>) {`,
    `  let tr = gid.x + gid.y * params.rowStride;`,
    `  if (tr >= params.n) { return; }`,
    `  let ib = tr * ${nIn}u;`,
    `  let ob = tr * ${nOut}u;`,
    `  _ = inp[0];`,
    `  // quiet NaN built from a run-time value (a constant NaN is rejected by WGSL)`,
    `  let qnan = bitcast<f32>(params._p0 | 0x7fc00000u);`,
    ...body,
    `}`,
    ``,
  ].join("\n");
}
