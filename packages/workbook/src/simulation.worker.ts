/// Module Web Worker entry: `new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" })`.
import { attachSimulationWorker, type WorkerScopeLike } from "./worker";

attachSimulationWorker(self as unknown as WorkerScopeLike);
