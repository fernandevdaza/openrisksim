/**
 * Loan amortization schedules: French (level payment), German (level principal), American (bullet).
 */
import { useMemo, useState } from "react";
import { amortizationSchedule } from "@openrisksim/finance";
import { Chart, Field, Select, Table } from "../../components/ui";
import { useToolsT } from "../common/i18n";
import { ExportButton, HelpBox, Note, NumField, PctField, Section, StatGrid } from "../common/ui";
import { fmt } from "../common/format";
import { columnOption, lineOption } from "../common/charts";

type Method = "french" | "german" | "american";
const METHODS: Method[] = ["french", "german", "american"];

export default function LoanTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const [principal, setPrincipal] = useState(100000);
  const [rate, setRate] = useState(0.01);
  const [periods, setPeriods] = useState(24);
  const [method, setMethod] = useState<Method>("french");

  const n = Math.max(1, Math.min(600, Math.round(periods)));
  const schedules = useMemo(() => {
    const out = {} as Record<Method, ReturnType<typeof amortizationSchedule>>;
    for (const m of METHODS) out[m] = amortizationSchedule({ principal, rate, periods: n, method: m });
    return out;
  }, [principal, rate, n]);
  const rows = schedules[method].filter((r) => r.period > 0);
  const totals = (m: Method) => schedules[m].reduce((a, r) => ({ payment: a.payment + r.payment, interest: a.interest + r.interest }), { payment: 0, interest: 0 });
  const tot = totals(method);

  const payChart = useMemo(
    () =>
      columnOption({
        categories: rows.map((r) => r.period),
        series: [
          { name: t("loan.principal"), data: rows.map((r) => r.principal) },
          { name: t("loan.interest"), data: rows.map((r) => r.interest), colorIndex: 1 },
        ],
        stacked: true,
        locale,
        xName: t("project.period"),
      }),
    [rows, locale, t],
  );
  const balChart = useMemo(
    () =>
      lineOption({
        x: schedules.french.map((r) => String(r.period)),
        series: METHODS.map((m) => ({ name: t(`loan.methods.${m}`), data: schedules[m].map((r) => r.balance), dashed: m !== method })),
        xName: t("project.period"),
        yName: t("loan.balance"),
        locale,
      }),
    [schedules, method, locale, t],
  );

  return (
    <div className="space-y-4">
      <HelpBox>
        <p>{t("loan.help1")}</p>
        <p>{t("loan.help2")}</p>
      </HelpBox>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumField label={t("loan.amount")} value={principal} min={0} onChange={setPrincipal} />
        <PctField label={t("loan.rate")} value={rate} onChange={setRate} hint={t("loan.rateHint")} />
        <NumField label={t("loan.periods")} value={n} min={1} max={600} onChange={setPeriods} />
        <Field label={t("loan.method")}>
          <Select value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: t(`loan.methods.${m}`) }))} />
        </Field>
      </div>
      <StatGrid
        items={[
          { label: t("loan.firstPayment"), value: fmt(rows[0]?.payment ?? NaN, 2, locale) },
          { label: t("loan.totalPaid"), value: fmt(tot.payment, 2, locale) },
          { label: t("loan.totalInterest"), value: fmt(tot.interest, 2, locale) },
          { label: t("loan.lastPayment"), value: fmt(rows[rows.length - 1]?.payment ?? NaN, 2, locale) },
        ]}
      />
      <Note>
        {t(`loan.explain.${method}`)} {t("loan.compare", { french: fmt(totals("french").interest, 2, locale), german: fmt(totals("german").interest, 2, locale), american: fmt(totals("american").interest, 2, locale) })}
      </Note>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title={t("loan.paymentsChart")}>
          <Chart option={payChart} height={280} />
        </Section>
        <Section title={t("loan.balanceChart")}>
          <Chart option={balChart} height={280} />
        </Section>
      </div>
      <Section
        title={t("loan.schedule")}
        actions={
          <ExportButton
            sheetName={t("loan.sheetName")}
            build={() => [
              [t(`loan.methods.${method}`), t("loan.amount"), principal, t("loan.rate"), rate, t("loan.periods"), n],
              [t("project.period"), t("loan.payment"), t("loan.interest"), t("loan.principal"), t("loan.balance")],
              ...schedules[method].map((r) => [r.period, r.payment, r.interest, r.principal, r.balance]),
              [t("loan.total"), tot.payment, tot.interest, principal, null],
            ]}
          />
        }
      >
        <Table
          maxHeight={320}
          columns={[
            { key: "period", label: t("project.period"), align: "right" },
            { key: "payment", label: t("loan.payment"), align: "right", format: (v) => fmt(v as number, 2, locale) },
            { key: "interest", label: t("loan.interest"), align: "right", format: (v) => fmt(v as number, 2, locale) },
            { key: "principal", label: t("loan.principal"), align: "right", format: (v) => fmt(v as number, 2, locale) },
            { key: "balance", label: t("loan.balance"), align: "right", format: (v) => fmt(v as number, 2, locale) },
          ]}
          rows={schedules[method].map((r) => ({ ...r }))}
        />
      </Section>
    </div>
  );
}
