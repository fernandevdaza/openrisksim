/** Acceleration with the real `@openrisksim/accel` compiler (no WebGPU in Node → GPU falls back). */
import { describe, expect, it } from "vitest";
import type { AccelerationMode, RiskModel } from "@openrisksim/core";
import { detectAccelerationCapabilities, runAcceleratedSimulation } from "./acceleration";
import { buildExample, EXAMPLES } from "./examples";
import { inlinePoolFactory } from "./pool";

function job(id: string, trials: number, acceleration: AccelerationMode, decisionValues?: Record<string, number>) {
  const wb = buildExample(id);
  const model: RiskModel = { ...wb.model!, settings: { ...wb.model!.settings, trials, seed: 99, acceleration } };
  return { workbook: wb, model, decisionValues, locale: "en" as const };
}

describe("acceleration with the real compiler", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id}: compiled agrees with standard (or falls back with a reason)`, async () => {
      const env = { poolFactory: null };
      const std = await runAcceleratedSimulation(job(ex.id, 1500, "standard"), undefined, undefined, env);
      const c = await runAcceleratedSimulation(job(ex.id, 1500, "compiled"), undefined, undefined, env);
      expect(c.assumptionSamples).toEqual(std.assumptionSamples);
      if (c.backend?.mode === "compiled") {
        expect(c.backend.validation?.passed).toBe(true);
        for (const id of Object.keys(std.forecasts)) {
          const a = std.forecasts[id].values;
          const b = c.forecasts[id].values;
          let maxRel = 0;
          for (let i = 0; i < a.length; i++) {
            if (Number.isNaN(a[i]) && Number.isNaN(b[i])) continue;
            maxRel = Math.max(maxRel, Math.abs(a[i] - b[i]) / Math.max(1e-12, Math.abs(a[i])));
          }
          expect(maxRel, `${ex.id}/${id}`).toBeLessThan(1e-9);
        }
      } else {
        expect(c.backend?.fallbackReason).toBeTruthy();
        expectSame(c.forecasts.f_npv?.values, std.forecasts.f_npv?.values);
      }
      const caps = await detectAccelerationCapabilities(buildExample(ex.id), job(ex.id, 10, "auto").model);
      if (c.backend?.mode === "compiled") expect(caps.compile.ok).toBe(true);
      let exact = 0;
      let total = 0;
      for (const id of Object.keys(std.forecasts)) {
        const a = std.forecasts[id].values;
        const b = c.forecasts[id].values;
        for (let i = 0; i < a.length; i++, total++) if (Object.is(a[i], b[i])) exact++;
      }
      // compiled outputs get HyperFormula's 14-digit output rounding → bit-identical to the sheet
      if (c.backend?.mode === "compiled") expect(exact).toBe(total);
      console.log(`[accel] ${ex.id}: ${c.backend?.mode} ${caps.compile.ok ? `${caps.compile.formulaCount} formulas, gpu ${caps.gpuSupport?.ok ? "ok" : "no"}` : "not compiled"} bit-identical ${exact}/${total} ${c.backend?.fallbackReason ?? ""}`);
    });
  }

  it("project: gpu request in Node falls back to compiled; auto with a pool works", async () => {
    const g = await runAcceleratedSimulation(job("project", 800, "gpu"), undefined, undefined, { poolFactory: null });
    expect(g.backend?.mode).toBe("compiled");
    expect(g.backend?.fallbackReason).toMatch(/WebGPU/);
    const a = await runAcceleratedSimulation(job("inventory", 2500, "auto", { d_order: 60 }), undefined, undefined, { poolFactory: inlinePoolFactory, hardwareConcurrency: 4 });
    expect(["compiled", "multicore"]).toContain(a.backend?.mode);
    expect(Math.max(...Array.from(a.forecasts.f_profit.values))).toBeLessThanOrEqual(1200 + 1e-9);
  });
});

function expectSame(a?: Float64Array, b?: Float64Array) {
  expect(a).toEqual(b);
}
