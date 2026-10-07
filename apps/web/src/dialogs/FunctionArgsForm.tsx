import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SquareDashedMousePointer } from "lucide-react";
import { Button, Modal } from "../components/ui";
import { useUiStore } from "../store/ui";
import { useWorkbookStore } from "../store/workbook";
import { declaredArgIndex, fnName, type FnInfo } from "../lib/functionCatalog";
import { formatEvalValue, type EvalValue } from "../lib/formulaEval";
import { quoteSheet } from "../lib/formulaTokens";
import { insertAtCaret, normaliseFormula, useEditStore } from "../grid/editState";
import { parseAddress } from "../lib/a1";

const MAX_ARGS = 30;

/** "valor3" for the 3rd item of a repeating group. */
function argLabel(fn: FnInfo, i: number, locale: "es" | "en"): string {
  const a = fn.args[declaredArgIndex(fn, i)];
  const base = locale === "es" ? a.es : a.en;
  if (i < fn.args.length) return base;
  const first = fn.args.findIndex((x) => x.rep);
  const group = fn.args.length - first;
  const m = /^(.*?)(\d+)$/.exec(base);
  if (!m) return base;
  return `${m[1]}${Number(m[2]) + Math.floor((i - first) / group)}`;
}

/** Excel's "Function arguments" form: one field per argument with live values and result. */
export function FunctionArgsForm({ fn, onBack, onClose }: { fn: FnInfo; onBack?: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  // the cell the function goes into (picking ranges moves the selection meanwhile)
  const [target] = useState(() => {
    const ed = useEditStore.getState().editing;
    const wb = useWorkbookStore.getState();
    return ed ? { sheet: ed.sheet, address: ed.address } : { sheet: wb.activeSheet, address: wb.cursor };
  });
  useEffect(
    () => () => {
      if (useEditStore.getState().editing) return; // releaseEdit restores the edited cell
      const st = useWorkbookStore.getState();
      if (st.sheets.includes(target.sheet)) {
        if (st.activeSheet !== target.sheet) st.setActiveSheet(target.sheet);
        st.setSelection({ sheet: target.sheet, range: target.address }, target.address);
      }
    },
    [target],
  );
  const firstRep = fn.args.findIndex((a) => a.rep);
  const baseCount = fn.args.length;
  const [values, setValues] = useState<string[]>(() => new Array(baseCount).fill(""));
  const [focus, setFocus] = useState(0);
  const sep = locale === "es" ? ";" : ",";

  // a repeating group grows when its last field is filled (Excel)
  const shown = useMemo(() => {
    if (firstRep < 0) return values.length;
    const group = baseCount - firstRep;
    let n = values.length;
    if (values[n - 1]?.trim() && n + group <= MAX_ARGS) n += group;
    return n;
  }, [values, firstRep, baseCount]);

  const call = useMemo(() => {
    const args = values.slice(0, shown).map((v) => v.trim());
    while (args.length && !args[args.length - 1]) args.pop();
    return `${fnName(fn, locale)}(${args.join(sep)})`;
  }, [values, shown, fn, locale, sep]);

  const calc = (expr: string): EvalValue | null => {
    const engine = useWorkbookStore.getState().engine;
    if (!engine || !expr.trim()) return null;
    try {
      const f = normaliseFormula(`=${expr}`);
      if (!engine.validateFormula(f)) return null;
      return engine.calculate(f, target.sheet) as EvalValue;
    } catch {
      return null;
    }
  };
  const result = calc(call);

  const setVal = (i: number, v: string) =>
    setValues((prev) => {
      const next = [...prev];
      while (next.length <= i) next.push("");
      next[i] = v;
      return next;
    });

  const pick = (i: number) => {
    useUiStore.getState().startRangePick((r) => {
      if (!r) return;
      const prefix = `${quoteSheet(target.sheet)}!`;
      setVal(i, r.startsWith(prefix) ? r.slice(prefix.length) : r);
    });
  };

  const accept = () => {
    const ed = useEditStore.getState().editing;
    if (ed) {
      if (!ed.text.startsWith("=")) useEditStore.getState().replace(`=${call}`, call.length + 1, undefined, null);
      else insertAtCaret(call);
    } else {
      const f = normaliseFormula(`=${call}`);
      const p = parseAddress(target.address);
      const st = useWorkbookStore.getState();
      if (p && st.engine?.validateFormula(f)) st.mutate(target.sheet, { r0: p.row, c0: p.col, r1: p.row, c1: p.col }, (eng) => eng.setRangeRaw(target.sheet, target.address, [[f]]));
    }
    onClose();
  };

  const fa = fn.args[declaredArgIndex(fn, focus)];
  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title={t("formula.arguments")}
      footer={
        <>
          {onBack && <Button onClick={onBack}>{t("formula.back")}</Button>}
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={accept} data-fx-ok>
            {t("common.ok")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 text-sm">
        <div className="font-mono font-semibold">{fnName(fn, locale)}</div>
        {fn.args.length === 0 && <div className="text-slate-500">—</div>}
        {Array.from({ length: shown }, (_, i) => {
          const a = fn.args[declaredArgIndex(fn, i)];
          const label = argLabel(fn, i, locale);
          const v = values[i] ?? "";
          const val = calc(v);
          return (
            <div key={i} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 max-md:grid-cols-1">
              <label htmlFor={`fxarg${i}`} className={a.opt || i >= baseCount ? "text-slate-600 dark:text-slate-400" : "font-semibold"}>
                {label}
              </label>
              <div className="flex min-w-0 items-center gap-1">
                <input
                  id={`fxarg${i}`}
                  data-fx-arg={i}
                  className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs focus:border-blue-600 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
                  value={v}
                  autoFocus={i === 0}
                  onFocus={() => setFocus(i)}
                  onChange={(e) => setVal(i, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), accept())}
                />
                <button type="button" title={t("formula.pickArg")} aria-label={t("formula.pickArg")} className="rounded-md border border-slate-300 p-1 text-blue-700 hover:bg-blue-50 dark:border-slate-600 dark:text-blue-300 dark:hover:bg-slate-800" onClick={() => pick(i)}>
                  <SquareDashedMousePointer size={14} />
                </button>
                <span className="w-28 shrink-0 truncate font-mono text-xs text-slate-500 max-md:w-20" title={val !== null ? formatEvalValue(val, locale) : ""}>
                  {val !== null ? `= ${formatEvalValue(val, locale)}` : ""}
                </span>
              </div>
            </div>
          );
        })}
        <div className="mt-2 rounded-md bg-slate-50 p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <div>{fn.d[locale]}</div>
          {fa && (
            <div className="mt-1 text-[12.5px]">
              <b>{locale === "es" ? fa.es : fa.en}</b>: {fa.d[locale]}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-xs">
          <span className="truncate text-slate-500">={call}</span>
          <span data-fx-result>
            {t("formula.result")} = <b>{result !== null ? formatEvalValue(result, locale) : ""}</b>
          </span>
        </div>
      </div>
    </Modal>
  );
}
