import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DISTRIBUTION_META } from "@openrisksim/distributions";
import { Input, Modal, Tabs } from "../components/ui";
import { useUiStore, type HelpTab } from "../store/ui";
import { tr } from "../lib/modelText";
import { SHORTCUTS } from "../shortcuts";

const QS_STEPS = 8;

export function HelpDialog({ tab: initial, onClose }: { tab: HelpTab; onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<HelpTab>(initial);
  return (
    <Modal open size="lg" onClose={onClose} title={t("help.title")}>
      <Tabs<HelpTab>
        className="mb-3"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "quickstart", label: t("help.quickstart") },
          { id: "glossary", label: t("help.glossary") },
          { id: "shortcuts", label: t("help.shortcuts") },
          { id: "about", label: t("help.about") },
        ]}
      />
      {tab === "quickstart" && <QuickStart />}
      {tab === "glossary" && <Glossary />}
      {tab === "shortcuts" && <Shortcuts />}
      {tab === "about" && <About />}
    </Modal>
  );
}

function QuickStart() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 text-sm text-slate-700 dark:text-slate-300">
      <p>{t("help.qsIntro")}</p>
      <ol className="flex flex-col gap-2">
        {Array.from({ length: QS_STEPS }, (_, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">{i + 1}</span>
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">{t(`help.qs${i + 1}Title`)}</div>
              <div>{t(`help.qs${i + 1}`)}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="rounded-md border border-slate-200 p-3 text-xs dark:border-slate-700">
        <div className="mb-1 font-semibold">{t("help.colorsTitle")}</div>
        <div className="flex flex-wrap gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-sm bg-green-200 ring-1 ring-green-600" /> {t("defs.assumption")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-sm bg-sky-200 ring-1 ring-blue-600" /> {t("defs.forecast")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-sm bg-yellow-200 ring-1 ring-yellow-600" /> {t("defs.decision")}
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-500">{t("help.qsTip")}</p>
    </div>
  );
}

function Glossary() {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const [q, setQ] = useState("");
  const items = DISTRIBUTION_META.filter((m) => !q.trim() || `${m.name.es} ${m.name.en} ${tr(m.description, locale)}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="flex flex-col gap-2">
      <Input placeholder={t("assumption.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("assumption.search")} />
      <div className="max-h-[55vh] overflow-auto">
        <dl className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((m) => (
            <div key={m.id} className="py-2">
              <dt className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                {tr(m.name, locale)}
                <span className="rounded bg-slate-100 px-1.5 text-[10px] font-normal uppercase text-slate-500 dark:bg-slate-800">{t(`assumption.filter_${m.kind}`)}</span>
              </dt>
              <dd className="text-sm text-slate-700 dark:text-slate-300">{tr(m.description, locale)}</dd>
              {m.params.length > 0 && (
                <dd className="text-xs text-slate-500">
                  {t("help.params")}: {m.params.map((p) => tr(p.label, locale)).join(", ")}
                </dd>
              )}
              {m.usage && <dd className="text-xs italic text-slate-500">{tr(m.usage, locale)}</dd>}
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function Shortcuts() {
  const { t } = useTranslation();
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const keyLabel = (k: string) => (mac ? k.replace("Ctrl", "⌘").replace("Alt", "⌥").replace("Shift", "⇧") : k);
  return (
    <table className="w-full text-sm">
      <tbody>
        {SHORTCUTS.map((s) => (
          <tr key={s.keys} className="border-b border-slate-100 dark:border-slate-800">
            <td className="py-1.5 pr-4">
              {s.keys.split(" / ").map((k) => (
                <kbd key={k} className="mr-1 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs dark:border-slate-600 dark:bg-slate-800">
                  {keyLabel(k)}
                </kbd>
              ))}
            </td>
            <td className="py-1.5 text-slate-700 dark:text-slate-300">{t(s.label)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function About() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 text-sm text-slate-700 dark:text-slate-300">
      <div className="flex items-center gap-3">
        <img src="./icon.svg" alt="" className="h-12 w-12" />
        <div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">OpenRiskSim</div>
          <div className="text-xs text-slate-500">v0.1.0</div>
        </div>
      </div>
      <p>{t("help.aboutText")}</p>
      <p>{t("help.privacy")}</p>
      <div className="rounded-md bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
        <div className="font-semibold">{t("help.license")}</div>
        <p className="mt-1">
          OpenRiskSim — Copyright © 2026 {t("help.contributors")}. {t("help.gpl")}
        </p>
        <p className="mt-1">{t("help.credits")}</p>
      </div>
    </div>
  );
}
