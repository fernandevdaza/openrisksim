import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import {
  BookA,
  BookOpen,
  ClipboardPaste,
  Copy,
  Dices,
  Eraser,
  FileDown,
  FilePlus,
  FolderOpen,
  Grid3x3,
  Info,
  Keyboard,
  Languages,
  Layers,
  ListTree,
  Moon,
  PanelRight,
  Play,
  Rocket,
  RotateCcw,
  Save,
  Settings,
  SlidersHorizontal,
  Square,
  StepForward,
  Sun,
  Target,
  Trash2,
} from "lucide-react";
import { clsx } from "../components/ui";
import { useUiStore, type RibbonTabId } from "../store/ui";
import { useSimulationStore } from "../store/simulation";
import { useWorkbookStore } from "../store/workbook";
import { useModelStore } from "../store/model";
import { actions } from "../actions";
import { TOOLS } from "../tools/registry";
import { tr } from "../lib/modelText";

const TABS: RibbonTabId[] = ["file", "simulation", "analysis", "forecast", "optimization", "finance", "help"];

export function RibbonButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  big = true,
  active,
  title,
  iconClass,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  big?: boolean;
  active?: boolean;
  title?: string;
  iconClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        "rounded text-slate-800 transition-colors hover:bg-blue-100 disabled:pointer-events-none disabled:opacity-40 dark:text-slate-100 dark:hover:bg-slate-700",
        active && "bg-blue-100 ring-1 ring-blue-300 dark:bg-slate-700 dark:ring-slate-500",
        big ? "flex w-[68px] flex-col items-center gap-1 px-1 py-1 text-[11px] leading-tight" : "flex items-center gap-1.5 px-1.5 py-0.5 text-[11.5px]",
      )}
    >
      <Icon size={big ? 22 : 15} strokeWidth={big ? 1.6 : 1.8} className={clsx("shrink-0", iconClass ?? "text-blue-800 dark:text-blue-300")} />
      <span className={clsx(big ? "line-clamp-2 text-center" : "whitespace-nowrap")}>{label}</span>
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col border-r border-slate-200 px-1.5 dark:border-slate-700" role="group" aria-label={label}>
      <div className="flex flex-1 items-start gap-0.5">{children}</div>
      <div className="mt-0.5 select-none text-center text-[10px] text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

function SmallStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col justify-start gap-0.5 py-0.5">{children}</div>;
}

export function Ribbon() {
  const { t } = useTranslation();
  const tab = useUiStore((s) => s.ribbonTab);
  const setTab = useUiStore((s) => s.setRibbonTab);
  const fileName = useWorkbookStore((s) => s.fileName);

  return (
    <header className="shrink-0 select-none">
      <div className="flex h-8 items-end bg-[#1f3864] pl-2 text-white dark:bg-slate-950">
        <div className="mr-3 flex items-center gap-1.5 self-center text-sm font-semibold tracking-tight">
          <img src="./icon.svg" alt="" className="h-5 w-5" />
          OpenRiskSim
        </div>
        <nav className="flex gap-0.5" role="tablist" aria-label={t("ribbon.tabs")}>
          {TABS.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={clsx(
                "rounded-t px-3 py-1 text-[12.5px]",
                tab === id ? "bg-slate-50 font-semibold text-[#1f3864] dark:bg-slate-900 dark:text-blue-200" : "text-blue-50 hover:bg-white/15",
              )}
            >
              {t(`ribbon.${id}`)}
            </button>
          ))}
        </nav>
        <div className="ml-auto mr-3 self-center truncate text-xs text-blue-100/80" title={fileName}>
          {fileName}
        </div>
      </div>
      <div className="flex h-[94px] items-stretch overflow-x-auto border-b border-slate-300 bg-slate-50 py-1 dark:border-slate-700 dark:bg-slate-900" role="toolbar" aria-label={t(`ribbon.${tab}`)}>
        {tab === "file" && <FileTab />}
        {tab === "simulation" && <SimulationTab />}
        {(tab === "analysis" || tab === "forecast" || tab === "optimization" || tab === "finance") && <ToolsTab tab={tab} />}
        {tab === "help" && <HelpTab />}
      </div>
    </header>
  );
}

function FileTab() {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const theme = useUiStore((s) => s.theme);
  const hasEngine = useWorkbookStore((s) => !!s.engine);
  const hasResult = useSimulationStore((s) => !!s.result);
  return (
    <>
      <Group label={t("ribbon.gWorkbook")}>
        <RibbonButton icon={FolderOpen} label={t("file.open")} onClick={() => void actions.openFile()} title={t("file.openHint")} />
        <RibbonButton icon={BookOpen} label={t("file.examples")} onClick={actions.openExamples} />
        <RibbonButton icon={FilePlus} label={t("file.newBlank")} onClick={() => void actions.newWorkbook()} />
      </Group>
      <Group label={t("ribbon.gSave")}>
        <RibbonButton icon={Save} label={t("file.save")} onClick={() => void actions.saveXlsx(false)} disabled={!hasEngine} title={t("file.saveHint")} />
        <RibbonButton icon={FileDown} label={t("file.exportReport")} onClick={actions.exportReport} disabled={!hasResult} />
      </Group>
      <Group label={t("ribbon.gView")}>
        <RibbonButton icon={Languages} label={locale === "es" ? "English" : "Español"} onClick={actions.toggleLanguage} title={t("file.language")} />
        <RibbonButton icon={theme === "dark" ? Sun : Moon} label={theme === "dark" ? t("file.lightTheme") : t("file.darkTheme")} onClick={actions.toggleTheme} />
      </Group>
    </>
  );
}

