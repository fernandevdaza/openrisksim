/**
 * Writes every example workbook to `<repo>/examples/*.xlsx` (with the model in the hidden sheet).
 *
 * Run (from the repo root):
 *   pnpm --filter @openrisksim/workbook export-examples
 * which executes this file through Vitest (`scripts/vitest.export.config.ts`): the monorepo packages
 * are consumed from TypeScript source with extensionless imports, which `node --experimental-strip-types`
 * cannot resolve.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { EXAMPLES } from "../src/examples";
import { readXlsx, writeXlsx } from "../src/xlsx";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../../../examples");

export async function exportExamples(dir = outDir): Promise<string[]> {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const ex of EXAMPLES) {
    const wb = ex.build();
    const file = join(dir, wb.fileName ?? `${ex.id}.xlsx`);
    const buf = await writeXlsx(wb, { includeModel: true });
    writeFileSync(file, new Uint8Array(buf));
    written.push(file);
  }
  return written;
}

test("export examples to /examples", async () => {
  const files = await exportExamples();
  for (const f of files) console.log(`wrote ${f}`);
  expect(files.length).toBe(EXAMPLES.length);
  // sanity: the written files read back with their model
  const { readFileSync } = await import("node:fs");
  for (const f of files) {
    const b = readFileSync(f);
    const wb = await readXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    expect(wb.model).not.toBeNull();
  }
});
