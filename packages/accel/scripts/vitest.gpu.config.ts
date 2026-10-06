import { defineConfig } from "vitest/config";

/** Used by scripts/gpu-check.mjs to prepare shaders, inputs and f64 reference outputs. */
export default defineConfig({
  test: {
    include: ["scripts/gpu-prepare.ts"],
    environment: "node",
    testTimeout: 600_000,
  },
});
