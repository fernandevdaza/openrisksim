import { actions } from "./actions";
import { useUiStore } from "./store/ui";
import { useSimulationStore } from "./store/simulation";
import { openInsertFunction, toggleShowFormulas } from "./grid/formulaActions";

/** Displayed in Help → Keyboard shortcuts (labels are i18n keys). */
export const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Alt+R", label: "sim.run" },
  { keys: "Alt+S", label: "sim.step" },
  { keys: "Alt+X", label: "sim.reset" },
  { keys: "Esc", label: "sim.abort" },
  { keys: "Alt+A", label: "sim.defineAssumption" },
  { keys: "Alt+F", label: "sim.defineForecast" },
  { keys: "Alt+D", label: "sim.defineDecision" },
  { keys: "Alt+C", label: "sim.correlations" },
  { keys: "Ctrl+O", label: "file.open" },
  { keys: "Ctrl+S", label: "file.save" },
  { keys: "F1", label: "help.quickstart" },
  { keys: "F2", label: "help.kEdit" },
  { keys: "Enter / Tab", label: "help.kCommit" },
  { keys: "Shift+Arrow", label: "help.kExtend" },
  { keys: "Ctrl+Arrow", label: "help.kJump" },
  { keys: "Ctrl+C / Ctrl+X / Ctrl+V", label: "help.kCopyPaste" },
  { keys: "Ctrl+Z / Ctrl+Y", label: "help.kUndo" },
  { keys: "Delete", label: "help.kDelete" },
  { keys: "F4", label: "help.kAbsolute" },
  { keys: "Shift+F3", label: "formula.insertFunction" },
  { keys: "Alt+=", label: "formula.autoSum" },
  { keys: "Ctrl+D / Ctrl+R", label: "help.kFill" },
  { keys: "Ctrl+Shift+V", label: "clipboard.pasteValues" },
  { keys: "Ctrl+Enter", label: "help.kFillSelection" },
  { keys: "Alt+Enter", label: "help.kNewLine" },
  { keys: "Ctrl+`", label: "formula.showFormulas" },
  { keys: "Ctrl+Shift+U", label: "help.kExpandBar" },
];

/** Global shortcuts. Returns the remover. */
export function installShortcuts(): () => void {
  const onKey = (e: KeyboardEvent) => {
    const ui = useUiStore.getState();
    const modalOpen = !!ui.dialog || ui.openTools.length > 0;
    if (e.key === "Escape" && useSimulationStore.getState().status === "running") {
      useSimulationStore.getState().abort();
      return;
    }
    if (e.key === "Escape" && ui.rangePick) {
      ui.finishRangePick(null);
      return;
    }
    if (modalOpen) {
      // Escape closes the top-most window even when focus is outside it (Modal handles the focused case)
      if (e.key === "Escape" && !e.defaultPrevented) {
        if (ui.dialog) ui.closeDialog();
        else if (ui.openTools.length) ui.closeTool(ui.openTools[ui.openTools.length - 1].id);
      }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && e.code === "Backquote") {
      e.preventDefault();
      toggleShowFormulas();
      return;
    }
    if (mod && e.shiftKey && !e.altKey && e.code === "KeyU") {
      e.preventDefault();
      ui.setFormulaBarExpanded(!ui.formulaBarExpanded);
      return;
    }
    if (e.key === "F3" && e.shiftKey && !mod) {
      e.preventDefault();
      openInsertFunction();
      return;
    }
    if (mod && !e.altKey && !e.shiftKey) {
      if (e.code === "KeyO") {
        e.preventDefault();
        void actions.openFile();
      } else if (e.code === "KeyS") {
        e.preventDefault();
        void actions.saveXlsx(false);
      }
      return;
    }
    if (e.key === "F1") {
      e.preventDefault();
      actions.help("quickstart");
      return;
    }
    if (e.altKey && !mod) {
      const map: Record<string, () => void> = {
        KeyR: actions.run,
        KeyS: actions.step,
        KeyX: actions.resetSimulation,
        KeyA: actions.defineAssumption,
        KeyF: actions.defineForecast,
        KeyD: actions.defineDecision,
        KeyC: actions.openCorrelations,
      };
      const fn = map[e.code];
      if (fn) {
        e.preventDefault();
        fn();
      }
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
