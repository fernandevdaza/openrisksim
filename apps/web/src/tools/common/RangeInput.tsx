/**
 * Data input widgets for the tools:
 *  - RangeInput: "Hoja!B2:B40" text field + "Usar selección" button (reads the grid selection).
 *  - DataSourceInput: range | pasted text | simulated forecast, resolved with resolveDataSource().
 */
import type { ReactNode } from "react";
import { SquareDashedMousePointer } from "lucide-react";
import { Button, Field, Input, Select, clsx } from "../../components/ui";
import { useModelStore } from "../../store/model";
import { useSimulationStore } from "../../store/simulation";
import { useToolsT } from "./i18n";
import { parseNumberList, parseTable, type CellValue } from "./parse";
import { ToolError, forecastValues, readRange, readRangeNumbers, selectionRef } from "./workbook";

export function RangeInput({
  value,
  onChange,
  label,
  hint,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: ReactNode;
  hint?: ReactNode;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useToolsT();
  const control = (
    <div className="flex gap-1.5">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? t("common.rangePlaceholder")} spellCheck={false} />
      <Button
        type="button"
        size="sm"
        title={t("common.useSelectionHint")}
        onClick={() => {
          const ref = selectionRef();
          if (ref) onChange(ref);
        }}
        className="shrink-0 whitespace-nowrap"
      >
        <SquareDashedMousePointer size={14} />
        {t("common.useSelection")}
      </Button>
    </div>
  );
  if (label === undefined) return <div className={className}>{control}</div>;
  return (
    <Field label={label} hint={hint} className={className}>
      {control}
    </Field>
  );
}

export type DataSourceMode = "range" | "paste" | "forecast";
export interface DataSourceState {
  mode: DataSourceMode;
  range: string;
  text: string;
  forecastId: string;
}
export const emptySource = (mode: DataSourceMode = "range"): DataSourceState => ({ mode, range: "", text: "", forecastId: "" });

export function DataSourceInput({
  value,
  onChange,
  allowForecast = false,
  label,
  rows = 5,
  matrix = false,
}: {
  value: DataSourceState;
  onChange: (v: DataSourceState) => void;
  allowForecast?: boolean;
  label?: ReactNode;
  rows?: number;
  /** Hint that a multi-column table is expected (regression). */
  matrix?: boolean;
}) {
  const { t } = useToolsT();
  const forecasts = useModelStore((s) => s.model.forecasts);
  const result = useSimulationStore((s) => s.result);
  const withResults = forecasts.filter((f) => result?.forecasts[f.id]);
  const modes: { id: DataSourceMode; label: string }[] = [
    { id: "range", label: t("common.source.range") },
    { id: "paste", label: t("common.source.paste") },
  ];
  if (allowForecast) modes.push({ id: "forecast", label: t("common.source.forecast") });
  const set = (patch: Partial<DataSourceState>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-1.5">
      {label && <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</div>}
      <div className="flex gap-1" role="radiogroup">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={value.mode === m.id}
            onClick={() => set({ mode: m.id })}
            className={clsx(
              "rounded-md border px-2 py-0.5 text-xs",
              value.mode === m.id
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {value.mode === "range" && <RangeInput value={value.range} onChange={(range) => set({ range })} />}
      {value.mode === "paste" && (
        <textarea
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          rows={rows}
          value={value.text}
          placeholder={matrix ? t("common.pasteMatrixPlaceholder") : t("common.pastePlaceholder")}
          onChange={(e) => set({ text: e.target.value })}
          spellCheck={false}
        />
      )}
      {value.mode === "forecast" && (
        <Select
          value={value.forecastId}
          onChange={(forecastId) => set({ forecastId })}
          options={[
            { value: "", label: withResults.length ? t("common.chooseForecast") : t("common.noResults") },
            ...withResults.map((f) => ({ value: f.id, label: f.name })),
          ]}
        />
      )}
    </div>
  );
}

/** Resolve a data source to numbers. Throws ToolError with an i18n key. */
export function resolveDataSource(s: DataSourceState, minCount = 2): number[] {
  let values: number[];
  if (s.mode === "range") {
    if (!s.range.trim()) throw new ToolError("common.errors.noRange");
    values = readRangeNumbers(s.range);
  } else if (s.mode === "paste") {
    values = parseNumberList(s.text);
  } else {
    if (!s.forecastId) throw new ToolError("common.errors.noForecast");
    const v = forecastValues(s.forecastId);
    if (!v) throw new ToolError("common.errors.noResults");
    values = Array.from(v);
  }
  if (values.length < minCount) throw new ToolError("common.errors.tooFew", { n: minCount, got: values.length });
  return values;
}

/** Human label for a data source (chart legends, sheet names). */
export function sourceLabel(s: DataSourceState, forecastName?: (id: string) => string | undefined): string {
  if (s.mode === "range") return s.range;
  if (s.mode === "forecast") return forecastName?.(s.forecastId) ?? s.forecastId;
  return "";
}

/** Resolve a data source to a raw matrix (rows × cols) — used when column headers matter. */
export function resolveMatrix(s: DataSourceState): CellValue[][] {
  if (s.mode === "range") {
    if (!s.range.trim()) throw new ToolError("common.errors.noRange");
    return readRange(s.range).values;
  }
  if (s.mode === "paste") return parseTable(s.text);
  throw new ToolError("common.errors.badSource");
}
