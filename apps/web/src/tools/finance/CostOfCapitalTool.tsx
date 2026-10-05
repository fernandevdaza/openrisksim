/**
 * Cost of capital: CAPM (with country risk and beta re-levering), WACC and interest-rate conversions.
 */
import { useState } from "react";
import { capm, wacc, effectiveRate, nominalRate, realRate } from "@openrisksim/finance";
import { Tabs } from "../../components/ui";
import { useToolsT } from "../common/i18n";
import { Checkbox, ExportButton, HelpBox, Note, NumField, PctField, Section, StatGrid } from "../common/ui";
import { fmt, fmtPct } from "../common/format";
import { leveredBeta, periodicFromEffective } from "../common/stats";

type Tab = "capm" | "wacc" | "rates";

export default function CostOfCapitalTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const [tab, setTab] = useState<Tab>("capm");
  // CAPM
  const [rf, setRf] = useState(0.045);
  const [rm, setRm] = useState(0.1);
  const [beta, setBeta] = useState(1.1);
  const [crp, setCrp] = useState(0.03);
  const [relever, setRelever] = useState(false);
  const [betaU, setBetaU] = useState(0.8);
  const [de, setDe] = useState(0.5);
  const [taxC, setTaxC] = useState(0.25);
  // WACC
  const [equity, setEquity] = useState(600000);
  const [debt, setDebt] = useState(400000);
  const [ke, setKe] = useState(0.15);
  const [useCapmKe, setUseCapmKe] = useState(true);
  const [kd, setKd] = useState(0.09);
  const [tax, setTax] = useState(0.25);
  // rates
  const [nominal, setNominal] = useState(0.12);
  const [m, setM] = useState(12);
  const [effective, setEffective] = useState(0.1268);
  const [inflation, setInflation] = useState(0.04);

  const betaUsed = relever ? leveredBeta(betaU, de, taxC) : beta;
  const keCapm = capm({ riskFree: rf, beta: betaUsed, marketReturn: rm, countryRisk: crp });
  const keUsed = useCapmKe ? keCapm : ke;
  const w = wacc({ equity, debt, costEquity: keUsed, costDebt: kd, taxRate: tax });
  const total = equity + debt;
  const M = Math.max(1, Math.round(m));

  return (
    <div className="space-y-4">
      <HelpBox>
        <p>{t("costOfCapital.help1")}</p>
        <p>{t("costOfCapital.help2")}</p>
      </HelpBox>
      <Tabs
        tabs={[
          { id: "capm" as Tab, label: t("costOfCapital.capmTab") },
          { id: "wacc" as Tab, label: t("costOfCapital.waccTab") },
          { id: "rates" as Tab, label: t("costOfCapital.ratesTab") },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "capm" && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PctField label={t("costOfCapital.rf")} value={rf} onChange={setRf} />
            <PctField label={t("costOfCapital.rm")} value={rm} onChange={setRm} />
            <PctField label={t("costOfCapital.crp")} value={crp} onChange={setCrp} hint={t("costOfCapital.crpHint")} />
            <NumField label={t("costOfCapital.beta")} value={beta} onChange={setBeta} disabled={relever} />
          </div>
          <Checkbox checked={relever} onChange={setRelever} label={t("costOfCapital.relever")} />
          {relever && (
            <div className="grid grid-cols-3 gap-2">
              <NumField label={t("costOfCapital.betaU")} value={betaU} onChange={setBetaU} />
              <NumField label={t("costOfCapital.de")} value={de} min={0} onChange={setDe} />
              <PctField label={t("costOfCapital.tax")} value={taxC} onChange={setTaxC} />
            </div>
          )}
          <StatGrid
            items={[
              { label: t("costOfCapital.betaUsed"), value: fmt(betaUsed, 3, locale) },
              { label: t("costOfCapital.premium"), value: fmtPct(rm - rf, 2, locale) },
              { label: t("costOfCapital.riskPremium"), value: fmtPct(betaUsed * (rm - rf), 2, locale) },
              { label: t("costOfCapital.ke"), value: fmtPct(keCapm, 2, locale) },
            ]}
          />
          <Note>
            {t("costOfCapital.capmFormula", {
              rf: fmtPct(rf, 2, locale),
              beta: fmt(betaUsed, 3, locale),
              prem: fmtPct(rm - rf, 2, locale),
              crp: fmtPct(crp, 2, locale),
              ke: fmtPct(keCapm, 2, locale),
            })}
          </Note>
          {relever && <Note>{t("costOfCapital.releverFormula", { bu: fmt(betaU, 3, locale), de: fmt(de, 3, locale), t: fmtPct(taxC, 1, locale), bl: fmt(betaUsed, 3, locale) })}</Note>}
        </>
      )}
      {tab === "wacc" && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <NumField label={t("costOfCapital.equity")} value={equity} min={0} onChange={setEquity} />
            <NumField label={t("costOfCapital.debt")} value={debt} min={0} onChange={setDebt} />
            <PctField label={t("costOfCapital.taxRate")} value={tax} onChange={setTax} />
            <PctField label={t("costOfCapital.keInput")} value={keUsed} onChange={setKe} disabled={useCapmKe} />
            <PctField label={t("costOfCapital.kd")} value={kd} onChange={setKd} />
          </div>
          <Checkbox checked={useCapmKe} onChange={setUseCapmKe} label={t("costOfCapital.useCapm", { ke: fmtPct(keCapm, 2, locale) })} />
          <StatGrid
            items={[
              { label: t("costOfCapital.wE"), value: fmtPct(total ? equity / total : NaN, 1, locale) },
              { label: t("costOfCapital.wD"), value: fmtPct(total ? debt / total : NaN, 1, locale) },
              { label: t("costOfCapital.kdAfterTax"), value: fmtPct(kd * (1 - tax), 2, locale) },
              { label: "WACC", value: fmtPct(w, 2, locale) },
            ]}
          />
          <Note>{t("costOfCapital.waccMeaning", { wacc: fmtPct(w, 2, locale) })}</Note>
          <div className="flex justify-end">
              <ExportButton
                sheetName={t("costOfCapital.sheetName")}
                build={() => [
                  [t("costOfCapital.equity"), equity],
                  [t("costOfCapital.debt"), debt],
                  [t("costOfCapital.keInput"), keUsed],
                  [t("costOfCapital.kd"), kd],
                  [t("costOfCapital.taxRate"), tax],
                  ["WACC", "=B1/(B1+B2)*B3+B2/(B1+B2)*B4*(1-B5)"],
                ]}
              />
          </div>
        </>
      )}
      {tab === "rates" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Section title={t("costOfCapital.nomToEff")}>
            <PctField label={t("costOfCapital.nominal")} value={nominal} onChange={setNominal} />
            <NumField label={t("costOfCapital.periodsPerYear")} value={M} min={1} max={365} onChange={setM} hint={t("costOfCapital.periodsHint")} />
            <StatGrid
              cols={2}
              items={[
                { label: t("costOfCapital.effective"), value: fmtPct(effectiveRate(nominal, M), 3, locale) },
                { label: t("costOfCapital.periodic"), value: fmtPct(nominal / M, 3, locale) },
              ]}
            />
          </Section>
          <Section title={t("costOfCapital.effToNom")}>
            <PctField label={t("costOfCapital.effective")} value={effective} onChange={setEffective} />
            <StatGrid
              cols={2}
              items={[
                { label: t("costOfCapital.nominalM", { m: M }), value: fmtPct(nominalRate(effective, M), 3, locale) },
                { label: t("costOfCapital.equivalentPeriodic"), value: fmtPct(periodicFromEffective(effective, M), 4, locale) },
              ]}
            />
          </Section>
          <Section title={t("costOfCapital.realTitle")}>
            <PctField label={t("costOfCapital.nominalRate")} value={nominal} onChange={setNominal} />
            <PctField label={t("costOfCapital.inflation")} value={inflation} onChange={setInflation} />
            <StatGrid cols={2} items={[{ label: t("costOfCapital.real"), value: fmtPct(realRate(nominal, inflation), 3, locale) }]} />
            <p className="text-xs text-slate-500">{t("costOfCapital.fisher")}</p>
          </Section>
        </div>
      )}
    </div>
  );
}
