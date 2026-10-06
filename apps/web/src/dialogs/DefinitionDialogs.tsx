import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { newId, type CellRef, type DecisionVariableDef, type ForecastDef } from "@openrisksim/core";
import { Button, Field, Input, Modal, NumberInput, Select } from "../components/ui";
import { useModelStore } from "../store/model";
import { useWorkbookStore } from "../store/workbook";
import { useUiStore } from "../store/ui";
import { actions, guessName } from "../actions";
import { LEVEL_PRESETS } from "../lib/certainty";

const DEFAULT_CERTAINTY = 0.9;
const DEFAULT_CONFIDENCE = 0.95;
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

function Title({ color, text, cell }: { color: string; text: string; cell: CellRef }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block h-3 w-3 rounded-sm ${color}`} />
      {text} — <span className="font-mono text-sm">{cell.sheet}!{cell.address}</span>
    </span>
  );
}

export function ForecastDialog({ cell, id, onClose }: { cell: CellRef; id?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const existing = useModelStore((s) => (id ? s.model.forecasts.find((f) => f.id === id) : undefined));
  const engine = useWorkbookStore((s) => s.engine);
  const [name, setName] = useState(existing?.name ?? guessName(cell));
  const [format, setFormat] = useState<NonNullable<ForecastDef["format"]>>(existing?.format ?? "number");
  // both kept as percentages in the form (90 ⇒ 0.9)
  const [certaintyPct, setCertaintyPct] = useState(round4((existing?.certainty ?? DEFAULT_CERTAINTY) * 100));
  const [confidencePct, setConfidencePct] = useState(round4((existing?.confidence ?? DEFAULT_CONFIDENCE) * 100));
  const certaintyError = !(certaintyPct > 0 && certaintyPct < 100) ? t("forecast.certaintyError") : null;
  const confidenceError = !(confidencePct >= 50 && confidencePct <= 99.9) ? t("forecast.confidenceError") : null;
  const invalid = !!certaintyError || !!confidenceError;
  const isFormula = useMemo(() => actions.isFormulaCell(cell), [cell]);
  const value = useMemo(() => {
    try {
      return engine?.getValue(cell);
    } catch {
      return null;
    }
  }, [engine, cell]);
  const save = () => {
    if (!name.trim() || invalid) return;
    const certainty = round4(certaintyPct / 100);
    const confidence = round4(confidencePct / 100);
    useModelStore.getState().upsertForecast({
      id: existing?.id ?? newId("f"),
      name: name.trim(),
      cell,
      format,
      // defaults are not stored, so models saved before this option existed stay unchanged
      certainty: certainty === DEFAULT_CERTAINTY ? undefined : certainty,
      confidence: confidence === DEFAULT_CONFIDENCE ? undefined : confidence,
    });
    useUiStore.getState().notify(t("forecast.saved", { name: name.trim() }), "success");
    onClose();
  };
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={<Title color="bg-sky-500" text={t("forecast.title")} cell={cell} />}
      footer={
        <>
          {existing && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                useModelStore.getState().removeForecast(existing.id);
                onClose();
              }}
            >
              {t("common.delete")}
            </Button>
          )}
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={save} disabled={!name.trim() || invalid}>
            {t("common.ok")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={t("common.name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} autoFocus />
        </Field>
        <Field label={t("forecast.format")}>
          <Select
            value={format}
            onChange={setFormat}
            options={[
              { value: "number", label: t("forecast.format_number") },
              { value: "currency", label: t("forecast.format_currency") },
              { value: "percent", label: t("forecast.format_percent") },
            ]}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 text-sm">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{t("forecast.certainty")}</span>
              <NumberInput value={certaintyPct} onChange={setCertaintyPct} min={1} max={99.9} />
            </label>
            <PresetChips value={certaintyPct} onPick={setCertaintyPct} label={t("forecast.certainty")} />
            <span className={certaintyError ? "text-xs text-red-600" : "text-xs text-slate-500"}>{certaintyError ?? t("forecast.certaintyHint")}</span>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700 dark:text-slate-300">{t("forecast.confidence")}</span>
              <NumberInput value={confidencePct} onChange={setConfidencePct} min={50} max={99.9} />
            </label>
            <PresetChips value={confidencePct} onPick={setConfidencePct} label={t("forecast.confidence")} />
            <span className={confidenceError ? "text-xs text-red-600" : "text-xs text-slate-500"}>{confidenceError ?? t("forecast.confidenceHint")}</span>
          </div>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {t("forecast.currentValue")}: <span className="font-mono">{value == null ? "—" : typeof value === "object" ? value.error : String(value)}</span>
        </div>
        {!isFormula && <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{t("forecast.noFormulaWarning")}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Quick 80/90/95/99 % buttons under a percentage input. */
function PresetChips({ value, onPick, label }: { value: number; onPick: (pct: number) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {LEVEL_PRESETS.map((p) => {
        const pct = Math.round(p * 100);
        const on = Math.abs(value - pct) < 1e-9;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={on}
            className={`rounded-full border px-1.5 py-0 text-[11px] tabular-nums max-md:min-h-8 max-md:px-2.5 max-md:text-[13px] ${on ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            onClick={() => onPick(pct)}
          >
            {pct}
          </button>
        );
      })}
    </div>
  );
}

