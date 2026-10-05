/**
 * Project evaluator: builds the classic project cash flow (flujo de caja del proyecto / del
 * inversionista), computes NPV, IRR, MIRR, payback, PI, EAA with an accept/reject reading, draws the
 * NPV profile and exports the model to a sheet with live formulas (ready for Monte Carlo).
 */
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { buildProjectCashFlow, projectIndicators, allIrrs, npv, type ProjectInputs } from "@openrisksim/finance";
import { Chart, Field, NumberInput, Select, clsx } from "../../components/ui";
import { useToolsT } from "../common/i18n";
import { Checkbox, ExportButton, HelpBox, Note, NumField, PctField, Section, StatGrid } from "../common/ui";
import { fmt, fmtPct, fmtPeriods } from "../common/format";
import { npvProfileOption } from "../common/charts";
import { growthSeries, resizeArray } from "../common/parse";
import { npvProfile, profileRates } from "../common/stats";
import { buildProjectSheet, buildProjectValuesSheet } from "../common/projectSheet";

type YearKey = "units" | "price" | "variableCost" | "fixedCosts";
const YEAR_KEYS: YearKey[] = ["units", "price", "variableCost", "fixedCosts"];

const DEFAULTS: ProjectInputs = {
  horizon: 5,
  investment: 100000,
  workingCapital: 15000,
  salvageValue: 20000,
  units: [10000, 11000, 12000, 12500, 13000],
  price: [12, 12, 12.5, 12.5, 13],
  variableCost: [6, 6, 6.2, 6.2, 6.4],
  fixedCosts: [25000, 25000, 26000, 26000, 27000],
  depreciationMethod: "straightLine",
  depreciableLife: 5,
  taxRate: 0.25,
  discountRate: 0.12,
};

