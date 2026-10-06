import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChartColumn, ChevronDown, ChevronRight, Dices, Pencil, SlidersHorizontal, Target, Trash2, X } from "lucide-react";
import type { CellRef } from "@openrisksim/core";
import { clsx } from "../components/ui";
import { useModelStore } from "../store/model";
import { useUiStore } from "../store/ui";
import { useSimulationStore } from "../store/simulation";
import { useWorkbookStore } from "../store/workbook";
import { describeSpec } from "../lib/modelText";
import { useIsCompact } from "../lib/responsive";

function Section({ title, count, icon, children, color }: { title: string; count: number; icon: ReactNode; children: ReactNode; color: string }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-semibold uppercase pointer-coarse:py-2 tracking-wide text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className={color}>{icon}</span>
        {title}
        <span className="ml-auto rounded-full bg-slate-200 px-1.5 text-[10px] font-normal text-slate-700 dark:bg-slate-700 dark:text-slate-200">{count}</span>
      </button>
      {open && <ul className="pb-1">{children}</ul>}
    </div>
  );
}

function Item({ name, cell, detail, disabled, onEdit, onDelete, onOpen }: { name: string; cell: CellRef; detail?: string; disabled?: boolean; onEdit: () => void; onDelete: () => void; onOpen?: () => void }) {
  const { t } = useTranslation();
  const cursor = useWorkbookStore((s) => s.cursor);
  const sheet = useWorkbookStore((s) => s.activeSheet);
  const active = cursor === cell.address && sheet === cell.sheet;
  return (
    <li className={clsx("group flex items-center gap-1 px-2 py-0.5 pl-6 text-[12px] pointer-coarse:py-1.5 pointer-coarse:text-[14px]", active ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/60")}>
      <button className="min-w-0 flex-1 text-left" onClick={() => useUiStore.getState().jumpTo(cell)} onDoubleClick={onEdit} title={`${name}\n${cell.sheet}!${cell.address}${detail ? `\n${detail}` : ""}`}>
        <div className={clsx("truncate", disabled ? "text-slate-400 line-through" : "text-slate-800 dark:text-slate-100")}>{name}</div>
        <div className="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400 pointer-coarse:text-[11.5px]">
          {cell.sheet}!{cell.address}
          {detail ? ` · ${detail}` : ""}
        </div>
      </button>
      <div className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100 [&>button]:pointer-coarse:p-2">
        {onOpen && (
          <button className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-blue-700 dark:hover:bg-slate-700" onClick={onOpen} aria-label={t("explorer.openChart")} title={t("explorer.openChart")}>
            <ChartColumn size={13} />
          </button>
        )}
        <button className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-blue-700 dark:hover:bg-slate-700" onClick={onEdit} aria-label={t("common.edit")} title={t("common.edit")}>
          <Pencil size={13} />
        </button>
        <button className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-red-600 dark:hover:bg-slate-700" onClick={onDelete} aria-label={t("common.delete")} title={t("common.delete")}>
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

export function ModelExplorer() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.explorerOpen);
  const locale = useUiStore((s) => s.locale);
  const model = useModelStore((s) => s.model);
  const result = useSimulationStore((s) => s.result);
  const compact = useIsCompact();
  // drawer mode (phones/tablets): Escape closes it
  useEffect(() => {
    if (!open || !compact) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && useUiStore.getState().setExplorerOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, compact]);
  if (!open) return null;
  const ui = useUiStore.getState();
  const ms = useModelStore.getState();
  const s = model.settings;
  const aside = (
    <aside
      className={clsx(
        "flex shrink-0 flex-col border-r border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900",
        compact ? "ors-slide-left fixed inset-y-0 left-0 z-[46] w-[min(86vw,320px)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] shadow-2xl" : "w-56",
      )}
      aria-label={t("explorer.title")}
      role={compact ? "dialog" : undefined}
      aria-modal={compact ? true : undefined}
    >
      <div className={clsx("flex items-center border-b border-slate-200 bg-slate-100 px-2 py-1 dark:border-slate-700 dark:bg-slate-800", compact && "min-h-12")}>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{t("explorer.title")}</span>
        <button
          className={clsx("ml-auto rounded p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700", compact && "flex h-10 w-10 items-center justify-center")}
          aria-label={t("common.close")}
          onClick={() => ui.setExplorerOpen(false)}
        >
          <X size={compact ? 18 : 14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        <Section title={t("explorer.assumptions")} count={model.assumptions.length} icon={<Dices size={12} />} color="text-green-600">
          {model.assumptions.map((a) => (
            <Item
              key={a.id}
              name={a.name}
              cell={a.cell}
              disabled={!a.enabled}
              detail={describeSpec(a.distribution, locale).split(" (")[0]}
              onEdit={() => ui.openDialog({ type: "assumption", cell: a.cell, id: a.id })}
              onDelete={() => ms.removeAssumption(a.id)}
            />
          ))}
          {model.assumptions.length === 0 && <li className="px-6 py-1 text-[11px] italic text-slate-400">{t("explorer.noneA")}</li>}
        </Section>
        <Section title={t("explorer.forecasts")} count={model.forecasts.length} icon={<Target size={12} />} color="text-blue-600">
          {model.forecasts.map((f) => (
            <Item
              key={f.id}
              name={f.name}
              cell={f.cell}
              onEdit={() => ui.openDialog({ type: "forecast", cell: f.cell, id: f.id })}
              onDelete={() => ms.removeForecast(f.id)}
              onOpen={result?.forecasts[f.id] ? () => ui.setResultsTab(`fc:${f.id}`) : undefined}
            />
          ))}
          {model.forecasts.length === 0 && <li className="px-6 py-1 text-[11px] italic text-slate-400">{t("explorer.noneF")}</li>}
        </Section>
        <Section title={t("explorer.decisions")} count={model.decisions.length} icon={<SlidersHorizontal size={12} />} color="text-yellow-600">
          {model.decisions.map((d) => (
            <Item
              key={d.id}
              name={d.name}
              cell={d.cell}
              detail={`[${d.lower}; ${d.upper}]`}
              onEdit={() => ui.openDialog({ type: "decision", cell: d.cell, id: d.id })}
              onDelete={() => ms.removeDecision(d.id)}
            />
          ))}
          {model.decisions.length === 0 && <li className="px-6 py-1 text-[11px] italic text-slate-400">{t("explorer.noneD")}</li>}
        </Section>
      </div>
      <button
        className={clsx(
          "border-t border-slate-200 px-2 py-1.5 text-left text-[11px] text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800",
          compact && "py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-[12.5px]",
        )}
        onClick={() => ui.openDialog({ type: "settings" })}
        title={t("sim.settings")}
      >
        <div>
          {t("settings.trials")}: <b>{s.trials.toLocaleString(locale)}</b> · {s.sampling === "latinHypercube" ? "LHS" : "MC"}
        </div>
        <div>
          {t("settings.seed")}: <b>{s.seed ?? t("settings.random")}</b> · {t("explorer.correlationsN", { n: model.correlations.length })}
        </div>
      </button>
    </aside>
  );
  if (!compact) return aside;
  return (
    <>
      <div className="fixed inset-0 z-[45] bg-black/40" onClick={() => ui.setExplorerOpen(false)} aria-hidden />
      {aside}
    </>
  );
}
