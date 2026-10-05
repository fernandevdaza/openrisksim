/**
 * Run a simulation job in a module Web Worker (with an inline main-thread fallback).
 */
import { cellKey } from "@openrisksim/core";
import type { CellRef, RiskModel, SimulationProgress, SimulationResult } from "@openrisksim/core";
import { runSimulation } from "@openrisksim/engine";
import { SpreadsheetEngine } from "./engine";
import { createWorkbookEvaluator } from "./evaluator";
import type { SimulationJob } from "./types";

/** Decision overrides for a job: `decisionValues` keyed by decision id or by "Sheet!A1". */
export function decisionOverrides(model: RiskModel, decisionValues?: Record<string, number>): { ref: CellRef; value: number }[] {
  if (!decisionValues) return [];
  const out: { ref: CellRef; value: number }[] = [];
  for (const d of model.decisions ?? []) {
    const v = decisionValues[d.id] ?? decisionValues[cellKey(d.cell.sheet, d.cell.address)];
    if (typeof v === "number" && Number.isFinite(v)) out.push({ ref: d.cell, value: v });
  }
  return out;
}

/**
 * Run a job on the current thread (used when Workers are unavailable, in Node and in tests).
 * `onProgress` receives `{ type: "progress" }` messages; the result is returned by the Promise.
 * Aborting returns the partial result.
 */
export async function runSimulationInline(
  job: SimulationJob,
  onProgress?: (p: SimulationProgress) => void,
  signal?: AbortSignal,
): Promise<SimulationResult> {
  const engine = SpreadsheetEngine.fromWorkbook(job.workbook);
  try {
    const evaluator = createWorkbookEvaluator(engine, job.model, {
      decisions: decisionOverrides(job.model, job.decisionValues),
    });
    try {
      return await runSimulation(job.model, evaluator, {
        onProgress: onProgress ? (completed, total) => onProgress({ type: "progress", completed, total }) : undefined,
        signal,
      });
    } finally {
      evaluator.dispose();
    }
  } finally {
    engine.destroy();
  }
}

function canUseWorker(): boolean {
  return typeof Worker !== "undefined" && typeof URL !== "undefined";
}

/**
 * Run a job in a module Web Worker. Progress messages are forwarded to `onProgress`; aborting via
 * `signal` stops the run and resolves with the partial result. Falls back to `runSimulationInline`
 * when Workers are unavailable.
 */
export function runSimulationInWorker(
  job: SimulationJob,
  onProgress?: (p: SimulationProgress) => void,
  signal?: AbortSignal,
): Promise<SimulationResult> {
  if (!canUseWorker()) return runSimulationInline(job, onProgress, signal);
  let worker: Worker;
  try {
    worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return runSimulationInline(job, onProgress, signal);
  }
  return new Promise<SimulationResult>((resolve, reject) => {
    let settled = false;
    let started = false;
    const onAbort = () => worker.postMessage({ type: "abort" });
    const finish = () => {
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    worker.onmessage = (ev: MessageEvent<SimulationProgress>) => {
      const msg = ev.data;
      if (!msg || settled) return;
      started = true;
      if (msg.type === "progress") onProgress?.(msg);
      else if (msg.type === "done") {
        finish();
        resolve(msg.result);
      } else if (msg.type === "error") {
        finish();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (ev: ErrorEvent) => {
      if (settled) return;
      finish();
      ev.preventDefault?.();
      // The worker could not even start (bundler/CSP issue): run on the main thread instead.
      if (!started) runSimulationInline(job, onProgress, signal).then(resolve, reject);
      else reject(new Error(ev.message || "Simulation worker failed"));
    };
    signal?.addEventListener("abort", onAbort);
    worker.postMessage({ type: "run", job });
    if (signal?.aborted) onAbort();
  });
}
