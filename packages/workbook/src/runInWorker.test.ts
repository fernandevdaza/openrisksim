import { describe, expect, it } from "vitest";
import type { SimulationProgress } from "@openrisksim/core";
import { buildExample, EXAMPLES } from "./examples";
import { runSimulationInline, runSimulationInWorker } from "./runInWorker";
import { attachSimulationWorker, resultTransferables } from "./worker";

describe("runSimulationInline", () => {
  it("runs the project example end-to-end", async () => {
    const wb = buildExample("project");
    const model = { ...wb.model!, settings: { ...wb.model!.settings, trials: 2000 } };
    const progress: SimulationProgress[] = [];
    const result = await runSimulationInline({ workbook: wb, model }, (p) => progress.push(p));
    expect(result.trials).toBe(2000);
    const npv = result.forecasts.f_npv;
    expect(npv.values.length).toBe(2000);
    expect(npv.errors).toBe(0);
    expect(Array.from(npv.values).some(Number.isNaN)).toBe(false);
    expect(npv.stats.mean).toBeGreaterThan(-50000);
    expect(npv.stats.mean).toBeLessThan(200000);
    expect(npv.stats.stdDev).toBeGreaterThan(10000);
    const irr = result.forecasts.f_irr;
    expect(irr.stats.mean).toBeGreaterThan(0.05);
    expect(irr.stats.mean).toBeLessThan(0.4);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toEqual({ type: "progress", completed: 2000, total: 2000 });
    // price is the top driver of NPV
    const sens = result.sensitivity.f_npv;
    expect(sens.length).toBe(5);
    console.log(`[inline] project: mean NPV ${npv.stats.mean.toFixed(0)}, sd ${npv.stats.stdDev.toFixed(0)}, ${result.trials} trials in ${result.elapsedMs.toFixed(0)} ms`);
  });

  it("runs every example without NaN-only forecasts and applies decision values", async () => {
    for (const ex of EXAMPLES) {
      const wb = ex.build();
      const model = { ...wb.model!, settings: { ...wb.model!.settings, trials: 300 } };
      const result = await runSimulationInline({ workbook: wb, model });
      for (const f of model.forecasts) {
        const fr = result.forecasts[f.id];
        expect(fr.errors, `${ex.id}/${f.id}`).toBeLessThan(15);
        expect(Number.isFinite(fr.stats.mean), `${ex.id}/${f.id}`).toBe(true);
      }
    }
    const inv = buildExample("inventory");
    const m = { ...inv.model!, settings: { ...inv.model!.settings, trials: 500 } };
    const low = await runSimulationInline({ workbook: inv, model: m, decisionValues: { d_order: 60 } });
    const high = await runSimulationInline({ workbook: inv, model: m, decisionValues: { "Inventario!B11": 140 } });
    // ordering 60 units: sales capped at 60 → profit ≤ 60·(50−30)
    expect(Math.max(...Array.from(low.forecasts.f_profit.values))).toBeLessThanOrEqual(1200 + 1e-9);
    expect(high.forecasts.f_fill.stats.mean).toBeGreaterThan(low.forecasts.f_fill.stats.mean);
  });

  it("aborts and returns a partial result", async () => {
    const wb = buildExample("project");
    const model = { ...wb.model!, settings: { ...wb.model!.settings, trials: 50000 } };
    const ctrl = new AbortController();
    const result = await runSimulationInline({ workbook: wb, model }, (p) => {
      if (p.type === "progress" && p.completed >= 1000) ctrl.abort();
    }, ctrl.signal);
    expect(result.trials).toBeLessThan(50000);
    expect(result.trials).toBeGreaterThanOrEqual(1000);
  });

  it("runSimulationInWorker falls back to inline when Worker is unavailable", async () => {
    const wb = buildExample("inventory");
    const model = { ...wb.model!, settings: { ...wb.model!.settings, trials: 200 } };
    const result = await runSimulationInWorker({ workbook: wb, model });
    expect(result.trials).toBe(200);
  });
});

describe("worker protocol", () => {
  it("handles run messages and posts progress + done with transferables", async () => {
    const posted: { msg: SimulationProgress; transfer?: Transferable[] }[] = [];
    let listener: ((ev: MessageEvent) => void) | null = null;
    let resolveDone: () => void = () => {};
    const done = new Promise<void>((r) => (resolveDone = r));
    attachSimulationWorker({
      postMessage: (msg: unknown, transfer?: Transferable[]) => {
        posted.push({ msg: msg as SimulationProgress, transfer });
        if ((msg as SimulationProgress).type !== "progress") resolveDone();
      },
      addEventListener: (_t, l) => (listener = l),
    });
    const wb = buildExample("loan");
    const model = { ...wb.model!, settings: { ...wb.model!.settings, trials: 300 } };
    listener!({ data: { type: "run", job: { workbook: wb, model } } } as MessageEvent);
    await done;
    const last = posted.at(-1)!;
    expect(last.msg.type).toBe("done");
    if (last.msg.type === "done") {
      expect(last.msg.result.trials).toBe(300);
      expect(last.transfer?.length).toBe(resultTransferables(last.msg.result).length);
      expect(last.transfer!.length).toBeGreaterThan(0);
    }
    expect(posted.some((p) => p.msg.type === "progress")).toBe(true);
  });

  it("posts an error message for invalid jobs", async () => {
    const posted: SimulationProgress[] = [];
    let listener: ((ev: MessageEvent) => void) | null = null;
    let resolveDone: () => void = () => {};
    const done = new Promise<void>((r) => (resolveDone = r));
    attachSimulationWorker({
      postMessage: (msg: unknown) => {
        posted.push(msg as SimulationProgress);
        resolveDone();
      },
      addEventListener: (_t, l) => (listener = l),
    });
    const wb = buildExample("loan");
    const model = { ...wb.model!, forecasts: [{ id: "x", name: "x", cell: { sheet: "No existe", address: "A1" } }] };
    listener!({ data: { type: "run", job: { workbook: wb, model } } } as MessageEvent);
    await done;
    expect(posted[0].type).toBe("error");
  });
});
