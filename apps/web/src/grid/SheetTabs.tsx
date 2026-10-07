import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { clsx } from "../components/ui";
import { useWorkbookStore } from "../store/workbook";
import { canPoint, commitEdit, focusEditor, useEditStore } from "./editState";

export function SheetTabs() {
  const { t } = useTranslation();
  const sheets = useWorkbookStore((s) => s.sheets);
  const active = useWorkbookStore((s) => s.activeSheet);
  const engine = useWorkbookStore((s) => s.engine);
  return (
    <div className="no-scrollbar-mobile flex h-7 shrink-0 items-stretch gap-px overflow-x-auto border-t max-md:h-9 max-md:text-[13px] border-slate-300 bg-slate-100 pl-1 text-[12px] dark:border-slate-700 dark:bg-slate-800" role="tablist" aria-label={t("grid.sheets")}>
      {sheets.map((name) => (
        <button
          key={name}
          role="tab"
          aria-selected={name === active}
          onMouseDown={(e) => {
            // pointing at another sheet while editing a formula: keep the editor focused
            if (canPoint()) e.preventDefault();
          }}
          onClick={() => {
            const ed = useEditStore.getState().editing;
            if (ed && canPoint()) {
              // Excel: the edit continues in the formula bar while you pick cells on another sheet
              if (ed.source !== "bar") useEditStore.getState().patch({ source: "bar" });
              useWorkbookStore.getState().setActiveSheet(name);
              requestAnimationFrame(focusEditor);
              return;
            }
            if (!commitEdit()) return;
            useWorkbookStore.getState().setActiveSheet(name);
          }}
          className={clsx(
            "shrink-0 whitespace-nowrap border-x border-b-2 px-3 max-md:px-4",
            name === active
              ? "border-x-slate-300 border-b-blue-700 bg-white font-semibold text-blue-800 dark:border-x-slate-600 dark:bg-slate-950 dark:text-blue-300"
              : "border-x-transparent border-b-transparent text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700",
          )}
        >
          {name}
        </button>
      ))}
      <button
        disabled={!engine}
        aria-label={t("grid.addSheet")}
        title={t("grid.addSheet")}
        className="px-2 text-slate-500 hover:bg-slate-200 max-md:px-3 hover:text-slate-900 disabled:opacity-40 dark:hover:bg-slate-700"
        onClick={() => {
          const base = t("grid.sheetBase");
          let i = sheets.length + 1;
          while (sheets.includes(`${base}${i}`)) i++;
          useWorkbookStore.getState().addSheet(`${base}${i}`);
        }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