export default function ProjectEvaluatorTool(_props: { onClose(): void }) {
  const { t, locale, L } = useToolsT();
  const [inp, setInp] = useState<ProjectInputs>(DEFAULTS);
  const [useLoan, setUseLoan] = useState(false);
  const [loan, setLoan] = useState<NonNullable<ProjectInputs["loan"]>>({ amount: 50000, rate: 0.1, periods: 5, method: "french" });
  const [growth, setGrowth] = useState<Record<YearKey, number>>({ units: 0.05, price: 0.03, variableCost: 0.03, fixedCosts: 0.02 });
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const H = Math.max(1, Math.min(50, Math.round(inp.horizon)));
  const full: ProjectInputs = useMemo(
    () => ({
      ...inp,
      horizon: H,
      units: resizeArray(inp.units, H),
      price: resizeArray(inp.price, H),
      variableCost: resizeArray(inp.variableCost, H),
      fixedCosts: resizeArray(inp.fixedCosts, H),
      loan: useLoan ? loan : undefined,
    }),
    [inp, H, useLoan, loan],
  );

  const calc = useMemo(() => {
    try {
      const table = buildProjectCashFlow(full);
      const ind = projectIndicators(table.freeCashFlow, full.discountRate);
      const irrs = allIrrs(table.freeCashFlow);
      const eq = table.equityCashFlow ? projectIndicators(table.equityCashFlow, full.discountRate) : null;
      const profile = npvProfile(table.freeCashFlow, profileRates(irrs.length ? irrs : [ind.irr], full.discountRate), npv);
      return { table, ind, irrs, eq, profile, error: null as string | null };
    } catch (e) {
      return { table: null, ind: null, irrs: [], eq: null, profile: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [full]);

  const set = (patch: Partial<ProjectInputs>) => setInp((s) => ({ ...s, ...patch }));
  const setYear = (key: YearKey, i: number, v: number) => setInp((s) => ({ ...s, [key]: resizeArray(s[key], H).map((x, j) => (j === i ? v : x)) }));
  const fillGrowth = (key: YearKey) => setInp((s) => ({ ...s, [key]: growthSeries(resizeArray(s[key], H)[0], growth[key], H).map((v) => Math.round(v * 100) / 100) }));

  const ind = calc.ind;
  const indicatorItems = ind
    ? [
        { label: t("project.npv"), value: fmt(ind.npv, 2, locale), hint: ind.npv > 0 ? t("project.accept") : ind.npv < 0 ? t("project.reject") : t("project.indifferent") },
        { label: t("project.irr"), value: fmtPct(ind.irr, 2, locale), hint: Number.isFinite(ind.irr) ? (ind.irr > full.discountRate ? t("project.accept") : t("project.reject")) : "" },
        { label: t("project.mirr"), value: fmtPct(ind.mirr, 2, locale) },
        { label: t("project.pi"), value: fmt(ind.profitabilityIndex, 3, locale), hint: ind.profitabilityIndex > 1 ? t("project.accept") : t("project.reject") },
        { label: t("project.payback"), value: fmtPeriods(ind.payback, locale) },
        { label: t("project.discountedPayback"), value: fmtPeriods(ind.discountedPayback, locale) },
        { label: t("project.eaa"), value: fmt(ind.eaa, 2, locale) },
      ]
    : [];

  const indicatorRows = () =>
    ind
      ? [
          { label: t("project.npv"), value: ind.npv },
          { label: t("project.irr"), value: ind.irr },
          { label: t("project.mirr"), value: ind.mirr },
          { label: t("project.payback"), value: ind.payback },
          { label: t("project.discountedPayback"), value: ind.discountedPayback },
          { label: t("project.pi"), value: ind.profitabilityIndex },
          { label: t("project.eaa"), value: ind.eaa },
          ...(calc.eq
            ? [
                { label: t("project.equityNpv"), value: calc.eq.npv },
                { label: t("project.equityIrr"), value: calc.eq.irr },
              ]
            : []),
        ]
      : [];

  const chart = useMemo(
    () =>
      calc.profile.length
        ? npvProfileOption({
            points: calc.profile,
            irrs: calc.irrs,
            discountRate: full.discountRate,
            labels: { npv: t("project.npv"), rate: t("project.rate"), irr: t("project.irr"), discount: t("project.discountRateShort") },
            locale,
          })
        : null,
    [calc, full.discountRate, locale, t],
  );

  const years = Array.from({ length: H }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      <HelpBox>
        <p>{t("project.help1")}</p>
        <p>{t("project.help2")}</p>
        <p>{t("project.help3")}</p>
      </HelpBox>

      <Section title={t("project.general")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumField label={t("project.horizon")} value={H} min={1} max={50} onChange={(horizon) => set({ horizon })} />
          <NumField label={t("project.investment")} value={inp.investment} min={0} onChange={(investment) => set({ investment })} />
          <NumField label={t("project.workingCapital")} value={inp.workingCapital} min={0} onChange={(workingCapital) => set({ workingCapital })} />
          <NumField label={t("project.salvageValue")} value={inp.salvageValue} onChange={(salvageValue) => set({ salvageValue })} hint={t("project.salvageHint")} />
          <Field label={t("project.depreciationMethod")}>
            <Select
              value={inp.depreciationMethod}
              onChange={(depreciationMethod: ProjectInputs["depreciationMethod"]) => set({ depreciationMethod })}
              options={[
                { value: "straightLine", label: t("depreciation.methods.straightLine") },
                { value: "doubleDeclining", label: t("depreciation.methods.doubleDeclining") },
                { value: "sumOfYears", label: t("depreciation.methods.sumOfYears") },
              ]}
            />
          </Field>
          <NumField label={t("project.depreciableLife")} value={inp.depreciableLife} min={1} max={100} onChange={(depreciableLife) => set({ depreciableLife })} />
          <PctField label={t("project.taxRate")} value={inp.taxRate} onChange={(taxRate) => set({ taxRate })} />
          <PctField label={t("project.discountRate")} value={inp.discountRate} onChange={(discountRate) => set({ discountRate })} hint={t("project.discountHint")} />
        </div>
      </Section>

      <Section title={t("project.perYear")}>
        <div className="overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800">
              <tr>
                <th className="px-2 py-1.5 text-left">{t("project.year")}</th>
                {years.map((y) => (
                  <th key={y} className="min-w-24 px-1 py-1.5 text-right">
                    {y}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-left">{t("project.growthFill")}</th>
              </tr>
            </thead>
            <tbody>
              {YEAR_KEYS.map((key) => {
                const arr = resizeArray(inp[key], H);
                return (
                  <tr key={key} className="border-t border-slate-100 dark:border-slate-800">
                    <th className="whitespace-nowrap px-2 py-1 text-left font-medium">{t(`project.rows.${key}`)}</th>
                    {arr.map((v, i) => (
                      <td key={i} className="px-1 py-0.5">
                        <NumberInput value={v} onChange={(x) => setYear(key, i, x)} />
                      </td>
                    ))}
                    <td className="px-1 py-0.5">
                      <div className="flex items-center gap-1">
                        <NumberInput className="w-16" value={Math.round(growth[key] * 1000) / 10} onChange={(g) => setGrowth({ ...growth, [key]: g / 100 })} />
                        <span className="text-xs">%</span>
                        <button type="button" title={t("project.applyGrowth")} aria-label={t("project.applyGrowth")} onClick={() => fillGrowth(key)} className="rounded p-1 text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800">
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">{t("project.perYearHint")}</p>
      </Section>

      <Section title={t("project.financing")}>
        <Checkbox checked={useLoan} onChange={setUseLoan} label={t("project.useLoan")} />
        {useLoan && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <NumField label={t("project.loanAmount")} value={loan.amount} min={0} onChange={(amount) => setLoan({ ...loan, amount })} />
            <PctField label={t("project.loanRate")} value={loan.rate} onChange={(rate) => setLoan({ ...loan, rate })} />
            <NumField label={t("project.loanPeriods")} value={loan.periods} min={1} max={50} onChange={(periods) => setLoan({ ...loan, periods: Math.round(periods) })} />
            <Field label={t("loan.method")}>
              <Select
                value={loan.method}
                onChange={(method: typeof loan.method) => setLoan({ ...loan, method })}
                options={[
                  { value: "french", label: t("loan.methods.french") },
                  { value: "german", label: t("loan.methods.german") },
                  { value: "american", label: t("loan.methods.american") },
                ]}
              />
            </Field>
          </div>
        )}
      </Section>

      {calc.error && <Note tone="bad">{calc.error}</Note>}
      {calc.table && ind && (
        <>
          <Section title={t("project.indicators")}>
            <StatGrid items={indicatorItems} />
            <Note tone={ind.npv > 0 ? "good" : ind.npv < 0 ? "bad" : "info"}>
              <p>
                <strong>{ind.npv > 0 ? t("project.verdictAccept") : ind.npv < 0 ? t("project.verdictReject") : t("project.verdictIndifferent")}</strong>
              </p>
              <p>{t("project.npvMeaning", { npv: fmt(ind.npv, 2, locale), rate: fmtPct(full.discountRate, 1, locale) })}</p>
              {Number.isFinite(ind.irr) && <p>{t("project.irrMeaning", { irr: fmtPct(ind.irr, 2, locale), rate: fmtPct(full.discountRate, 1, locale) })}</p>}
              {calc.irrs.length > 1 && <p>{t("project.multipleIrr", { irrs: calc.irrs.map((r) => fmtPct(r, 2, locale)).join(", ") })}</p>}
              <p>{Number.isFinite(ind.payback) ? t("project.paybackMeaning", { p: fmtPeriods(ind.payback, locale), h: H }) : t("project.noPayback")}</p>
            </Note>
            {calc.eq && (
              <Note>
                {t("project.equityMeaning", { npv: fmt(calc.eq.npv, 2, locale), irr: fmtPct(calc.eq.irr, 2, locale) })}
              </Note>
            )}
          </Section>

          <Section
            title={t("project.cashFlow")}
            actions={
              <>
                <ExportButton
                  sheetName={t("project.sheetName")}
                  label={t("project.exportFormulas")}
                  build={() => {
                    const sheet = buildProjectSheet(full, locale);
                    setExportMsg(t("project.exportHint", { npv: sheet.cells.npv, price: sheet.cells.price, units: sheet.cells.units }));
                    return sheet.rows;
                  }}
                />
                <ExportButton sheetName={t("project.sheetNameValues")} label={t("project.exportValues")} build={() => buildProjectValuesSheet(calc.table!, indicatorRows(), locale)} />
              </>
            }
          >
            {exportMsg && <Note tone="good">{exportMsg}</Note>}
            <div className="overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="w-full border-collapse text-sm tabular-nums">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="px-2 py-1.5 text-left">{t("project.year")}</th>
                    {Array.from({ length: H + 1 }, (_, i) => (
                      <th key={i} className="px-2 py-1.5 text-right">
                        {i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calc.table.rows.map((row) => {
                    const strong = row.key === "freeCashFlow" || row.key === "equityCashFlow" || row.key === "ebt" || row.key === "netIncome";
                    return (
                      <tr key={row.key} className={clsx("border-t border-slate-100 dark:border-slate-800", strong && "bg-slate-50 font-semibold dark:bg-slate-800/60")}>
                        <td className="whitespace-nowrap px-2 py-1 text-left">{L(row.label)}</td>
                        {row.values.map((v, i) => (
                          <td key={i} className={clsx("px-2 py-1 text-right", v < 0 && "text-red-700 dark:text-red-400")}>
                            {v === 0 ? "–" : fmt(v, 0, locale)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={t("project.profile")}>
            {chart && <Chart option={chart} height={300} />}
            <p className="text-xs text-slate-500">{t("project.profileHint")}</p>
          </Section>
        </>
      )}
    </div>
  );
}
