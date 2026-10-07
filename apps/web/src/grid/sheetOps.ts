/**
 * Spreadsheet operations behind the fill handle, Ctrl+D/R, the internal clipboard (copy/cut/paste
 * with formulas), AutoSum and the copy marquee.
 */
import { create } from "zustand";
import type { CellRef, RiskModel } from "@openrisksim/core";
import type { RawContent } from "@openrisksim/workbook";
import { linkModelUndo, useWorkbookStore } from "../store/workbook";
import { sameCell, useModelStore } from "../store/model";
import { useUiStore } from "../store/ui";
import { addressesIn, boundsToRange, inBounds, parseAddress, parseRangeBounds, toAddress, toTsv, type RangeBounds } from "../lib/a1";
import { separatorsFor } from "../lib/numberFormat";
import { fillTarget, seriesGenerator, type FillDirection, type FillValue } from "../lib/fillSeries";
import { localFunctionName } from "../lib/formulaI18n";
import { boundsRefText } from "../lib/formulaTokens";
import { onAfterCommit, useEditStore } from "./editState";
import i18n from "../i18n";

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o);

// ---------------------------------------------------------------------------------------------
// Copy marquee + internal clipboard
// ---------------------------------------------------------------------------------------------

export interface ClipRange {
  sheet: string;
  bounds: RangeBounds;
  cut: boolean;
}

interface ClipStore {
  marquee: ClipRange | null;
}
export const useClipStore = create<ClipStore>()(() => ({ marquee: null }));

let clip: (ClipRange & { tsv: string }) | null = null;

export function clearClipboardMarquee(): void {
  clip = null;
  if (useClipStore.getState().marquee) useClipStore.setState({ marquee: null });
}
onAfterCommit(() => {
  // typing into a cell ends Excel's copy mode (but keeps a cut pending until it is pasted)
  if (clip && !clip.cut) clearClipboardMarquee();
});

/** TSV of a range (values in the UI locale) for the system clipboard (pasting into Excel etc.). */
export function rangeTsv(sheet: string, b: RangeBounds): string {
  const { engine } = useWorkbookStore.getState();
  if (!engine) return "";
  const sep = separatorsFor(useUiStore.getState().locale);
  const rows: string[][] = [];
  for (let r = b.r0; r <= b.r1; r++) {
    const row: string[] = [];
    for (let c = b.c0; c <= b.c1; c++) {
      const v = engine.getValue({ sheet, address: toAddress(r, c) });
      if (v === null || v === undefined) row.push("");
      else if (typeof v === "object") row.push(v.error);
      else if (typeof v === "number") row.push(String(v).replace(".", sep.decimal));
      else row.push(String(v));
    }
    rows.push(row);
  }
  return toTsv(rows);
}

/** Copy (or cut) the selection: remembers it for an internal paste and returns the TSV text. */
export function copySelection(cut: boolean): string {
  const st = useWorkbookStore.getState();
  const b = parseRangeBounds(st.selection.range);
  if (!b) return "";
  const tsv = rangeTsv(st.selection.sheet, b);
  clip = { sheet: st.selection.sheet, bounds: b, cut, tsv };
  useClipStore.setState({ marquee: { sheet: st.selection.sheet, bounds: b, cut } });
  return tsv;
}

const norm = (s: string) => s.replace(/\r\n?/g, "\n").replace(/\n$/, "");

/** True when the system clipboard text still is what we copied (so the internal paste applies). */
export function isInternalClipboard(text: string | null | undefined): boolean {
  if (!clip) return false;
  if (text == null || text === "") return true;
  return norm(text) === norm(clip.tsv);
}

export function hasInternalClip(): boolean {
  return clip !== null;
}

function formatsOf(sheet: string, b: RangeBounds) {
  const st = useWorkbookStore.getState();
  const out: (ReturnType<typeof st.formatOf> | undefined)[][] = [];
  for (let r = b.r0; r <= b.r1; r++) {
    const row: (ReturnType<typeof st.formatOf> | undefined)[] = [];
    for (let c = b.c0; c <= b.c1; c++) row.push(st.formatOf(sheet, toAddress(r, c)));
    out.push(row);
  }
  return out;
}

