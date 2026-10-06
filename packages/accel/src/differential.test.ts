/**
 * Differential tests: the compiled JS backend must reproduce the spreadsheet engine (HyperFormula)
 * on random inputs drawn from each model's distributions.
 */
import { describe, expect, it } from "vitest";
import type { AssumptionDef, RiskModel } from "@openrisksim/core";
import { DEFAULT_SETTINGS } from "@openrisksim/core";
import { EXAMPLES, SpreadsheetEngine, createWorkbookEvaluator } from "@openrisksim/workbook";
import type { WorkbookData } from "@openrisksim/workbook";
import { createDistribution, createRng } from "../../distributions/src/index";
import { compareOutputs, compileModel } from "./index";
import type { CompiledProgramInternal } from "./compile";

const TRIALS = 500;

function sampleInputs(model: RiskModel, n: number, seed: number, widen = 0): Float64Array {
  const enabled = model.assumptions.filter((a) => a.enabled);
  const rng = createRng(seed);
  const dists = enabled.map((a) => createDistribution(a.distribution));
  const out = new Float64Array(n * enabled.length);
  for (let t = 0; t < n; t++) {
    for (let j = 0; j < enabled.length; j++) {
      let x = dists[j].sample(rng);
      // occasionally push the value far outside its range to exercise error paths
      if (widen > 0 && rng.next() < widen) x = (rng.next() - 0.5) * 4 * (Math.abs(x) + 1);
      if (widen > 0 && rng.next() < widen / 4) x = 0;
      out[t * enabled.length + j] = x;
    }
  }
  return out;
}

function reference(wb: WorkbookData, model: RiskModel, inputs: Float64Array, n: number): Float64Array {
  const engine = SpreadsheetEngine.fromWorkbook(wb);
  const ev = createWorkbookEvaluator(engine, model);
  const k = model.assumptions.filter((a) => a.enabled).length;
  const nOut = model.forecasts.length;
  const out = new Float64Array(n * nOut);
  try {
    for (let t = 0; t < n; t++) {
      const r = ev.evaluate(inputs.subarray(t * k, (t + 1) * k));
      for (let j = 0; j < nOut; j++) out[t * nOut + j] = Number.isFinite(r[j]) ? r[j] : NaN;
    }
  } finally {
    ev.dispose();
    engine.destroy();
  }
  return out;
}

function expectSame(ref: Float64Array, got: Float64Array, label: string) {
  const c = compareOutputs(ref, got, { relTol: 1e-9, absTol: 1e-9 });
  if (!c.passed) {
    for (let i = 0; i < ref.length; i++) {
      const a = ref[i];
      const b = got[i];
      const bad = Number.isNaN(a) !== Number.isNaN(b) || (!Number.isNaN(a) && Math.abs(a - b) > 1e-9 + 1e-9 * Math.abs(a));
      if (bad) {
        throw new Error(`${label}: first mismatch at ${i}: ref=${a} compiled=${b} (max rel ${c.maxRelativeError})`);
      }
    }
  }
  expect(c.passed).toBe(true);
  expect(c.maxRelativeError).toBeLessThanOrEqual(1e-9);
}

function checkModel(wb: WorkbookData, model: RiskModel, label: string, widen = 0) {
  const engine = SpreadsheetEngine.fromWorkbook(wb);
  const res = compileModel(engine, model);
  engine.destroy();
  if (!res.ok) throw new Error(`${label} did not compile: ${JSON.stringify(res.reasons)}`);
  const prog = res.program;
  const k = prog.inputCount;
  const inputs = sampleInputs(model, TRIALS, 7, widen);
  const ref = reference(wb, model, inputs, TRIALS);
  // single-trial evaluator
  const ev = prog.createJsEvaluator();
  const single = new Float64Array(TRIALS * prog.outputCount);
  for (let t = 0; t < TRIALS; t++) single.set(ev.evaluate(inputs.subarray(t * k, (t + 1) * k)), t * prog.outputCount);
  expectSame(ref, single, `${label} (single)`);
  // batch evaluator
  expectSame(ref, prog.evaluateBatchJs(inputs, TRIALS), `${label} (batch)`);
  return { prog: prog as CompiledProgramInternal, ref };
}

