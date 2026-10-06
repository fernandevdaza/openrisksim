/** Locale-aware number formatting for the tools (es: "1.234,56", en: "1,234.56"). */

export type Locale = "es" | "en";

const cache = new Map<string, Intl.NumberFormat>();
function nf(locale: Locale, min: number, max: number): Intl.NumberFormat {
  const key = `${locale}|${min}|${max}`;
  let f = cache.get(key);
  if (!f) {
    const opts = { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: "always" } as unknown as Intl.NumberFormatOptions;
    try {
      f = new Intl.NumberFormat(locale === "es" ? "es" : "en-US", opts);
    } catch {
      f = new Intl.NumberFormat(locale === "es" ? "es-AR" : "en-US", { minimumFractionDigits: min, maximumFractionDigits: max });
    }
    cache.set(key, f);
  }
  return f;
}

/** Format a number with up to `digits` decimals (fixed decimals when `fixed`). */
export function fmt(v: number | null | undefined, digits = 2, locale: Locale = "es", fixed = false): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "−∞";
  const s = nf(locale, fixed ? digits : 0, digits).format(v === 0 ? 0 : v);
  return s === "-0" ? "0" : s;
}

/** Fraction → percent string: 0.1234 → "12,3 %" (es) / "12.3%" (en). */
export function fmtPct(v: number | null | undefined, digits = 1, locale: Locale = "es"): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "−∞";
  return nf(locale, digits, digits).format(v * 100) + (locale === "es" ? " %" : "%");
}

/** Digits chosen from the magnitude: big numbers 0–2 decimals, small numbers more. */
export function autoDigits(v: number): number {
  const a = Math.abs(v);
  if (!Number.isFinite(a) || a === 0) return 2;
  if (a >= 1000) return 0;
  if (a >= 1) return 2;
  if (a >= 0.01) return 4;
  return 6;
}

/** Format with automatic decimals. */
export function fmtAuto(v: number | null | undefined, locale: Locale = "es"): string {
  if (v == null || Number.isNaN(v)) return "—";
  return fmt(v, autoDigits(v), locale);
}

/** p-value: "< 0,001" or 3–4 decimals. */
export function fmtP(p: number | null | undefined, locale: Locale = "es"): string {
  if (p == null || Number.isNaN(p)) return "—";
  if (p < 0.001) return "< " + fmt(0.001, 3, locale, true);
  return fmt(p, 4, locale, true);
}

/** "p < 0,001" or "p = 0,0457" (for sentences). */
export function fmtPEq(p: number | null | undefined, locale: Locale = "es", label = "p"): string {
  if (p == null || Number.isNaN(p)) return `${label} = —`;
  if (p < 0.001) return `${label} < ${fmt(0.001, 3, locale, true)}`;
  return `${label} = ${fmt(p, 4, locale, true)}`;
}

/** Periods (payback): "3,25" or "∞" / "no se recupera". */
export function fmtPeriods(v: number, locale: Locale = "es"): string {
  if (!Number.isFinite(v)) return locale === "es" ? "No se recupera" : "Never";
  return fmt(v, 2, locale, true);
}

/** Compact axis labels: 1 234 567 → "1,23 M". */
export function fmtCompact(v: number, locale: Locale = "es"): string {
  const a = Math.abs(v);
  if (a >= 1e9) return fmt(v / 1e9, 2, locale) + (locale === "es" ? " MM" : "B");
  if (a >= 1e6) return fmt(v / 1e6, 2, locale) + " M";
  if (a >= 1e4) return fmt(v / 1e3, 1, locale) + " k";
  // Densities of wide distributions are tiny (e.g. 5e-6): keep 2 significant digits instead of rounding to 0.
  if (a > 0 && a < 1e-3) {
    const [m, e] = v.toExponential(1).split("e");
    return `${locale === "es" ? m.replace(".", ",") : m}e${e}`;
  }
  return fmt(v, a < 1 ? 3 : 2, locale);
}
