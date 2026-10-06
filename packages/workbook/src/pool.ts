/**
 * Multicore evaluation: a pool of evaluators, each with its own SpreadsheetEngine, fed with chunks of
 * pre-sampled trials. The coordinator (the simulation worker) samples once, hands out chunks
 * dynamically (work queue) and writes every chunk's outputs back at its trial index, so the merged
 * result is bit-identical to a single-engine run with the same seed.
 *
 * Pool worker protocol (coordinator ↔ `evaluation.worker.ts`):
 *   → `{ type: "init", init: PoolInit }`                 ← `{ type: "ready" }` | `{ type: "error", message }`
 *   → `{ type: "eval", id, inputs, n }` (inputs transferred) ← `{ type: "result", id, outputs }` | `{ type: "error", id, message }`
 */
import type { RiskModel } from "@openrisksim/core";
import { batchEvaluatorFromModelEvaluator, type BatchEvaluator } from "@openrisksim/engine";
import { SpreadsheetEngine } from "./engine";
import { createWorkbookEvaluator } from "./evaluator";
import { decisionOverrides } from "./decisions";
import type { WorkbookData } from "./types";
import type { WorkerScopeLike } from "./worker";

/** What every pool member needs to build its own evaluator. */
export interface PoolInit {
  workbook: WorkbookData;
  model: RiskModel;
  decisionValues?: Record<string, number>;
}

/** One pool member: evaluates `n` row-major input rows, returns `n × forecasts` row-major outputs. */
export interface ChunkWorker {
  evaluate(inputs: Float64Array, n: number): Promise<Float64Array>;
  terminate(): void;
}

/** Creates `size` initialised pool members (rejects when the pool cannot be started). */
export type PoolFactory = (size: number, init: PoolInit) => Promise<ChunkWorker[]>;

export function abortError(): Error {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

/** Synchronous chunk evaluator over a private SpreadsheetEngine (what each pool worker runs). */
export function createChunkEvaluator(init: PoolInit): { evaluate(inputs: Float64Array, n: number): Float64Array; dispose(): void } {
  const engine = SpreadsheetEngine.fromWorkbook(init.workbook);
  try {
    const ev = createWorkbookEvaluator(engine, init.model, { decisions: decisionOverrides(init.model, init.decisionValues) });
    const batch = batchEvaluatorFromModelEvaluator(ev, init.model.forecasts.length);
    return {
      evaluate: (inputs, n) => batch.evaluateBatch(inputs, n, 0) as Float64Array,
      dispose: () => {
        try {
          ev.dispose();
        } finally {
          engine.destroy();
        }
      },
    };
  } catch (e) {
    engine.destroy();
    throw e;
  }
}

/** Pool members running on the current thread (Node, tests): same arithmetic, no parallelism. */
export const inlinePoolFactory: PoolFactory = async (size, init) => {
  const out: ChunkWorker[] = [];
  for (let i = 0; i < size; i++) {
    const ce = createChunkEvaluator(init);
    out.push({
      evaluate: async (inputs, n) => {
        await Promise.resolve();
        return ce.evaluate(inputs, n);
      },
      terminate: () => ce.dispose(),
    });
  }
  return out;
};

/**
 * Batch evaluator over a pool. Each batch is cut into `subChunk`-trial pieces handed out to whichever
 * member is free; outputs are written at their trial index (order-preserving merge).
 */
export function poolBatchEvaluator(workers: ChunkWorker[], outputs: number, subChunk: number): BatchEvaluator {
  const chunk = Math.max(1, Math.floor(subChunk));
  return {
    async evaluateBatch(inputs, n, _offset, signal) {
      const w = n > 0 ? Math.floor(inputs.length / n) : 0;
      const out = new Float64Array(n * outputs);
      let next = 0;
      let failed = false;
      const drive = async (worker: ChunkWorker) => {
        while (next < n && !failed) {
          if (signal?.aborted) throw abortError();
          const start = next;
          const cnt = Math.min(chunk, n - start);
          next += cnt;
          const part = inputs.slice(start * w, (start + cnt) * w);
          let res: Float64Array;
          try {
            res = await worker.evaluate(part, cnt);
          } catch (e) {
            failed = true;
            throw e;
          }
          if (res.length < cnt * outputs) {
            failed = true;
            throw new Error("Pool worker returned a short result");
          }
          out.set(res.length === cnt * outputs ? res : res.subarray(0, cnt * outputs), start * outputs);
        }
      };
      await Promise.all(workers.map(drive));
      return out;
    },
  };
}

// ---- Web Worker pool --------------------------------------------------------------------------

type PoolRequest = { type: "init"; init: PoolInit } | { type: "eval"; id: number; inputs: Float64Array; n: number };
type PoolResponse =
  | { type: "ready" }
  | { type: "result"; id: number; outputs: Float64Array }
  | { type: "error"; id?: number; message: string };

/** Wire the pool-member protocol into a worker scope (used by `evaluation.worker.ts`). */
export function attachEvaluationWorker(scope: WorkerScopeLike): void {
  let ce: ReturnType<typeof createChunkEvaluator> | null = null;
  scope.addEventListener("message", (ev: MessageEvent) => {
    const msg = ev.data as PoolRequest;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "init") {
      try {
        ce?.dispose();
        ce = createChunkEvaluator(msg.init);
        scope.postMessage({ type: "ready" } satisfies PoolResponse);
      } catch (e) {
        scope.postMessage({ type: "error", message: e instanceof Error ? e.message : String(e) } satisfies PoolResponse);
      }
      return;
    }
    if (msg.type === "eval") {
      try {
        if (!ce) throw new Error("Pool worker not initialised");
        const outputs = ce.evaluate(msg.inputs, msg.n);
        scope.postMessage({ type: "result", id: msg.id, outputs } satisfies PoolResponse, [outputs.buffer as ArrayBuffer]);
      } catch (e) {
        scope.postMessage({ type: "error", id: msg.id, message: e instanceof Error ? e.message : String(e) } satisfies PoolResponse);
      }
    }
  });
}

