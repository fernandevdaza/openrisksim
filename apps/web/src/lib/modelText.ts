import type { DistributionSpec, I18nText } from "@openrisksim/core";
import { DISTRIBUTION_META } from "@openrisksim/distributions";
import { formatStat, type UiLocale } from "./numberFormat";

export function tr(text: I18nText | undefined, locale: UiLocale): string {
  if (!text) return "";
  return text[locale] ?? text.en ?? "";
}

export function distributionName(id: string, locale: UiLocale): string {
  const meta = DISTRIBUTION_META.find((m) => m.id === id);
  return meta ? tr(meta.name, locale) : id;
}

/** "Normal (Media = 100; Desv. estándar = 10)" */
export function describeSpec(spec: DistributionSpec, locale: UiLocale): string {
  const meta = DISTRIBUTION_META.find((m) => m.id === spec.id);
  const name = meta ? tr(meta.name, locale) : spec.id;
  if (spec.id === "custom") {
    const n = spec.values?.length ?? 0;
    return `${name} (${n} ${locale === "es" ? "valores" : "values"})`;
  }
  const sep = locale === "es" ? "; " : ", ";
  const params = (meta?.params ?? Object.keys(spec.params).map((k) => ({ key: k, label: { en: k, es: k } })))
    .map((p) => `${tr(p.label, locale)} = ${formatStat(spec.params[p.key], locale)}`)
    .join(sep);
  let s = `${name} (${params})`;
  if (spec.truncate && (spec.truncate.min != null || spec.truncate.max != null)) {
    const lo = spec.truncate.min != null ? formatStat(spec.truncate.min, locale) : "−∞";
    const hi = spec.truncate.max != null ? formatStat(spec.truncate.max, locale) : "∞";
    s += ` [${lo}, ${hi}]`;
  }
  return s;
}
