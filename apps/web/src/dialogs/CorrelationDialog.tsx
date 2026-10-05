import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert, CircleCheck } from "lucide-react";
import type { CorrelationDef } from "@openrisksim/core";
import { cholesky, nearestPositiveDefinite } from "@openrisksim/engine";
import { Button, Modal } from "../components/ui";
import { useModelStore } from "../store/model";

function isPositiveDefinite(m: number[][]): boolean {
  try {
    cholesky(m);
    return true;
  } catch {
    return false;
  }
}

function cellColor(v: number): string {
  if (!v) return "transparent";
  const a = Math.min(1, Math.abs(v)) * 0.45;
  return v > 0 ? `rgba(29,78,216,${a})` : `rgba(220,38,38,${a})`;
}

export function CorrelationDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const model = useModelStore((s) => s.model);
  const assumptions = model.assumptions;
  const ids = assumptions.map((a) => a.id);
  const [matrix, setMatrix] = useState<number[][]>(() => {
    const k = ids.length;
    const m: number[][] = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
    for (const c of model.correlations) {
      const i = ids.indexOf(c.a);
      const j = ids.indexOf(c.b);
      if (i >= 0 && j >= 0 && i !== j) {
        m[i][j] = c.rho;
        m[j][i] = c.rho;
      }
    }
    return m;
  });
  const [texts, setTexts] = useState<Record<string, string>>({});

  const outOfRange = matrix.some((row, i) => row.some((v, j) => i !== j && (!Number.isFinite(v) || v < -1 || v > 1)));
  const pd = useMemo(() => !outOfRange && isPositiveDefinite(matrix), [matrix, outOfRange]);

  const setRho = (i: number, j: number, v: number) =>
    setMatrix((m) => {
      const next = m.map((r) => [...r]);
      next[i][j] = v;
      next[j][i] = v;
      return next;
    });

  const fixPd = () => {
    try {
      const near = nearestPositiveDefinite(matrix);
      // the projection lands on the PSD boundary: shrink towards the identity until strictly PD
      let fixed = near;
      for (const eps of [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2]) {
        fixed = near.map((r, i) => r.map((v, j) => (i === j ? 1 : Math.round((1 - eps) * v * 1e3) / 1e3)));
        if (isPositiveDefinite(fixed)) break;
      }
      setMatrix(fixed);
      setTexts({});
    } catch (e) {
      console.warn(e);
    }
  };

  const save = () => {
    const defs: CorrelationDef[] = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) if (matrix[i][j] !== 0 && Number.isFinite(matrix[i][j])) defs.push({ a: ids[i], b: ids[j], rho: matrix[i][j] });
    useModelStore.getState().setCorrelations(defs);
    onClose();
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={t("corr.title")}
      footer={
        <>
          <Button
            className="mr-auto"
            variant="ghost"
            onClick={() => {
              setMatrix((m) => m.map((r, i) => r.map((_, j) => (i === j ? 1 : 0))));
              setTexts({});
            }}
          >
            {t("corr.clearAll")}
          </Button>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={save} disabled={outOfRange}>
            {t("common.ok")}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">{t("corr.hint")}</p>
      {!model.settings.applyCorrelations && <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{t("corr.disabledInSettings")}</p>}
      <div className="max-h-[56vh] overflow-auto rounded border border-slate-200 dark:border-slate-700">
        <table className="border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="sticky left-0 bg-slate-100 px-2 py-1 dark:bg-slate-800" />
              {assumptions.map((a, j) => (
                <th key={a.id} className="max-w-[90px] truncate px-1 py-1 text-center font-semibold" title={a.name}>
                  {j + 1}. {a.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assumptions.map((a, i) => (
              <tr key={a.id}>
                <th className="sticky left-0 max-w-[180px] truncate bg-slate-50 px-2 py-1 text-left font-semibold dark:bg-slate-900" title={`${a.name} (${a.cell.sheet}!${a.cell.address})`}>
                  {i + 1}. {a.name}
                  {!a.enabled && <span className="ml-1 font-normal text-slate-400">({t("defs.disabled")})</span>}
                </th>
                {assumptions.map((b, j) => {
                  const key = `${i}-${j}`;
                  if (i === j) return <td key={b.id} className="border border-slate-200 bg-slate-100 px-1 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-800">1</td>;
                  if (j < i)
                    return (
                      <td key={b.id} className="border border-slate-200 px-1 text-center tabular-nums text-slate-400 dark:border-slate-700" style={{ background: cellColor(matrix[i][j]) }}>
                        {matrix[i][j] ? matrix[i][j].toFixed(2) : ""}
                      </td>
                    );
                  const v = matrix[i][j];
                  const bad = !Number.isFinite(v) || v < -1 || v > 1;
                  return (
                    <td key={b.id} className="border border-slate-200 p-0 dark:border-slate-700" style={{ background: cellColor(v) }}>
                      <input
                        aria-label={`${a.name} × ${b.name}`}
                        className={`w-16 bg-transparent px-1 py-1 text-right tabular-nums outline-none focus:ring-1 focus:ring-blue-600 ${bad ? "text-red-600" : ""}`}
                        value={texts[key] ?? (v === 0 ? "" : String(v))}
                        placeholder="0"
                        onChange={(e) => {
                          setTexts((tx) => ({ ...tx, [key]: e.target.value }));
                          const s = e.target.value.trim().replace(",", ".");
                          const n = s === "" ? 0 : Number(s);
                          if (Number.isFinite(n)) setRho(i, j, n);
                          else setRho(i, j, NaN);
                        }}
                        onBlur={() =>
                          setTexts((tx) => {
                            const next = { ...tx };
                            delete next[key];
                            return next;
                          })
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {outOfRange ? (
          <span className="flex items-center gap-1 text-red-600">
            <TriangleAlert size={14} /> {t("corr.outOfRange")}
          </span>
        ) : pd ? (
          <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
            <CircleCheck size={14} /> {t("corr.valid")}
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <TriangleAlert size={14} /> {t("corr.notPd")}
            </span>
            <Button size="sm" onClick={fixPd}>
              {t("corr.fix")}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
