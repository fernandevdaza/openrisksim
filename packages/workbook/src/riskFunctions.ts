/**
 * Detect `ORS.<DIST>(…)` risk functions with literal arguments in a workbook and turn them into
 * assumption definitions (like Risk Simulator's RS* / @RISK's Risk* functions).
 */
import type { AssumptionDef, DistributionSpec } from "@openrisksim/core";
import type { WorkbookData } from "./types";

const NUM = String.raw`\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*`;
const RE = new RegExp(String.raw`^\s*ORS\.(NORMAL|TRIANGULAR|UNIFORM|PERT|LOGNORMAL)\((${NUM}(?:,${NUM})*)\)\s*$`, "i");

function specFor(fn: string, a: number[]): DistributionSpec | null {
  switch (fn.toUpperCase()) {
    case "NORMAL":
      return a.length === 2 ? { id: "normal", params: { mean: a[0], stdDev: a[1] } } : null;
    case "LOGNORMAL":
      return a.length === 2 ? { id: "lognormal", params: { mean: a[0], stdDev: a[1] } } : null;
    case "UNIFORM":
      return a.length === 2 ? { id: "uniform", params: { min: a[0], max: a[1] } } : null;
    case "TRIANGULAR":
      return a.length === 3 ? { id: "triangular", params: { min: a[0], mode: a[1], max: a[2] } } : null;
    case "PERT":
      return a.length === 3 ? { id: "pert", params: { min: a[0], mode: a[1], max: a[2] } } : null;
    default:
      return null;
  }
}

/** Assumptions for every cell whose whole formula is an ORS distribution call with numeric literals. */
export function detectRiskFunctions(wb: WorkbookData): AssumptionDef[] {
  const out: AssumptionDef[] = [];
  for (const sheet of wb.sheets) {
    for (const [address, cell] of Object.entries(sheet.cells)) {
      if (!cell.f) continue;
      const m = RE.exec(cell.f);
      if (!m) continue;
      const args = m[2].split(",").map((s) => Number(s.trim()));
      if (args.some((x) => !Number.isFinite(x))) continue;
      const spec = specFor(m[1], args);
      if (!spec) continue;
      out.push({
        id: `ors_${sheet.name}_${address}`.replace(/[^A-Za-z0-9_]/g, "_"),
        name: `${sheet.name}!${address}`,
        cell: { sheet: sheet.name, address: address.replace(/\$/g, "").toUpperCase() },
        distribution: spec,
        enabled: true,
      });
    }
  }
  return out;
}
