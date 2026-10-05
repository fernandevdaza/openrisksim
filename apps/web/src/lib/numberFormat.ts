/**
 * Excel-style number format rendering (subset good enough for typical finance/project models):
 * General, 0, 0.00, #,##0, #,##0.00, 0%, 0.0%, currency ($, €, [$S/.-es-PE]...), accounting (_( * ...),
 * multi-section formats (pos;neg;zero;text), colours ([Red]), scaling (#,##0,), scientific (0.00E+00)
 * and dates/times (dd/mm/yyyy, mmm-yy, hh:mm...).
 */

export type UiLocale = "es" | "en";

export interface Separators {
  decimal: string;
  group: string;
}

export function separatorsFor(locale: UiLocale): Separators {
  return locale === "es" ? { decimal: ",", group: "." } : { decimal: ".", group: "," };
}

export interface FormattedCell {
  text: string;
  color?: string;
  /** Numbers/dates are right-aligned, text left, booleans/errors centred (Excel defaults). */
  align: "left" | "right" | "center";
}

type CellValue = number | string | boolean | null | undefined | { error: string };

const COLOR_NAMES: Record<string, string> = {
  red: "#dc2626",
  blue: "#2563eb",
  green: "#16a34a",
  black: "",
  white: "#ffffff",
  magenta: "#c026d3",
  yellow: "#ca8a04",
  cyan: "#0891b2",
};

