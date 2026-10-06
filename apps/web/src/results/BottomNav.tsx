import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ChartColumn, Dices, ListTree, Play, Sheet, Square } from "lucide-react";
import { clsx } from "../components/ui";
import { useUiStore } from "../store/ui";
import { useSimulationStore } from "../store/simulation";
import { useModelStore } from "../store/model";
import { useWorkbookStore } from "../store/workbook";
import { actions } from "../actions";
import { CellContextMenu } from "../grid/ContextMenu";

function NavItem({
  icon,
  label,
  active,
  disabled,
  onClick,
  badge,
  badgeLabel,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  badge?: number;
  badgeLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[11px] font-medium transition-colors disabled:opacity-35",
        active ? "text-blue-700 dark:text-blue-300" : "text-slate-600 active:bg-slate-100 dark:text-slate-300 dark:active:bg-slate-800",
      )}
    >
      <span className="relative">
        {icon}
        {badge !== undefined && badge > 0 && (
          <span title={badgeLabel} className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-blue-700 px-1 text-center text-[10px] font-semibold leading-[18px] text-white dark:bg-blue-500">{badge > 99 ? "99+" : badge}</span>
        )}
      </span>
      <span className="max-w-full truncate">{label}</span>
      {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-blue-700 dark:bg-blue-400" aria-hidden />}
    </button>
  );
}

/** Phone-only bottom navigation: sheet · model drawer · run · results sheet · define (cell menu). */
export function BottomNav() {
  const { t } = useTranslation();
  const resultsOpen = useUiStore((s) => s.resultsOpen);
  const explorerOpen = useUiStore((s) => s.explorerOpen);
  const status = useSimulationStore((s) => s.status);
  const progress = useSimulationStore((s) => s.progress);
  const hasResult = useSimulationStore((s) => !!s.result);
  const hasEngine = useWorkbookStore((s) => !!s.engine);
  const nDefs = useModelStore((s) => s.model.assumptions.length + s.model.forecasts.length + s.model.decisions.length);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const running = status === "running";
  const pct = Math.round(progress * 100);
  const ui = useUiStore.getState();

  const showSheet = () => {
    ui.setExplorerOpen(false);
    ui.setResultsOpen(false);
  };

  return (
    <nav
      className="relative z-40 flex h-[var(--bottom-nav-h)] shrink-0 items-stretch gap-1 border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))] backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
      aria-label={t("mobile.nav")}
    >
      <NavItem icon={<Sheet size={21} strokeWidth={1.8} />} label={t("mobile.sheet")} active={!resultsOpen && !explorerOpen} onClick={showSheet} />
      <NavItem
        icon={<ListTree size={21} strokeWidth={1.8} />}
        label={t("mobile.model")}
        active={explorerOpen}
        badge={nDefs}
        badgeLabel={t("mobile.definitions", { n: nDefs })}
        onClick={() => ui.setExplorerOpen(!explorerOpen)}
      />
      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={() => (running ? useSimulationStore.getState().abort() : actions.run())}
          disabled={!hasEngine}
          aria-label={running ? `${t("mobile.stop")} (${pct} %)` : t("mobile.run")}
          className={clsx(
            "relative flex h-[52px] w-[52px] flex-col items-center justify-center rounded-full text-white shadow-md shadow-green-900/30 transition-transform active:scale-95 disabled:opacity-50",
            running ? "bg-red-600" : "bg-green-700 dark:bg-green-600",
          )}
          style={running ? { background: `conic-gradient(#dc2626 ${pct * 3.6}deg, #fca5a5 0deg)` } : undefined}
        >
          {running ? (
            <span className="flex h-[42px] w-[42px] flex-col items-center justify-center rounded-full bg-red-600">
              <Square size={14} fill="currentColor" />
              <span className="text-[10px] font-semibold tabular-nums leading-none">{pct}%</span>
            </span>
          ) : (
            <Play size={24} fill="currentColor" className="ml-0.5" />
          )}
        </button>
      </div>
      <NavItem
        icon={<ChartColumn size={21} strokeWidth={1.8} />}
        label={t("mobile.results")}
        active={resultsOpen}
        disabled={!hasResult && !running}
        onClick={() => ui.setResultsOpen(!resultsOpen)}
      />
      <NavItem
        icon={<Dices size={21} strokeWidth={1.8} />}
        label={t("mobile.define")}
        disabled={!hasEngine || running}
        onClick={(e) => {
          showSheet();
          const top = e.currentTarget.closest("nav")?.getBoundingClientRect().top ?? window.innerHeight;
          setMenu({ x: window.innerWidth, y: top - 6 });
        }}
      />
      {/* portal: the nav's backdrop-filter would otherwise become the menu's containing block */}
      {menu && createPortal(<CellContextMenu above x={menu.x} y={menu.y} onClose={() => setMenu(null)} />, document.body)}
    </nav>
  );
}
