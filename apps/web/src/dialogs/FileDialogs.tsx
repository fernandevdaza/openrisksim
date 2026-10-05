import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSpreadsheet, Printer, ExternalLink } from "lucide-react";
import { EXAMPLES } from "@openrisksim/workbook";
import { Button, Modal } from "../components/ui";
import { useWorkbookStore } from "../store/workbook";
import { useModelStore } from "../store/model";
import { useSimulationStore } from "../store/simulation";
import { useUiStore } from "../store/ui";
import { actions } from "../actions";
import { tr } from "../lib/modelText";
import { buildHtmlReport, openHtmlInTab, printHtml } from "../lib/report";
import { useCertaintyStore } from "../results/ForecastWindow";

export function ExamplesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const open = async (id: string) => {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    const m = useModelStore.getState().model;
    if (m.assumptions.length + m.forecasts.length > 0 || useWorkbookStore.getState().editVersion > 1) {
      const ok = await useUiStore.getState().confirm({ title: t("file.examples"), message: t("file.replaceConfirm"), confirmLabel: t("file.openExample") });
      if (!ok) return;
    }
    try {
      const wb = ex.build();
      useWorkbookStore.getState().loadWorkbook({ ...wb, fileName: wb.fileName ?? `${tr(ex.name, locale)}.xlsx` });
      useUiStore.getState().notify(t("file.exampleLoaded", { name: tr(ex.name, locale) }), "success");
      onClose();
    } catch (e) {
      useUiStore.getState().notify(e instanceof Error ? e.message : String(e), "error");
    }
  };
  return (
    <Modal open size="lg" onClose={onClose} title={t("file.examples")}>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{t("file.examplesHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.id}
            onClick={() => void open(ex.id)}
            className="flex gap-3 rounded-lg border border-slate-200 p-3 text-left transition hover:border-blue-500 hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet className="mt-0.5 shrink-0 text-green-700 dark:text-green-400" size={28} />
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">{tr(ex.name, locale)}</div>
              <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{tr(ex.description, locale)}</div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function ReportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const result = useSimulationStore((s) => s.result);
  const resultModel = useSimulationStore((s) => s.resultModel);
  const stale = useSimulationStore((s) => s.stale);
  const fileName = useWorkbookStore((s) => s.fileName);
  const [busy, setBusy] = useState(false);

  const html = () => buildHtmlReport(resultModel!, result!, locale, (k, o) => t(k, o), useCertaintyStore.getState().states, fileName);

  return (
    <Modal open size="md" onClose={onClose} title={t("report.exportTitle")}>
      {!result || !resultModel ? (
        <p className="text-sm text-slate-600">{t("report.needRun")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {stale && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{t("results.staleLong")}</p>}
          <p className="text-sm text-slate-600 dark:text-slate-400">{t("report.exportHint")}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              disabled={busy}
              className="!h-auto flex-col !py-3"
              onClick={async () => {
                setBusy(true);
                try {
                  await actions.saveXlsx(true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FileSpreadsheet size={22} className="text-green-700" />
              <span>{t("report.xlsx")}</span>
            </Button>
            <Button
              disabled={busy}
              className="!h-auto flex-col !py-3"
              onClick={() => {
                try {
                  printHtml(html());
                } catch (e) {
                  useUiStore.getState().notify(String(e), "error");
                }
              }}
            >
              <Printer size={22} className="text-blue-700" />
              <span>{t("report.pdf")}</span>
            </Button>
            <Button
              disabled={busy}
              className="!h-auto flex-col !py-3"
              onClick={() => {
                if (!openHtmlInTab(html())) useUiStore.getState().notify(t("report.popupBlocked"), "error");
              }}
            >
              <ExternalLink size={22} className="text-slate-600" />
              <span>{t("report.html")}</span>
            </Button>
          </div>
          <p className="text-xs text-slate-500">{t("report.certaintyNote")}</p>
        </div>
      )}
    </Modal>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }: { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            autoFocus
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel ?? t("common.ok")}
          </Button>
        </>
      }
    >
      <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{message}</p>
    </Modal>
  );
}