const MONTHS: Record<UiLocale, string[]> = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const DAYS: Record<UiLocale, string[]> = {
  es: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

/** Format any engine value for display in a cell. */
export function formatCellValue(value: CellValue, fmt: string | undefined, locale: UiLocale): FormattedCell {
  if (value === null || value === undefined || value === "") return { text: "", align: "left" };
  if (typeof value === "object") return { text: value.error || "#ERROR!", align: "center", color: "#dc2626" };
  if (typeof value === "boolean") {
    const t = locale === "es" ? (value ? "VERDADERO" : "FALSO") : value ? "TRUE" : "FALSE";
    return { text: t, align: "center" };
  }
  if (typeof value === "string") {
    if (fmt) {
      const sections = splitSections(fmt);
      const textSection = sections.length >= 4 ? sections[3] : sections.find((s) => s.includes("@"));
      if (textSection && textSection.includes("@")) {
        const parsed = tokenize(textSection);
        return { text: parsed.tokens.map((t) => (t.raw ? t.text.replace(/@/g, value) : t.text)).join(""), align: "left", color: parsed.color };
      }
    }
    return { text: value, align: "left" };
  }
  if (!Number.isFinite(value)) return { text: Number.isNaN(value) ? "#NUM!" : "#NUM!", align: "center", color: "#dc2626" };
  const out = formatNumber(value, fmt, locale);
  return { text: out.text, color: out.color, align: "right" };
}

/** Format a number with an Excel format code. */
export function formatNumber(v: number, fmt: string | undefined, locale: UiLocale): { text: string; color?: string } {
  const sep = separatorsFor(locale);
  if (!fmt || /^general$/i.test(fmt.trim())) return { text: formatGeneral(v, sep) };
  const sections = splitSections(fmt);
  let section = sections[0];
  let abs = false;
  if (sections.length >= 2 && v < 0) {
    section = sections[1];
    abs = true;
  } else if (sections.length >= 3 && v === 0) {
    section = sections[2];
  }
  const parsed = tokenize(section);
  const rawJoined = parsed.tokens.filter((t) => t.raw).map((t) => t.text).join("");
  if (isDateFormat(rawJoined)) {
    return { text: formatDate(v, parsed.tokens, locale, sep), color: parsed.color };
  }
  if (/^\s*@\s*$/.test(rawJoined) || rawJoined.trim() === "") {
    // text-only or literal-only section
    const lit = parsed.tokens.map((t) => (t.raw ? "" : t.text)).join("");
    if (rawJoined.includes("@")) return { text: formatGeneral(v, sep), color: parsed.color };
    return { text: lit || formatGeneral(abs ? Math.abs(v) : v, sep), color: parsed.color };
  }
  const text = formatWithPattern(abs ? Math.abs(v) : v, parsed.tokens, sep, !abs);
  return { text, color: parsed.color };
}

/** Excel "General": up to ~10 significant digits, scientific for very large/small magnitudes. */
export function formatGeneral(v: number, sep: Separators): string {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e11 || a < 1e-9) {
    const [m, e] = v.toExponential(5).split("e");
    const mant = String(Number(m)).replace(".", sep.decimal);
    const exp = Number(e);
    return `${mant}E${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  }
  let s = String(Number(v.toPrecision(10)));
  if (s.includes("e")) s = Number(v.toPrecision(10)).toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
  return s.replace(".", sep.decimal);
}

/** Excel "General" that drops decimals (then switches to scientific) to fit `maxChars`. */
export function formatGeneralFit(v: number, sep: Separators, maxChars: number): string {
  let s = formatGeneral(v, sep);
  if (s.length <= maxChars) return s;
  for (let d = 9; d >= 0; d--) {
    s = String(Number(v.toFixed(d))).replace(".", sep.decimal);
    if (s.includes("e")) break;
    if (s.length <= maxChars && !(s === "0" && v !== 0)) return s;
  }
  for (let d = 4; d >= 0; d--) {
    const [m, e] = v.toExponential(d).split("e");
    const exp = Number(e);
    s = `${m.replace(".", sep.decimal)}E${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
    if (s.length <= maxChars) return s;
  }
  return "#".repeat(Math.max(1, maxChars));
}

/** Split format sections on ";" outside quotes/brackets. */
export function splitSections(fmt: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  let b = false;
  for (let i = 0; i < fmt.length; i++) {
    const ch = fmt[i];
    if (ch === "\\" && !q) {
      cur += ch + (fmt[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') q = !q;
    else if (ch === "[" && !q) b = true;
    else if (ch === "]" && !q) b = false;
    if (ch === ";" && !q && !b) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

interface Token {
  text: string;
  /** true = format code characters; false = literal text */
  raw: boolean;
}

function tokenize(section: string): { tokens: Token[]; color?: string } {
  const tokens: Token[] = [];
  let color: string | undefined;
  const pushRaw = (c: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.raw) last.text += c;
    else tokens.push({ text: c, raw: true });
  };
  const pushLit = (c: string) => tokens.push({ text: c, raw: false });
  for (let i = 0; i < section.length; i++) {
    const ch = section[i];
    if (ch === '"') {
      const end = section.indexOf('"', i + 1);
      const lit = end < 0 ? section.slice(i + 1) : section.slice(i + 1, end);
      pushLit(lit);
      i = end < 0 ? section.length : end;
    } else if (ch === "\\") {
      pushLit(section[i + 1] ?? "");
      i++;
    } else if (ch === "_") {
      pushLit(" ");
      i++;
    } else if (ch === "*") {
      i++; // fill character: ignored
    } else if (ch === "[") {
      const end = section.indexOf("]", i + 1);
      const inner = end < 0 ? section.slice(i + 1) : section.slice(i + 1, end);
      i = end < 0 ? section.length : end;
      if (inner.startsWith("$")) {
        const dash = inner.indexOf("-");
        pushLit(dash < 0 ? inner.slice(1) : inner.slice(1, dash));
      } else if (COLOR_NAMES[inner.toLowerCase()] !== undefined) {
        color = COLOR_NAMES[inner.toLowerCase()] || undefined;
      } else if (/^(h+|m+|s+)$/i.test(inner)) {
        pushRaw(inner); // elapsed time: approximate as plain token
      }
      // conditions like [<0] and locale codes are ignored
    } else if (ch === "$" || ch === "€" || ch === "£" || ch === "¥" || ch === "-" || ch === "+" || ch === "(" || ch === ")" || ch === ":" || ch === "/" || ch === " " || ch === "^" || ch === "'" || ch === "{" || ch === "}" || ch === "<" || ch === ">" || ch === "=" || ch === "&" || ch === "~") {
      // characters displayed literally without quotes; "/" and ":" are also date separators
      if ((ch === "/" || ch === ":" || ch === "-" || ch === " ") && tokens.length && tokens[tokens.length - 1].raw) pushRaw(ch);
      else pushLit(ch);
    } else {
      pushRaw(ch);
    }
  }
  return { tokens, color };
}

function isDateFormat(raw: string): boolean {
  const cleaned = raw.replace(/E[+-]/gi, "");
  if (/[0#?]/.test(cleaned)) return false;
  return /[dmyhs]/i.test(cleaned);
}

const PLACEHOLDER = /[0#?]/;

/** Format a number using the numeric pattern found in the raw tokens; literals before/after are kept. */
function formatWithPattern(v: number, tokens: Token[], sep: Separators, allowMinus: boolean): string {
  // Flatten into chars with literal flag
  const chars: { c: string; raw: boolean }[] = [];
  for (const t of tokens) {
    if (t.raw) for (const c of t.text) chars.push({ c, raw: true });
    else chars.push({ c: t.text, raw: false });
  }
  let first = -1;
  let last = -1;
  let percent = 0;
  let expAt = chars.length;
  for (let i = 0; i < chars.length - 1; i++) {
    if (chars[i].raw && /^e$/i.test(chars[i].c) && /^[+-]$/.test(chars[i + 1].c) && first >= 0) {
      expAt = i;
      break;
    }
    if (chars[i].raw && PLACEHOLDER.test(chars[i].c) && first < 0) first = i;
  }
  first = -1;
  for (let i = 0; i < chars.length; i++) {
    const { c, raw } = chars[i];
    if (!raw) continue;
    if (c === "%") percent++;
    if (PLACEHOLDER.test(c) && i < expAt) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) {
    return chars.map((x) => x.c).join("");
  }
  // extend `last` over trailing commas (scaling) and a scientific exponent
  let pattern = "";
  for (let i = first; i <= last; i++) if (chars[i].raw) pattern += chars[i].c;
  let j = last + 1;
  let expPattern: string | null = null;
  while (j < chars.length && chars[j].raw && chars[j].c === ",") {
    pattern += ",";
    j++;
  }
  if (j < chars.length && chars[j].raw && /e/i.test(chars[j].c) && j + 1 < chars.length && /[+-]/.test(chars[j + 1].c)) {
    let k = j + 2;
    let e = "";
    while (k < chars.length && chars[k].raw && PLACEHOLDER.test(chars[k].c)) e += chars[k++].c;
    if (e) {
      expPattern = chars[j + 1].c + e;
      j = k;
    }
  }
  const prefix = chars
    .slice(0, first)
    .map((x) => (x.raw ? x.c.replace(/[%,.]/g, (m) => (m === "%" ? "%" : "")) : x.c))
    .join("");
  const suffix = chars
    .slice(j)
    .map((x) => (x.raw ? x.c.replace(/[^%a-zA-Z ]/g, "") : x.c))
    .join("");

  let value = v * Math.pow(100, percent);
  const negative = value < 0;
  value = Math.abs(value);

  const dot = pattern.indexOf(".");
  let intPat = dot < 0 ? pattern : pattern.slice(0, dot);
  const decPat = dot < 0 ? "" : pattern.slice(dot + 1).replace(/,/g, "");
  // trailing commas scale by 1000
  const trailing = /,+$/.exec(intPat);
  if (trailing && dot < 0) {
    value /= Math.pow(1000, trailing[0].length);
    intPat = intPat.slice(0, -trailing[0].length);
  } else if (trailing) {
    value /= Math.pow(1000, trailing[0].length);
    intPat = intPat.slice(0, -trailing[0].length);
  }
  const grouping = intPat.includes(",");
  const minInt = (intPat.match(/0/g) ?? []).length;
  const minDec = (decPat.match(/0/g) ?? []).length;
  const maxDec = (decPat.match(/[0#?]/g) ?? []).length;

  let body: string;
  if (expPattern) {
    let exp = value === 0 ? 0 : Math.floor(Math.log10(value));
    let mant = value === 0 ? 0 : value / Math.pow(10, exp);
    if (Number(mant.toFixed(maxDec)) >= 10) {
      mant /= 10;
      exp += 1;
    }
    const m = numberBody(mant, Math.max(minInt, 1), false, minDec, maxDec, sep);
    const expDigits = (expPattern.match(/0/g) ?? []).length;
    const sign = exp < 0 ? "-" : expPattern[0] === "+" ? "+" : "";
    body = `${m}E${sign}${String(Math.abs(exp)).padStart(expDigits, "0")}`;
  } else {
    body = numberBody(value, minInt, grouping, minDec, maxDec, sep);
  }
  const isZeroDisplay = !/[1-9]/.test(body);
  const minus = negative && allowMinus && !isZeroDisplay ? "-" : "";
  return `${minus}${prefix}${body}${suffix}`;
}

function numberBody(value: number, minInt: number, grouping: boolean, minDec: number, maxDec: number, sep: Separators): string {
  let fixed = roundTo(value, maxDec).toFixed(maxDec);
  let [intStr, decStr = ""] = fixed.split(".");
  if (decStr.length > minDec) {
    decStr = decStr.replace(/0+$/, "");
    if (decStr.length < minDec) decStr = decStr.padEnd(minDec, "0");
  }
  if (intStr === "0" && minInt === 0) intStr = "";
  if (intStr.length < minInt) intStr = intStr.padStart(minInt, "0");
  if (grouping && intStr.length > 3) intStr = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, sep.group);
  fixed = decStr.length ? `${intStr}${sep.decimal}${decStr}` : intStr;
  return fixed;
}

function roundTo(v: number, digits: number): number {
  if (digits > 15) return v;
  const f = Math.pow(10, digits);
  return Math.round((v + Number.EPSILON * v) * f) / f;
}

/** Excel serial (1900 system) → UTC Date. */
export function excelSerialToDate(serial: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000));
}

function formatDate(serial: number, tokens: Token[], locale: UiLocale, sep: Separators): string {
  const d = excelSerialToDate(serial);
  const Y = d.getUTCFullYear();
  const M = d.getUTCMonth();
  const D = d.getUTCDate();
  const wd = d.getUTCDay();
  const h = d.getUTCHours();
  const mi = d.getUTCMinutes();
  const s = d.getUTCSeconds();
  // Spanish users expect day-first for the US built-in short date
  let out = "";
  for (const t of tokens) {
    if (!t.raw) {
      out += t.text;
      continue;
    }
    let code = t.text;
    if (locale === "es" && /^m{1,2}\/d{1,2}\/y{2,4}$/i.test(code)) {
      const [mm, dd, yy] = code.split("/");
      code = `${dd}/${mm}/${yy}`;
    }
    const ampm = /AM\/PM|A\/P/i.test(code);
    const re = /(yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|am\/pm|A\/P|a\/p|\.0+|[eg]+|.)/gi;
    const parts = code.match(re) ?? [];
    let prevWasHour = false;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const low = p.toLowerCase();
      const nextIsSec = parts.slice(i + 1).find((x) => /[a-z]/i.test(x))?.toLowerCase().startsWith("s") ?? false;
      if (low === "yyyy" || low === "e") out += String(Y);
      else if (low === "yy") out += String(Y % 100).padStart(2, "0");
      else if (low === "mmmmm") out += MONTHS[locale][M][0].toUpperCase();
      else if (low === "mmmm") out += MONTHS[locale][M];
      else if (low === "mmm") out += MONTHS[locale][M].slice(0, 3);
      else if (low === "mm" || low === "m") {
        if (prevWasHour || nextIsSec) out += low === "mm" ? String(mi).padStart(2, "0") : String(mi);
        else out += low === "mm" ? String(M + 1).padStart(2, "0") : String(M + 1);
      } else if (low === "dddd") out += DAYS[locale][wd];
      else if (low === "ddd") out += DAYS[locale][wd].slice(0, 3);
      else if (low === "dd") out += String(D).padStart(2, "0");
      else if (low === "d") out += String(D);
      else if (low === "hh" || low === "h") {
        const hh = ampm ? ((h + 11) % 12) + 1 : h;
        out += low === "hh" ? String(hh).padStart(2, "0") : String(hh);
      } else if (low === "ss") out += String(s).padStart(2, "0");
      else if (low === "s") out += String(s);
      else if (low === "am/pm") out += h < 12 ? "AM" : "PM";
      else if (low === "a/p") out += h < 12 ? "A" : "P";
      else if (low.startsWith(".0")) out += sep.decimal + "0".repeat(low.length - 1);
      else out += p;
      if (/^h+$/.test(low)) prevWasHour = true;
      else if (/[a-z]/.test(low)) prevWasHour = false;
    }
  }
  return out;
}

/**
 * Parse what the user typed in a cell. Formulas pass through unchanged; numbers accept the
 * locale decimal separator, percentages ("15%") and thousand separators.
 */
export function parseUserInput(raw: string, locale: UiLocale): string | number | null {
  const text = raw.trim();
  if (text === "") return null;
  if (text.startsWith("=")) return raw.trim();
  const n = parseLocaleNumber(text, locale);
  if (n !== null) return n;
  return raw;
}

export function parseLocaleNumber(text: string, locale: UiLocale): number | null {
  let s = text.trim().replace(/\s/g, "").replace(/^[$€£]/, "");
  let pct = false;
  if (s.endsWith("%")) {
    pct = true;
    s = s.slice(0, -1);
  }
  if (s === "" || !/^[-+]?[\d.,]+(e[-+]?\d+)?$/i.test(s)) return null;
  const sep = separatorsFor(locale);
  const hasDec = s.includes(sep.decimal);
  const hasGroup = s.includes(sep.group);
  let normalised = s;
  if (hasDec && hasGroup) {
    normalised = s.split(sep.group).join("").replace(sep.decimal, ".");
  } else if (hasDec) {
    if (s.split(sep.decimal).length > 2) return null;
    normalised = s.replace(sep.decimal, ".");
  } else if (hasGroup) {
    // "1.234.567" (es) → grouping; "1.5" (es) → students often type "." as decimal: accept it
    const parts = s.split(sep.group);
    const looksGrouped = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && sep.group === ",");
    normalised = looksGrouped ? parts.join("") : s.replace(sep.group, ".");
    if (parts.length === 2 && parts[1].length === 3 && sep.group === "." && /^\d{1,3}$/.test(parts[0].replace(/^[-+]/, ""))) {
      // ambiguous "1.234" in es → thousands
      normalised = parts.join("");
    }
  }
  const n = Number(normalised);
  if (!Number.isFinite(n)) return null;
  return pct ? n / 100 : n;
}

/** Number → short display string for stats/charts (no format code). */
export function formatStat(v: number, locale: UiLocale, kind: "currency" | "percent" | "number" | undefined = "number", digits = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "−∞";
  const loc = locale === "es" ? "es-ES" : "en-US";
  if (kind === "percent") return (v * 100).toLocaleString(loc, { maximumFractionDigits: digits, minimumFractionDigits: digits, useGrouping: true }) + "%";
  const a = Math.abs(v);
  const d = a >= 1e6 ? 0 : a >= 100 ? Math.min(digits, 2) : a >= 1 ? Math.max(digits, 2) : 4;
  const s = v.toLocaleString(loc, { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, digits), useGrouping: true });
  return kind === "currency" ? `$ ${s}` : s;
}
