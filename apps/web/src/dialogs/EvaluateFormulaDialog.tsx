import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CellRef } from "@openrisksim/core";
import { Button, Modal, clsx } from "../components/ui";
import { useUiStore } from "../store/ui";
import { useWorkbookStore } from "../store/workbook";
import { evaluationSteps, type EvalValue } from "../lib/formulaEval";
import { quoteSheet } from "../lib/formulaTokens";

/** Excel's "Evaluate formula": each click replaces the next part of the formula by its value. */
export function EvaluateFormulaDialog({ cell, onClose }: { cell: CellRef; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const steps = useMemo(() => {
    const engine = useWorkbookStore.getState().engine;
    const f = engine?.getFormula(cell);
    if (!engine || !f) return [];
    const ev = (expr: string): EvalValue => {
      try {
        return engine.calculate(`=${expr}`, cell.sheet) as EvalValue;
      } catch {
        return { error: "#ERROR!" };
      }
    };
    return evaluationSteps(f, ev, locale);
  }, [cell, locale]);
  const [n, setN] = useState(0);
  const done = n >= steps.length - 1;
  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title={t("formula.evaluate")}
      footer={
        <>
          <Button onClick={() => setN(0)} disabled={n === 0}>
            {t("formula.restart")}
          </Button>
          <Button variant="primary" onClick={() => setN((x) => Math.min(steps.length - 1, x + 1))} disabled={done} data-eval-step>
            {t("formula.evaluateStep")}
          </Button>
          <Button onClick={onClose}>{t("common.close")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 text-sm">
        <div className="text-slate-600 dark:text-slate-300">
          {t("formula.cellFormula", { cell: `${quoteSheet(cell.sheet)}!${cell.address}` })}
        </div>
        <ol className="flex flex-col gap-1" data-eval-steps>
          {steps.slice(0, n + 1).map((s, i) => (
            <li key={i} className={clsx("break-all rounded border px-2 py-1 font-mono text-[12.5px]", i === n ? "border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-slate-800" : "border-transparent text-slate-500")}>
              {s.changed && i === n ? (
                <>
                  {s.text.slice(0, s.changed[0])}
                  <u className="font-semibold text-blue-800 dark:text-blue-300">{s.text.slice(s.changed[0], s.changed[1])}</u>
                  {s.text.slice(s.changed[1])}
                </>
              ) : (
                s.text
              )}
            </li>
          ))}
        </ol>
        <p className="text-xs text-slate-500">{t("formula.evaluateHint")}</p>
      </div>
    </Modal>
  );
}
