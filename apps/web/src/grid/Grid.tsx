import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { clsx } from "../components/ui";
import { useWorkbookStore, displayDims } from "../store/workbook";
import { definitionIndex, useModelStore, type DefinitionKind } from "../store/model";
import { useUiStore } from "../store/ui";
import { boundsToRange, colLetters, inBounds, normalise, parseAddress, parseRangeBounds, parseTsv, toAddress, type RangeBounds } from "../lib/a1";
import { formatCellValue, formatGeneralFit, parseUserInput, separatorsFor } from "../lib/numberFormat";
import { describeSpec } from "../lib/modelText";
import { toDisplayFormula } from "../lib/formulaI18n";
import { explainError, localizeError } from "../lib/errorInfo";
import { readableOnTheme } from "../lib/color";
import { canPoint, commitEdit, normaliseFormula, pointTo, rawCellContent, useEditStore } from "./editState";
import { CellContextMenu } from "./ContextMenu";
import { FormulaInput } from "./FormulaInput";
import { RefHighlights, type GridGeom } from "./RefHighlights";
import { CopyMarquee, ErrorBadge, FillHandle, TraceArrows } from "./GridOverlays";
import { autoSum, clearClipboardMarquee, copySelection, fillDownToAdjacent, fillRange, fillSelection, hasInternalClip, isInternalClipboard, pasteInternal } from "./sheetOps";
import { clearTraces } from "./formulaActions";
import { isCoarsePointer, touchedRecently } from "../lib/responsive";
import type { AssumptionDef, DecisionVariableDef, ForecastDef } from "@openrisksim/core";

export const ROW_H = 22;
const HEADER_H = 22;
const ROW_HEADER_W = 48;
const DEFAULT_COL_PX = 76;
const OVERSCAN_COLS_RIGHT = 6;

export function charsToPx(chars: number): number {
  return Math.max(16, Math.round(chars * 7 + 5));
}

const DEF_CLASSES: Record<DefinitionKind, { cell: string; marker: string }> = {
  assumption: { cell: "bg-green-100 dark:bg-green-900/45", marker: "border-t-green-600" },
  forecast: { cell: "bg-sky-100 dark:bg-sky-900/45", marker: "border-t-blue-600" },
  decision: { cell: "bg-yellow-100 dark:bg-yellow-800/40", marker: "border-t-yellow-600" },
};

interface RenderCell {
  key: string;
  x: number;
  y: number;
  w: number;
  text: string;
  style: CSSProperties;
  className?: string;
  kinds?: DefinitionKind[];
  title?: string;
  overflow: boolean;
  error?: boolean;
}

