import type { ReactNode } from "react";
import { formulaRefs, refColor, tokenize, type Locale } from "../lib/formulaTokens";

const FN = "text-teal-700 dark:text-teal-300";
const STR = "text-amber-800 dark:text-amber-300";
const NUM = "text-indigo-600 dark:text-indigo-300";
const ERR = "text-red-700 dark:text-red-400";

/**
 * Coloured rendering of a formula (references in their highlight colour, functions, strings,
 * numbers). Only colours change, never font metrics, so it can sit under a transparent textarea.
 */
export function highlightFormula(text: string, locale: Locale, dark: boolean): ReactNode[] {
  if (!text.startsWith("=")) return [text];
  const refs = new Map(formulaRefs(text, locale).map((r) => [r.start, r]));
  const out: ReactNode[] = [];
  for (const t of tokenize(text, locale)) {
    const r = t.type === "ref" ? refs.get(t.start) : undefined;
    if (r) out.push(<span key={t.start} style={{ color: refColor(r.color, dark) }}>{t.text}</span>);
    else if (t.type === "func" || t.type === "bool") out.push(<span key={t.start} className={FN}>{t.text}</span>);
    else if (t.type === "string") out.push(<span key={t.start} className={STR}>{t.text}</span>);
    else if (t.type === "number") out.push(<span key={t.start} className={NUM}>{t.text}</span>);
    else if (t.type === "error") out.push(<span key={t.start} className={ERR}>{t.text}</span>);
    else out.push(t.text);
  }
  return out;
}
