/**
 * Pure parsing helpers used by the tool windows (pasted data, range references, cell values).
 * No React / store imports here so everything is unit-testable.
 */

export type CellValue = number | string | boolean | null | undefined | { error: string };

/**
 * Parse one number written by a human, accepting both "1.234,56" (es) and "1,234.56" (en),
 * percentages ("12%" → 0.12), currency symbols, and accounting negatives "(100)".
 * Returns NaN when the token is not a number.
 */
export function parseLocaleNumber(raw: string): number {
  let s = raw.trim().replace(/[  \s]/g, "");
  if (s === "") return NaN;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^[$€£¥]|[$€£¥]$/g, "").replace(/^(US\$|S\/\.?|Bs\.?|COP|MXN|USD|ARS|CLP|PEN)/i, "");
  let percent = false;
  if (s.endsWith("%")) {
    percent = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/^\+/, "");
  if (s.startsWith("−")) s = "-" + s.slice(1);
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // the last separator is the decimal one
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    const n = (s.match(/,/g) ?? []).length;
    if (n === 1) s = s.replace(",", ".");
    else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
    else return NaN;
  } else if (hasDot) {
    const n = (s.match(/\./g) ?? []).length;
    if (n > 1) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
      else return NaN;
    }
  }
  if (!/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  let v = Number(s);
  if (percent) v /= 100;
  return negative ? -v : v;
}

/**
 * Parse a list of numbers pasted by the user: separators are newlines, tabs, ";", spaces.
 * A comma is a decimal separator ("1,5" → 1.5), except inside tokens like "1,2,3" (several commas
 * and no dot) which are read as comma-separated lists. Non-numeric tokens (headers) are skipped.
 */
export function parseNumberList(text: string): number[] {
  const out: number[] = [];
  for (let tok of text.split(/[\s;]+/)) {
    tok = tok.replace(/^,+|,+$/g, "");
    if (!tok) continue;
    const commas = (tok.match(/,/g) ?? []).length;
    const parts = commas > 1 && !tok.includes(".") && !/^-?\d{1,3}(,\d{3})+$/.test(tok) ? tok.split(",") : [tok];
    for (const p of parts) {
      const v = parseLocaleNumber(p);
      if (Number.isFinite(v)) out.push(v);
    }
  }
  return out;
}

/** Parse a pasted table (rows = lines, cells separated by tab or ";" or spaces). Cells stay as raw strings. */
export function parseTable(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  const sep = lines.some((l) => l.includes("\t")) ? /\t/ : lines.some((l) => l.includes(";")) ? /;/ : /\s+/;
  return lines.map((l) => l.split(sep).map((c) => c.trim()));
}

/** Convert a cell value coming from the spreadsheet engine into a number (NaN when not numeric). */
export function cellToNumber(v: CellValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") return parseLocaleNumber(v);
  return NaN;
}

/** Flatten a 2D range (row-major) into the finite numbers it contains. */
export function flattenNumbers(values: CellValue[][]): number[] {
  const out: number[] = [];
  for (const row of values)
    for (const c of row) {
      if (typeof c === "boolean") continue;
      const v = cellToNumber(c);
      if (Number.isFinite(v)) out.push(v);
    }
  return out;
}

export interface NamedColumns {
  names: string[];
  columns: number[][];
  /** Rows dropped because a value was missing / non numeric. */
  dropped: number;
}

/**
 * Turn a matrix (rows × columns) into named numeric columns.
 * `hasHeader`: "auto" → the first row is a header when any of its cells is non-numeric text.
 * Rows with any non-numeric value are dropped (listwise deletion).
 */
export function matrixToColumns(matrix: CellValue[][], hasHeader: boolean | "auto" = "auto", defaultPrefix = "X"): NamedColumns {
  const rows = matrix.filter((r) => r.some((c) => c !== null && c !== undefined && c !== ""));
  if (rows.length === 0) return { names: [], columns: [], dropped: 0 };
  const width = Math.max(...rows.map((r) => r.length));
  const first = rows[0];
  const header =
    hasHeader === "auto"
      ? first.some((c) => typeof c === "string" && c.trim() !== "" && !Number.isFinite(parseLocaleNumber(c)))
      : hasHeader;
  const names: string[] = [];
  for (let j = 0; j < width; j++) {
    const h = header ? first[j] : null;
    names.push(h !== null && h !== undefined && String(h).trim() !== "" ? String(h).trim() : `${defaultPrefix}${j + 1}`);
  }
  const body = header ? rows.slice(1) : rows;
  const columns: number[][] = names.map(() => []);
  let dropped = 0;
  for (const r of body) {
    const nums: number[] = [];
    for (let j = 0; j < width; j++) nums.push(cellToNumber(r[j] as CellValue));
    if (nums.some((v) => !Number.isFinite(v))) {
      dropped++;
      continue;
    }
    nums.forEach((v, j) => columns[j].push(v));
  }
  return { names, columns, dropped };
}

/**
 * Place several matrices side by side (same observations in the same rows) and convert them to
 * named numeric columns with joint listwise deletion. Each matrix may have its own header row.
 */
