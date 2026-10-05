import { create } from "zustand";
import {
  emptyModel,
  type AssumptionDef,
  type CellRef,
  type CorrelationDef,
  type DecisionVariableDef,
  type ForecastDef,
  type RiskModel,
  type SimulationSettings,
} from "@openrisksim/core";

export type DefinitionKind = "assumption" | "forecast" | "decision";

export interface ModelState {
  model: RiskModel;
  setModel(m: RiskModel): void;
  upsertAssumption(a: AssumptionDef): void;
  removeAssumption(id: string): void;
  upsertForecast(f: ForecastDef): void;
  removeForecast(id: string): void;
  upsertDecision(d: DecisionVariableDef): void;
  removeDecision(id: string): void;
  setCorrelations(c: CorrelationDef[]): void;
  /** Accepts a full or partial settings object (merged). */
  setSettings(s: Partial<SimulationSettings>): void;
  /** Remove every definition on the given cells. Returns number removed. */
  removeDefinitionsAt(sheet: string, addresses: string[]): number;
}

export function sameCell(a: CellRef, b: CellRef): boolean {
  return a.sheet === b.sheet && a.address.replace(/\$/g, "").toUpperCase() === b.address.replace(/\$/g, "").toUpperCase();
}

/** Normalise a model coming from a file (older/foreign versions, missing fields). */
export function sanitizeModel(m: Partial<RiskModel> | null | undefined): RiskModel {
  const base = emptyModel();
  if (!m) return base;
  return {
    version: 1,
    assumptions: Array.isArray(m.assumptions) ? m.assumptions.map((a) => ({ ...a, enabled: a.enabled !== false })) : [],
    forecasts: Array.isArray(m.forecasts) ? m.forecasts : [],
    decisions: Array.isArray(m.decisions) ? m.decisions : [],
    correlations: Array.isArray(m.correlations) ? m.correlations : [],
    settings: { ...base.settings, ...(m.settings ?? {}) },
  };
}

function upsert<T extends { id: string; cell: CellRef }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  // one definition of a kind per cell
  const filtered = list.filter((x) => x.id === item.id || !sameCell(x.cell, item.cell));
  if (idx < 0) return [...filtered, item];
  return filtered.map((x) => (x.id === item.id ? item : x));
}

export const useModelStore = create<ModelState>()((set, get) => ({
  model: emptyModel(),
  setModel: (m) => set({ model: sanitizeModel(m) }),
  upsertAssumption: (a) =>
    set((s) => {
      const assumptions = upsert(s.model.assumptions, a);
      const kept = new Set(assumptions.map((x) => x.id));
      return {
        model: {
          ...s.model,
          assumptions,
          // an assumption cell cannot also be a forecast
          forecasts: s.model.forecasts.filter((f) => !sameCell(f.cell, a.cell)),
          correlations: s.model.correlations.filter((c) => kept.has(c.a) && kept.has(c.b)),
        },
      };
    }),
  removeAssumption: (id) =>
    set((s) => ({
      model: {
        ...s.model,
        assumptions: s.model.assumptions.filter((a) => a.id !== id),
        correlations: s.model.correlations.filter((c) => c.a !== id && c.b !== id),
      },
    })),
  upsertForecast: (f) =>
    set((s) => {
      const removed = new Set(s.model.assumptions.filter((a) => sameCell(a.cell, f.cell)).map((a) => a.id));
      return {
        model: {
          ...s.model,
          forecasts: upsert(s.model.forecasts, f),
          assumptions: s.model.assumptions.filter((a) => !removed.has(a.id)),
          correlations: s.model.correlations.filter((c) => !removed.has(c.a) && !removed.has(c.b)),
        },
      };
    }),
  removeForecast: (id) =>
    set((s) => ({
      model: {
        ...s.model,
        forecasts: s.model.forecasts.filter((f) => f.id !== id),
        settings: s.model.settings.precisionControl?.forecastId === id ? { ...s.model.settings, precisionControl: null } : s.model.settings,
      },
    })),
  upsertDecision: (d) => set((s) => ({ model: { ...s.model, decisions: upsert(s.model.decisions, d) } })),
  removeDecision: (id) => set((s) => ({ model: { ...s.model, decisions: s.model.decisions.filter((d) => d.id !== id) } })),
  setCorrelations: (c) => set((s) => ({ model: { ...s.model, correlations: c.filter((x) => x.a !== x.b && x.rho !== 0) } })),
  setSettings: (st) => set((s) => ({ model: { ...s.model, settings: { ...s.model.settings, ...st } } })),
  removeDefinitionsAt: (sheet, addresses) => {
    const set0 = new Set(addresses.map((a) => a.toUpperCase()));
    const hit = (c: CellRef) => c.sheet === sheet && set0.has(c.address.toUpperCase());
    const m = get().model;
    const removedA = new Set(m.assumptions.filter((a) => hit(a.cell)).map((a) => a.id));
    const nF = m.forecasts.filter((f) => hit(f.cell)).length;
    const nD = m.decisions.filter((d) => hit(d.cell)).length;
    const total = removedA.size + nF + nD;
    if (total === 0) return 0;
    const forecasts = m.forecasts.filter((f) => !hit(f.cell));
    set({
      model: {
        ...m,
        assumptions: m.assumptions.filter((a) => !removedA.has(a.id)),
        forecasts,
        decisions: m.decisions.filter((d) => !hit(d.cell)),
        correlations: m.correlations.filter((c) => !removedA.has(c.a) && !removedA.has(c.b)),
        settings: m.settings.precisionControl && !forecasts.some((f) => f.id === m.settings.precisionControl?.forecastId) ? { ...m.settings, precisionControl: null } : m.settings,
      },
    });
    return total;
  },
}));

/** Map "Sheet!A1" → definition kinds present on that cell (for grid highlighting). */
export function definitionIndex(model: RiskModel): Map<string, { kind: DefinitionKind; def: AssumptionDef | ForecastDef | DecisionVariableDef }[]> {
  const map = new Map<string, { kind: DefinitionKind; def: AssumptionDef | ForecastDef | DecisionVariableDef }[]>();
  const add = (kind: DefinitionKind, def: AssumptionDef | ForecastDef | DecisionVariableDef) => {
    const k = `${def.cell.sheet}!${def.cell.address.replace(/\$/g, "").toUpperCase()}`;
    const arr = map.get(k);
    if (arr) arr.push({ kind, def });
    else map.set(k, [{ kind, def }]);
  };
  model.assumptions.forEach((a) => add("assumption", a));
  model.forecasts.forEach((f) => add("forecast", f));
  model.decisions.forEach((d) => add("decision", d));
  return map;
}
