/**
 * Run a simulation job in a module Web Worker (with an inline main-thread fallback).
 */
import type { SimulationProgress, SimulationResult } from "@openrisksim/core";
import { runAcceleratedSimulation, type AccelerationEnv } from "./acceleration";
import type { SimulationJob } from "./types";

export { decisionOverrides } from "./decisions";

/**
 * Run a job on the current thread (inside the simulation worker; also used when Workers are
 * unavailable, in Node and in tests). Honours `job.model.settings.acceleration` (see acceleration.ts):
 * every mode falls back to the plain spreadsheet engine when it cannot be used.
 * `onProgress` receives `{ type: "progress" }` messages; the result is returned by the Promise.
 * Aborting returns the partial result.
 */
export async function runSimulationInline(
  job: SimulationJob,
  onProgress?: (p: SimulationProgress) => void,
  signal?: AbortSignal,
  env?: AccelerationEnv,
): Promise<SimulationResult> {
  return runAcceleratedSimulation(job, onProgress, signal, env);
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
