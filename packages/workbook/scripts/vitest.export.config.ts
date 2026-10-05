import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/export-examples.ts"],
    environment: "node",
  },
});
