/**
 * "Evaluate formula" (Excel's Evaluar fórmula): step-by-step rendering of a formula — first the
 * references replaced by their values, then each function call (innermost first) replaced by its
 * result, finally the result of the whole formula.
 */
import { tokenize, type Locale } from "./formulaTokens";
import { localizeError, toDisplayFormula } from "./formulaI18n";
import { formatGeneral, separatorsFor } from "./numberFormat";

export type EvalValue = number | string | boolean | null | { error: string } | EvalValue[][];

export interface EvalStep {
  text: string;
  /** Span (in `text`) of the part that changed in this step. */
  changed?: [number, number];
}

export function formatEvalValue(v: EvalValue, locale: Locale): string {
  if (Array.isArray(v)) {
    const flat = v.flat();
    const sep = locale === "es" ? "; " : ", ";
    const items = flat.slice(0, 12).map((x) => formatEvalValue(x as EvalValue, locale));
    return `{${items.join(sep)}${flat.length > 12 ? `${sep}…` : ""}}`;
  }
  if (v === null || v === undefined) return "0";
  if (typeof v === "object") return localizeError(v.error, locale);
  if (typeof v === "boolean") return locale === "es" ? (v ? "VERDADERO" : "FALSO") : v ? "TRUE" : "FALSE";
  if (typeof v === "number") return formatGeneral(v, separatorsFor(locale));
  return `"${v.replace(/"/g, '""')}"`;
}

interface Rep {
  start: number;
  end: number;
  text: string;
  last?: boolean;
}

function render(formula: string, reps: Rep[], locale: Locale): EvalStep {
  const sorted = [...reps].sort((a, b) => a.start - b.start);
  let out = "";
  let pos = 0;
  let changed: [number, number] | undefined;
  const piece = (s: string) => (s ? toDisplayFormula(`=${s}`, locale).slice(1) : "");
  for (const r of sorted) {
    out += pos === 0 ? toDisplayFormula(formula.slice(0, r.start), locale) : piece(formula.slice(pos, r.start));
    const st = out.length;
    out += r.text;
    if (r.last) changed = [st, out.length];
    pos = r.end;
  }
  out += pos === 0 ? toDisplayFormula(formula, locale) : piece(formula.slice(pos));
  return { text: out, changed };
}

/**
 * Steps for an engine formula ("=..."). `evaluate` computes an engine expression (without "=")
 * in the context of the formula's sheet.
 */
export function evaluationSteps(formula: string, evaluate: (expr: string) => EvalValue, locale: Locale): EvalStep[] {
  if (!formula.startsWith("=")) return [{ text: formula }];
  const toks = tokenize(formula, "en");
  const steps: EvalStep[] = [render(formula, [], locale)];
  // function call spans (post-order: inner calls end first)
  const calls: { start: number; end: number }[] = [];
  const stack: { start: number; fn: boolean }[] = [];
  toks.forEach((t, k) => {
    if (t.type === "lparen") {
      const prev = toks[k - 1];
      stack.push({ start: prev && prev.type === "func" && prev.end === t.start ? prev.start : t.start, fn: !!prev && prev.type === "func" && prev.end === t.start });
    } else if (t.type === "rparen") {
      const open = stack.pop();
      if (open?.fn) calls.push({ start: open.start, end: t.end });
    }
  });
  calls.sort((a, b) => a.end - b.end);
  let reps: Rep[] = [];
  const operands = toks.filter((t) => t.type === "ref" || t.type === "name");
  if (operands.length) {
    for (const t of operands) {
      const v = evaluate(t.text);
      if (t.type === "name" && v && typeof v === "object" && !Array.isArray(v)) continue; // unknown name: leave as is
      reps.push({ start: t.start, end: t.end, text: formatEvalValue(v, locale) });
    }
    if (reps.length) steps.push(render(formula, reps, locale));
  }
  for (const c of calls) {
    const v = evaluate(formula.slice(c.start, c.end));
    reps = reps.filter((r) => r.end <= c.start || r.start >= c.end).map((r) => ({ ...r, last: false }));
    reps.push({ start: c.start, end: c.end, text: formatEvalValue(v, locale), last: true });
    steps.push(render(formula, reps, locale));
  }
  const whole = formatEvalValue(evaluate(formula.slice(1)), locale);
  const last = steps[steps.length - 1].text;
  if (last !== `=${whole}`) steps.push({ text: `=${whole}`, changed: [1, whole.length + 1] });
  return steps;
}
