import { SquareDashedMousePointer, TextCursorInput } from "lucide-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { useWorkbookStore } from "../../store/workbook";
import { useUiStore } from "../../store/ui";

/** "Hoja 1" → "'Hoja 1'" when needed. */
function quoteSheet(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

export function formatRangeRef(sheet: string, range: string): string {
  return `${quoteSheet(sheet)}!${range}`;
}

/** Parse "Hoja1!B2:B9", "'Mi hoja'!B2" or "B2:B9" (active sheet). */
export function resolveRangeRef(value: string, defaultSheet?: string): { sheet: string; range: string } | null {
  const v = value.trim();
  if (!v) return null;
  const idx = v.lastIndexOf("!");
  let sheet = defaultSheet ?? useWorkbookStore.getState().activeSheet;
  let range = v;
  if (idx >= 0) {
    sheet = v.slice(0, idx).trim();
    if (sheet.startsWith("'") && sheet.endsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
    range = v.slice(idx + 1);
  }
  range = range.replace(/\$/g, "").trim().toUpperCase();
  if (!/^[A-Z]{1,3}\d{1,7}(:[A-Z]{1,3}\d{1,7})?$/.test(range)) return null;
  return { sheet, range };
}

/** Numeric values of a range reference (row-major, non-numbers skipped). */
export function readRangeNumbers(value: string): number[] {
  const ref = resolveRangeRef(value);
  const engine = useWorkbookStore.getState().engine;
  if (!ref || !engine) return [];
  try {
    return engine
      .getRangeValues(ref.sheet, ref.range)
      .flat()
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  } catch {
    return [];
  }
}

/**
 * Range text field + buttons: "use current selection" and "pick on the sheet" (temporarily hides
 * open dialogs so the user can select a range in the grid, like Excel's RefEdit).
 */
export function RangeInput({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const invalid = value.trim() !== "" && !resolveRangeRef(value);
  return (
    <div className={clsx("flex items-stretch gap-1", className)}>
      <input
        aria-label={ariaLabel ?? t("range.label")}
        aria-invalid={invalid}
        disabled={disabled}
        className={clsx(
          "w-full min-w-0 rounded-md border bg-white px-2 py-1 font-mono text-xs text-slate-900 focus:outline-none focus:ring-1 dark:bg-slate-900 dark:text-slate-100",
          invalid ? "border-red-500 focus:ring-red-500" : "border-slate-300 focus:border-blue-600 focus:ring-blue-600 dark:border-slate-600",
        )}
        value={value}
        placeholder={placeholder ?? "Hoja1!B2:B20"}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        disabled={disabled}
        title={t("range.useSelection")}
        aria-label={t("range.useSelection")}
        className="rounded-md border border-slate-300 px-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        onClick={() => {
          const sel = useWorkbookStore.getState().selection;
          if (sel.sheet) onChange(formatRangeRef(sel.sheet, sel.range));
        }}
      >
        <TextCursorInput size={14} />
      </button>
      <button
        type="button"
        disabled={disabled}
        title={t("range.pick")}
        aria-label={t("range.pick")}
        className="rounded-md border border-slate-300 px-1.5 text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-slate-600 dark:text-blue-300 dark:hover:bg-slate-800"
        onClick={() => {
          const ref = resolveRangeRef(value);
          if (ref) useUiStore.getState().jumpTo({ sheet: ref.sheet, address: ref.range });
          useUiStore.getState().startRangePick((r) => {
            if (r) onChange(r);
          });
        }}
      >
        <SquareDashedMousePointer size={14} />
      </button>
    </div>
  );
}
