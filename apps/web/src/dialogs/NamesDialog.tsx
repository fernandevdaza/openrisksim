import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, SquareDashedMousePointer, Trash2 } from "lucide-react";
import { Button, Modal } from "../components/ui";
import { useUiStore } from "../store/ui";
import { useWorkbookStore } from "../store/workbook";
import { toDisplayFormula } from "../lib/formulaI18n";
import { formatEvalValue, type EvalValue } from "../lib/formulaEval";
import { normaliseFormula } from "../grid/editState";

const NAME_RE = /^[\p{L}_\\][\p{L}\p{N}_.]*$/u;

/** Name manager: list / add / edit / delete workbook-level defined names. */
export function NamesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const version = useWorkbookStore((s) => s.version);
  const engine = useWorkbookStore((s) => s.engine);
  const [form, setForm] = useState<{ orig: string | null; name: string; ref: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const names = useMemo(() => {
    if (!engine) return [];
    const sheet = useWorkbookStore.getState().activeSheet;
    return engine.listNames().map((n) => {
      let value = "";
      try {
        value = formatEvalValue(engine.calculate(n.formula, sheet) as EvalValue, locale);
      } catch {
        /* ignore */
      }
      return { ...n, display: toDisplayFormula(n.formula, locale), value };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, version, locale]);

  const save = () => {
    if (!form || !engine) return;
    const name = form.name.trim();
    if (!NAME_RE.test(name) || /^[A-Za-z]{1,3}\d+$/.test(name) || /^(TRUE|FALSE|VERDADERO|FALSO)$/i.test(name)) return setErr(t("formula.badName"));
    const expr = normaliseFormula(form.ref.trim().startsWith("=") ? form.ref.trim() : `=${form.ref.trim()}`);
    if (!form.ref.trim() || !engine.validateFormula(expr)) return setErr(t("formula.badRefersTo"));
    try {
      useWorkbookStore.getState().mutate(useWorkbookStore.getState().activeSheet, null, (eng) => {
        if (form.orig && form.orig.toLowerCase() !== name.toLowerCase()) eng.removeName(form.orig);
        eng.setName(name, expr);
      });
    } catch {
      return setErr(t("formula.badName"));
    }
    useUiStore.getState().notify(t("formula.nameSaved", { name }), "success");
    setForm(null);
    setErr(null);
  };

  const pick = () => {
    useUiStore.getState().startRangePick((r) => {
      if (r && form) setForm({ ...form, ref: `=${r.replace(/!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/, (_m, c1, r1, c2, r2) => `!$${c1}$${r1}${c2 ? `:$${c2}$${r2}` : ""}`)}` });
    });
  };

  return (
    <Modal open size="md" onClose={onClose} title={t("formula.names")} footer={<Button onClick={onClose}>{t("common.close")}</Button>}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-slate-600 dark:text-slate-300">{t("formula.namesHint")}</p>
        <div className="overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-2 py-1">{t("common.name")}</th>
                <th className="px-2 py-1">{t("formula.refersTo")}</th>
                <th className="px-2 py-1">{t("formula.value")}</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {names.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-2 text-slate-500">
                    {t("formula.noNames")}
                  </td>
                </tr>
              )}
              {names.map((n) => (
                <tr key={n.name} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1 font-semibold">{n.name}</td>
                  <td className="break-all px-2 py-1 font-mono">{n.display}</td>
                  <td className="px-2 py-1 font-mono">{n.value}</td>
                  <td className="whitespace-nowrap px-1">
                    <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label={t("common.edit")} title={t("common.edit")} onClick={() => (setErr(null), setForm({ orig: n.name, name: n.name, ref: n.display }))}>
                      <Pencil size={14} />
                    </button>
                    <button className="rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-slate-700" aria-label={t("common.delete")} title={t("common.delete")} onClick={() => useWorkbookStore.getState().mutate(useWorkbookStore.getState().activeSheet, null, (eng) => eng.removeName(n.name))}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {form ? (
          <div className="flex flex-col gap-2 rounded-md border border-slate-200 p-2 dark:border-slate-700">
            <label className="flex flex-col gap-1">
              <span className="font-medium">{t("common.name")}</span>
              <input data-name-input className="rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium">{t("formula.refersTo")}</span>
              <div className="flex gap-1">
                <input data-name-ref className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs dark:border-slate-600 dark:bg-slate-900" value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} />
                <button type="button" className="rounded-md border border-slate-300 px-1.5 text-blue-700 dark:border-slate-600 dark:text-blue-300" title={t("formula.pickArg")} aria-label={t("formula.pickArg")} onClick={pick}>
                  <SquareDashedMousePointer size={14} />
                </button>
              </div>
            </label>
            {err && <div className="text-red-700 dark:text-red-400">{err}</div>}
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={() => (setForm(null), setErr(null))}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" variant="primary" onClick={save}>
                {t("common.ok")}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button size="sm" onClick={() => setForm({ orig: null, name: "", ref: "=" })}>
              <Plus size={14} /> {t("formula.newName")}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
