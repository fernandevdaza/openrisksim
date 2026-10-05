import { useTranslation } from "react-i18next";
import { Modal } from "../components/ui";
import { useUiStore } from "../store/ui";
import { TOOLS } from "../tools/registry";
import { tr } from "../lib/modelText";
import { AssumptionDialog } from "./AssumptionDialog";
import { DecisionDialog, ForecastDialog } from "./DefinitionDialogs";
import { CorrelationDialog } from "./CorrelationDialog";
import { SettingsDialog } from "./SettingsDialog";
import { ConfirmDialog, ExamplesDialog, ReportDialog } from "./FileDialogs";
import { HelpDialog } from "./HelpDialog";

/** Renders the active shell dialog. */
export function DialogHost() {
  const dialog = useUiStore((s) => s.dialog);
  const close = useUiStore((s) => s.closeDialog);
  if (!dialog) return null;
  switch (dialog.type) {
    case "assumption":
      return <AssumptionDialog key={`${dialog.cell.sheet}!${dialog.cell.address}`} cell={dialog.cell} id={dialog.id} onClose={close} />;
    case "forecast":
      return <ForecastDialog cell={dialog.cell} id={dialog.id} onClose={close} />;
    case "decision":
      return <DecisionDialog cell={dialog.cell} id={dialog.id} onClose={close} />;
    case "correlations":
      return <CorrelationDialog onClose={close} />;
    case "settings":
      return <SettingsDialog onClose={close} />;
    case "examples":
      return <ExamplesDialog onClose={close} />;
    case "report":
      return <ReportDialog onClose={close} />;
    case "help":
      return <HelpDialog tab={dialog.tab} onClose={close} />;
    case "confirm":
      return <ConfirmDialog {...dialog} onClose={close} />;
  }
}

/** Tool windows (stacked modals; the last opened is on top). */
export function ToolHost() {
  const { i18n } = useTranslation();
  const openTools = useUiStore((s) => s.openTools);
  const locale = i18n.language === "en" ? "en" : "es";
  return (
    <>
      {openTools.map(({ id }) => {
        const tool = TOOLS.find((x) => x.id === id);
        if (!tool) return null;
        const Comp = tool.component;
        const Icon = tool.icon;
        const onClose = () => useUiStore.getState().closeTool(id);
        return (
          <Modal
            key={id}
            open
            size={tool.size ?? "lg"}
            onClose={onClose}
            title={
              <span className="flex items-center gap-2">
                <Icon size={16} className="text-blue-700 dark:text-blue-300" />
                {tr(tool.label, locale)}
              </span>
            }
          >
            <Comp onClose={onClose} />
          </Modal>
        );
      })}
    </>
  );
}
