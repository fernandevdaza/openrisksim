/**
 * Single import point for `@openrisksim/distributions`, so tests can replace it with deterministic
 * doubles via `vi.mock("./deps", ...)` (see test-utils.ts).
 */
export { createDistribution, createRng, studentTCdf } from "@openrisksim/distributions";
