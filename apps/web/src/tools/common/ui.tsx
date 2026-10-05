/**
 * Small presentational helpers shared by the tool windows.
 */
import { useEffect, useState, type ReactNode } from "react";
import { CircleHelp, Info, CircleCheck, TriangleAlert, CircleX, FileSpreadsheet, ChevronDown, ChevronRight } from "lucide-react";
import { Button, Field, NumberInput, Select, clsx } from "../../components/ui";
import { useModelStore } from "../../store/model";
import { useSimulationStore } from "../../store/simulation";
import { useToolsT } from "./i18n";
import { exportToNewSheet, errorMessage } from "./workbook";

/** Collapsible "¿Qué hace?" box. */
export function HelpBox({ children, defaultOpen = false }: { children: ReactNode; defaultOpen?: boolean }) {
  const { t } = useToolsT();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3 rounded-md border border-blue-200 bg-blue-50/60 text-sm dark:border-blue-900 dark:bg-blue-950/30">
      <button type="button" className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left font-medium text-blue-900 dark:text-blue-200" onClick={() => setOpen(!open)}>
        <CircleHelp size={15} />
        {t("common.whatItDoes")}
        {open ? <ChevronDown size={14} className="ml-auto" /> : <ChevronRight size={14} className="ml-auto" />}
      </button>
      {open && <div className="space-y-1.5 px-3 pb-2.5 text-slate-700 dark:text-slate-300">{children}</div>}
    </div>
  );
}

type Tone = "info" | "good" | "warn" | "bad";
const toneCls: Record<Tone, string> = {
  info: "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200",
  good: "border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200",
  warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  bad: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
};
const toneIcon: Record<Tone, ReactNode> = {
  info: <Info size={15} className="mt-0.5 shrink-0" />,
  good: <CircleCheck size={15} className="mt-0.5 shrink-0" />,
  warn: <TriangleAlert size={15} className="mt-0.5 shrink-0" />,
  bad: <CircleX size={15} className="mt-0.5 shrink-0" />,
};

/** Interpretation hint / status message (icon + text, never colour alone). */
export function Note({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex gap-2 rounded-md border px-3 py-2 text-sm", toneCls[tone], className)} role={tone === "bad" ? "alert" : undefined}>
      {toneIcon[tone]}
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const { t } = useToolsT();
  if (!error) return null;
  return <Note tone="bad">{errorMessage(error, t)}</Note>;
}

/** Grid of labelled statistics. */
export function StatGrid({ items, cols = 4 }: { items: { label: ReactNode; value: ReactNode; hint?: ReactNode }[]; cols?: 2 | 3 | 4 | 5 }) {
  const colCls = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" }[cols];
  return (
    <div className={clsx("grid grid-cols-2 gap-2", colCls)}>
      {items.map((it, i) => (
        <div key={i} className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
          <div className="text-xs text-slate-500 dark:text-slate-400">{it.label}</div>
          <div className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">{it.value}</div>
          {it.hint && <div className="text-xs text-slate-500 dark:text-slate-400">{it.hint}</div>}
        </div>
      ))}
    </div>
  );
}

export function Section({ title, children, actions, className }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={clsx("space-y-2", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2">
          {title && <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>}
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** "Exportar a hoja" button: builds rows lazily, writes a new sheet and shows the sheet name. */
export function ExportButton({ sheetName, build, label }: { sheetName: string; build: () => (number | string | null)[][]; label?: ReactNode }) {
  const { t } = useToolsT();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        onClick={() => {
          try {
            const name = exportToNewSheet(sheetName, build());
            setMsg(t("common.exported", { name }));
          } catch (e) {
            setMsg(errorMessage(e, t));
          }
        }}
      >
        <FileSpreadsheet size={14} />
        {label ?? t("common.exportToSheet")}
      </Button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </span>
  );
}

/** Number field with label. */
export function NumField({
  label,
  value,
  onChange,
  hint,
  min,
  max,
  className,
  disabled,
}: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  hint?: ReactNode;
  min?: number;
  max?: number;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      <NumberInput value={value} onChange={(v) => onChange(clamp(v, min, max))} min={min} max={max} disabled={disabled} />
    </Field>
  );
}

/** Field editing a fraction shown as a percentage (12 ⇒ 0.12). */
export function PctField({ label, value, onChange, hint, className, disabled }: { label: ReactNode; value: number; onChange: (v: number) => void; hint?: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <Field label={<>{label} (%)</>} hint={hint} className={className}>
      <NumberInput value={round(value * 100, 10)} onChange={(v) => onChange(v / 100)} disabled={disabled} />
    </Field>
  );
}

function round(v: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}
function clamp(v: number, min?: number, max?: number): number {
  if (min !== undefined && v < min) return min;
  if (max !== undefined && v > max) return max;
  return v;
}

/** Select a forecast of the current model. */
export function ForecastSelect({ value, onChange, label, onlyWithResults }: { value: string; onChange: (id: string) => void; label?: ReactNode; onlyWithResults?: boolean }) {
  const { t } = useToolsT();
  const forecasts = useModelStore((s) => s.model.forecasts);
  const result = useSimulationStore((s) => s.result);
  const list = onlyWithResults ? forecasts.filter((f) => result?.forecasts[f.id]) : forecasts;
  // keep the selection valid when the model changes (e.g. another workbook was opened)
  const valid = list.some((f) => f.id === value);
  useEffect(() => {
    if (!valid && list.length) onChange(list[0].id);
  }, [valid, list, onChange]);
  return (
    <Field label={label ?? t("common.forecast")}>
      <Select
        value={value}
        onChange={onChange}
        options={list.length ? list.map((f) => ({ value: f.id, label: `${f.name} (${f.cell.sheet}!${f.cell.address})` })) : [{ value: "", label: t("common.noForecasts") }]}
        disabled={!list.length}
      />
    </Field>
  );
}

/** Small "running…" indicator with optional progress bar. */
export function Progress({ value, label }: { value?: number; label?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      <div className="h-2 w-48 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
      </div>
      {label}
    </div>
  );
}

/** Two-column responsive layout: form on the left, results on the right. */
export function SplitLayout({ form, children }: { form: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
      <div className="space-y-3">{form}</div>
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-blue-700" />
      {label}
    </label>
  );
}