function upperBound(arr: number[], x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function Grid() {
  const { t } = useTranslation();
  const engine = useWorkbookStore((s) => s.engine);
  const version = useWorkbookStore((s) => s.version);
  const sheet = useWorkbookStore((s) => s.activeSheet);
  const workbook = useWorkbookStore((s) => s.workbook);
  const selection = useWorkbookStore((s) => s.selection);
  const cursor = useWorkbookStore((s) => s.cursor);
  const stepping = useWorkbookStore((s) => s.stepEvaluator !== null);
  const model = useModelStore((s) => s.model);
  const locale = useUiStore((s) => s.locale);
  const dark = useUiStore((s) => s.theme) === "dark";
  const jumpRequest = useUiStore((s) => s.jumpRequest);
  const editing = useEditStore((s) => s.editing);
  const picking = useUiStore((s) => s.rangePick !== null);
  const showFormulas = useUiStore((s) => s.showFormulas);

  const meta = useMemo(() => workbook?.sheets.find((s) => s.name === sheet), [workbook, sheet]);
  const [extra, setExtra] = useState({ rows: 0, cols: 0 });
  const dims = useMemo(() => {
    const d = displayDims(meta);
    return { rows: d.rows + extra.rows, cols: d.cols + extra.cols };
  }, [meta, extra]);
  useEffect(() => setExtra({ rows: 0, cols: 0 }), [sheet]);

  const [resizing, setResizing] = useState<{ col: number; px: number } | null>(null);
  const colX = useMemo(() => {
    const xs = new Array<number>(dims.cols + 1);
    xs[0] = 0;
    for (let c = 0; c < dims.cols; c++) {
      const w = resizing && resizing.col === c ? resizing.px : meta?.colWidths?.[c] != null ? charsToPx(meta.colWidths[c]) : DEFAULT_COL_PX;
      xs[c + 1] = xs[c] + w;
    }
    return xs;
  }, [dims.cols, meta, resizing]);

  const bodyRef = useRef<HTMLDivElement>(null);
  /** Hidden textarea that owns keyboard focus: receives keydown, IME/dead-key text input and clipboard events. */
  const keyRef = useRef<HTMLTextAreaElement>(null);
  // On touch devices the hidden textarea only gets focus to start an edit (otherwise the on-screen keyboard would pop up on every tap).
  const focusGrid = () => {
    if (!isCoarsePointer()) keyRef.current?.focus({ preventScroll: true });
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [view, setView] = useState({ w: 800, h: 500 });

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setView({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0, left: 0 });
  }, [sheet, engine]);

  const totalW = colX[dims.cols];
  const totalH = dims.rows * ROW_H;
  const firstRow = Math.max(0, Math.floor(scroll.top / ROW_H));
  const lastRow = Math.min(dims.rows - 1, Math.ceil((scroll.top + view.h) / ROW_H));
  const firstCol = Math.max(0, upperBound(colX, scroll.left) - 1);
  const lastVisCol = Math.min(dims.cols - 1, upperBound(colX, scroll.left + view.w) - 1);

  // grow the sheet when the user scrolls near the end
  const onScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    setScroll({ top: el.scrollTop, left: el.scrollLeft });
    if (el.scrollTop + el.clientHeight > el.scrollHeight - ROW_H * 10 && dims.rows < 100000) setExtra((e) => ({ ...e, rows: e.rows + 200 }));
    if (el.scrollLeft + el.clientWidth > el.scrollWidth - 200 && dims.cols < 702) setExtra((e) => ({ ...e, cols: e.cols + 10 }));
  }, [dims.rows, dims.cols]);

  const defIndex = useMemo(() => definitionIndex(model), [model]);
  const selBounds = useMemo(() => parseRangeBounds(selection.range) ?? { r0: 0, c0: 0, r1: 0, c1: 0 }, [selection.range]);
  const cursorPos = useMemo(() => parseAddress(cursor) ?? { row: 0, col: 0 }, [cursor]);

  // ---- cells to render --------------------------------------------------------------------------
  const cells = useMemo<RenderCell[]>(() => {
    if (!engine || !sheet) return [];
    const out: RenderCell[] = [];
    const lastCol = Math.min(dims.cols - 1, lastVisCol + OVERSCAN_COLS_RIGHT);
    const valueAt = (r: number, c: number) => {
      try {
        return engine.getValue({ sheet, address: toAddress(r, c) });
      } catch {
        return null;
      }
    };
    for (let r = firstRow; r <= lastRow; r++) {
      const rowVals = [] as ReturnType<typeof valueAt>[];
      for (let c = firstCol; c <= lastCol; c++) rowVals.push(valueAt(r, c));
      for (let c = firstCol; c <= Math.min(lastVisCol, lastCol); c++) {
        const addr = toAddress(r, c);
        const v = rowVals[c - firstCol];
        const cm = meta?.cells[addr];
        const defs = defIndex.get(`${sheet}!${addr}`);
        let formulaText: string | null = null;
        if (showFormulas) {
          try {
            const fx = engine.getFormula({ sheet, address: addr });
            if (fx) formulaText = toDisplayFormula(fx, locale);
          } catch {
            /* ignore */
          }
        }
        if ((v === null || v === undefined || v === "") && !cm?.s?.bg && !defs && formulaText === null) continue;
        const f = formulaText !== null ? { text: formulaText, align: "left" as const, color: undefined } : formatCellValue(v, cm?.z, locale);
        let errTitle: string | undefined;
        if (formulaText === null && v && typeof v === "object") {
          f.text = localizeError(v.error, locale);
          const info = engine.cellError({ sheet, address: addr });
          errTitle = `${f.text}: ${explainError(info ?? { value: v.error }, locale)}`;
        }
        const st = cm?.s;
        const w = colX[c + 1] - colX[c];
        let text = f.text;
        let overflowW = w;
        const align = st?.align ?? f.align;
        if (formulaText === null && typeof v === "number" && text.length * 7 + 6 > w && !(cm?.z ?? "").match(/[dmyhs]/i)) {
          const maxChars = Math.max(1, Math.floor((w - 6) / 7));
          text = !cm?.z || /^general$/i.test(cm.z) ? formatGeneralFit(v, separatorsFor(locale), maxChars) : "#".repeat(maxChars);
        }
        let overflow = false;
        if ((typeof v === "string" || formulaText !== null) && align === "left" && text.length * 6.8 + 8 > w) {
          let c2 = c + 1;
          while (c2 <= lastCol && overflowW < text.length * 6.8 + 8) {
            const nv = rowVals[c2 - firstCol];
            if (nv !== null && nv !== undefined && nv !== "") break;
            overflowW += colX[c2 + 1] - colX[c2];
            c2++;
          }
          overflow = overflowW > w;
        }
        const style: CSSProperties = {
          left: colX[c],
          top: r * ROW_H,
          width: (overflow ? overflowW : w) - 1,
          textAlign: align,
          fontWeight: st?.bold ? 600 : undefined,
          fontStyle: st?.italic ? "italic" : undefined,
          // The file's own fill is replaced by the definition highlight, so dark text meant for that
          // fill must be adapted to the theme background.
          color: f.color ?? (st?.bg && !defs ? (st.color ?? "#0f172a") : readableOnTheme(st?.color, dark)),
          background: defs ? undefined : st?.bg,
        };
        let title: string | undefined = errTitle;
        if (defs) {
          title = defs
            .map(({ kind, def }) => {
              if (kind === "assumption") {
                const a = def as AssumptionDef;
                return `${t("defs.assumption")}: ${a.name}\n${describeSpec(a.distribution, locale)}${a.enabled ? "" : `\n(${t("defs.disabled")})`}`;
              }
              if (kind === "forecast") return `${t("defs.forecast")}: ${(def as ForecastDef).name}`;
              const d = def as DecisionVariableDef;
              return `${t("defs.decision")}: ${d.name}\n${t(`decision.type.${d.type}`)} [${d.lower}, ${d.upper}]`;
            })
            .join("\n");
        }
        out.push({
          key: addr,
          x: colX[c],
          y: r * ROW_H,
          w,
          text,
          style,
          className: defs ? DEF_CLASSES[defs[0].kind].cell : undefined,
          kinds: defs?.map((d) => d.kind),
          title: errTitle && title !== errTitle ? `${errTitle}\n${title}` : title,
          overflow,
          error: !!errTitle,
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, sheet, version, firstRow, lastRow, firstCol, lastVisCol, colX, meta, defIndex, locale, t, dark, showFormulas]);

  // ---- selection helpers --------------------------------------------------------------------------
  const anchorRef = useRef<{ row: number; col: number }>({ row: 0, col: 0 });
  const focusRef = useRef<{ row: number; col: number }>({ row: 0, col: 0 });
  useEffect(() => {
    // external selection changes (jump, name box) reset the anchor
    anchorRef.current = cursorPos;
    const b = selBounds;
    focusRef.current = { row: b.r0 === cursorPos.row ? b.r1 : b.r0, col: b.c0 === cursorPos.col ? b.c1 : b.c0 };
  }, [cursorPos, selBounds]);

  const select = useCallback(
    (anchor: { row: number; col: number }, focus: { row: number; col: number }) => {
      anchorRef.current = anchor;
      focusRef.current = focus;
      useWorkbookStore.getState().setSelection({ sheet, range: boundsToRange(normalise(anchor, focus)) }, toAddress(anchor.row, anchor.col));
    },
    [sheet],
  );

  const scrollIntoView = useCallback(
    (row: number, col: number) => {
      const el = bodyRef.current;
      if (!el) return;
      const x0 = colX[col] ?? 0;
      const x1 = colX[col + 1] ?? x0 + DEFAULT_COL_PX;
      const y0 = row * ROW_H;
      const y1 = y0 + ROW_H;
      let { scrollTop, scrollLeft } = el;
      if (y0 < scrollTop) scrollTop = y0;
      else if (y1 > scrollTop + el.clientHeight) scrollTop = y1 - el.clientHeight;
      if (x0 < scrollLeft) scrollLeft = x0;
      else if (x1 > scrollLeft + el.clientWidth) scrollLeft = x1 - el.clientWidth;
      if (scrollTop !== el.scrollTop || scrollLeft !== el.scrollLeft) el.scrollTo({ top: scrollTop, left: scrollLeft });
    },
    [colX],
  );

  const ensureDims = useCallback(
    (row: number, col: number) => {
      if (row >= dims.rows - 5 || col >= dims.cols - 2)
        setExtra((e) => ({ rows: e.rows + (row >= dims.rows - 5 ? 100 : 0), cols: e.cols + (col >= dims.cols - 2 ? 5 : 0) }));
    },
    [dims],
  );

  const moveCursor = useCallback(
    (dr: number, dc: number, extend: boolean, jump = false) => {
      const base = extend ? focusRef.current : anchorRef.current;
      let row = base.row + dr;
      let col = base.col + dc;
      if (jump) {
        const dataRows = Math.max(1, meta?.rows ?? 1);
        const dataCols = Math.max(1, meta?.cols ?? 1);
        if (dr < 0) row = 0;
        if (dr > 0) row = Math.max(base.row, dataRows - 1);
        if (dc < 0) col = 0;
        if (dc > 0) col = Math.max(base.col, dataCols - 1);
      }
      row = Math.max(0, Math.min(dims.rows - 1, row));
      col = Math.max(0, Math.min(dims.cols - 1, col));
      if (extend) select(anchorRef.current, { row, col });
      else select({ row, col }, { row, col });
      ensureDims(row, col);
      scrollIntoView(row, col);
    },
    [dims, meta, select, scrollIntoView, ensureDims],
  );

  // jump requests from the model explorer / name box
  useEffect(() => {
    if (!jumpRequest) return;
    const pos = parseAddress(jumpRequest.address.split(":")[0]);
    if (!pos) return;
    const st = useWorkbookStore.getState();
    if (st.sheets.includes(jumpRequest.sheet) && st.activeSheet !== jumpRequest.sheet) st.setActiveSheet(jumpRequest.sheet);
    const b = parseRangeBounds(jumpRequest.address) ?? { r0: pos.row, c0: pos.col, r1: pos.row, c1: pos.col };
    useWorkbookStore.getState().setSelection({ sheet: jumpRequest.sheet, range: boundsToRange(b) }, toAddress(pos.row, pos.col));
    ensureDims(b.r1, b.c1);
    requestAnimationFrame(() => {
      scrollIntoView(pos.row, pos.col);
      focusGrid();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpRequest]);

  // ---- editing ----------------------------------------------------------------------------------
  const startEdit = useCallback(
    (initial: string | null, mode: "enter" | "edit") => {
      if (!engine || !sheet) return;
      const ref = { sheet, address: cursor };
      useEditStore.getState().start({ sheet, address: cursor, text: initial ?? rawCellContent(ref), mode, source: "cell" });
    },
    [engine, sheet, cursor],
  );

  // trace arrows are removed when the workbook changes (Excel)
  const editVersion = useWorkbookStore((s) => s.editVersion);
  useEffect(() => clearTraces(), [editVersion, engine]);

  // move the active cell after an edit was committed (Enter/Tab/arrows in the editor)
  const moveRequest = useUiStore((s) => s.moveRequest);
  useEffect(() => {
    if (!moveRequest) return;
    const p = parseAddress(useWorkbookStore.getState().cursor) ?? { row: 0, col: 0 };
    const row = Math.max(0, Math.min(dims.rows - 1, p.row + moveRequest.dr));
    const col = Math.max(0, Math.min(dims.cols - 1, p.col + moveRequest.dc));
    select({ row, col }, { row, col });
    ensureDims(row, col);
    scrollIntoView(row, col);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveRequest]);

  // ---- clipboard ----------------------------------------------------------------------------------
  const gridHasFocus = () => {
    const a = document.activeElement;
    return !!a && a === keyRef.current;
  };

  useEffect(() => {
    const onCopy = (e: ClipboardEvent, cut = false) => {
      if (!gridHasFocus() || !engine) return;
      const tsv = copySelection(cut);
      e.clipboardData?.setData("text/plain", tsv);
      e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => onCopy(e, true);
    const onPaste = (e: ClipboardEvent) => {
      if (!gridHasFocus() || !engine) return;
      const text = e.clipboardData?.getData("text/plain");
      if (hasInternalClip() && isInternalClipboard(text)) {
        e.preventDefault();
        pasteInternal(false);
        return;
      }
      if (text == null) return;
      e.preventDefault();
      pasteText(text);
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [engine]);

  const pasteText = (text: string) => {
    const st = useWorkbookStore.getState();
    const locale = useUiStore.getState().locale;
    const b = parseRangeBounds(st.selection.range);
    if (!b) return;
    let matrix = parseTsv(text).map((r) =>
      r.map((cell) => {
        const p = parseUserInput(cell, locale);
        return typeof p === "string" && p.startsWith("=") ? normaliseFormula(p) : p;
      }),
    );
    // single value pasted onto a multi-cell selection → fill
    if (matrix.length === 1 && matrix[0].length === 1 && (b.r1 > b.r0 || b.c1 > b.c0)) {
      const v = matrix[0][0];
      matrix = [];
      for (let r = b.r0; r <= b.r1; r++) matrix.push(new Array(b.c1 - b.c0 + 1).fill(v));
    }
    try {
      st.writeRange(st.selection.sheet, toAddress(b.r0, b.c0), matrix);
      const cols = matrix.reduce((m, r) => Math.max(m, r.length), 1);
      const nb: RangeBounds = { r0: b.r0, c0: b.c0, r1: b.r0 + matrix.length - 1, c1: b.c0 + cols - 1 };
      st.setSelection({ sheet: st.selection.sheet, range: boundsToRange(nb) }, toAddress(b.r0, b.c0));
      ensureDims(nb.r1, nb.c1);
    } catch (err) {
      useUiStore.getState().notify(err instanceof Error ? err.message : String(err), "error");
    }
  };

  // ---- keyboard ----------------------------------------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const edNow = useEditStore.getState().editing;
    if (edNow && !edNow.hold) return;
    const mod = e.ctrlKey || e.metaKey;
    const st = useWorkbookStore.getState();
    const pageRows = Math.max(1, Math.floor(view.h / ROW_H) - 1);
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        return moveCursor(-1, 0, e.shiftKey, mod);
      case "ArrowDown":
        e.preventDefault();
        return moveCursor(1, 0, e.shiftKey, mod);
      case "ArrowLeft":
        e.preventDefault();
        return moveCursor(0, -1, e.shiftKey, mod);
      case "ArrowRight":
        e.preventDefault();
        return moveCursor(0, 1, e.shiftKey, mod);
      case "PageDown":
        e.preventDefault();
        return moveCursor(pageRows, 0, e.shiftKey);
      case "PageUp":
        e.preventDefault();
        return moveCursor(-pageRows, 0, e.shiftKey);
      case "Home":
        e.preventDefault();
        if (mod) return select({ row: 0, col: 0 }, { row: 0, col: 0 }), scrollIntoView(0, 0);
        return moveCursor(0, -anchorRef.current.col, e.shiftKey);
      case "Tab":
        e.preventDefault();
        return moveCursor(0, e.shiftKey ? -1 : 1, false);
      case "Enter":
        e.preventDefault();
        return moveCursor(e.shiftKey ? -1 : 1, 0, false);
      case "F2":
        e.preventDefault();
        return startEdit(null, "edit");
      case "Escape":
        clearClipboardMarquee();
        return;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        st.clearRange(st.selection.sheet, st.selection.range);
        return;
    }
    if (e.altKey && !mod && e.code === "Equal") {
      e.preventDefault();
      return autoSum();
    }
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if ((e.code === "KeyD" || e.code === "KeyR") && !e.shiftKey) {
        e.preventDefault();
        return fillSelection(e.code === "KeyD" ? "down" : "right");
      }
      if (e.code === "KeyV" && e.shiftKey && hasInternalClip()) {
        e.preventDefault();
        pasteInternal(true);
        return;
      }

      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        st.undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        st.redo();
      } else if (k === "a") {
        e.preventDefault();
        select({ row: 0, col: 0 }, { row: Math.max(0, (meta?.rows ?? 1) - 1), col: Math.max(0, (meta?.cols ?? 1) - 1) });
      }
      return;
    }
    // printable characters arrive through the textarea "input" event (handles dead keys / IME)
  };

  const onTextInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if ((e.nativeEvent as InputEvent).isComposing) return;
    const text = ta.value;
    ta.value = "";
    if (text && !useEditStore.getState().editing) startEdit(text, "enter");
  };
  const onCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const text = ta.value || e.data;
    ta.value = "";
    if (text && !useEditStore.getState().editing) startEdit(text, "enter");
  };

  // ---- mouse ----------------------------------------------------------------------------------
  const cellFromEvent = (clientX: number, clientY: number) => {
    const el = bodyRef.current!;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    const y = clientY - rect.top + el.scrollTop;
    const row = Math.max(0, Math.min(dims.rows - 1, Math.floor(y / ROW_H)));
    const col = Math.max(0, Math.min(dims.cols - 1, upperBound(colX, x) - 1));
    return { row, col };
  };

  const dragging = useRef(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-cell-editor]")) return;
    // compatibility mouse events after a tap: the touch handlers below already did the work
    if (touchedRecently()) return;
    const el = bodyRef.current!;
    // ignore clicks on scrollbars
    const rect = el.getBoundingClientRect();
    if (e.clientX - rect.left > el.clientWidth || e.clientY - rect.top > el.clientHeight) return;
    const pos = cellFromEvent(e.clientX, e.clientY);
    const ed = useEditStore.getState().editing;
    if (ed && e.button === 0 && canPoint()) {
      // Point mode: clicking / dragging inserts a reference into the edited formula
      e.preventDefault();
      const anchor = e.shiftKey && ed.point && ed.point.sheet === sheet ? ed.point.anchor : pos;
      pointTo(sheet, anchor, pos);
      const onMovePt = (ev: MouseEvent) => {
        const p = cellFromEvent(ev.clientX, ev.clientY);
        const cur = useEditStore.getState().editing?.point;
        if (cur && (p.row !== cur.focus.row || p.col !== cur.focus.col)) pointTo(sheet, cur.anchor, p);
        const r = el.getBoundingClientRect();
        if (ev.clientY > r.bottom - 10) el.scrollTop += ROW_H;
        else if (ev.clientY < r.top + 10) el.scrollTop -= ROW_H;
      };
      const onUpPt = () => {
        window.removeEventListener("mousemove", onMovePt);
        window.removeEventListener("mouseup", onUpPt);
      };
      window.addEventListener("mousemove", onMovePt);
      window.addEventListener("mouseup", onUpPt);
      return;
    }
    if (ed && !ed.hold && !commitEdit()) {
      e.preventDefault();
      return;
    }
    if (e.button === 2) {
      if (!inBounds(selBounds, pos.row, pos.col)) select(pos, pos);
      return;
    }
    e.preventDefault();
    focusGrid();
    if (e.shiftKey) select(anchorRef.current, pos);
    else select(pos, pos);
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const p = cellFromEvent(ev.clientX, ev.clientY);
      if (p.row !== focusRef.current.row || p.col !== focusRef.current.col) select(anchorRef.current, p);
      // auto-scroll near edges
      const r = el.getBoundingClientRect();
      if (ev.clientY > r.bottom - 10) el.scrollTop += ROW_H;
      else if (ev.clientY < r.top + 10) el.scrollTop -= ROW_H;
      if (ev.clientX > r.right - 10) el.scrollLeft += 30;
      else if (ev.clientX < r.left + 10) el.scrollLeft -= 30;
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-cell-editor]")) return;
    if (touchedRecently()) return;
    startEdit(null, "edit");
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (touchedRecently()) return; // touch: our own long-press opens the menu
    setMenu({ x: e.clientX, y: e.clientY });
  };

  // ---- touch ----------------------------------------------------------------------------------
  // Native (momentum) scrolling stays on; a tap selects, a tap on the selected cell edits,
  // a long-press (≈500 ms, ≤10 px of movement) opens the cell menu. While picking a range for a
  // dialog, dragging selects instead of scrolling.
  const touch = useRef<{ x: number; y: number; moved: boolean; long: boolean; range: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  useEffect(() => () => {
    if (touch.current?.timer) clearTimeout(touch.current.timer);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch" || !e.isPrimary) return;
    if ((e.target as HTMLElement).closest("[data-cell-editor]")) return;
    if (touch.current?.timer) clearTimeout(touch.current.timer);
    const x = e.clientX;
    const y = e.clientY;
    const st = { x, y, moved: false, long: false, range: picking, timer: null as ReturnType<typeof setTimeout> | null };
    touch.current = st;
    if (picking) {
      const pos = cellFromEvent(x, y);
      select(pos, pos);
      return;
    }
    st.timer = setTimeout(() => {
      st.timer = null;
      if (touch.current !== st || st.moved) return;
      st.long = true;
      if (useEditStore.getState().editing) commitEdit();
      const pos = cellFromEvent(x, y);
      if (!inBounds(selBounds, pos.row, pos.col)) select(pos, pos);
      navigator.vibrate?.(10);
      setMenu({ x, y });
    }, 500);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = touch.current;
    if (!st || e.pointerType !== "touch") return;
    if (st.range) {
      const p = cellFromEvent(e.clientX, e.clientY);
      if (p.row !== focusRef.current.row || p.col !== focusRef.current.col) select(anchorRef.current, p);
      return;
    }
    if (!st.moved && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 10) {
      st.moved = true;
      if (st.timer) clearTimeout(st.timer);
      st.timer = null;
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = touch.current;
    if (!st || e.pointerType !== "touch") return;
    touch.current = null;
    if (st.timer) clearTimeout(st.timer);
    if (st.range || st.moved || st.long) return;
    const pos = cellFromEvent(e.clientX, e.clientY);
    const editingNow = useEditStore.getState().editing;
    if (editingNow) commitEdit();
    const single = selBounds.r0 === selBounds.r1 && selBounds.c0 === selBounds.c1;
    const same = single && cursorPos.row === pos.row && cursorPos.col === pos.col && sheet === useWorkbookStore.getState().selection.sheet;
    if (same && !editingNow) {
      // focus synchronously inside the gesture so iOS shows the keyboard; the cell editor takes it over
      keyRef.current?.focus({ preventScroll: true });
      startEdit(null, "edit");
    } else select(pos, pos);
  };
  const onPointerCancel = () => {
    if (touch.current?.timer) clearTimeout(touch.current.timer);
    touch.current = null;
  };

  // ---- header interactions ----------------------------------------------------------------------
  const onColHeaderDown = (e: React.MouseEvent, col: number) => {
    e.preventDefault();
    focusGrid();
    const last = dims.rows - 1;
    if (e.shiftKey) select({ row: 0, col: anchorRef.current.col }, { row: last, col });
    else select({ row: 0, col }, { row: last, col });
  };
  const onRowHeaderDown = (e: React.MouseEvent, row: number) => {
    e.preventDefault();
    focusGrid();
    const last = dims.cols - 1;
    if (e.shiftKey) select({ row: anchorRef.current.row, col: 0 }, { row, col: last });
    else select({ row, col: 0 }, { row, col: last });
  };
  const onResizeStart = (e: React.MouseEvent, col: number) => {
    if (touchedRecently()) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colX[col + 1] - colX[col];
    let px = startW;
    const onMove = (ev: MouseEvent) => {
      px = Math.max(20, startW + ev.clientX - startX);
      setResizing({ col, px });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      useWorkbookStore.getState().setColWidth(sheet, col, px);
      setResizing(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ---- render ----------------------------------------------------------------------------------
  const selRect = {
    left: colX[selBounds.c0] ?? 0,
    top: selBounds.r0 * ROW_H,
    width: (colX[Math.min(selBounds.c1 + 1, dims.cols)] ?? 0) - (colX[selBounds.c0] ?? 0),
    height: (selBounds.r1 - selBounds.r0 + 1) * ROW_H,
  };
  const curRect = {
    left: colX[cursorPos.col] ?? 0,
    top: cursorPos.row * ROW_H,
    width: (colX[cursorPos.col + 1] ?? 0) - (colX[cursorPos.col] ?? 0),
    height: ROW_H,
  };
  const multi = selBounds.r1 > selBounds.r0 || selBounds.c1 > selBounds.c0;
  const geom: GridGeom = { colX, rowH: ROW_H, rows: dims.rows, cols: dims.cols, view: { r0: firstRow, r1: lastRow, c0: firstCol, c1: lastVisCol }, cellFromEvent };
  const editPos = editing && editing.sheet === sheet ? parseAddress(editing.address) : null;

  const colHeaders = [];
  for (let c = firstCol; c <= lastVisCol; c++) {
    const active = c >= selBounds.c0 && c <= selBounds.c1;
    colHeaders.push(
      <div
        key={c}
        className={clsx(
          "absolute top-0 flex h-full select-none items-center justify-center border-r border-slate-300 text-[11px] dark:border-slate-600",
          active ? "bg-blue-100 font-semibold text-blue-900 dark:bg-blue-900/60 dark:text-blue-100" : "text-slate-600 dark:text-slate-300",
        )}
        style={{ left: colX[c], width: colX[c + 1] - colX[c] }}
        onMouseDown={(e) => onColHeaderDown(e, c)}
      >
        {colLetters(c)}
        <div className="absolute right-[-3px] top-0 z-10 h-full w-[6px] cursor-col-resize" onMouseDown={(e) => onResizeStart(e, c)} />
      </div>,
    );
  }
  const rowHeaders = [];
  for (let r = firstRow; r <= lastRow; r++) {
    const active = r >= selBounds.r0 && r <= selBounds.r1;
    rowHeaders.push(
      <div
        key={r}
        className={clsx(
          "absolute left-0 flex w-full select-none items-center justify-end border-b border-slate-300 pr-1.5 text-[11px] tabular-nums dark:border-slate-600",
          active ? "bg-blue-100 font-semibold text-blue-900 dark:bg-blue-900/60 dark:text-blue-100" : "text-slate-600 dark:text-slate-300",
        )}
        style={{ top: r * ROW_H, height: ROW_H }}
        onMouseDown={(e) => onRowHeaderDown(e, r)}
      >
        {r + 1}
      </div>,
    );
  }

  if (!engine) {
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">{t("grid.noWorkbook")}</div>;
  }

  return (
    <div
      ref={rootRef}
      className="relative grid min-h-0 flex-1 bg-white text-[12.5px] text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      style={{ gridTemplateColumns: `${ROW_HEADER_W}px 1fr`, gridTemplateRows: `${HEADER_H}px 1fr` }}
    >
      {/* corner */}
      <button
        aria-label={t("grid.selectAll")}
        className="border-b border-r border-slate-300 bg-slate-100 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800"
        onMouseDown={(e) => {
          e.preventDefault();
          select({ row: 0, col: 0 }, { row: dims.rows - 1, col: dims.cols - 1 });
        }}
      />
      {/* column headers */}
      <div className="relative overflow-hidden border-b border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800">
        <div className="absolute top-0 h-full" style={{ width: totalW, transform: `translateX(${-scroll.left}px)` }}>
          {colHeaders}
        </div>
      </div>
      {/* row headers */}
      <div className="relative overflow-hidden border-r border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800">
        <div className="absolute left-0 w-full" style={{ height: totalH, transform: `translateY(${-scroll.top}px)` }}>
          {rowHeaders}
        </div>
      </div>
      {/* body */}
      <div
        ref={bodyRef}
        role="grid"
        aria-label={t("grid.ariaLabel", { sheet })}
        aria-rowcount={dims.rows}
        aria-colcount={dims.cols}
        className={clsx("relative select-none overflow-auto overscroll-contain outline-none [-webkit-touch-callout:none]", picking ? "touch-none" : "touch-manipulation")}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        <div
          className="relative"
          style={{
            width: totalW,
            height: totalH,
            backgroundImage: "linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)",
            backgroundSize: `100% ${ROW_H}px`,
            backgroundPosition: `0 ${ROW_H - 1}px`,
          }}
        >
          {/* vertical grid lines for visible columns */}
          {Array.from({ length: lastVisCol - firstCol + 1 }, (_, i) => firstCol + i).map((c) => (
            <div key={`v${c}`} className="pointer-events-none absolute top-0 w-px bg-[var(--grid-line)]" style={{ left: colX[c + 1] - 1, top: firstRow * ROW_H, height: (lastRow - firstRow + 1) * ROW_H }} />
          ))}
          {cells.map((c) => (
            <div
              key={c.key}
              title={c.title}
              className={clsx(
                "absolute overflow-hidden whitespace-pre px-[3px] leading-[21px]",
                c.overflow ? "z-[1]" : "",
                c.kinds ? "" : c.overflow ? "bg-white dark:bg-slate-950" : "",
                c.className,
                stepping && c.kinds?.includes("assumption") && "font-semibold",
              )}
              style={{ ...c.style, height: ROW_H - 1 }}
            >
              {c.text}
              {c.error && <span className="absolute left-0 top-0 h-0 w-0 border-r-[6px] border-t-[6px] border-r-transparent border-t-emerald-600" />}
              {c.kinds && <span className={clsx("absolute right-0 top-0 h-0 w-0 border-l-[7px] border-t-[7px] border-l-transparent", DEF_CLASSES[c.kinds[0]].marker)} />}
            </div>
          ))}
          {/* selection */}
          {multi && <div className="pointer-events-none absolute z-[2] border border-blue-600 bg-blue-500/10" style={selRect} />}
          <div className="pointer-events-none absolute z-[3] border-2 border-blue-700 dark:border-blue-400" style={{ ...curRect, left: curRect.left - 1, top: curRect.top - 1, width: curRect.width + 1, height: curRect.height + 1 }} />
          <CopyMarquee sheet={sheet} geom={geom} />
          <TraceArrows sheet={sheet} geom={geom} />
          {editing && <RefHighlights sheet={sheet} touch={isCoarsePointer()} geom={geom} />}
          {!editing && !picking && !isCoarsePointer() && (
            <FillHandle
              sel={selBounds}
              geom={geom}
              onFill={(dir, count) => {
                const res = fillRange(sheet, selBounds, dir, count, true);
                if (res) {
                  select({ row: res.r0, col: res.c0 }, { row: res.r1, col: res.c1 });
                  ensureDims(res.r1, res.c1);
                }
                focusGrid();
              }}
              onAutoFill={() => {
                fillDownToAdjacent();
                focusGrid();
              }}
            />
          )}
          {!editing && <ErrorBadge sheet={sheet} cursor={cursorPos} geom={geom} />}
          {editPos && editing && (
            <CellEditor
              left={colX[editPos.col] ?? 0}
              top={editPos.row * ROW_H}
              minWidth={(colX[editPos.col + 1] ?? 0) - (colX[editPos.col] ?? 0)}
            />
          )}
        </div>
      </div>
      <textarea
        ref={keyRef}
        data-grid-focus
        aria-label={t("grid.ariaLabel", { sheet })}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="pointer-events-none absolute h-4 w-4 resize-none overflow-hidden border-0 p-0 opacity-0 outline-none"
        style={{ left: ROW_HEADER_W + Math.max(0, curRect.left - scroll.left), top: HEADER_H + Math.max(0, curRect.top - scroll.top) }}
        onKeyDown={onKeyDown}
        onInput={onTextInput}
        onCompositionEnd={onCompositionEnd}
      />
      {menu && <CellContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
  );
}

function CellEditor({ left, top, minWidth }: { left: number; top: number; minWidth: number }) {
  const { t } = useTranslation();
  const editing = useEditStore((s) => s.editing)!;
  const lines = editing.text.split("\n");
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const width = Math.max(minWidth, Math.min(600, longest * 7.2 + 16));
  return (
    <FormulaInput
      variant="cell"
      ariaLabel={t("grid.cellEditor")}
      typo="px-[3px] py-0 text-[12.5px] leading-[19px]"
      className="z-[5] border-2 border-blue-700 bg-white shadow-md dark:bg-slate-900"
      style={{ position: "absolute", left: left - 1, top: top - 1, width: width + 1, height: Math.max(ROW_H + 1, lines.length * 19 + 4) }}
    />
  );
}
