/**
 * A1 address helpers (0-based rows/cols) and a small formula reference translator
 * used to expand Excel shared formulas.
 */

const CELL_RE = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/;

/** 0 → "A", 25 → "Z", 26 → "AA", 16383 → "XFD". */
export function colToLetters(col: number): string {
  if (!Number.isInteger(col) || col < 0) throw new Error(`Invalid column index: ${col}`);
  let n = col + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "A" → 0, "aa" → 26. */
export function lettersToCol(letters: string): number {
  let n = 0;
  const up = letters.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const c = up.charCodeAt(i);
    if (c < 65 || c > 90) throw new Error(`Invalid column letters: ${letters}`);
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/** Parse "B7", "$b$7" → { row: 6, col: 1 } (0-based). Throws on invalid input. */
export function parseA1(a1: string): { row: number; col: number } {
  const m = CELL_RE.exec(a1.trim());
  if (!m) throw new Error(`Invalid A1 address: ${a1}`);
  const row = parseInt(m[2], 10) - 1;
  if (row < 0) throw new Error(`Invalid A1 address: ${a1}`);
  return { row, col: lettersToCol(m[1]) };
}

export function toA1(row: number, col: number): string {
  if (!Number.isInteger(row) || row < 0) throw new Error(`Invalid row index: ${row}`);
  return colToLetters(col) + String(row + 1);
}

/** "B2:D9" (or a single cell "B2") → normalised start/end (start = top-left). */
export function parseRange(range: string): { start: { row: number; col: number }; end: { row: number; col: number } } {
  let r = range.trim();
  const bang = r.lastIndexOf("!");
  if (bang >= 0) r = r.slice(bang + 1);
  const parts = r.split(":");
  if (parts.length > 2) throw new Error(`Invalid range: ${range}`);
  const a = parseA1(parts[0]);
  const b = parts.length === 2 ? parseA1(parts[1]) : a;
  return {
    start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
    end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
  };
}

/** Normalise an address: strip `$`, uppercase. */
export function normalizeA1(a1: string): string {
  const { row, col } = parseA1(a1);
  return toA1(row, col);
}

/** Quote a sheet name for use in a formula when needed: `'My sheet'!A1`. */
export function quoteSheetName(name: string): string {
  if (/^[\p{L}_][\p{L}0-9_.]*$/u.test(name) && !/^[A-Za-z]{1,3}[0-9]+$/.test(name)) return name;
  return `'${name.replace(/'/g, "''")}'`;
}

const MAX_ROW = 1048575;
const MAX_COL = 16383;

/**
 * Translate relative references of a formula by (dRow, dCol), like Excel does when a formula is
 * copied/filled (used to expand shared formulas). String literals, quoted sheet names, function
 * names and absolute (`$`) parts are left untouched. Whole-column (`A:A`) and whole-row (`1:1`)
 * references are translated too.
 */
export function translateFormula(formula: string, dRow: number, dCol: number): string {
  if (dRow === 0 && dCol === 0) return formula;
  let out = "";
  let i = 0;
  const n = formula.length;
  while (i < n) {
    const ch = formula[i];
    if (ch === '"') {
      // string literal ("" escapes)
      let j = i + 1;
      while (j < n) {
        if (formula[j] === '"') {
          if (formula[j + 1] === '"') j += 2;
          else break;
        } else j++;
      }
      out += formula.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "'") {
      // quoted sheet name
      let j = i + 1;
      while (j < n) {
        if (formula[j] === "'") {
          if (formula[j + 1] === "'") j += 2;
          else break;
        } else j++;
      }
      out += formula.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (/[A-Za-z0-9_$.\\\p{L}]/u.test(ch)) {
      // read an identifier-like token
      let j = i;
      while (j < n && /[A-Za-z0-9_$.\\\p{L}]/u.test(formula[j])) j++;
      const tok = formula.slice(i, j);
      const next = formula[j];
      const prev = i > 0 ? formula[i - 1] : "";
      if (next === "(" || next === "!" || /[\p{L}_]/u.test(prev)) {
        out += tok; // function name, sheet name
      } else {
        out += translateToken(tok, dRow, dCol, formula, i, j);
      }
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function translateToken(tok: string, dRow: number, dCol: number, formula: string, start: number, end: number): string {
  const cell = /^(\$?)([A-Za-z]{1,3})(\$?)([0-9]+)$/.exec(tok);
  if (cell) {
    let col = lettersToCol(cell[2]);
    let row = parseInt(cell[4], 10) - 1;
    if (col > MAX_COL) return tok;
    if (!cell[1]) col += dCol;
    if (!cell[3]) row += dRow;
    if (col < 0 || row < 0 || col > MAX_COL || row > MAX_ROW) return "#REF!";
    return `${cell[1]}${colToLetters(col)}${cell[3]}${row + 1}`;
  }
  // whole column (A:A) / whole row (1:1) — only when adjacent to ':'
  const adjColon = formula[end] === ":" || formula[start - 1] === ":";
  if (adjColon) {
    const colOnly = /^(\$?)([A-Za-z]{1,3})$/.exec(tok);
    if (colOnly) {
      if (colOnly[1]) return tok;
      const col = lettersToCol(colOnly[2]) + dCol;
      return col < 0 || col > MAX_COL ? "#REF!" : colToLetters(col);
    }
    const rowOnly = /^(\$?)([0-9]+)$/.exec(tok);
    if (rowOnly) {
      if (rowOnly[1]) return tok;
      const row = parseInt(rowOnly[2], 10) - 1 + dRow;
      return row < 0 || row > MAX_ROW ? "#REF!" : String(row + 1);
    }
  }
  return tok;
}
