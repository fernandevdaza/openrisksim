/// Module Web Worker entry for one member of the multicore evaluation pool (see pool.ts).
import { attachEvaluationWorker } from "./pool";
import type { WorkerScopeLike } from "./worker";

attachEvaluationWorker(self as unknown as WorkerScopeLike);
