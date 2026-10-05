/**
 * Depreciation methods comparison (straight line, declining balance, double declining, SYD, units).
 */
import { useMemo, useState } from "react";
import { depreciation } from "@openrisksim/finance";
import { Chart, Table, Tabs } from "../../components/ui";
import { useToolsT } from "../common/i18n";
import { ExportButton, HelpBox, Note, NumField, Section } from "../common/ui";
import { fmt } from "../common/format";
import { columnOption, lineOption } from "../common/charts";
import { parseNumberList } from "../common/parse";

type Method = "straightLine" | "decliningBalance" | "doubleDeclining" | "sumOfYears" | "units";
const METHODS: Method[] = ["straightLine", "decliningBalance", "doubleDeclining", "sumOfYears", "units"];
type View = "book" | "charge";

export default function DepreciationTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const [cost, setCost] = useState(50000);
  const [salvage, setSalvage] = useState(5000);
  const [life, setLife] = useState(5);
  const [unitsText, setUnitsText] = useState("");
  const [view, setView] = useState<View>("book");

  const units = parseNumberList(unitsText);
  const L = Math.max(1, Math.min(100, Math.round(life)));
  const data = useMemo(() => {
    const out: { m: Method; charges: number[] }[] = [];
    for (const m of METHODS) {
      if (m === "units" && !units.length) continue;
      try {
        out.push({ m, charges: depreciation({ cost, salvage, life: L, method: m, units: m === "units" ? units : undefined }) });
      } catch {
        /* invalid inputs for this method */
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cost, salvage, L, unitsText]);

  const years = Math.max(...data.map((d) => d.charges.length), L);
  const book = (charges: number[]) => {
    let b = cost;
    return [cost, ...Array.from({ length: years }, (_, i) => (b -= charges[i] ?? 0))];
  };

  const chart = useMemo(
    () =>
      view === "book"
        ? lineOption({
            x: Array.from({ length: years + 1 }, (_, i) => String(i)),
            series: data.map((d) => ({ name: t(`depreciation.methods.${d.m}`), data: book(d.charges) })),
            xName: t("project.year"),
            yName: t("depreciation.bookValue"),
            locale,
            markLines: [{ y: salvage, label: t("depreciation.salvage") }],
          })
        : columnOption({
            categories: Array.from({ length: years }, (_, i) => i + 1),
            series: data.map((d) => ({ name: t(`depreciation.methods.${d.m}`), data: Array.from({ length: years }, (_, i) => d.charges[i] ?? 0) })),
            xName: t("project.year"),
            yName: t("depreciation.charge"),
            locale,
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, view, years, locale, t],
  );

  const tableRows = Array.from({ length: years }, (_, i) => {
    const row: Record<string, unknown> = { year: i + 1 };
    data.forEach((d) => {
      row[d.m] = d.charges[i] ?? 0;
      row[`${d.m}_b`] = book(d.charges)[i + 1];
    });
    return row;
  });

  return (
    <div className="space-y-4">
      <HelpBox>
        <p>{t("depreciation.help1")}</p>
        <p>{t("depreciation.help2")}</p>
      </HelpBox>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumField label={t("depreciation.cost")} value={cost} min={0} onChange={setCost} />
        <NumField label={t("depreciation.salvage")} value={salvage} min={0} onChange={setSalvage} />
        <NumField label={t("depreciation.life")} value={L} min={1} max={100} onChange={setLife} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">{t("depreciation.units")}</span>
          <input
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
            value={unitsText}
            onChange={(e) => setUnitsText(e.target.value)}
            placeholder="1000; 1200; 900; 800; 600"
          />
          <span className="text-xs text-slate-500">{t("depreciation.unitsHint")}</span>
        </label>
      </div>
      <Tabs
        tabs={[
          { id: "book" as View, label: t("depreciation.bookValue") },
          { id: "charge" as View, label: t("depreciation.charge") },
        ]}
        value={view}
        onChange={setView}
      />
      <Chart option={chart} height={300} />
      <Note>{t("depreciation.interpretation")}</Note>
      <Section
        title={t("depreciation.table")}
        actions={
          <ExportButton
            sheetName={t("depreciation.sheetName")}
            build={() => [
              [t("project.year"), ...data.flatMap((d) => [`${t(`depreciation.methods.${d.m}`)} — ${t("depreciation.charge")}`, `${t(`depreciation.methods.${d.m}`)} — ${t("depreciation.bookValue")}`])],
              [0, ...data.flatMap(() => [null, cost])],
              ...tableRows.map((r) => [r.year as number, ...data.flatMap((d) => [r[d.m] as number, r[`${d.m}_b`] as number])]),
            ]}
          />
        }
      >
        <Table
          maxHeight={300}
          columns={[
            { key: "year", label: t("project.year"), align: "right" },
            ...data.flatMap((d) => [
              { key: d.m, label: `${t(`depreciation.methods.${d.m}`)}`, align: "right" as const, format: (v: unknown) => fmt(v as number, 2, locale) },
              { key: `${d.m}_b`, label: t("depreciation.bookShort"), align: "right" as const, format: (v: unknown) => fmt(v as number, 2, locale) },
            ]),
          ]}
          rows={tableRows}
        />
      </Section>
    </div>
  );
}
