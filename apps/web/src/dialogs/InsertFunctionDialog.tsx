import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, clsx } from "../components/ui";
import { useUiStore } from "../store/ui";
import { CATEGORY_LABELS, FUNCTION_CATALOG, catalogEntry, fnName, signatureParts, type FnCategory, type FnInfo } from "../lib/functionCatalog";
import { foldName } from "../lib/autocomplete";
import { canonicalFunctionName } from "../lib/formulaI18n";
import { releaseEdit } from "../grid/formulaActions";
import { FunctionArgsForm } from "./FunctionArgsForm";

const POPULAR = ["SUM", "AVERAGE", "IF", "NPV", "IRR", "PMT", "VLOOKUP", "COUNTIF", "SUMPRODUCT", "MAX", "MIN", "ROUND", "STDEV.S", "NORM.INV"];

/** Excel's "Insert function" (fx): search/category list, then the argument form. */
export function InsertFunctionDialog({ fn, onClose }: { fn?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const initial = fn ? catalogEntry(canonicalFunctionName(fn) ?? fn) : undefined;
  const [chosen, setChosen] = useState<FnInfo | null>(initial ?? null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<FnCategory | "all" | "popular">("popular");
  const [sel, setSel] = useState<FnInfo | null>(initial ?? null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => releaseEdit(), []);
  useEffect(() => {
    if (!chosen) searchRef.current?.focus();
  }, [chosen]);

  const list = useMemo(() => {
    const q = foldName(query.trim());
    let items: FnInfo[];
    if (q) {
      const words = q.split(/\s+/);
      const score = (f: FnInfo) => {
        const name = foldName(fnName(f, locale));
        if (name === q || f.en === q) return 0;
        if (name.startsWith(q) || f.en.startsWith(q)) return 1;
        const desc = foldName(f.d[locale]);
        return words.every((w) => name.includes(w) || desc.includes(w)) ? 2 : 9;
      };
      items = FUNCTION_CATALOG.map((f) => [f, score(f)] as const)
        .filter(([, s]) => s < 9)
        .sort((a, b) => a[1] - b[1] || fnName(a[0], locale).localeCompare(fnName(b[0], locale)))
        .map(([f]) => f);
    } else if (cat === "popular") items = POPULAR.map((n) => catalogEntry(n)!).filter(Boolean);
    else items = FUNCTION_CATALOG.filter((f) => cat === "all" || f.cat === cat).sort((a, b) => fnName(a, locale).localeCompare(fnName(b, locale)));
    return items;
  }, [query, cat, locale]);

  useEffect(() => {
    if (!sel || !list.includes(sel)) setSel(list[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  if (chosen) return <FunctionArgsForm fn={chosen} onBack={initial ? undefined : () => setChosen(null)} onClose={onClose} />;

  const idx = sel ? list.indexOf(sel) : -1;
  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title={t("formula.insertFunction")}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!sel} onClick={() => sel && setChosen(sel)}>
            {t("common.ok")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-medium">{t("formula.searchFunction")}</span>
          <input
            ref={searchRef}
            data-fx-search
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-blue-600 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
            placeholder={t("formula.searchHint")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = list.length;
                if (n) setSel(list[(idx + (e.key === "ArrowDown" ? 1 : n - 1) + n) % n]);
              } else if (e.key === "Enter" && sel) {
                e.preventDefault();
                setChosen(sel);
              }
            }}
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="font-medium">{t("formula.category")}</span>
          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
            value={cat}
            disabled={!!query.trim()}
            onChange={(e) => setCat(e.target.value as FnCategory | "all" | "popular")}
          >
            <option value="popular">{t("formula.recent")}</option>
            <option value="all">{t("formula.allCategories")}</option>
            {(Object.keys(CATEGORY_LABELS) as FnCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c][locale]}
              </option>
            ))}
          </select>
        </label>
        <div>
          <div className="mb-1 font-medium">{t("formula.selectFunction")}</div>
          <div role="listbox" aria-label={t("formula.selectFunction")} className="h-52 overflow-auto rounded-md border border-slate-300 dark:border-slate-600 max-md:h-64">
            {list.length === 0 && <div className="p-2 text-slate-500">{t("formula.noMatches")}</div>}
            {list.map((f) => (
              <div
                key={f.en}
                role="option"
                aria-selected={f === sel}
                className={clsx("cursor-default px-2 py-0.5 font-mono text-[12.5px] max-md:py-2", f === sel ? "bg-blue-600 text-white" : "hover:bg-blue-50 dark:hover:bg-slate-800")}
                onClick={() => setSel(f)}
                onDoubleClick={() => setChosen(f)}
              >
                {fnName(f, locale)}
              </div>
            ))}
          </div>
        </div>
        {sel && (
          <div className="min-h-14">
            <div className="font-mono text-[12.5px] font-semibold">{signatureParts(sel, locale).map((p) => p.text).join("")}</div>
            <div className="mt-1 text-slate-600 dark:text-slate-300">{sel.d[locale]}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
