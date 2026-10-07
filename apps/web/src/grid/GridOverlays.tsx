import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { parseRangeBounds, toAddress, type RangeBounds } from "../lib/a1";
import { explainError, localizeError } from "../lib/errorInfo";
import { fillExtent, fillTarget } from "../lib/fillSeries";
import { useUiStore } from "../store/ui";
import { useWorkbookStore } from "../store/workbook";
import { useClipStore } from "./sheetOps";
import { useTraceStore } from "./formulaActions";
import type { GridGeom } from "./RefHighlights";

function rectOf(b: RangeBounds, g: GridGeom) {
  const r1 = Math.min(b.r1, g.rows - 1);
  const c1 = Math.min(b.c1, g.cols - 1);
  const left = g.colX[b.c0] ?? 0;
  return { left, top: b.r0 * g.rowH, width: (g.colX[c1 + 1] ?? left) - left, height: (r1 - b.r0 + 1) * g.rowH };
}

/** Animated dashed border ("marching ants") around the copied / cut range. */
export function CopyMarquee({ sheet, geom }: { sheet: string; geom: GridGeom }) {
  const m = useClipStore((s) => s.marquee);
  if (!m || m.sheet !== sheet) return null;
  const r = rectOf(m.bounds, geom);
  return (
    <svg className="pointer-events-none absolute z-[4] overflow-visible" style={{ left: r.left - 1, top: r.top - 1, width: r.width + 1, height: r.height + 1 }} data-copy-marquee>
      <rect x="1" y="1" width={Math.max(0, r.width - 1)} height={Math.max(0, r.height - 1)} fill="none" stroke="#16a34a" strokeWidth="2" strokeDasharray="5 3" className="ors-ants" />
    </svg>
  );
}

/**
 * Fill handle: the small square at the bottom-right corner of the selection. Dragging previews the
 * target range; releasing calls `onFill`; double-click calls `onAutoFill` (fill down to the data).
 */
export function FillHandle({
  sel,
  geom,
  onFill,
  onAutoFill,
}: {
  sel: RangeBounds;
  geom: GridGeom;
  onFill: (dir: "down" | "up" | "right" | "left", count: number) => void;
  onAutoFill: () => void;
}) {
  const [preview, setPreview] = useState<RangeBounds | null>(null);
  const r = rectOf(sel, geom);
  const start = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    let last: { dir: "down" | "up" | "right" | "left"; count: number } | null = null;
    const onMove = (ev: MouseEvent) => {
      const p = geom.cellFromEvent(ev.clientX, ev.clientY);
      last = fillExtent(sel, p);
      if (!last) return setPreview(null);
      const t = fillTarget(sel, last.dir, last.count);
      setPreview({ r0: Math.min(sel.r0, Math.max(0, t.r0)), c0: Math.min(sel.c0, Math.max(0, t.c0)), r1: Math.max(sel.r1, t.r1), c1: Math.max(sel.c1, t.c1) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setPreview(null);
      if (last) onFill(last.dir, last.count);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const pr = preview ? rectOf(preview, geom) : null;
  return (
    <>
      {pr && <div className="pointer-events-none absolute z-[4] border-2 border-dashed border-slate-500" style={{ left: pr.left - 1, top: pr.top - 1, width: pr.width + 1, height: pr.height + 1 }} />}
      <div
        data-fill-handle
        title="↘"
        className="absolute z-[6] h-[7px] w-[7px] cursor-crosshair border border-white bg-blue-700 dark:border-slate-950 dark:bg-blue-400"
        style={{ left: r.left + r.width - 4, top: r.top + r.height - 4 }}
        onMouseDown={start}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAutoFill();
        }}
      />
    </>
  );
}

/** Excel-like trace arrows (precedents / dependents) on the active sheet. */
export function TraceArrows({ sheet, geom }: { sheet: string; geom: GridGeom }) {
  const edges = useTraceStore((s) => s.edges);
  if (!edges.length) return null;
  const center = (range: string) => {
    const b = parseRangeBounds(range);
    if (!b) return null;
    const r = rectOf({ ...b, r1: b.r0, c1: b.c0 }, geom);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, box: b.r1 > b.r0 || b.c1 > b.c0 ? rectOf(b, geom) : null };
  };
  const items = edges.map((e, i) => {
    const from = e.from.sheet === sheet ? center(e.from.range) : null;
    const to = e.to.sheet === sheet ? center(e.to.range) : null;
    if (!from && !to) return null;
    const color = "#1d4ed8";
    if (from && to) {
      return (
        <g key={i}>
          {from.box && <rect x={from.box.left} y={from.box.top} width={from.box.width} height={from.box.height} fill="none" stroke={color} strokeWidth="1.5" />}
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth="1.5" markerEnd="url(#ors-arrow)" />
          <circle cx={from.x} cy={from.y} r="3" fill={color} />
        </g>
      );
    }
    // other sheet: dashed arrow from/to a small sheet icon
    const p = (from ?? to)!;
    const ix = p.x - 46;
    const iy = p.y - 26;
    return (
      <g key={i}>
        <line x1={from ? p.x : ix + 8} y1={from ? p.y : iy + 6} x2={from ? ix + 8 : p.x} y2={from ? iy + 6 : p.y} stroke="#111827" strokeDasharray="4 3" strokeWidth="1.2" markerEnd="url(#ors-arrow-k)" />
        <rect x={ix} y={iy} width="16" height="12" fill="white" stroke="#111827" />
        <path d={`M${ix} ${iy + 4}h16M${ix} ${iy + 8}h16M${ix + 5} ${iy}v12M${ix + 10} ${iy}v12`} stroke="#111827" strokeWidth="0.6" />
        <title>{from ? `${e.to.sheet}!${e.to.range}` : `${e.from.sheet}!${e.from.range}`}</title>
      </g>
    );
  });
  const w = geom.colX[geom.cols] ?? 0;
  return (
    <svg className="pointer-events-none absolute left-0 top-0 z-[4]" width={w} height={geom.rows * geom.rowH} data-trace-arrows>
      <defs>
        <marker id="ors-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#1d4ed8" />
        </marker>
        <marker id="ors-arrow-k" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#111827" />
        </marker>
      </defs>
      {items}
    </svg>
  );
}

/** Small "!" next to the active cell when it holds an error; hover/click explains the cause. */
export function ErrorBadge({ sheet, cursor, geom }: { sheet: string; cursor: { row: number; col: number }; geom: GridGeom }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const version = useWorkbookStore((s) => s.version);
  const engine = useWorkbookStore((s) => s.engine);
  const info = useMemo(() => {
    try {
      return engine?.cellError({ sheet, address: toAddress(cursor.row, cursor.col) }) ?? null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, sheet, cursor.row, cursor.col, version]);
  if (!info) return null;
  const text = explainError(info, locale);
  const shown = localizeError(info.value, locale);
  const left = geom.colX[cursor.col] ?? 0;
  return (
    <button
      type="button"
      data-error-badge
      title={`${shown}: ${text}`}
      aria-label={t("grid.errorBadge", { error: shown })}
      className="absolute z-[6] flex h-[18px] w-[18px] items-center justify-center rounded-sm border border-amber-400 bg-amber-50 text-[12px] font-bold text-amber-700 shadow-sm hover:bg-amber-100 dark:border-amber-600 dark:bg-slate-800 dark:text-amber-300"
      style={{ left: Math.max(0, left - 21), top: cursor.row * geom.rowH + 2 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => useUiStore.getState().notify(`${shown}: ${text}`, "info")}
    >
      !
    </button>
  );
}
