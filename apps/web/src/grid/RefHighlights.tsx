import { useMemo } from "react";
import { formulaRefs, refColor } from "../lib/formulaTokens";
import type { CellPos, RangeBounds } from "../lib/a1";
import { useUiStore } from "../store/ui";
import { replaceRefBounds, useEditStore } from "./editState";

export interface GridGeom {
  colX: number[];
  rowH: number;
  rows: number;
  cols: number;
  /** visible window (inclusive) */
  view: RangeBounds;
  cellFromEvent: (x: number, y: number) => CellPos;
}

/**
 * Coloured boxes over the cells referenced by the formula being edited (active sheet only). The
 * box edges move the reference and the corners resize it (Excel). The pointed reference
 * (Point mode) gets a dashed border.
 */
export function RefHighlights({ sheet, geom, touch }: { sheet: string; geom: GridGeom; touch: boolean }) {
  const editing = useEditStore((s) => s.editing);
  const locale = useUiStore((s) => s.locale);
  const dark = useUiStore((s) => s.theme) === "dark";
  const text = editing?.text ?? "";
  const refs = useMemo(() => (text.startsWith("=") ? formulaRefs(text, locale) : []), [text, locale]);
  if (!editing || !refs.length) return null;
  const { colX, rowH, rows, cols, view } = geom;
  const lower = sheet.toLowerCase();
  return (
    <>
      {refs.map((r) => {
        const refSheet = (r.sheet ?? editing.sheet).toLowerCase();
        if (refSheet !== lower) return null;
        const b = { r0: r.bounds.r0, c0: r.bounds.c0, r1: Math.min(r.bounds.r1, rows - 1), c1: Math.min(r.bounds.c1, cols - 1) };
        if (b.r1 < view.r0 || b.r0 > view.r1 || b.c1 < view.c0 || b.c0 > view.c1) return null;
        const left = colX[b.c0] ?? 0;
        const top = b.r0 * rowH;
        const width = (colX[b.c1 + 1] ?? left) - left;
        const height = (b.r1 - b.r0 + 1) * rowH;
        const color = refColor(r.color, dark);
        const pointed = editing.point && editing.point.start === r.start;
        const resizable = !touch && (r.ref.kind === "cell" || r.ref.kind === "range");
        const startDrag = (e: React.MouseEvent, mode: "move" | "tl" | "tr" | "bl" | "br") => {
          e.preventDefault();
          e.stopPropagation();
          const startCell = geom.cellFromEvent(e.clientX, e.clientY);
          const orig = { ...r.bounds };
          const onMove = (ev: MouseEvent) => {
            const p = geom.cellFromEvent(ev.clientX, ev.clientY);
            let nb: RangeBounds;
            if (mode === "move") {
              const dr = Math.max(-orig.r0, p.row - startCell.row);
              const dc = Math.max(-orig.c0, p.col - startCell.col);
              nb = { r0: orig.r0 + dr, r1: orig.r1 + dr, c0: orig.c0 + dc, c1: orig.c1 + dc };
            } else {
              const fixed = { row: mode[0] === "t" ? orig.r1 : orig.r0, col: mode[1] === "l" ? orig.c1 : orig.c0 };
              nb = { r0: Math.min(fixed.row, p.row), r1: Math.max(fixed.row, p.row), c0: Math.min(fixed.col, p.col), c1: Math.max(fixed.col, p.col) };
            }
            replaceRefBounds(r.index, nb);
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        };
        const corner = (pos: "tl" | "tr" | "bl" | "br") => (
          <div
            key={pos}
            className="pointer-events-auto absolute h-[7px] w-[7px] border border-white"
            style={{
              background: color,
              cursor: pos === "tl" || pos === "br" ? "nwse-resize" : "nesw-resize",
              left: pos[1] === "l" ? -4 : undefined,
              right: pos[1] === "r" ? -4 : undefined,
              top: pos[0] === "t" ? -4 : undefined,
              bottom: pos[0] === "b" ? -4 : undefined,
            }}
            onMouseDown={(e) => startDrag(e, pos)}
          />
        );
        const edge = (side: "t" | "b" | "l" | "r") => (
          <div
            key={side}
            className="pointer-events-auto absolute cursor-move"
            style={side === "t" || side === "b" ? { left: 0, right: 0, height: 5, [side === "t" ? "top" : "bottom"]: -3 } : { top: 0, bottom: 0, width: 5, [side === "l" ? "left" : "right"]: -3 }}
            onMouseDown={(e) => startDrag(e, "move")}
          />
        );
        return (
          <div
            key={`${r.start}`}
            data-ref-highlight={r.text}
            className="pointer-events-none absolute z-[4]"
            style={{ left: left - 1, top: top - 1, width: width + 1, height: height + 1, border: `2px ${pointed ? "dashed" : "solid"} ${color}`, background: `${color}1f` }}
          >
            {resizable && (["t", "b", "l", "r"] as const).map(edge)}
            {resizable && (["tl", "tr", "bl", "br"] as const).map(corner)}
          </div>
        );
      })}
    </>
  );
}
