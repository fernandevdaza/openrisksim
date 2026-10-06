import { create } from "zustand";
import type { RiskModel, SimulationProgress, SimulationResult } from "@openrisksim/core";
import { createWorkbookEvaluator, runSimulationInWorker, runSimulationInline, type SimulationJob } from "@openrisksim/workbook";
import { sampleAssumptions } from "@openrisksim/engine";
import { createRng } from "@openrisksim/distributions";
import { useWorkbookStore } from "./workbook";
import { useModelStore } from "./model";
import { useUiStore } from "./ui";

/** Upper bound for `settings.trials` (memory: trials × (assumptions + forecasts) × 8 bytes, several copies). */
export const MAX_TRIALS = 5_000_000;
/** Above this, runs without acceleration get a warning in the settings dialog. */
export const LARGE_RUN_TRIALS = 200_000;

export type SimStatus = "idle" | "running" | "done" | "error";

export interface SimulationState {
  status: SimStatus;
  /** 0..1 */
  progress: number;
  result: SimulationResult | null;
  /** Model snapshot that produced `result` (names, cells, formats). */
  resultModel: RiskModel | null;
  /** i18n key (prefixed "sim.") or raw message. */
  error: string | null;
  /** True when the model or workbook changed after the last run. */
  stale: boolean;
  /** True if the last run used the in-thread fallback instead of a Web Worker. */
  usedFallback: boolean;
  /** Trials shown with "step" since the last reset. */
  stepCount: number;
  run(): Promise<void>;
  abort(): void;
  reset(): void;
  step(): void;
}

let controller: AbortController | null = null;

function validate(model: RiskModel): string | null {
  if (!useWorkbookStore.getState().engine) return "sim.errNoWorkbook";
  if (model.forecasts.length === 0) return "sim.errNoForecasts";
  if (!model.assumptions.some((a) => a.enabled)) return "sim.errNoAssumptions";
  if (!(model.settings.trials >= 1) || model.settings.trials > MAX_TRIALS) return "sim.errTrials";
  return null;
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export const useSimulationStore = create<SimulationState>()((set, get) => ({
  status: "idle",
  progress: 0,
  result: null,
  resultModel: null,
  error: null,
  stale: false,
  usedFallback: false,
  stepCount: 0,

  run: async () => {
    if (get().status === "running") return;
    const model = useModelStore.getState().model;
    const err = validate(model);
    if (err) {
      set({ status: "error", error: err });
      return;
    }
    const wbStore = useWorkbookStore.getState();
    wbStore.endStep();
    controller = new AbortController();
    const signal = controller.signal;
    set({ status: "running", progress: 0, error: null, stepCount: 0 });
    const modelSnapshot: RiskModel = JSON.parse(JSON.stringify(model));
    let lastProgress = 0;
    const onProgress = (completed: number, total: number) => {
      const p = total > 0 ? completed / total : 0;
      if (p - lastProgress >= 0.005 || p >= 1) {
        lastProgress = p;
        set({ progress: p });
      }
    };

    let result: SimulationResult | null = null;
    let usedFallback = false;
    // Acceleration fallback reasons (result.backend) come back in the UI language.
    const job: SimulationJob = { workbook: wbStore.snapshot(), model: modelSnapshot, locale: useUiStore.getState().locale };
    const progressCb = (p: SimulationProgress) => {
      if (p.type === "progress") onProgress(p.completed, p.total);
    };
    try {
      // runSimulationInWorker already falls back to an inline run when Workers can't start.
      result = await runSimulationInWorker(job, progressCb, signal);
    } catch (e) {
      if (signal.aborted) {
        set({ status: get().result ? "done" : "idle", progress: 0, error: "sim.aborted" });
        controller = null;
        return;
      }
      const msg = messageOf(e);
      if (/worker/i.test(msg)) {
        // the worker crashed mid-run (e.g. out of memory in the worker): retry on the main thread
        console.warn("[OpenRiskSim] worker simulation failed, retrying inline:", e);
        usedFallback = true;
        try {
          result = await runSimulationInline(job, progressCb, signal);
        } catch (e2) {
          controller = null;
          set({ status: "error", error: messageOf(e2), progress: 0 });
          return;
        }
      } else {
        controller = null;
        set({ status: "error", error: msg, progress: 0 });
        return;
      }
    }
    controller = null;
    if (!result || result.trials === 0) {
      set({ status: get().result ? "done" : "idle", progress: 0, error: signal.aborted ? "sim.aborted" : "sim.errNoTrials" });
      return;
    }
    set({
      status: "done",
      progress: 1,
      result,
      resultModel: modelSnapshot,
      stale: false,
      usedFallback,
      error: signal.aborted ? "sim.abortedPartial" : null,
    });
  },

  abort: () => {
    controller?.abort();
  },

  reset: () => {
    controller?.abort();
    controller = null;
    useWorkbookStore.getState().endStep();
    set({ status: "idle", progress: 0, result: null, resultModel: null, error: null, stale: false, stepCount: 0 });
  },

  step: () => {
    if (get().status === "running") return;
    const model = useModelStore.getState().model;
    const err = validate({ ...model, forecasts: model.forecasts.length ? model.forecasts : [{ id: "_", name: "", cell: { sheet: "", address: "A1" } }] });
    if (err) {
      set({ status: "error", error: err });
      return;
    }
    const wbStore = useWorkbookStore.getState();
    const engine = wbStore.engine!;
    try {
      let ev = wbStore.stepEvaluator;
      if (!ev) {
        ev = createWorkbookEvaluator(engine, model);
        wbStore.setStepEvaluator(ev);
      }
      const seed = model.settings.seed == null ? null : model.settings.seed + get().stepCount;
      const samples = sampleAssumptions(model, 1, createRng(seed));
      const enabled = model.assumptions.filter((a) => a.enabled);
      const inputs = new Float64Array(enabled.length);
      enabled.forEach((a, i) => {
        inputs[i] = samples[a.id]?.[0] ?? NaN;
      });
      ev.evaluate(inputs);
      useWorkbookStore.setState((s) => ({ version: s.version + 1 }));
      set((s) => ({ stepCount: s.stepCount + 1, error: null, status: s.status === "error" ? (s.result ? "done" : "idle") : s.status }));
    } catch (e) {
      wbStore.endStep();
      set({ status: "error", error: messageOf(e) });
    }
  },
}));

// ---- Invalidation wiring -------------------------------------------------------------------
useModelStore.subscribe((s, prev) => {
  if (s.model === prev.model) return;
  // the step evaluator was built for the previous model
  useWorkbookStore.getState().endStep();
  if (useSimulationStore.getState().result) useSimulationStore.setState({ stale: true });
});
useWorkbookStore.subscribe((s, prev) => {
  if (s.engine !== prev.engine) {
    useSimulationStore.getState().reset();
    return;
  }
  if (s.editVersion !== prev.editVersion && useSimulationStore.getState().result) useSimulationStore.setState({ stale: true });
  if (prev.stepEvaluator && !s.stepEvaluator) useSimulationStore.setState({ stepCount: 0 });
});

// Read-only inspection hook for end-to-end tests / debugging (e.g. `__openrisksim.simulation().result.backend`).
if (typeof window !== "undefined") {
  const w = window as unknown as { __openrisksim?: Record<string, unknown> };
  w.__openrisksim = { ...(w.__openrisksim ?? {}), simulation: () => useSimulationStore.getState() };
}