type FmtEntry = [string, { z?: string; s?: import("@openrisksim/workbook").CellStyle } | undefined];

function formatSnapshot(sheet: string, b: RangeBounds): FmtEntry[] {
  const st = useWorkbookStore.getState();
  return addressesIn(b).map((a) => [a, st.formatOf(sheet, a)]);
}

/** Undo/redo of format changes (and optionally of the model) linked to the last engine edit. */
function linkUndo(parts: { sheet: string; before: FmtEntry[]; after: FmtEntry[] }[], model?: { before: RiskModel; after: RiskModel }): void {
  if (!parts.length && !model) return;
  linkModelUndo(
    () => {
      for (const p of [...parts].reverse()) useWorkbookStore.getState().setFormats(p.sheet, p.before);
      if (model) useModelStore.setState({ model: model.before });
    },
    () => {
      for (const p of parts) useWorkbookStore.getState().setFormats(p.sheet, p.after);
      if (model) useModelStore.setState({ model: model.after });
    },
  );
}

/** Copy formats from `src` tiled over `dst` (undone together with the cells). */
function tileFormats(srcSheet: string, src: RangeBounds, dstSheet: string, dst: RangeBounds): void {
  const fmts = formatsOf(srcSheet, src);
  const h = src.r1 - src.r0 + 1;
  const w = src.c1 - src.c0 + 1;
  const hasAny = fmts.some((r) => r.some((f) => f && (f.z || f.s))) || formatsOf(dstSheet, dst).some((r) => r.some((f) => f && (f.z || f.s)));
  if (!hasAny) return;
  const before = formatSnapshot(dstSheet, dst);
  const entries: FmtEntry[] = [];
  for (let r = dst.r0; r <= dst.r1; r++)
    for (let c = dst.c0; c <= dst.c1; c++) {
      const fr = (((r - src.r0) % h) + h) % h;
      const fc = (((c - src.c0) % w) + w) % w;
      entries.push([toAddress(r, c), fmts[fr][fc]]);
    }
  useWorkbookStore.getState().setFormats(dstSheet, entries);
  linkUndo([{ sheet: dstSheet, before, after: entries }]);
}

/** Move model definitions (assumptions, forecasts, decisions) that sit in `src` by the cut/paste offset. */
function moveDefinitions(srcSheet: string, src: RangeBounds, dstSheet: string, dRow: number, dCol: number): { moved: number; model?: { before: RiskModel; after: RiskModel } } {
  const before = useModelStore.getState().model;
  const inSrc = (c: CellRef) => {
    const p = c.sheet === srcSheet ? parseAddress(c.address) : null;
    return !!p && inBounds(src, p.row, p.col);
  };
  const dst: RangeBounds = { r0: src.r0 + dRow, r1: src.r1 + dRow, c0: src.c0 + dCol, c1: src.c1 + dCol };
  const inDst = (c: CellRef) => {
    const p = c.sheet === dstSheet ? parseAddress(c.address) : null;
    return !!p && inBounds(dst, p.row, p.col);
  };
  const shift = (c: CellRef): CellRef => {
    const p = parseAddress(c.address)!;
    return { sheet: dstSheet, address: toAddress(p.row + dRow, p.col + dCol) };
  };
  let moved = 0;
  const mv = <T extends { cell: CellRef }>(list: T[]): T[] =>
    list
      .filter((d) => inSrc(d.cell) || !inDst(d.cell)) // definitions on overwritten cells go away
      .map((d) => {
        if (!inSrc(d.cell)) return d;
        moved++;
        return { ...d, cell: shift(d.cell) };
      });
  const assumptions = mv(before.assumptions);
  const kept = new Set(assumptions.map((a) => a.id));
  const after: RiskModel = {
    ...before,
    assumptions,
    forecasts: mv(before.forecasts),
    decisions: mv(before.decisions),
    correlations: before.correlations.filter((c) => kept.has(c.a) && kept.has(c.b)),
  };
  const changed = after.assumptions.length !== before.assumptions.length || after.forecasts.length !== before.forecasts.length || after.decisions.length !== before.decisions.length || moved > 0;
  if (!changed) return { moved: 0 };
  useModelStore.setState({ model: after });
  return { moved, model: { before, after } };
}

