import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Cpu, Gauge, LoaderCircle, Sparkles, X, Zap, type LucideIcon } from "lucide-react";
import type { AccelerationMode, RiskModel, SimulationSettings } from "@openrisksim/core";
import { detectAccelerationCapabilities, hardwareThreads, MAX_WORKERS, resolveWorkerCount, type AccelerationCapabilities, type AccelReason } from "@openrisksim/workbook";
import { clsx, Select } from "../components/ui";
import { useWorkbookStore } from "../store/workbook";

const MODES: { id: AccelerationMode; icon: LucideIcon }[] = [
  { id: "auto", icon: Sparkles },
  { id: "standard", icon: Gauge },
  { id: "multicore", icon: Cpu },
  { id: "compiled", icon: Cpu },
  { id: "gpu", icon: Zap },
];

/** Capability probe for the settings dialog (GPU adapter, CPU threads, model compilation). */
export function useAccelerationCapabilities(model: RiskModel): AccelerationCapabilities | null | "error" {
  const engine = useWorkbookStore((s) => s.engine);
  const [caps, setCaps] = useState<AccelerationCapabilities | null | "error">(null);
  useEffect(() => {
    let alive = true;
    setCaps(null);
    if (!engine) return;
    // let the dialog paint first: compiling a big model takes a moment
    const id = setTimeout(() => {
      detectAccelerationCapabilities(engine, model)
        .then((c) => alive && setCaps(c))
        .catch((e) => {
          console.warn("[OpenRiskSim] capability detection failed", e);
          if (alive) setCaps("error");
        });
    }, 30);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [engine, model]);
  return caps;
}

function reasonText(reasons: AccelReason[], lang: "es" | "en"): string {
  if (!reasons.length) return "?";
  const r = reasons[0];
  const more = reasons.length > 1 ? ` (+${reasons.length - 1})` : "";
  return `${r.cell ? `${r.cell}: ` : ""}${r.message[lang]}${more}`;
}

/** Whether a mode can run on this machine + model (null = unknown yet). */
function modeAvailable(mode: AccelerationMode, caps: AccelerationCapabilities | null | "error"): boolean | null {
  if (!caps || caps === "error") return null;
  if (mode === "compiled") return caps.compile.ok;
  if (mode === "gpu") return !!caps.gpu && caps.compile.ok && !!caps.gpuSupport?.ok;
  if (mode === "multicore") return caps.workersAvailable;
  return true;
}

export function AccelerationSettings({
  settings,
  onChange,
  model,
  caps,
}: {
  settings: SimulationSettings;
  onChange: (s: SimulationSettings) => void;
  model: RiskModel;
  caps: AccelerationCapabilities | null | "error";
}) {
  const { t, i18n } = useTranslation();
  const lang: "es" | "en" = i18n.language?.startsWith("en") ? "en" : "es";
  const mode: AccelerationMode = settings.acceleration ?? "auto";
  const threads = caps && caps !== "error" ? caps.cpuThreads : hardwareThreads();
  const autoWorkers = resolveWorkerCount(null, threads);
  const hasModel = model.forecasts.length > 0 && model.assumptions.some((a) => a.enabled);

  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700" data-testid="accel-settings">
      <legend className="px-1 font-medium text-slate-700 dark:text-slate-300">{t("accel.title")}</legend>
      <span className="text-xs text-slate-500">{t("accel.intro")}</span>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label={t("accel.title")}>
        {MODES.map(({ id, icon: Icon }) => {
          const avail = modeAvailable(id, caps);
          const selected = mode === id;
          return (
            <label
              key={id}
              className={clsx(
                "flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 transition-colors",
                id === "auto" && "sm:col-span-2",
                selected
                  ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600 dark:border-blue-400 dark:bg-blue-950/40 dark:ring-blue-400"
                  : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800",
              )}
            >
              <input
                type="radio"
                name="accel-mode"
                value={id}
                className="mt-1"
                checked={selected}
                onChange={() => onChange({ ...settings, acceleration: id })}
                data-testid={`accel-mode-${id}`}
              />
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-100">
                  <Icon size={13} className={id === "gpu" ? "text-violet-600 dark:text-violet-300" : "text-slate-500"} />
                  {t(`accel.mode_${id}`)}
                  {id === "auto" && <span className="rounded bg-blue-100 px-1 text-[10px] font-semibold uppercase text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">{t("accel.recommended")}</span>}
                  {avail === false && <span className="rounded bg-slate-100 px-1 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t("accel.unavailable")}</span>}
                </span>
                <span className="text-xs leading-snug text-slate-500 dark:text-slate-400">{t(`accel.mode_${id}_desc`)}</span>
              </span>
            </label>
          );
        })}
      </div>

      {(mode === "multicore" || mode === "auto") && (
        <label className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-700 dark:text-slate-300">{t("accel.workers")}</span>
          <Select
            className="w-40"
            value={settings.workers == null ? "auto" : String(settings.workers)}
            onChange={(v) => onChange({ ...settings, workers: v === "auto" ? null : Number(v) })}
            options={[
              { value: "auto", label: t("accel.workersAuto", { n: autoWorkers }) },
              ...Array.from({ length: MAX_WORKERS }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
            ]}
          />
          <span className="text-xs text-slate-500">{t("accel.workersHint", { n: threads })}</span>
        </label>
      )}

      <div className="rounded-md bg-slate-50 p-2 text-xs dark:bg-slate-800/60" data-testid="accel-capabilities">
        <div className="mb-1 font-semibold text-slate-700 dark:text-slate-200">{t("accel.capabilities")}</div>
        {caps === null ? (
          <div className="flex items-center gap-1.5 text-slate-500">
            <LoaderCircle size={12} className="animate-spin" /> {t("accel.detecting")}
          </div>
        ) : caps === "error" ? (
          <div className="text-slate-500">—</div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            <li className="flex gap-1.5" data-testid="cap-gpu">
              <span className="w-16 shrink-0 text-slate-500">{t("accel.gpu")}</span>
              {caps.gpu ? (
                <span className="flex items-center gap-1 text-slate-800 dark:text-slate-100">
                  <Check size={12} className="text-green-600" /> {caps.gpuLabel?.replace(/\s*\(([^)]+)\)\s*$/, " · $1")}
                  {caps.gpu.isFallbackAdapter ? " (software)" : ""}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                  <X size={12} className="text-slate-400" /> {caps.gpuUnavailableReason?.[lang] ?? "—"}
                </span>
              )}
            </li>
            <li className="flex gap-1.5" data-testid="cap-cpu">
              <span className="w-16 shrink-0 text-slate-500">{t("accel.cpu")}</span>
              <span className="text-slate-800 dark:text-slate-100">{t("accel.cpuThreads", { n: caps.cpuThreads })}</span>
            </li>
            <li className="flex gap-1.5" data-testid="cap-model">
              <span className="w-16 shrink-0 text-slate-500">{t("accel.model")}</span>
              {!hasModel ? (
                <span className="text-slate-500">{t("accel.noModel")}</span>
              ) : (
                <span className="flex min-w-0 flex-col">
                  {caps.compile.ok ? (
                    <span className="flex items-center gap-1 text-slate-800 dark:text-slate-100">
                      <Check size={12} className="text-green-600" /> {t("accel.compiledOk", { n: caps.compile.formulaCount.toLocaleString(lang) })}
                    </span>
                  ) : (
                    <span className="flex items-start gap-1 text-slate-700 dark:text-slate-200">
                      <X size={12} className="mt-0.5 shrink-0 text-red-500" /> {t("accel.compiledFail", { reason: reasonText(caps.compile.reasons, lang) })}
                    </span>
                  )}
                  {caps.gpuSupport &&
                    (caps.gpuSupport.ok ? (
                      <span className="flex items-center gap-1 text-slate-800 dark:text-slate-100">
                        <Check size={12} className="text-green-600" /> {t("accel.gpuOk")}
                      </span>
                    ) : (
                      <span className="flex items-start gap-1 text-slate-700 dark:text-slate-200">
                        <X size={12} className="mt-0.5 shrink-0 text-amber-500" /> {t("accel.gpuFail", { reason: reasonText(caps.gpuSupport.reasons, lang) })}
                      </span>
                    ))}
                </span>
              )}
            </li>
          </ul>
        )}
      </div>
      <span className="text-xs text-slate-500">{t("accel.precisionNote")}</span>
    </fieldset>
  );
}
