import { describe, expect, it } from "vitest";
import { parseA1 } from "./address";
import { SpreadsheetEngine } from "./engine";
import { EXAMPLES } from "./examples";
import { readXlsx, writeXlsx } from "./xlsx";

describe("EXAMPLES", () => {
  it("has unique ids and bilingual texts", () => {
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(5);
    for (const e of EXAMPLES) {
      expect(e.name.es && e.name.en && e.description.es && e.description.en).toBeTruthy();
    }
  });

  for (const ex of EXAMPLES) {
    describe(ex.id, () => {
      const wb = ex.build();

      it("has zero formula errors and cached values", () => {
        const errors: string[] = [];
        for (const s of wb.sheets) {
          for (const [addr, c] of Object.entries(s.cells)) {
            if (!c.f) continue;
            if (c.t === "e" || c.v === undefined) errors.push(`${s.name}!${addr}: =${c.f} → ${String(c.v)}`);
          }
        }
        expect(errors).toEqual([]);
      });

      it("model references existing cells with numeric values", () => {
        const m = wb.model!;
        expect(m).toBeTruthy();
        const engine = SpreadsheetEngine.fromWorkbook(wb);
        try {
          const ids = new Set<string>();
          for (const r of [...m.assumptions, ...m.forecasts, ...m.decisions]) {
            expect(ids.has(r.id)).toBe(false);
            ids.add(r.id);
            expect(engine.sheetNames()).toContain(r.cell.sheet);
            expect(() => parseA1(r.cell.address)).not.toThrow();
            const v = engine.getValue(r.cell);
            expect(typeof v, `${r.name} @ ${r.cell.address} = ${JSON.stringify(v)}`).toBe("number");
          }
          for (const c of m.correlations) {
            expect(m.assumptions.some((a) => a.id === c.a)).toBe(true);
            expect(m.assumptions.some((a) => a.id === c.b)).toBe(true);
          }
          for (const d of m.decisions) expect(d.lower).toBeLessThan(d.upper);
        } finally {
          engine.destroy();
        }
      });

      it("round-trips through xlsx", async () => {
        const back = await readXlsx(await writeXlsx(wb));
        expect(back.model).toEqual(wb.model);
        expect(back.sheets.map((s) => s.name)).toEqual(wb.sheets.map((s) => s.name));
        for (let i = 0; i < wb.sheets.length; i++) {
          for (const [addr, c] of Object.entries(wb.sheets[i].cells)) {
            const b = back.sheets[i].cells[addr];
            if (c.f) {
              expect(b?.f, addr).toBe(c.f);
              if (typeof c.v === "number") expect(b?.v as number).toBeCloseTo(c.v, 6);
            }
          }
        }
      });
    });
  }
});