describe("differential: compiled JS vs HyperFormula on the bundled examples", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id}: 500 random trials match (rel ≤ 1e-9, NaN ↔ NaN)`, () => {
      const wb = ex.build();
      const { prog } = checkModel(wb, wb.model!, ex.id);
      expect(prog.jsMode).toBe("codegen");
      expect(prog.formulaCount).toBeGreaterThan(0);
      expect(prog.gpuSupport.ok).toBe(true);
      expect(prog.toWGSL()).toContain("@compute @workgroup_size(64)");
      // eslint-disable-next-line no-console
      console.log(`[accel] ${ex.id}: ${prog.formulaCount} formulas, functions ${prog.functionsUsed.join(",")}`);
    });
    it(`${ex.id}: matches with out-of-range inputs (error paths)`, () => {
      const wb = ex.build();
      checkModel(wb, wb.model!, `${ex.id} (wide)`, 0.15);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Synthetic model exercising many functions
// ---------------------------------------------------------------------------------------------

function a(id: string, sheet: string, address: string, distribution: AssumptionDef["distribution"]): AssumptionDef {
  return { id, name: id, cell: { sheet, address }, distribution, enabled: true };
}

function syntheticWorkbook(): { wb: WorkbookData; model: RiskModel } {
  const S = "Datos de entrada";
  const T = "Cálculo";
  const inCells: Record<string, { v?: number | string | boolean; f?: string }> = {
    A1: { v: "Investment" },
    B1: { v: 1000 },
    B2: { v: 0.1 },
    B3: { v: 300 },
    B4: { v: 0.05 },
    B5: { v: 2 },
    B6: { v: "header" },
    B7: { v: true },
    C1: { v: 5 },
    C2: { v: 0.08 },
  };
  const calc: Record<string, { v?: number | string | boolean; f?: string }> = {
    // cash flows years 0..5
    A1: { f: "-'Datos de entrada'!B1" },
    B1: { f: "'Datos de entrada'!B3" },
    C1: { f: "B1*(1+'Datos de entrada'!$B$4)" },
    D1: { f: "C1*(1+'Datos de entrada'!$B$4)" },
    E1: { f: "D1*(1+'Datos de entrada'!$B$4)-'Datos de entrada'!B5*10" },
    F1: { f: "E1*(1+'Datos de entrada'!$B$4)+50" },
    // indicators
    A3: { f: "A1+NPV('Datos de entrada'!B2,B1:F1)" },
    B3: { f: "IRR(A1:F1)" },
    C3: { f: "IFERROR(IRR(A1:F1,-0.5),-1)" },
    D3: { f: "MIRR(A1:F1,'Datos de entrada'!B2,'Datos de entrada'!C2)" },
    E3: { f: "PMT('Datos de entrada'!B2,'Datos de entrada'!C1,-'Datos de entrada'!B1)" },
    F3: { f: "PV('Datos de entrada'!B2,5,-B1)+FV(0.03,4,-100,10,1)" },
    A4: { f: "ROUND(A3,2)+ROUNDUP(B3*100,1)-ROUNDDOWN(-C3*7.77,0)+TRUNC(D3*1000)" },
    B4: { f: "IF(A3>0,MAX(A1:F1),MIN(A1:F1))" },
    C4: { f: "IF(AND(B3>0.1,A3>0),1,IF(OR(B3<0,A3<-200),-1,0))" },
    D4: { f: "SUMPRODUCT(A1:F1,A6:F6)/SUM(A6:F6)" },
    E4: { f: "AVERAGE(A1:F1)+COUNT(A1:F1,'Datos de entrada'!B6:B7)+PRODUCT(1.01,'Datos de entrada'!B5)" },
    F4: { f: "SQRT(ABS(A3))*SIGN(A3)+LN('Datos de entrada'!B1)+LOG10(ABS(B1)+1)+LOG(ABS(C1)+2,3)+EXP(-'Datos de entrada'!B4)" },
    A5: { f: "MOD(B1,7)+INT(-B1/9)+POWER('Datos de entrada'!B5,3)+(-'Datos de entrada'!B5)^2-'Datos de entrada'!B5^2+B1%" },
    B5: { f: "CHOOSE(2,A3,B3*100,C3)+INDEX(A1:F1,1,3)+INDEX(A6:A8,2)" },
    C5: { f: "1/('Datos de entrada'!B5-2)" },
    D5: { f: "IFERROR(C5,0)+ISERROR(C5)+NOT(A3>0)" },
    E5: { f: "ORS.PAYBACK(A1:F1)+ORS.DPAYBACK(0.1,A1:F1)+ORS.PI(0.1,A1:F1)+ORS.MIRR(A1:F1,0.1,0.12)" },
    F5: { f: "ORS.NORMAL('Datos de entrada'!B3,10)+ORS.TRIANGULAR(1,2,3)+ORS.PERT(0,'Datos de entrada'!B5,10)" },
    A6: { v: 1 },
    B6: { v: 2 },
    C6: { v: 3 },
    D6: { v: 4 },
    E6: { v: 5 },
    F6: { v: 6 },
    A7: { v: 7 },
    A8: { v: 8 },
    A9: { f: "MEDIAN(A1:F1)+NPER(0.01,-B1,1000)" },
    B9: { f: "IF(A3>100,TRUE(),FALSE())" },
    C9: { f: "(A3>0)+(B3>=0.1)*2" },
    D9: { f: "SUM(A1:C1,D1,1,'Datos de entrada'!B6:B7,E1:F1)" },
    E9: { f: "IF('Datos de entrada'!B5>3,\"big\",'Datos de entrada'!B5)" },
    F9: { f: "SQRT('Datos de entrada'!B5-2.5)" },
  };
  const toCells = (c: typeof calc) =>
    Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.f !== undefined ? { f: v.f } : { v: v.v, t: typeof v.v === "number" ? "n" : typeof v.v === "boolean" ? "b" : "s" }])) as never;
  const wb: WorkbookData = {
    model: null,
    sheets: [
      { name: S, rows: 10, cols: 5, cells: toCells(inCells) },
      { name: T, rows: 10, cols: 8, cells: toCells(calc) },
    ],
  };
  const forecasts = ["A3", "B3", "C3", "D3", "E3", "F3", "A4", "B4", "C4", "D4", "E4", "F4", "A5", "B5", "C5", "D5", "E5", "F5", "A9", "B9", "C9", "D9", "F9"].map(
    (addr) => ({ id: `f_${addr}`, name: addr, cell: { sheet: T, address: addr } }),
  );
  const model: RiskModel = {
    version: 1,
    assumptions: [
      a("inv", S, "B1", { id: "triangular", params: { min: 800, mode: 1000, max: 1400 } }),
      a("rate", S, "B2", { id: "uniform", params: { min: 0.02, max: 0.2 } }),
      a("cf", S, "B3", { id: "normal", params: { mean: 300, stdDev: 120 } }),
      a("g", S, "B4", { id: "normal", params: { mean: 0.05, stdDev: 0.05 } }),
      a("k", S, "B5", { id: "discreteUniform", params: { min: 0, max: 4 } }),
    ],
    forecasts,
    decisions: [],
    correlations: [],
    settings: { ...DEFAULT_SETTINGS },
  };
  return { wb, model };
}

describe("differential: synthetic model", () => {
  it("IRR, NPV, MIRR, IF, IFERROR, MIN/MAX, ROUND*, PMT/PV/FV/NPER, SUMPRODUCT, ORS.*, cross-sheet", () => {
    const { wb, model } = syntheticWorkbook();
    const { prog, ref } = checkModel(wb, model, "synthetic");
    expect(prog.functionsUsed).toEqual(expect.arrayContaining(["IRR", "NPV", "IF", "IFERROR", "MIN", "MAX", "ROUND", "PMT", "MEDIAN"]));
    // MEDIAN is CPU-only → no GPU
    expect(prog.gpuSupport.ok).toBe(false);
    // some trials must hit error paths (1/(k-2), SQRT of negative)
    expect(Array.from(ref).some((x) => Number.isNaN(x))).toBe(true);
  });

  it("wide inputs (errors, IRR failures)", () => {
    const { wb, model } = syntheticWorkbook();
    checkModel(wb, model, "synthetic wide", 0.2);
  });

  it("text results with simulated conditions are rejected with a reason", () => {
    const { wb, model } = syntheticWorkbook();
    const m = { ...model, forecasts: [...model.forecasts, { id: "f_txt", name: "txt", cell: { sheet: "Cálculo", address: "E9" } }] };
    const engine = SpreadsheetEngine.fromWorkbook(wb);
    const res = compileModel(engine, m);
    engine.destroy();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reasons[0].cell).toBe("Cálculo!E9");
      expect(res.reasons[0].message.en).toMatch(/text/);
      expect(res.reasons[0].message.es).toMatch(/texto/);
    }
  });
});

describe("compiler rejections", () => {
  const mk = (cells: Record<string, string | number>, forecast = "B1"): { wb: WorkbookData; model: RiskModel } => ({
    wb: {
      model: null,
      sheets: [
        {
          name: "S",
          rows: 20,
          cols: 5,
          cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, typeof v === "string" ? { f: v.replace(/^=/, "") } : { v, t: "n" }])) as never,
        },
      ],
    },
    model: {
      version: 1,
      assumptions: [a("x", "S", "A1", { id: "normal", params: { mean: 1, stdDev: 1 } })],
      forecasts: [{ id: "f", name: "f", cell: { sheet: "S", address: forecast } }],
      decisions: [],
      correlations: [],
      settings: { ...DEFAULT_SETTINGS },
    },
  });
  const compile = (cells: Record<string, string | number>) => {
    const { wb, model } = mk(cells);
    const engine = SpreadsheetEngine.fromWorkbook(wb);
    try {
      return compileModel(engine, model);
    } finally {
      engine.destroy();
    }
  };

  it("unsupported function", () => {
    const r = compile({ A1: 1, B1: "=STDEV(A1,2)" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons[0].message.en).toMatch(/STDEV/);
  });
  it("volatile / indirect references", () => {
    // (HyperFormula rewrites OFFSET with constant arguments to a plain reference, e.g. "=A1".)
    for (const f of ["=A1+RAND()", '=INDIRECT("A1")', "=A1*TODAY()"]) {
      const r = compile({ A1: 1, B1: f });
      expect(r.ok).toBe(false);
    }
  });
  it("whole-column references", () => {
    const r = compile({ A1: 1, B1: "=SUM(A:A)" });
    expect(r.ok).toBe(false);
  });
  it("circular references", () => {
    const r = compile({ A1: 1, B1: "=A1+C1", C1: "=B1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons[0].message.en).toMatch(/circular/);
  });
  it("cells not depending on inputs are folded (even if unsupported)", () => {
    const r = compile({ A1: 1, A2: 3, A3: "=STDEV(A2,5)", B1: "=A1*A3" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.program.formulaCount).toBe(1);
      const v = r.program.createJsEvaluator().evaluate(new Float64Array([2]))[0];
      expect(v).toBeCloseTo(2 * Math.SQRT2, 12);
    }
  });
  it("assumption cells holding formulas are inputs", () => {
    const r = compile({ A1: "=5*2", B1: "=A1+1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.program.createJsEvaluator().evaluate(new Float64Array([7]))[0]).toBe(8);
  });
  it("extra inputs (decision variables)", () => {
    const { wb, model } = mk({ A1: 1, A2: 10, B1: "=A1*A2" });
    const engine = SpreadsheetEngine.fromWorkbook(wb);
    const r = compileModel(engine, model, { extraInputs: [{ sheet: "S", address: "A2" }] });
    engine.destroy();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.program.inputCount).toBe(2);
      expect(r.program.createJsEvaluator().evaluate(new Float64Array([3, 4]))[0]).toBe(12);
    }
  });
  it("defined names are resolved through the engine", () => {
    const wb: WorkbookData = {
      model: null,
      names: { Rate: "S!$A$2" },
      sheets: [{ name: "S", rows: 3, cols: 3, cells: { A1: { v: 1, t: "n" }, A2: { v: 0.5, t: "n" }, B1: { f: "A1*Rate" } } }],
    };
    const { model } = mk({});
    const engine = SpreadsheetEngine.fromWorkbook(wb);
    const r = compileModel(engine, model);
    engine.destroy();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.program.createJsEvaluator().evaluate(new Float64Array([4]))[0]).toBe(2);
  });
});

describe("compareOutputs", () => {
  it("NaN patterns and tolerances", () => {
    const ref = new Float64Array([1, NaN, 100, 0]);
    expect(compareOutputs(ref, new Float64Array([1, NaN, 100.000001, 0])).passed).toBe(true);
    expect(compareOutputs(ref, new Float64Array([1, 2, 100, 0])).passed).toBe(false);
    expect(compareOutputs(ref, new Float64Array([1.1, NaN, 100, 0])).passed).toBe(false);
    const c = compareOutputs(new Float64Array([1e5, 1, 1e5, 0.5]), new Float64Array([1e5, 1, 1e5, 0.6]), { outputCount: 2 });
    expect(c.passed).toBe(false);
    expect(compareOutputs(new Float64Array([1e5, 1, 3, 1]), new Float64Array([1e5, 1, 3.001, 1]), { outputCount: 2 }).passed).toBe(true);
  });
});

describe("benchmark (project example)", () => {
  it("JS backend vs HyperFormula", () => {
    const wb = EXAMPLES.find((e) => e.id === "project")!.build();
    const model = wb.model!;
    const engine = SpreadsheetEngine.fromWorkbook(wb);
    const res = compileModel(engine, model);
    engine.destroy();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const nHf = 3000;
    const inHf = sampleInputs(model, nHf, 3);
    let t0 = performance.now();
    reference(wb, model, inHf, nHf);
    const hfRate = nHf / ((performance.now() - t0) / 1000);
    const nJs = 1_000_000;
    const inJs = sampleInputs(model, nJs, 4);
    const out = new Float64Array(nJs * model.forecasts.length);
    res.program.evaluateBatchJs(inJs.subarray(0, 10000 * res.program.inputCount), 10000, out); // warm-up
    t0 = performance.now();
    res.program.evaluateBatchJs(inJs, nJs, out);
    const jsRate = nJs / ((performance.now() - t0) / 1000);
    // eslint-disable-next-line no-console
    console.log(`[accel] project: HyperFormula ${Math.round(hfRate)} trials/s, compiled JS ${Math.round(jsRate)} trials/s (×${(jsRate / hfRate).toFixed(0)})`);
    expect(jsRate).toBeGreaterThan(hfRate * 10);
  }, 120_000);
});
