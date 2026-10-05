import { getDistributionMeta } from "@openrisksim/distributions";
import type { DistributionSpec } from "@openrisksim/core";
import { fmtAuto, type Locale } from "./format";

/** "Normal (mean=10, stdDev=2)" with the localised family name. */
export function specLabel(spec: DistributionSpec, locale: Locale): string {
  let name: string = spec.id;
  try {
    name = getDistributionMeta(spec.id).name[locale];
  } catch {
    /* unknown id */
  }
  const params = Object.entries(spec.params)
    .map(([k, v]) => `${k}=${fmtAuto(v, locale)}`)
    .join(", ");
  return params ? `${name} (${params})` : name;
}