/** Paste the internal clipboard onto the selection. `valuesOnly` pastes values (Ctrl+Shift+V). */
export function pasteInternal(valuesOnly = false): boolean {
  const st = useWorkbookStore.getState();
  const engine = st.engine;
  const target = parseRangeBounds(st.selection.range);
  if (!clip || !engine || !target) return false;
  const src = clip.bounds;
  const h = src.r1 - src.r0 + 1;
  const w = src.c1 - src.c0 + 1;
  const dstSheet = st.selection.sheet;
  if (!st.sheets.includes(clip.sheet)) {
    clearClipboardMarquee();
    return false;
  }
  // tile when the selection is a multiple of the copied block (Excel)
  const th = target.r1 - target.r0 + 1;
  const tw = target.c1 - target.c0 + 1;
  const reps = { r: th % h === 0 ? th / h : 1, c: tw % w === 0 ? tw / w : 1 };
  if (clip.cut) reps.r = reps.c = 1;
  const dst: RangeBounds = { r0: target.r0, c0: target.c0, r1: target.r0 + h * reps.r - 1, c1: target.c0 + w * reps.c - 1 };
  try {
    if (clip.cut && !valuesOnly) {
      const srcSheet = clip.sheet;
      const dRow = dst.r0 - src.r0;
      const dCol = dst.c0 - src.c0;
      if (dRow === 0 && dCol === 0 && srcSheet === dstSheet) {
        clearClipboardMarquee();
        return true;
      }
      const fmts = formatsOf(srcSheet, src);
      const srcBefore = formatSnapshot(srcSheet, src);
      const dstBefore = formatSnapshot(dstSheet, dst);
      let ok = false;
      st.mutate(dstSheet, dst, (eng) => {
        ok = eng.moveRange(srcSheet, boundsToRange(src), dstSheet, toAddress(dst.r0, dst.c0));
      });
      if (!ok) {
        useUiStore.getState().notify(t("clipboard.cannotMove"), "error");
        return true;
      }
      // formats travel with the cells
      const clear: [string, undefined][] = addressesIn(src).map((a) => [a, undefined]);
      useWorkbookStore.getState().setFormats(srcSheet, clear);
      const entries: [string, ReturnType<typeof st.formatOf>][] = [];
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) entries.push([toAddress(dst.r0 + r, dst.c0 + c), fmts[r][c]]);
      useWorkbookStore.getState().setFormats(dstSheet, entries);
      const { moved, model } = moveDefinitions(srcSheet, src, dstSheet, dRow, dCol);
      linkUndo(
        [
          { sheet: srcSheet, before: srcBefore, after: formatSnapshot(srcSheet, src) },
          { sheet: dstSheet, before: dstBefore, after: formatSnapshot(dstSheet, dst) },
        ],
        model,
      );
      if (moved) useUiStore.getState().notify(t("clipboard.definitionsMoved", { count: moved }), "info");
      clearClipboardMarquee();
    } else if (valuesOnly) {
      const vals = engine.getRangeValues(clip.sheet, boundsToRange(src));
      const raw: RawContent[][] = [];
      for (let r = 0; r < h * reps.r; r++) {
        const row: RawContent[] = [];
        for (let c = 0; c < w * reps.c; c++) {
          const v = vals[r % h]?.[c % w] ?? null;
          row.push(typeof v === "string" && !v.startsWith("#") ? `'${v}` : v);
        }
        raw.push(row);
      }
      st.mutate(dstSheet, dst, (eng) => eng.setRangeRaw(dstSheet, toAddress(dst.r0, dst.c0), raw));
    } else {
      const srcSheet = clip.sheet;
      st.mutate(dstSheet, dst, (eng) => {
        if (srcSheet === dstSheet) {
          // same sheet: tiled copy with shifted references in a single undo step
          eng.setRangeRaw(dstSheet, toAddress(dst.r0, dst.c0), eng.fillData(dstSheet, boundsToRange(src), boundsToRange(dst)));
        } else {
          // HyperFormula's copy/paste cannot run inside a batch (one undo step per tile)
          for (let i = 0; i < reps.r; i++) for (let j = 0; j < reps.c; j++) eng.copyPaste(srcSheet, boundsToRange(src), dstSheet, toAddress(dst.r0 + i * h, dst.c0 + j * w));
        }
      });
      tileFormats(srcSheet, src, dstSheet, dst);
    }
  } catch (e) {
    useUiStore.getState().notify(e instanceof Error ? e.message : String(e), "error");
    return true;
  }
  useWorkbookStore.getState().setSelection({ sheet: dstSheet, range: boundsToRange(dst) }, toAddress(dst.r0, dst.c0));
  return true;
}

