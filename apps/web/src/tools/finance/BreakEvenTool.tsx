/**
 * Break-even: accounting break-even (units & revenue) and model break-even (value of an input
 * cell that makes a forecast — e.g. NPV — equal to a target, usually 0).
 */
import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import { accountingBreakEven, breakEven } from "@openrisksim/finance";
import { Button, Chart, Tabs } from "../../components/ui";
import { useModelStore } from "../../store/model";
import { useToolsT } from "../common/i18n";
import { RangeInput } from "../common/RangeInput";
import { ErrorNote, ForecastSelect, HelpBox, Note, NumField, Section, SplitLayout, StatGrid } from "../common/ui";
import { ToolError, cellNumber, modelForCells, parseCellRef, withEvaluator } from "../common/workbook";
import { fmt, fmtAuto, fmtPct } from "../common/format";
import { breakEvenOption, lineOption } from "../common/charts";
import { linspace } from "../common/parse";

type Tab = "accounting" | "model";

export default function BreakEvenTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const [tab, setTab] = useState<Tab>("accounting");
  // accounting
  const [fixed, setFixed] = useState(50000);
  const [price, setPrice] = useState(25);
  const [vc, setVc] = useState(15);
  const [expected, setExpected] = useState(7000);
  // model
  const model = useModelStore((s) => s.model);
  const [cell, setCell] = useState("");
  const [forecastId, setForecastId] = useState(model.forecasts[0]?.id ?? "");
  const [target, setTarget] = useState(0);
  const [lo, setLo] = useState(0);
  const [hi, setHi] = useState(100);
  const [res, setRes] = useState<{ root: number; base: number; xs: number[]; ys: number[]; fName: string; cell: string } | null>(null);
  const [error, setError] = useState<unknown>(null);

  const acc = accountingBreakEven({ fixedCosts: fixed, pricePerUnit: price, variableCostPerUnit: vc });
  const margin = price - vc;
  const safety = Number.isFinite(acc.units) && expected > 0 ? (expected - acc.units) / expected : NaN;
  const accChart = useMemo(
    () =>
      breakEvenOption({
        fixedCosts: fixed,
        price,
        variableCost: vc,
        breakEvenUnits: acc.units,
        labels: { revenue: t("breakEven.revenue"), totalCost: t("breakEven.totalCost"), fixedCost: t("breakEven.fixedCosts"), units: t("breakEven.units"), amount: t("breakEven.amount"), breakEven: t("breakEven.point") },
        locale,
      }),
    [fixed, price, vc, acc.units, locale, t],
  );

  const suggestRange = (ref: string) => {
    const c = parseCellRef(ref);
    if (!c) return;
    const v = cellNumber(c);
    if (Number.isFinite(v) && v !== 0) {
      setLo(Math.min(v * 0.2, v * 3));
      setHi(Math.max(v * 0.2, v * 3));
    }
  };

  const runModel = () => {
    setError(null);
    try {
      const ref = parseCellRef(cell);
      if (!ref) throw new ToolError("breakEven.errors.cell");
      const m = useModelStore.getState().model;
      const f = m.forecasts.find((x) => x.id === forecastId);
      if (!f) throw new ToolError("common.errors.noForecast");
      if (!(lo < hi)) throw new ToolError("breakEven.errors.range");
      const mm = modelForCells(m, [{ id: "x", cell: ref }], [{ id: "y", cell: f.cell }]);
      const out = withEvaluator(mm, (ev) => {
        const fx = (x: number) => ev.evaluate(Float64Array.of(x))[0];
        const xs = linspace(lo, hi, 31);
        const ys = xs.map(fx);
        const root = breakEven(fx, target, lo, hi);
        return { root, xs, ys };
      });
      if (!Number.isFinite(out.root)) throw new ToolError("breakEven.errors.noRoot", { target: fmt(target, 2, locale) });
      setRes({ ...out, base: cellNumber(ref), fName: f.name, cell: `${ref.sheet}!${ref.address}` });
    } catch (e) {
      setRes(null);
      setError(e);
    }
  };

  const modelChart = useMemo(() => {
    if (!res) return null;
    return lineOption({
      xType: "value",
      x: res.xs,
      series: [{ name: res.fName, data: res.ys }],
      xName: res.cell,
      yName: res.fName,
      locale,
      markLines: [
        { y: target, label: fmt(target, 2, locale) },
        { x: res.root, label: `${t("breakEven.point")}: ${fmtAuto(res.root, locale)}` },
      ],
    });
  }, [res, target, locale, t]);

  return (
    <div className="space-y-3">
      <HelpBox>
        <p>{t("breakEven.help1")}</p>
        <p>{t("breakEven.help2")}</p>
      </HelpBox>
      <Tabs
        tabs={[
          { id: "accounting" as Tab, label: t("breakEven.accountingTab") },
          { id: "model" as Tab, label: t("breakEven.modelTab") },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "accounting" && (
        <SplitLayout
          form={
            <>
              <NumField label={t("breakEven.fixedCosts")} value={fixed} min={0} onChange={setFixed} />
              <NumField label={t("breakEven.price")} value={price} onChange={setPrice} />
              <NumField label={t("breakEven.variableCost")} value={vc} onChange={setVc} />
              <NumField label={t("breakEven.expected")} value={expected} min={0} onChange={setExpected} hint={t("breakEven.expectedHint")} />
            </>
          }
        >
          <StatGrid
            items={[
              { label: t("breakEven.unitsBE"), value: fmt(acc.units, 2, locale) },
              { label: t("breakEven.revenueBE"), value: fmt(acc.revenue, 2, locale) },
              { label: t("breakEven.contribution"), value: fmt(margin, 2, locale), hint: price ? fmtPct(margin / price, 1, locale) : undefined },
              { label: t("breakEven.safety"), value: fmtPct(safety, 1, locale) },
            ]}
          />
          {Number.isFinite(acc.units) ? (
            <Note tone={safety > 0 ? "good" : "warn"}>
              <p>{t("breakEven.accMeaning", { units: fmt(Math.ceil(acc.units), 0, locale), revenue: fmt(acc.revenue, 2, locale) })}</p>
              {Number.isFinite(safety) && <p>{safety > 0 ? t("breakEven.safetyGood", { s: fmtPct(safety, 1, locale) }) : t("breakEven.safetyBad")}</p>}
            </Note>
          ) : (
            <Note tone="bad">{t("breakEven.noMargin")}</Note>
          )}
          <Chart option={accChart} height={320} />
        </SplitLayout>
      )}
      {tab === "model" && (
        <SplitLayout
          form={
            <>
              <RangeInput
                label={t("breakEven.inputCell")}
                hint={t("breakEven.inputCellHint")}
                value={cell}
                onChange={(v) => {
                  setCell(v);
                  suggestRange(v);
                }}
                placeholder="Hoja!C5"
              />
              <ForecastSelect value={forecastId} onChange={setForecastId} label={t("breakEven.output")} />
              <NumField label={t("breakEven.target")} value={target} onChange={setTarget} hint={t("breakEven.targetHint")} />
              <div className="grid grid-cols-2 gap-2">
                <NumField label={t("breakEven.lo")} value={lo} onChange={setLo} />
                <NumField label={t("breakEven.hi")} value={hi} onChange={setHi} />
              </div>
              <Button variant="primary" onClick={runModel} disabled={!cell || !forecastId}>
                <Play size={14} />
                {t("common.calculate")}
              </Button>
              <ErrorNote error={error} />
            </>
          }
        >
          {!res ? (
            <Note>{t("breakEven.modelEmpty")}</Note>
          ) : (
            <>
              <StatGrid
                items={[
                  { label: t("breakEven.criticalValue"), value: fmtAuto(res.root, locale) },
                  { label: t("breakEven.currentValue"), value: fmtAuto(res.base, locale) },
                  { label: t("breakEven.change"), value: Number.isFinite(res.base) && res.base !== 0 ? fmtPct((res.root - res.base) / Math.abs(res.base), 1, locale) : "—" },
                ]}
                cols={3}
              />
              <Note>
                {t("breakEven.modelMeaning", {
                  cell: res.cell,
                  root: fmtAuto(res.root, locale),
                  f: res.fName,
                  target: fmt(target, 2, locale),
                  change: Number.isFinite(res.base) && res.base !== 0 ? fmtPct(Math.abs(res.root - res.base) / Math.abs(res.base), 1, locale) : "—",
                })}
              </Note>
              <Section title={t("breakEven.curve")}>{modelChart && <Chart option={modelChart} height={320} />}</Section>
            </>
          )}
        </SplitLayout>
      )}
    </div>
  );
}
