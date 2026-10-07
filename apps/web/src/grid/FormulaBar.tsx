import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkbookStore } from "../store/workbook";
import { useUiStore } from "../store/ui";
import { ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "../components/ui";
import { rawCellContent } from "./editState";
import { FormulaInput } from "./FormulaInput";
import { openInsertFunction } from "./formulaActions";
import { parseRangeBounds, splitSheetRef } from "../lib/a1";
import { isCoarsePointer } from "../lib/responsive";

/** Name box + fx input (Excel-like). */
export function FormulaBar() {
  const { t } = useTranslation();
  const sheet = useWorkbookStore((s) => s.activeSheet);
  const selection = useWorkbookStore((s) => s.selection);
  const cursor = useWorkbookStore((s) => s.cursor);
  const version = useWorkbookStore((s) => s.version);
  const engine = useWorkbookStore((s) => s.engine);
  const [nameText, setNameText] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const raw = engine && sheet ? rawCellContent({ sheet, address: cursor }) : "";
  void version;
  const expanded = useUiStore((s) => s.formulaBarExpanded);

  useEffect(() => setNameText(null), [selection.range, sheet]);

  const focusGrid = () => {
    // touch devices: just drop the focus (focusing the hidden textarea would keep the on-screen keyboard up)
    if (isCoarsePointer()) (document.activeElement as HTMLElement | null)?.blur();
    else (document.querySelector("[data-grid-focus]") as HTMLElement | null)?.focus({ preventScroll: true });
  };

  const goName = () => {
    const txt = (nameText ?? "").trim();
    setNameText(null);
    if (!txt) return;
    const { sheet: sh, range } = splitSheetRef(txt);
    const target = sh ?? sheet;
    if (!parseRangeBounds(range) || !useWorkbookStore.getState().sheets.includes(target)) {
      useUiStore.getState().notify(t("grid.badReference", { ref: txt }), "error");
      return;
    }
    useUiStore.getState().jumpTo({ sheet: target, address: range });
  };

  return (
    <div className="flex min-h-8 shrink-0 items-start gap-2 py-1 border-b border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-slate-900 max-md:h-11 max-md:gap-1.5 max-md:px-1.5">
      <input
        aria-label={t("grid.nameBox")}
        className="h-6 w-28 shrink-0 rounded border max-md:h-8 max-md:w-16 max-md:px-1 max-md:text-center border-slate-300 bg-white px-1.5 text-[12px] tabular-nums text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        value={nameText ?? selection.range}
        onChange={(e) => setNameText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            goName();
          } else if (e.key === "Escape") {
            setNameText(null);
            focusGrid();
          }
        }}
        onBlur={() => setNameText(null)}
      />
      <button
        type="button"
        data-keep-edit
        title={t("formula.insertFunction")}
        aria-label={t("formula.insertFunction")}
        disabled={!engine}
        className="shrink-0 rounded px-1 font-serif text-sm italic text-slate-600 hover:bg-blue-100 hover:text-blue-800 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700 max-md:text-xs"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => openInsertFunction()}
      >
        fx
      </button>
      <FormulaInput
        variant="bar"
        ariaLabel={t("grid.formulaBar")}
        idleText={raw}
        disabled={!engine}
        wrap={expanded}
        typo="px-2 py-[3px] font-mono text-[12px] leading-[17px] max-md:py-[7px]"
        className={clsx(
          "min-w-0 flex-1 self-start rounded border border-slate-300 bg-white focus-within:border-blue-600 dark:border-slate-600 dark:bg-slate-800",
          expanded ? "h-[94px]" : "h-6 max-md:h-8",
        )}
      />
      <button
        type="button"
        className="shrink-0 self-start rounded p-0.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 max-md:hidden"
        title={t("formula.expandBar")}
        aria-label={t("formula.expandBar")}
        aria-expanded={expanded}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => useUiStore.getState().setFormulaBarExpanded(!expanded)}
      >
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
    </div>
  );
}