function SimulationTab() {
  const { t } = useTranslation();
  const status = useSimulationStore((s) => s.status);
  const hasResult = useSimulationStore((s) => !!s.result);
  const stepping = useWorkbookStore((s) => !!s.stepEvaluator);
  const hasEngine = useWorkbookStore((s) => !!s.engine);
  const hasClip = useUiStore((s) => !!s.defClipboard);
  const resultsOpen = useUiStore((s) => s.resultsOpen);
  const explorerOpen = useUiStore((s) => s.explorerOpen);
  const nAssumptions = useModelStore((s) => s.model.assumptions.length);
  const running = status === "running";
  return (
    <>
      <Group label={t("ribbon.gProfile")}>
        <RibbonButton icon={Eraser} label={t("sim.newProfile")} onClick={() => void actions.newProfile()} disabled={running} title={t("sim.newProfileHint")} />
      </Group>
      <Group label={t("ribbon.gDefine")}>
        <RibbonButton icon={Dices} iconClass="text-green-700 dark:text-green-400" label={t("sim.defineAssumption")} onClick={actions.defineAssumption} disabled={!hasEngine || running} />
        <RibbonButton icon={Target} iconClass="text-blue-700 dark:text-sky-400" label={t("sim.defineForecast")} onClick={actions.defineForecast} disabled={!hasEngine || running} />
        <RibbonButton icon={SlidersHorizontal} iconClass="text-yellow-600 dark:text-yellow-400" label={t("sim.defineDecision")} onClick={actions.defineDecision} disabled={!hasEngine || running} />
      </Group>
      <Group label={t("ribbon.gModel")}>
        <RibbonButton icon={Grid3x3} label={t("sim.correlations")} onClick={actions.openCorrelations} disabled={nAssumptions < 2 || running} />
        <RibbonButton icon={Settings} label={t("sim.settings")} onClick={actions.openSettings} disabled={running} />
      </Group>
      <Group label={t("ribbon.gRun")}>
        {running ? (
          <RibbonButton icon={Square} iconClass="text-red-600" label={t("sim.abort")} onClick={() => useSimulationStore.getState().abort()} />
        ) : (
          <RibbonButton icon={Play} iconClass="text-green-700 dark:text-green-400" label={t("sim.run")} onClick={actions.run} disabled={!hasEngine} />
        )}
        <RibbonButton icon={StepForward} label={t("sim.step")} onClick={actions.step} disabled={!hasEngine || running} active={stepping} title={t("sim.stepHint")} />
        <RibbonButton icon={RotateCcw} label={t("sim.reset")} onClick={actions.resetSimulation} disabled={running || (!hasResult && !stepping)} title={t("sim.resetHint")} />
      </Group>
      <Group label={t("ribbon.gDefinitions")}>
        <SmallStack>
          <RibbonButton big={false} icon={Copy} label={t("sim.copyDef")} onClick={actions.copyDefinition} disabled={!hasEngine} />
          <RibbonButton big={false} icon={ClipboardPaste} label={t("sim.pasteDef")} onClick={actions.pasteDefinition} disabled={!hasClip} />
          <RibbonButton big={false} icon={Trash2} label={t("sim.deleteDef")} onClick={actions.deleteDefinitions} disabled={!hasEngine} />
        </SmallStack>
      </Group>
      <Group label={t("ribbon.gWindows")}>
        <SmallStack>
          <RibbonButton big={false} icon={PanelRight} label={t("sim.showResults")} onClick={() => useUiStore.getState().setResultsOpen(!resultsOpen)} active={resultsOpen} />
          <RibbonButton big={false} icon={Layers} label={t("results.overlay")} onClick={() => useUiStore.getState().setResultsTab("overlay")} disabled={!hasResult} />
          <RibbonButton big={false} icon={ListTree} label={t("explorer.title")} onClick={() => useUiStore.getState().setExplorerOpen(!explorerOpen)} active={explorerOpen} />
        </SmallStack>
      </Group>
    </>
  );
}

function ToolsTab({ tab }: { tab: "analysis" | "forecast" | "optimization" | "finance" }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const tools = TOOLS.filter((x) => x.ribbonTab === tab);
  if (!tools.length) return <div className="flex items-center px-4 text-sm text-slate-500">{t("ribbon.noTools")}</div>;
  return (
    <Group label={t(`ribbon.${tab}`)}>
      {tools.map((tool) => (
        <RibbonButton key={tool.id} icon={tool.icon} label={tr(tool.label, locale)} onClick={() => useUiStore.getState().openTool(tool.id)} />
      ))}
    </Group>
  );
}

function HelpTab() {
  const { t } = useTranslation();
  return (
    <Group label={t("ribbon.help")}>
      <RibbonButton icon={Rocket} label={t("help.quickstart")} onClick={() => actions.help("quickstart")} />
      <RibbonButton icon={BookA} label={t("help.glossary")} onClick={() => actions.help("glossary")} />
      <RibbonButton icon={Keyboard} label={t("help.shortcuts")} onClick={() => actions.help("shortcuts")} />
      <RibbonButton icon={Info} label={t("help.about")} onClick={() => actions.help("about")} />
    </Group>
  );
}
