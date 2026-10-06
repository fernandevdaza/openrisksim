import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SimulationSettings } from "@openrisksim/core";
import { Button, Field, Modal, NumberInput, Select } from "../components/ui";
import { useModelStore } from "../store/model";
import { LARGE_RUN_TRIALS, MAX_TRIALS } from "../store/simulation";
import { AccelerationSettings, useAccelerationCapabilities } from "./AccelerationSettings";

const TRIAL_PRESETS = [1000, 5000, 10000, 100000, 1000000];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const model = useModelStore((s) => s.model);
  const [s, setS] = useState<SimulationSettings>(() => structuredClone(model.settings));
  const [randomSeed, setRandomSeed] = useState(model.settings.seed == null);
  const pc = s.precisionControl ?? null;
  const trialsOk = Number.isInteger(s.trials) && s.trials >= 10 && s.trials <= MAX_TRIALS;
  const caps = useAccelerationCapabilities(model);
  const mode = s.acceleration ?? "auto";
  // Runs that will (most likely) be evaluated by the spreadsheet engine.
  const unaccelerated = mode === "standard" || (mode === "auto" && !!caps && caps !== "error" && !caps.compile.ok);
  const largeRunWarning = trialsOk && s.trials > LARGE_RUN_TRIALS && unaccelerated;

  const save = () => {
    if (!trialsOk) return;
    useModelStore.getState().setSettings({ ...s, seed: randomSeed ? null : s.seed ?? 12345 });
    onClose();
  };

  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title={t("settings.title")}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!trialsOk} onClick={save}>
            {t("common.ok")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label={t("settings.trials")}
          hint={
            !trialsOk ? (
              <span className="text-red-600">{t("accel.trialsError")}</span>
            ) : largeRunWarning ? (
              <span className="text-amber-700 dark:text-amber-300" data-testid="large-run-warning">{t("accel.bigRunWarning")}</span>
            ) : (
              t("settings.trialsHint")
            )
          }
        >
          <div className="flex items-center gap-2 max-md:flex-col max-md:items-stretch">
            <NumberInput className="w-32 max-md:w-full" max={MAX_TRIALS} value={s.trials} onChange={(v) => setS({ ...s, trials: Math.round(v) })} />
            <div className="flex flex-wrap gap-1 max-md:gap-1.5">
              {TRIAL_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setS({ ...s, trials: n })}
                  className={`rounded border px-1.5 py-0.5 text-xs max-md:min-h-9 max-md:min-w-14 max-md:px-3 max-md:text-[13px] ${s.trials === n ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"}`}
                >
                  {n >= 1_000_000 ? `${n / 1_000_000} M` : n.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
        </Field>

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 font-medium text-slate-700 dark:text-slate-300">{t("settings.seed")}</legend>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!randomSeed} onChange={() => setRandomSeed(false)} />
            {t("settings.fixedSeed")}
            <NumberInput className="ml-2 w-32" disabled={randomSeed} value={s.seed ?? 12345} onChange={(v) => setS({ ...s, seed: Math.round(v) })} />
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={randomSeed} onChange={() => setRandomSeed(true)} />
            {t("settings.random")}
          </label>
          <span className="text-xs text-slate-500">{t("settings.seedHint")}</span>
        </fieldset>

        <Field label={t("settings.sampling")} hint={t("settings.samplingHint")}>
          <Select
            value={s.sampling}
            onChange={(v) => setS({ ...s, sampling: v })}
            options={[
              { value: "monteCarlo", label: t("settings.mc") },
              { value: "latinHypercube", label: t("settings.lhs") },
            ]}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.applyCorrelations} onChange={(e) => setS({ ...s, applyCorrelations: e.target.checked })} />
          {t("settings.applyCorrelations")} <span className="text-xs text-slate-500">({t("settings.nCorrelations", { n: model.correlations.length })})</span>
        </label>

        <fieldset className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              disabled={model.forecasts.length === 0}
              checked={!!pc}
              onChange={(e) =>
                setS({ ...s, precisionControl: e.target.checked ? { forecastId: model.forecasts[0]?.id ?? "", relativeError: 0.01, confidence: 0.95 } : null })
              }
            />
            {t("settings.precision")}
          </label>
          <span className="text-xs text-slate-500">{t("settings.precisionHint")}</span>
          {pc && (
            <div className="grid grid-cols-3 gap-2">
              <Field label={t("defs.forecast")}>
                <Select
                  value={pc.forecastId}
                  onChange={(v) => setS({ ...s, precisionControl: { ...pc, forecastId: v } })}
                  options={model.forecasts.map((f) => ({ value: f.id, label: f.name }))}
                />
              </Field>
              <Field label={t("settings.relError")}>
                <NumberInput value={Math.round(pc.relativeError * 1e4) / 100} onChange={(v) => setS({ ...s, precisionControl: { ...pc, relativeError: Math.max(0.0001, v / 100) } })} />
              </Field>
              <Field label={t("settings.confidence")}>
                <Select
                  value={String(pc.confidence)}
                  onChange={(v) => setS({ ...s, precisionControl: { ...pc, confidence: Number(v) } })}
                  options={["0.9", "0.95", "0.99"].map((v) => ({ value: v, label: `${Number(v) * 100}%` }))}
                />
              </Field>
            </div>
          )}
        </fieldset>

        <AccelerationSettings settings={s} onChange={setS} model={model} caps={caps} />
      </div>
    </Modal>
  );
}