/** Default clamp for the pool size: hardwareConcurrency − 1, between 1 and 16. */
export function defaultWorkerCount(hardwareConcurrency: number): number {
  return Math.max(1, Math.min(16, Math.floor(hardwareConcurrency) - 1));
}

export function canSpawnWorkers(): boolean {
  return typeof Worker !== "undefined" && typeof URL !== "undefined";
}

function spawnChunkWorker(init: PoolInit, timeoutMs: number): Promise<ChunkWorker> {
  return new Promise<ChunkWorker>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./evaluation.worker.ts", import.meta.url), { type: "module" });
    } catch (e) {
      reject(e);
      return;
    }
    const pending = new Map<number, { resolve: (v: Float64Array) => void; reject: (e: Error) => void }>();
    let ready = false;
    let dead = false;
    let seq = 0;
    const timer = setTimeout(() => fail(new Error("Pool worker did not start in time")), timeoutMs);
    const fail = (err: Error) => {
      if (dead) return;
      dead = true;
      clearTimeout(timer);
      worker.terminate();
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      if (!ready) reject(err);
    };
    const member: ChunkWorker = {
      evaluate(inputs, n) {
        if (dead) return Promise.reject(new Error("Pool worker terminated"));
        const id = ++seq;
        return new Promise<Float64Array>((res, rej) => {
          pending.set(id, { resolve: res, reject: rej });
          worker.postMessage({ type: "eval", id, inputs, n } satisfies PoolRequest, [inputs.buffer as ArrayBuffer]);
        });
      },
      terminate() {
        if (dead) return;
        dead = true;
        clearTimeout(timer);
        worker.terminate();
        for (const p of pending.values()) p.reject(new Error("Pool worker terminated"));
        pending.clear();
      },
    };
    worker.onmessage = (ev: MessageEvent<PoolResponse>) => {
      const msg = ev.data;
      if (!msg || dead) return;
      if (msg.type === "ready") {
        ready = true;
        clearTimeout(timer);
        resolve(member);
      } else if (msg.type === "result") {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        p?.resolve(msg.outputs);
      } else if (msg.type === "error") {
        if (msg.id === undefined) fail(new Error(msg.message));
        else {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          p?.reject(new Error(msg.message));
        }
      }
    };
    worker.onerror = (ev: ErrorEvent) => {
      ev.preventDefault?.();
      fail(new Error(ev.message || "Pool worker failed"));
    };
    worker.postMessage({ type: "init", init } satisfies PoolRequest);
  });
}

/** Pool of module Web Workers (works from the main thread and from a dedicated worker). */
export const webWorkerPoolFactory: PoolFactory = async (size, init) => {
  if (!canSpawnWorkers()) throw new Error("Web Workers are not available");
  const settled = await Promise.allSettled(Array.from({ length: size }, () => spawnChunkWorker(init, 60000)));
  const ok = settled.filter((s): s is PromiseFulfilledResult<ChunkWorker> => s.status === "fulfilled").map((s) => s.value);
  const bad = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
  if (bad) {
    ok.forEach((w) => w.terminate());
    throw bad.reason instanceof Error ? bad.reason : new Error(String(bad.reason));
  }
  return ok;
};