export function DecisionDialog({ cell, id, onClose }: { cell: CellRef; id?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const existing = useModelStore((s) => (id ? s.model.decisions.find((d) => d.id === id) : undefined));
  const engine = useWorkbookStore((s) => s.engine);
  const current = useMemo(() => {
    try {
      const v = engine?.getValue(cell);
      return typeof v === "number" ? v : null;
    } catch {
      return null;
    }
  }, [engine, cell]);
  const [name, setName] = useState(existing?.name ?? guessName(cell));
  const [type, setType] = useState<DecisionVariableDef["type"]>(existing?.type ?? "continuous");
  const [lower, setLower] = useState(existing?.lower ?? (current != null ? Math.min(0, current) : 0));
  const [upper, setUpper] = useState(existing?.upper ?? (current != null && current > 0 ? current * 2 : 100));
  const [step, setStep] = useState(existing?.step ?? 1);
  const lo = type === "binary" ? 0 : lower;
  const hi = type === "binary" ? 1 : upper;
  const error = lo >= hi ? t("decision.boundsError") : type === "discrete" && !(step > 0) ? t("decision.stepError") : null;
  const save = () => {
    if (error || !name.trim()) return;
    useModelStore.getState().upsertDecision({
      id: existing?.id ?? newId("d"),
      name: name.trim(),
      cell,
      type,
      lower: lo,
      upper: hi,
      step: type === "discrete" ? step : undefined,
    });
    useUiStore.getState().notify(t("decision.saved", { name: name.trim() }), "success");
    onClose();
  };
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={<Title color="bg-yellow-400" text={t("decision.title")} cell={cell} />}
      footer={
        <>
          {existing && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                useModelStore.getState().removeDecision(existing.id);
                onClose();
              }}
            >
              {t("common.delete")}
            </Button>
          )}
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={save} disabled={!!error || !name.trim()}>
            {t("common.ok")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t("common.name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} autoFocus />
        </Field>
        <Field label={t("decision.typeLabel")}>
          <Select
            value={type}
            onChange={setType}
            options={(["continuous", "integer", "binary", "discrete"] as const).map((v) => ({ value: v, label: t(`decision.type.${v}`) }))}
          />
        </Field>
        {type !== "binary" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("decision.lower")}>
              <NumberInput value={lower} onChange={setLower} />
            </Field>
            <Field label={t("decision.upper")}>
              <NumberInput value={upper} onChange={setUpper} />
            </Field>
          </div>
        )}
        {type === "discrete" && (
          <Field label={t("decision.step")}>
            <NumberInput value={step} onChange={setStep} />
          </Field>
        )}
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {t("decision.currentValue")}: <span className="font-mono">{current ?? "—"}</span>
        </div>
        {error && (
          <div className="text-xs text-red-600" role="alert">
            {error}
          </div>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("decision.hint")}</p>
      </div>
    </Modal>
  );
}
