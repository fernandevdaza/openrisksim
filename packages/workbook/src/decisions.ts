import { cellKey } from "@openrisksim/core";
import type { CellRef, RiskModel } from "@openrisksim/core";

/** Decision overrides for a job: `decisionValues` keyed by decision id or by "Sheet!A1". */
export function decisionOverrides(model: RiskModel, decisionValues?: Record<string, number>): { ref: CellRef; value: number }[] {
  if (!decisionValues) return [];
  const out: { ref: CellRef; value: number }[] = [];
  for (const d of model.decisions ?? []) {
    const v = decisionValues[d.id] ?? decisionValues[cellKey(d.cell.sheet, d.cell.address)];
    if (typeof v === "number" && Number.isFinite(v)) out.push({ ref: d.cell, value: v });
  }
  return out;
}
