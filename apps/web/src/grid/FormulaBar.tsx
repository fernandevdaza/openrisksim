import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkbookStore } from "../store/workbook";
import { useUiStore } from "../store/ui";
import { commitEdit, rawCellContent, useEditStore } from "./editState";
import { parseRangeBounds, splitSheetRef } from "../lib/a1";

/** Name box + fx input (Excel-like). */
export function FormulaBar() {
  const { t } = useTranslation();
  const sheet = useWorkbookStore((s) => s.activeSheet);
  const selection = useWorkbookStore((s) => s.selection);
  const cursor = useWorkbookStore((s) => s.cursor);
  const version = useWorkbookStore((s) => s.version);
  const engine = useWorkbookStore((s) => s.engine);
  const editing = useEditStore((s) => s.editing);
  const [nameText, setNameText] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const raw = engine && sheet ? rawCellContent({ sheet, address: cursor }) : "";
  void version;
  const shown = editing && editing.sheet === sheet && editing.address === cursor ? editing.text : raw;

  useEffect(() => setNameText(null), [selection.range, sheet]);

  const focusGrid = () => (document.querySelector("[data-grid-focus]") as HTMLElement | null)?.focus({ preventScroll: true });

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
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 dark:border-slate-700 dark:bg-slate-900">
      <input
        aria-label={t("grid.nameBox")}
        className="h-6 w-28 rounded border border-slate-300 bg-white px-1.5 text-[12px] tabular-nums text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
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
      <span className="select-none font-serif text-sm italic text-slate-500">fx</span>
      <input
        data-formula-input
        aria-label={t("grid.formulaBar")}
        className="h-6 flex-1 rounded border border-slate-300 bg-white px-2 font-mono text-[12px] text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        value={shown}
        disabled={!engine}
        onFocus={() => {
          const ed = useEditStore.getState().editing;
          if (!ed) useEditStore.getState().start({ sheet, address: cursor, text: raw, mode: "edit", source: "bar" });
          else if (ed.source !== "bar") useEditStore.setState({ editing: { ...ed, source: "bar", mode: "edit" } });
        }}
        onChange={(e) => {
          const ed = useEditStore.getState().editing;
          if (!ed) useEditStore.getState().start({ sheet, address: cursor, text: e.target.value, mode: "edit", source: "bar" });
          else useEditStore.getState().setText(e.target.value);
        }}
        onBlur={(e) => {
          const next = e.relatedTarget as HTMLElement | null;
          if (next?.closest("[data-cell-editor]")) return;
          commitEdit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitEdit();
            focusGrid();
          } else if (e.key === "Escape") {
            e.preventDefault();
            useEditStore.getState().cancel();
            focusGrid();
          }
        }}
      />
    </div>
  );
}