// ---------------------------------------------------------------------------------------------
// Fill
// ---------------------------------------------------------------------------------------------

function unquoteRaw(v: RawContent): FillValue {
  if (v === undefined) return null;
  if (typeof v === "string" && v.startsWith("'")) return v; // forced text keeps its marker (seriesGenerator strips it)
  return v as FillValue;
}

/**
 * Fill `count` cells in `dir` from the `src` block: formulas shift relative references, two or more
 * numbers extend as a linear series (when `series`), "Año 1"-like texts increment, the rest is
 * copied. One undo step. Returns the bounds covering source + filled cells.
 */
export function fillRange(sheet: string, src: RangeBounds, dir: FillDirection, count: number, series = true): RangeBounds | null {
  const st = useWorkbookStore.getState();
  const engine = st.engine;
  if (!engine || count <= 0) return null;
  const dst = fillTarget(src, dir, count);
  if (dst.r0 < 0 || dst.c0 < 0) return null;
  const data = engine.fillData(sheet, boundsToRange(src), boundsToRange(dst));
  if (series) {
    const srcRaw = engine.getRangeSerialized(sheet, boundsToRange(src));
    const vertical = dir === "down" || dir === "up";
    const lines = vertical ? src.c1 - src.c0 + 1 : src.r1 - src.r0 + 1;
    for (let k = 0; k < lines; k++) {
      const line: FillValue[] = vertical ? srcRaw.map((row) => unquoteRaw(row[k] ?? null)) : (srcRaw[k] ?? []).map(unquoteRaw);
      const gen = seriesGenerator(line);
      if (!gen) continue;
      if (vertical) for (let r = dst.r0; r <= dst.r1; r++) data[r - dst.r0][k] = gen(r - src.r0) as RawContent;
      else for (let c = dst.c0; c <= dst.c1; c++) data[k][c - dst.c0] = gen(c - src.c0) as RawContent;
    }
  }
  st.mutate(sheet, dst, (eng) => eng.setRangeRaw(sheet, toAddress(dst.r0, dst.c0), data));
  tileFormats(sheet, src, sheet, dst);
  return { r0: Math.min(src.r0, dst.r0), c0: Math.min(src.c0, dst.c0), r1: Math.max(src.r1, dst.r1), c1: Math.max(src.c1, dst.c1) };
}

/** Ctrl+D / Ctrl+R: copy the first row (column) of the selection over the rest; a single cell copies from above (left). */
export function fillSelection(dir: "down" | "right"): void {
  const st = useWorkbookStore.getState();
  const b = parseRangeBounds(st.selection.range);
  if (!b || !st.engine) return;
  const sheet = st.selection.sheet;
  if (dir === "down") {
    if (b.r0 === b.r1) {
      if (b.r0 === 0) return;
      fillRange(sheet, { ...b, r0: b.r0 - 1, r1: b.r0 - 1 }, "down", 1, false);
    } else fillRange(sheet, { ...b, r1: b.r0 }, "down", b.r1 - b.r0, false);
  } else if (b.c0 === b.c1) {
    if (b.c0 === 0) return;
    fillRange(sheet, { ...b, c0: b.c0 - 1, c1: b.c0 - 1 }, "right", 1, false);
  } else fillRange(sheet, { ...b, c1: b.c0 }, "right", b.c1 - b.c0, false);
}

function isEmpty(sheet: string, row: number, col: number): boolean {
  const engine = useWorkbookStore.getState().engine;
  if (!engine || row < 0 || col < 0) return true;
  try {
    const v = engine.getValue({ sheet, address: toAddress(row, col) });
    return v === null || v === "";
  } catch {
    return true;
  }
}

