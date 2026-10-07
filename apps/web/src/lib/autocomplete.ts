/**
 * Function / defined-name autocomplete for the formula editor.
 */
import { FUNCTION_CATALOG, type Bi } from "./functionCatalog";
import { engineFunctionNames, localFunctionName } from "./formulaI18n";
import type { Locale } from "./formulaTokens";

export interface Completion {
  kind: "fn" | "name";
  /** Shown and inserted (localised function name or defined name). */
  label: string;
  /** Canonical English name (functions) — also matched when typing in Spanish. */
  en: string;
  desc?: Bi;
}

/** Uppercase without accents (so "ANO" finds "AÑO" and "dia" finds "DÍA"). */
export function foldName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

const cache = new Map<Locale, Completion[]>();

/** Every function the engine can evaluate (catalog entries carry a description). */
export function functionCompletions(locale: Locale): Completion[] {
  let list = cache.get(locale);
  if (!list) {
    const seen = new Set<string>();
    list = [];
    for (const f of FUNCTION_CATALOG) {
      seen.add(f.en);
      list.push({ kind: "fn", label: locale === "es" ? f.es : f.en, en: f.en, desc: f.d });
    }
    for (const en of engineFunctionNames()) {
      if (seen.has(en) || en.startsWith("HF.") || /POOL$/.test(en) || en === "VERSION") continue;
      list.push({ kind: "fn", label: localFunctionName(en, locale), en });
    }
    cache.set(locale, list);
  }
  return list;
}

/**
 * Candidates whose name starts with `prefix` (case/accent-insensitive): exact match first, then
 * names in the UI locale alphabetically, then matches on the English name (accepted in es too).
 */
export function rankCompletions(prefix: string, candidates: Completion[], limit = 60): Completion[] {
  const p = foldName(prefix);
  if (!p) return [];
  const exact: Completion[] = [];
  const local: Completion[] = [];
  const english: Completion[] = [];
  for (const c of candidates) {
    const l = foldName(c.label);
    if (l === p) exact.push(c);
    else if (l.startsWith(p)) local.push(c);
    else if (c.kind === "fn" && c.en !== c.label && c.en.startsWith(p)) english.push(c);
  }
  const byLabel = (a: Completion, b: Completion) => foldName(a.label).localeCompare(foldName(b.label));
  return [...exact, ...local.sort(byLabel), ...english.sort(byLabel)].slice(0, limit);
}
