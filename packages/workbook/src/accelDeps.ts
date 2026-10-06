// The accelerator's GPU code uses the WebGPU DOM types (a dev dependency of @openrisksim/accel that is
// not linked into this package); reference them so packages type-checking accel's sources resolve them.
/// <reference path="../../accel/node_modules/@webgpu/types/dist/index.d.ts" />
/**
 * Single (lazy) import point for `@openrisksim/accel`.
 *
 * The module is loaded on demand with a dynamic import so that (a) runs in "standard"/"multicore"
 * mode never pay for it, (b) a broken/missing accelerator only disables acceleration instead of
 * breaking the workbook package, and (c) tests can replace it via `vi.mock("./accelDeps", ...)`.
 */
import type * as Accel from "@openrisksim/accel";
export type { CompiledProgram, FormulaSource, GpuInfo, GpuRunner } from "@openrisksim/accel";

export type AccelModule = Pick<typeof Accel, "compileModel" | "compareOutputs" | "createGpuRunner" | "detectGpu">;

let pending: Promise<AccelModule | null> | null = null;

/** Resolves with the accelerator module, or null when it cannot be loaded. */
export function loadAccel(): Promise<AccelModule | null> {
  if (!pending) {
    pending = import("@openrisksim/accel").then(
      (m) => m as AccelModule,
      (e: unknown) => {
        console.warn("[OpenRiskSim] acceleration module unavailable:", e);
        pending = null;
        return null;
      },
    );
  }
  return pending;
}