/** Double-click on the fill handle: fill down as far as the adjacent column has data. */
export function fillDownToAdjacent(): RangeBounds | null {
  const st = useWorkbookStore.getState();
  const b = parseRangeBounds(st.selection.range);
  if (!b) return null;
  const sheet = st.selection.sheet;
  const limit = Math.max(b.r1 + 1, (st.sheetMeta(sheet)?.rows ?? 0) + 1);
  let last = -1;
  for (const col of [b.c0 - 1, b.c1 + 1]) {
    if (col < 0 || isEmpty(sheet, b.r1 + 1, col)) continue;
    let r = b.r1 + 1;
    while (r < limit && !isEmpty(sheet, r + 1, col)) r++;
    last = r;
    break;
  }
  if (last <= b.r1) return null;
  const res = fillRange(sheet, b, "down", last - b.r1, true);
  if (res) st.setSelection({ sheet, range: boundsToRange(res) }, toAddress(res.r0, res.c0));
  return res;
}

// ---------------------------------------------------------------------------------------------
// AutoSum
// ---------------------------------------------------------------------------------------------

function isNumberCell(sheet: string, row: number, col: number): boolean {
  const engine = useWorkbookStore.getState().engine;
  if (!engine || row < 0 || col < 0) return false;
  try {
    return typeof engine.getValue({ sheet, address: toAddress(row, col) }) === "number";
  } catch {
    return false;
  }
}

/** Contiguous numbers above (else to the left of) a cell, like Excel's AutoSum guess. */
export function guessSumRange(sheet: string, row: number, col: number): RangeBounds | null {
  if (isNumberCell(sheet, row - 1, col)) {
    let r = row - 1;
    while (r - 1 >= 0 && isNumberCell(sheet, r - 1, col)) r--;
    return { r0: r, r1: row - 1, c0: col, c1: col };
  }
  if (isNumberCell(sheet, row, col - 1)) {
    let c = col - 1;
    while (c - 1 >= 0 && isNumberCell(sheet, row, c - 1)) c--;
    return { r0: row, r1: row, c0: c, c1: col - 1 };
  }
  return null;
}

/**
 * Σ AutoSum: a single cell starts editing "=SUMA(rango)" with the guessed range in Point mode;
 * a multi-cell selection writes a SUM below each selected column.
 */
export function autoSum(): void {
  const st = useWorkbookStore.getState();
  const b = parseRangeBounds(st.selection.range);
  if (!st.engine || !b) return;
  const sheet = st.selection.sheet;
  const locale = useUiStore.getState().locale;
  const fn = localFunctionName("SUM", locale);
  if (b.r0 === b.r1 && b.c0 === b.c1) {
    const pos = parseAddress(st.cursor) ?? { row: b.r0, col: b.c0 };
    const g = guessSumRange(sheet, pos.row, pos.col);
    const ref = g ? boundsRefText(g) : "";
    const text = `=${fn}(${ref})`;
    const start = fn.length + 2;
    useEditStore.getState().start({
      sheet,
      address: toAddress(pos.row, pos.col),
      text,
      mode: "enter",
      source: "cell",
      caret: start,
      caretEnd: start + ref.length,
      point: g ? { start, end: start + ref.length, sheet, anchor: { row: g.r0, col: g.c0 }, focus: { row: g.r1, col: g.c1 } } : null,
    });
    return;
  }
  const row = b.r1 + 1;
  st.mutate(sheet, { ...b, r0: row, r1: row }, (eng) =>
    eng.batch(() => {
      for (let c = b.c0; c <= b.c1; c++) eng.setRangeRaw(sheet, toAddress(row, c), [[`=SUM(${boundsRefText({ r0: b.r0, r1: b.r1, c0: c, c1: c })})`]]);
    }),
  );
}

/** Definitions of the model on a cell (used to avoid duplicating them when copying). */
export function hasDefinition(ref: CellRef): boolean {
  const m = useModelStore.getState().model;
  return [...m.assumptions, ...m.forecasts, ...m.decisions].some((d) => sameCell(d.cell, ref));
}
