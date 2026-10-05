import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardPaste, Copy, Dices, Eraser, SlidersHorizontal, Target, Trash2 } from "lucide-react";
import { actions } from "../actions";
import { useUiStore } from "../store/ui";
import { useWorkbookStore } from "../store/workbook";

export function CellContextMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const hasClip = useUiStore((s) => s.defClipboard !== null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) });
  }, [x, y]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const item = (icon: React.ReactNode, label: string, fn: () => void, disabled = false) => (
    <button
      role="menuitem"
      disabled={disabled}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-blue-50 disabled:opacity-40 dark:hover:bg-slate-700"
      onClick={() => {
        onClose();
        fn();
      }}
    >
      <span className="w-4 text-slate-500 dark:text-slate-400">{icon}</span>
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[60] min-w-56 rounded-md border border-slate-200 bg-white py-1 text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {item(<Dices size={15} className="text-green-600" />, t("sim.defineAssumption"), actions.defineAssumption)}
      {item(<Target size={15} className="text-blue-600" />, t("sim.defineForecast"), actions.defineForecast)}
      {item(<SlidersHorizontal size={15} className="text-yellow-600" />, t("sim.defineDecision"), actions.defineDecision)}
      <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
      {item(<Copy size={15} />, t("sim.copyDef"), actions.copyDefinition)}
      {item(<ClipboardPaste size={15} />, t("sim.pasteDef"), actions.pasteDefinition, !hasClip)}
      {item(<Trash2 size={15} />, t("sim.deleteDef"), actions.deleteDefinitions)}
      <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
      {item(<Eraser size={15} />, t("grid.clearContents"), () => {
        const st = useWorkbookStore.getState();
        st.clearRange(st.selection.sheet, st.selection.range);
      })}
    </div>
  );
}
