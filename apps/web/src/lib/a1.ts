/**
 * Lightweight A1-notation helpers used by the grid (hot paths: no heavy imports).
 * Rows/cols are 0-based.
 */

export interface CellPos {
  row: number;
  col: number;
}
export interface RangeBounds {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

const colCache: string[] = [];

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function colLetters(col: number): string {
  if (col < 0) return "";
  const cached = colCache[col];
  if (cached) return cached;
  let n = col + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  if (col < 2000) colCache[col] = s;
  return s;
}

/** "AA" → 26. Returns -1 when invalid. */
export function lettersToCol(letters: string): number {
  const s = letters.toUpperCase();
  if (!/^[A-Z]+$/.test(s)) return -1;
  let n = 0;
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1;
}

export function toAddress(row: number, col: number): string {
  return `${colLetters(col)}${row + 1}`;
}

/** Parse "B7" or "$B$7" → {row: 6, col: 1}. Returns null when invalid. */
export function parseAddress(a1: string): CellPos | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(a1.trim());
  if (!m) return null;
  const col = lettersToCol(m[1]);
  const row = Number(m[2]) - 1;
  if (col < 0 || row < 0) return null;
  return { row, col };
}

/** Parse "B2:D9" or "B2" → normalised bounds. */
export function parseRangeBounds(range: string): RangeBounds | null {
  const parts = range.split(":");
  const a = parseAddress(parts[0] ?? "");
  if (!a) return null;
  const b = parts.length > 1 ? parseAddress(parts[1]) : a;
  if (!b) return null;
  return normalise(a, b);
}

export function normalise(a: CellPos, b: CellPos): RangeBounds {
  return {
    r0: Math.min(a.row, b.row),
    c0: Math.min(a.col, b.col),
    r1: Math.max(a.row, b.row),
    c1: Math.max(a.col, b.col),
  };
}

export function boundsToRange(b: RangeBounds): string {
  const tl = toAddress(b.r0, b.c0);
  if (b.r0 === b.r1 && b.c0 === b.c1) return tl;
  return `${tl}:${toAddress(b.r1, b.c1)}`;
}

export function inBounds(b: RangeBounds, row: number, col: number): boolean {
  return row >= b.r0 && row <= b.r1 && col >= b.c0 && col <= b.c1;
}

/** Splits "Hoja 1!B2:C4" / "'Hoja 1'!B2" → {sheet, range}. Sheet is null if absent. */
export function splitSheetRef(ref: string): { sheet: string | null; range: string } {
  const idx = ref.lastIndexOf("!");
  if (idx < 0) return { sheet: null, range: ref.trim().replace(/\$/g, "").toUpperCase() };
  let sheet = ref.slice(0, idx).trim();
  if (sheet.startsWith("'") && sheet.endsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
  return { sheet, range: ref.slice(idx + 1).trim().replace(/\$/g, "").toUpperCase() };
}

/** Iterate all addresses in a range (row-major). */
export function addressesIn(b: RangeBounds): string[] {
  const out: string[] = [];
  for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) out.push(toAddress(r, c));
  return out;
}

/** Parse clipboard text (TSV from Excel/LibreOffice/Sheets) into a matrix of strings. */
export function parseTsv(text: string): string[][] {
  const normalised = text.replace(/\r\n?/g, "\n");
  const trimmed = normalised.endsWith("\n") ? normalised.slice(0, -1) : normalised;
  if (trimmed === "") return [[""]];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inQuotes) {
      if (ch === '"') {
        if (trimmed[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") {
      inQuotes = true;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/** Matrix → TSV (quotes cells containing tabs/newlines/quotes). */
export function toTsv(rows: string[][]): string {
  return rows
    .map((r) => r.map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join("\t"))
    .join("\n");
}
