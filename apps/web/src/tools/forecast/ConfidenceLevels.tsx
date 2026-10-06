/**
 * "Confidence levels" picker shared by the forecasting tools: preset chips (80/90/95/99 %),
 * custom levels typed as a percentage (decimal comma accepted, e.g. "97,5") and, in multi mode,
 * up to `max` levels at once. Values are fractions, always sorted ascending.
 */
import { useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { clsx } from "../../components/ui";
import { LEVEL_PRESETS, levelPct, parseLevelInput } from "../../lib/certainty";
import { useToolsT } from "../common/i18n";

const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const sortLevels = (v: number[]) => [...v].sort((a, b) => a - b).filter((x, i, arr) => i === 0 || !same(x, arr[i - 1]));

export function ConfidenceLevels({
  value,
  onChange,
  max = 3,
  single = false,
  label,
  hint,
}: {
  value: number[];
  onChange: (levels: number[]) => void;
  /** Maximum number of simultaneous levels (multi mode). */
  max?: number;
  /** Exactly one level (radio-like chips). */
  single?: boolean;
  label?: ReactNode;
  hint?: ReactNode;
}) {
  const { t, locale } = useToolsT();
  const [custom, setCustom] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const has = (l: number) => value.some((v) => same(v, l));

  const add = (l: number) => {
    setMsg(null);
    if (single) return onChange([l]);
    if (has(l)) return;
    if (value.length >= max) {
      setMsg(t("levels.max", { n: max }));
      return;
    }
    onChange(sortLevels([...value, l]));
  };
  const remove = (l: number) => {
    setMsg(null);
    if (value.length <= 1) return; // at least one level
    onChange(value.filter((v) => !same(v, l)));
  };
  const toggle = (l: number) => (has(l) && !single ? remove(l) : add(l));
  const addCustom = () => {
    const l = parseLevelInput(custom);
    if (!Number.isFinite(l)) {
      setMsg(t("levels.invalid"));
      return;
    }
    add(l);
    setCustom("");
  };

  const customOnes = value.filter((v) => !LEVEL_PRESETS.some((p) => same(p, v)));
  const chip = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors max-md:min-h-9 max-md:px-3 max-md:text-[13px]";
  const on = "border-blue-700 bg-blue-700 text-white hover:bg-blue-800";
  const off = "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";

  return (
    <fieldset className="flex flex-col gap-1 text-sm" data-testid="confidence-levels">
      <legend className="mb-1 font-medium text-slate-700 dark:text-slate-300">{label ?? (single ? t("levels.labelSingle") : t("levels.label"))}</legend>
      <div className="flex flex-wrap items-center gap-1.5" role={single ? "radiogroup" : "group"}>
        {LEVEL_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            role={single ? "radio" : undefined}
            aria-checked={single ? has(p) : undefined}
            aria-pressed={single ? undefined : has(p)}
            className={clsx(chip, has(p) ? on : off)}
            onClick={() => toggle(p)}
          >
            {levelPct(p, locale)}
          </button>
        ))}
        {customOnes.map((l) => (
          <span key={l} className={clsx(chip, on)}>
            {levelPct(l, locale)}
            {!single && value.length > 1 && (
              <button type="button" className="rounded-full hover:bg-blue-900" aria-label={t("levels.remove", { level: levelPct(l, locale) })} onClick={() => remove(l)}>
                <X size={11} />
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          inputMode="decimal"
          className="w-24 rounded-md border border-slate-300 bg-white px-2 py-0.5 max-md:py-1.5 text-right text-xs tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          placeholder={locale === "es" ? "97,5" : "97.5"}
          aria-label={t("levels.custom")}
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            setMsg(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <span className="text-xs text-slate-500">%</span>
        <button type="button" className={clsx(chip, off)} onClick={addCustom} disabled={!custom.trim()}>
          <Plus size={11} />
          {single ? t("levels.use") : t("levels.add")}
        </button>
      </div>
      {msg ? (
        <span className="text-xs text-red-600" role="alert">
          {msg}
        </span>
      ) : (
        <span className="text-xs text-slate-500">{hint ?? (single ? t("levels.hintSingle") : t("levels.hint", { n: max }))}</span>
      )}
    </fieldset>
  );
}