export function hstackColumns(mats: CellValue[][][], hasHeader: boolean | "auto" = "auto", prefixes: string[] = []): NamedColumns {
  const names: string[] = [];
  const bodies: CellValue[][][] = [];
  const isEmpty = (r: CellValue[]) => !r.some((c) => c !== null && c !== undefined && c !== "");
  mats.forEach((m, k) => {
    // keep interior empty rows (they hold the alignment between ranges); trim trailing ones
    const rows = m.slice();
    while (rows.length && isEmpty(rows[rows.length - 1])) rows.pop();
    const width = rows.length ? Math.max(...rows.map((r) => r.length)) : 0;
    const first = rows[0] ?? [];
    const header =
      hasHeader === "auto"
        ? first.some((c) => typeof c === "string" && c.trim() !== "" && !Number.isFinite(parseLocaleNumber(c)))
        : hasHeader;
    const prefix = prefixes[k] ?? "X";
    for (let j = 0; j < width; j++) {
      const h = header ? first[j] : null;
      const fallback = width === 1 && prefixes[k] ? prefix : `${prefix}${names.length + 1}`;
      names.push(h !== null && h !== undefined && String(h).trim() !== "" ? String(h).trim() : fallback);
    }
    bodies.push((header ? rows.slice(1) : rows).map((r) => Array.from({ length: width }, (_, j) => r[j] as CellValue)));
  });
  const n = bodies.length ? Math.max(...bodies.map((b) => b.length)) : 0;
  const stacked: CellValue[][] = [];
  for (let i = 0; i < n; i++) stacked.push(bodies.flatMap((b, k) => b[i] ?? Array.from({ length: mats[k].length ? Math.max(...mats[k].map((r) => r.length)) : 0 }, () => null)));
  const res = matrixToColumns(stacked, false);
  return { names, columns: res.columns.length ? res.columns : names.map(() => []), dropped: res.dropped };
}

/** "Hoja 1!B2:B40" /"'Hoja 1'!B2:B40" / "B2:B40" → { sheet, range } (sheet null when absent). */
export function parseRangeRef(ref: string): { sheet: string | null; range: string } | null {
  const s = ref.trim();
  if (!s) return null;
  const bang = s.lastIndexOf("!");
  let sheet: string | null = null;
  let range = s;
  if (bang >= 0) {
    sheet = s.slice(0, bang).trim();
    if (sheet.startsWith("'") && sheet.endsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
    range = s.slice(bang + 1);
  }
  range = range.replace(/\$/g, "").toUpperCase().trim();
  if (!/^[A-Z]{1,3}\d+(:[A-Z]{1,3}\d+)?$/.test(range)) return null;
  return { sheet: sheet || null, range };
}

/** Build "Hoja!B2:B9", quoting the sheet name when it contains spaces or punctuation. */
export function formatRangeRef(sheet: string, range: string): string {
  const needsQuote = /[^A-Za-z0-9_À-ſ]/.test(sheet);
  const name = needsQuote ? `'${sheet.replace(/'/g, "''")}'` : sheet;
  return `${name}!${range}`;
}

/** Top-left cell of a range: "B2:D9" → "B2". */
export function topLeftCell(range: string): string {
  return range.split(":")[0].replace(/\$/g, "").toUpperCase();
}

/** A sheet name that does not collide with existing ones ("Tornado", "Tornado (2)", ...). Max 31 chars like Excel. */
export function uniqueSheetName(base: string, existing: string[]): string {
  const clean = base.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Hoja";
  const lower = new Set(existing.map((e) => e.toLowerCase()));
  if (!lower.has(clean.toLowerCase())) return clean;
  for (let i = 2; i < 1000; i++) {
    const suffix = ` (${i})`;
    const name = clean.slice(0, 31 - suffix.length) + suffix;
    if (!lower.has(name.toLowerCase())) return name;
  }
  return clean + Date.now();
}

/**
 * Column widths (px) for exported rows, from the longest text label per column. Rows with a single
 * non-empty cell (titles / notes) are ignored; 0 = keep the default width.
 */
export function autoColumnWidths(rows: (number | string | null)[][], defaultPx = 80, maxPx = 320): number[] {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const out = new Array<number>(width).fill(0);
  for (const r of rows) {
    if (r.filter((c) => c !== null && c !== "").length < 2) continue;
    r.forEach((c, j) => {
      if (typeof c !== "string" || c.startsWith("=")) return;
      const px = Math.min(maxPx, Math.round(c.length * 7 + 16));
      if (px > defaultPx && px > out[j]) out[j] = px;
    });
  }
  return out;
}

/** n evenly spaced values from a to b inclusive. */
export function linspace(a: number, b: number, n: number): number[] {
  if (n <= 1) return [a];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(a + ((b - a) * i) / (n - 1));
  return out;
}

/** Resize an array to length n, repeating the last value (or `fill`) when growing. */
export function resizeArray(arr: number[], n: number, fill = 0): number[] {
  const out = arr.slice(0, n);
  while (out.length < n) out.push(out.length ? out[out.length - 1] : fill);
  return out;
}

/** Values growing at a constant rate: first, first·(1+g), first·(1+g)², ... */
export function growthSeries(first: number, growth: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(first * Math.pow(1 + growth, i));
  return out;
}
