import { describe, expect, it } from "vitest";
import { buildExample } from "./examples";
import { buildSimulationReport } from "./report";
import { runSimulationInline } from "./runInWorker";
import { readXlsx, writeXlsx } from "./xlsx";

describe("buildSimulationReport", () => {
  it("builds bilingual report sheets that can be written to xlsx", async () => {
    const wb = buildExample("project");
    const model = { ...wb.model!, settings: { ...wb.model!.settings, trials: 12000 } };
    const result = await runSimulationInline({ workbook: wb, model });
    const es = buildSimulationReport(model, result, "es");
    const en = buildSimulationReport(model, result, "en");
    expect(es.map((s) => s.name)).toEqual(["Resumen", "Pronósticos", "Supuestos", "Sensibilidad", "Datos de simulación"]);
    expect(en.map((s) => s.name)).toEqual(["Summary", "Forecasts", "Assumptions", "Sensitivity", "Simulation data"]);
    const fc = en[1].rows;
    expect(fc[0]).toEqual(["Statistic", "VAN", "TIR"]);
    const meanRow = fc.find((r) => r[0] === "Mean")!;
    expect(meanRow[1]).toBeCloseTo(result.forecasts.f_npv.stats.mean, 6);
    expect(fc.some((r) => r[0] === "P5")).toBe(true);
    expect(fc.some((r) => r[0] === "P95")).toBe(true);
    const below = fc.find((r) => r[0] === "P(x < 0)")!;
    const above = fc.find((r) => r[0] === "P(x ≥ 0)")!;
    expect((below[1] as number) + (above[1] as number)).toBeCloseTo(1, 12);
    const assumptions = es[2].rows;
    expect(assumptions[0][0]).toBe("Nombre");
    expect(assumptions.length).toBeGreaterThanOrEqual(1 + model.assumptions.length);
    const raw = en[4].rows;
    expect(raw.length).toBe(2 + 10000); // capped at 10k trials
    expect(raw[1]).toEqual(["Trial", ...model.assumptions.map((a) => a.name), "VAN", "TIR"]);

    const buf = await writeXlsx(wb, { includeModel: true, reports: es });
    const back = await readXlsx(buf);
    expect(back.sheets.map((s) => s.name)).toEqual(["Proyecto", "Resumen", "Pronósticos", "Supuestos", "Sensibilidad", "Datos de simulación"]);
    expect(back.model).toEqual(wb.model);
  });

  it("uses each forecast's confidence level for the CI of the mean and reports the backend", async () => {
    const wb = buildExample("project");
    const model = { ...wb.model!, settings: { ...wb.model!.settings, trials: 800, acceleration: "standard" as const } };
    const result = await runSimulationInline({ workbook: wb, model });
    const uniform = { ...model, forecasts: model.forecasts.map((f) => ({ ...f, confidence: 0.9 })) };
    const es = buildSimulationReport(uniform, result, "es");
    const low = es[1].rows.find((r) => r[0] === "IC 90 % de la media – inferior")!;
    const high = es[1].rows.find((r) => r[0] === "IC 90 % de la media – superior")!;
    const st = result.forecasts.f_npv.stats;
    expect(low[1] as number).toBeGreaterThan(st.meanCI95[0]);
    expect(high[1] as number).toBeLessThan(st.meanCI95[1]);
    expect(((low[1] as number) + (high[1] as number)) / 2).toBeCloseTo(st.mean, 6);
    expect(es[0].rows.find((r) => r[0] === "Motor de evaluación")?.[1]).toBe("Estándar (hoja de cálculo)");

    const mixed = { ...model, forecasts: model.forecasts.map((f, i) => ({ ...f, confidence: i ? 0.99 : undefined })) };
    const en = buildSimulationReport(mixed, result, "en");
    expect(en[1].rows.find((r) => r[0] === "CI confidence level")).toEqual(["CI confidence level", "95%", "99%"]);
    const lowEn = en[1].rows.find((r) => r[0] === "CI of mean – lower")!;
    expect(lowEn[1]).toBeCloseTo(st.meanCI95[0], 9);
  });
});
