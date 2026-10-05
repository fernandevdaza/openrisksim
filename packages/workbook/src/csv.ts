/**
 * CSV import (papaparse). Auto-detects the delimiter (`,` `;` tab `|`) and the decimal separator
 * (`1.234,56` vs `1,234.56`).
 */
import Papa from "papaparse";
import { toA1 } from "./address";
import type { CellData, SheetData, WorkbookData } from "./types";

const PapaNs: typeof Papa = ((Papa as unknown as { default?: typeof Papa }).default ?? Papa) as typeof Papa;

type DecimalSep = "." | ",";

const CURRENCY = /^[$€£¥]|[$€£¥]$|^(USD|EUR|BOB|MXN|ARS|COP|CLP|PEN)\s+|\s+(USD|EUR|BOB|MXN|ARS|COP|CLP|PEN)$/i;

function cleanNumericToken(raw: string): { body: string; percent: boolean } | null {
  let s = raw.trim().replace(/ /g, " ");
  if (!s) return null;
  let percent = false;
  if (s.endsWith("%")) {
    percent = true;
    s = s.slice(0, -1).trim();
  }
  s = s.replace(CURRENCY, "").trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1).trim();
  }
  // spaces / apostrophes as thousands separators: "1 234 567,8" or "1'234.5"
  if (/^[-+]?\d{1,3}([ '’]\d{3})+([.,]\d+)?$/.test(s)) s = s.replace(/[ '’]/g, "");
  if (!/^[-+]?(\d[\d.,]*|[.,]\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  return { body: neg ? `-${s}` : s, percent };
}

/** Score evidence for each decimal separator from a sample of tokens. */
export function detectDecimalSeparator(tokens: string[], delimiter: string): DecimalSep {
  let comma = 0;
  let dot = 0;
  for (const t of tokens) {
    const c = cleanNumericToken(t);
    if (!c) continue;
    const s = c.body.replace(/^[-+]/, "").replace(/[eE][-+]?\d+$/, "");
    if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) comma += 3;
    else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) dot += 3;
    else if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) comma += 2;
    else if (/^\d{1,3}(,\d{3}){2,}$/.test(s)) dot += 2;
    else if (/^\d*,\d+$/.test(s)) comma += /^\d{1,3},\d{3}$/.test(s) ? 0.5 : 2;
    else if (/^\d*\.\d+$/.test(s)) dot += /^\d{1,3}\.\d{3}$/.test(s) ? 0.5 : 2;
  }
  if (comma > dot) return ",";
  if (dot > comma) return ".";
  return delimiter === ";" ? "," : ".";
}

/** Parse a numeric token with the given decimal separator; null if not a number. */
export function parseLocaleNumber(raw: string, decimal: DecimalSep): number | null {
  const c = cleanNumericToken(raw);
  if (!c) return null;
  let s = c.body;
  const thousands = decimal === "," ? "." : ",";
  const intPart = s.split(decimal)[0];
  if (intPart.includes(thousands)) {
    // thousands separators must group by 3
    const grouped = new RegExp(`^[-+]?\\d{1,3}(\\${thousands}\\d{3})+$`);
    if (!grouped.test(intPart)) return null;
    s = s.split(thousands).join("");
  }
  if (s.split(decimal).length > 2) return null;
  if (decimal === ",") s = s.replace(",", ".");
  if (s.includes(",")) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return c.percent ? n / 100 : n;
}

function countOutsideQuotes(line: string, ch: string): number {
  let n = 0;
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (!inQ && c === ch) n++;
  }
  return n;
}

/**
 * Guess the delimiter: the candidate that appears the same (non-zero) number of times on every
 * sampled line wins; preference order tab, `;`, `,`, `|` (decimal commas make `,` least reliable).
 * Returns "" (let papaparse guess) when no candidate is consistent.
 */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "").slice(0, 50);
  if (!lines.length) return "";
  const candidates = ["\t", ";", ",", "|"];
  let best = "";
  let bestScore = 0;
  for (const d of candidates) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const first = counts[0];
    if (first === 0) continue;
    const consistent = counts.filter((c) => c === first).length / counts.length;
    if (consistent < 0.9) continue;
    const score = consistent * 10 + Math.min(first, 5) * 0.01;
    if (score > bestScore + 1e-9) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

function sheetNameFromFile(fileName?: string): string {
  if (!fileName) return "Sheet1";
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  const clean = base.replace(/[\\/?*[\]:]/g, "_").slice(0, 31).trim();
  return clean || "Sheet1";
}

/** Read CSV text into a single-sheet WorkbookData. */
export async function readCsv(text: string, fileName?: string): Promise<WorkbookData> {
  const src = text.replace(/^﻿/, "");
  const parsed = PapaNs.parse<string[]>(src, {
    delimiter: detectDelimiter(src),
    delimitersToGuess: [",", ";", "\t", "|"],
    skipEmptyLines: false,
    dynamicTyping: false,
  });
  const rows = (parsed.data as string[][]).slice();
  while (rows.length && rows[rows.length - 1].every((c) => c === "" || c == null)) rows.pop();
  const delimiter = parsed.meta.delimiter;

  const sample: string[] = [];
  outer: for (const r of rows) {
    for (const c of r) {
      if (c && /\d/.test(c)) sample.push(c);
      if (sample.length > 5000) break outer;
    }
  }
  const decimal = detectDecimalSeparator(sample, delimiter);

  const cells: Record<string, CellData> = {};
  let maxCols = 0;
  rows.forEach((row, r) => {
    maxCols = Math.max(maxCols, row.length);
    row.forEach((raw, c) => {
      if (raw == null) return;
      const value = String(raw);
      if (value.trim() === "") return;
      const key = toA1(r, c);
      const num = parseLocaleNumber(value, decimal);
      if (num !== null) {
        const cell: CellData = { v: num, t: "n" };
        if (/%\s*$/.test(value)) cell.z = "0.00%";
        cells[key] = cell;
        return;
      }
      const up = value.trim().toUpperCase();
      if (up === "TRUE" || up === "VERDADERO") cells[key] = { v: true, t: "b" };
      else if (up === "FALSE" || up === "FALSO") cells[key] = { v: false, t: "b" };
      else cells[key] = { v: value, t: "s" };
    });
  });
  const sheet: SheetData = { name: sheetNameFromFile(fileName), rows: Math.max(rows.length, 1), cols: Math.max(maxCols, 1), cells };
  const wb: WorkbookData = { sheets: [sheet], model: null };
  if (fileName !== undefined) wb.fileName = fileName;
  return wb;
}
