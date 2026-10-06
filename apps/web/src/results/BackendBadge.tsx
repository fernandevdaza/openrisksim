import { useTranslation } from "react-i18next";
import { Cpu, TriangleAlert, Zap } from "lucide-react";
import type { SimulationBackendInfo } from "@openrisksim/core";
import { clsx } from "../components/ui";

type T = (k: string, o?: Record<string, unknown>) => string;

/** "1,2 M" / "1.2M" */
export function formatRate(v: number, locale: string): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
  try {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: v >= 1e6 ? 1 : 0 }).format(v);
  } catch {
    return String(Math.round(v));
  }
}

/** "Apple M3 Pro (Metal)" → "Apple M3 Pro · Metal" */
function prettyDevice(d: string | undefined): string | undefined {
  return d?.replace(/\s*\(([^)]+)\)\s*$/, " · $1");
}

/** Short backend label: "GPU · Apple M3 Pro · Metal", "Compilado (CPU)", "8 núcleos", "Estándar". */
export function backendLabel(b: SimulationBackendInfo, t: T): string {
  switch (b.mode) {
    case "gpu":
      return [t("accel.backend_gpu"), prettyDevice(b.device)].filter(Boolean).join(" · ");
    case "multicore":
      return t("accel.backend_multicore", { n: b.workers ?? "?" });
    case "compiled":
      return t("accel.backend_compiled");
    default:
      return t("accel.backend_standard");
  }
}

/** Multi-line tooltip with everything we know about the backend. */
export function backendDetails(b: SimulationBackendInfo, t: T, locale: string): string {
  const lines = [`${t("accel.backendLabel")}: ${backendLabel(b, t)} (${b.precision})`];
  lines.push(t("accel.perSecond", { v: formatRate(b.trialsPerSecond, locale) }));
  if (b.requested !== b.mode) lines.push(t("accel.requested", { mode: t(`accel.mode_${b.requested}`) }));
  if (b.validation)
    lines.push(
      t("accel.validated", {
        n: b.validation.checked.toLocaleString(locale),
        err: b.validation.maxRelativeError === 0 ? "0" : b.validation.maxRelativeError.toExponential(1),
      }),
    );
  if (b.fallbackReason) lines.push(t("accel.fallbackTitle", { reason: b.fallbackReason }));
  return lines.join("\n");
}

/** Backend used by the last run, plus a warning chip when acceleration fell back. */
export function BackendBadge({ backend, showRate = true, className }: { backend: SimulationBackendInfo; showRate?: boolean; className?: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "es";
  const Icon = backend.mode === "gpu" ? Zap : Cpu;
  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-1.5", className)} data-testid="backend-badge" data-mode={backend.mode}>
      <span className="inline-flex min-w-0 items-center gap-1 truncate" title={backendDetails(backend, t, locale)}>
        <Icon size={12} className={backend.mode === "gpu" ? "shrink-0 text-violet-600 dark:text-violet-300" : "shrink-0 text-slate-500 dark:text-slate-400"} />
        <b className="truncate font-semibold">{backendLabel(backend, t)}</b>
        {showRate && <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">· {t("accel.perSecond", { v: formatRate(backend.trialsPerSecond, locale) })}</span>}
      </span>
      {backend.fallbackReason && (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-100 px-1.5 py-px text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
          title={t("accel.fallbackTitle", { reason: backend.fallbackReason })}
          data-testid="backend-fallback"
        >
          <TriangleAlert size={11} /> {t("accel.fallback")}
        </span>
      )}
    </span>
  );
}
