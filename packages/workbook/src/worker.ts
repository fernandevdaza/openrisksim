/**
 * Simulation worker protocol + handler (shared by the module worker entry `simulation.worker.ts`).
 *
 * main → worker: `{ type: "run", job }` then optionally `{ type: "abort" }`
 * worker → main: `SimulationProgress` messages (`progress`…, then `done` or `error`).
 */
import type { SimulationProgress, SimulationResult } from "@openrisksim/core";
import { runSimulationInline } from "./runInWorker";
import type { SimulationJob } from "./types";

export type WorkerRequest = { type: "run"; job: SimulationJob } | { type: "abort" };
export type WorkerResponse = SimulationProgress;

/** Minimal worker-scope surface we need (avoids depending on the WebWorker lib typings). */
export interface WorkerScopeLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (ev: MessageEvent) => void): void;
}

/** Collect the (deduplicated) ArrayBuffers of a result for zero-copy transfer. */
export function resultTransferables(result: SimulationResult): ArrayBuffer[] {
  const set = new Set<ArrayBuffer>();
  for (const a of Object.values(result.assumptionSamples)) if (a?.buffer instanceof ArrayBuffer) set.add(a.buffer);
  for (const f of Object.values(result.forecasts)) if (f?.values?.buffer instanceof ArrayBuffer) set.add(f.values.buffer);
  return [...set];
}

/** Wire the message handler into a worker scope. */
export function attachSimulationWorker(scope: WorkerScopeLike): void {
  let controller: AbortController | null = null;
  scope.addEventListener("message", (ev: MessageEvent) => {
    const msg = ev.data as WorkerRequest;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "abort") {
      controller?.abort();
      return;
    }
    if (msg.type === "run") {
      controller?.abort();
      const ctrl = new AbortController();
      controller = ctrl;
      runSimulationInline(msg.job, (p) => scope.postMessage(p), ctrl.signal)
        .then((result) => {
          const done: WorkerResponse = { type: "done", result };
          scope.postMessage(done, resultTransferables(result));
        })
        .catch((err: unknown) => {
          const error: WorkerResponse = { type: "error", message: err instanceof Error ? err.message : String(err) };
          scope.postMessage(error);
        })
        .finally(() => {
          if (controller === ctrl) controller = null;
        });
    }
  });
}
