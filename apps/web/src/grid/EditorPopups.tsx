import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleAlert } from "lucide-react";
import { clsx } from "../components/ui";
import type { Completion } from "../lib/autocomplete";
import { declaredArgIndex, signatureParts, type FnInfo } from "../lib/functionCatalog";
import type { Locale } from "../lib/formulaTokens";

export interface SignatureInfo {
  fn: FnInfo;
  argIndex: number;
}

/** Autocomplete list, argument tooltip and syntax-error message shown under the formula editor. */
export function EditorPopups({
  anchor,
  caretX,
  locale,
  error,
  items,
  index,
  onPick,
  onHover,
  signature,
}: {
  anchor: HTMLElement | null;
  caretX: number;
  locale: Locale;
  error: string | null;
  items: Completion[];
  index: number;
  onPick: (i: number) => void;
  onHover: (i: number) => void;
  signature: SignatureInfo | null;
}) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const update = () => {
      const r = anchor.getBoundingClientRect();
      const left = Math.max(4, Math.min(r.left + caretX, window.innerWidth - 340));
      setPos((p) => (p && p.left === left && p.top === r.bottom + 2 ? p : { left, top: r.bottom + 2 }));
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor, caretX]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index, items]);

  if (!anchor || !pos || (!error && !items.length && !signature)) return null;
  const active = items[index];
  return createPortal(
    <div data-keep-edit className="fixed z-[65] flex max-w-[340px] flex-col gap-1 text-[12px]" style={{ left: pos.left, top: pos.top }} onMouseDown={(e) => e.preventDefault()}>
      {error && (
        <div role="alert" className="flex items-start gap-1.5 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-red-800 shadow-lg dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <CircleAlert size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {!error && signature && !items.length && <SignatureTip sig={signature} locale={locale} />}
      {!error && items.length > 0 && (
        <div role="listbox" aria-label="functions" className="overflow-hidden rounded border border-slate-300 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-800">
          <div ref={listRef} className="max-h-56 overflow-auto py-0.5">
            {items.map((c, i) => (
              <div
                key={`${c.kind}:${c.label}`}
                data-idx={i}
                role="option"
                aria-selected={i === index}
                className={clsx("flex cursor-default items-center gap-2 px-2 py-0.5 font-mono", i === index ? "bg-blue-600 text-white" : "text-slate-800 hover:bg-blue-50 dark:text-slate-100 dark:hover:bg-slate-700")}
                onMouseEnter={() => onHover(i)}
                onClick={() => onHover(i)}
                onDoubleClick={() => onPick(i)}
              >
                <span className={clsx("w-4 shrink-0 text-center text-[10px]", i === index ? "text-blue-100" : "text-slate-400")}>{c.kind === "fn" ? "fx" : "N"}</span>
                {c.label}
              </div>
            ))}
          </div>
          {active?.desc && <div className="border-t border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{active.desc[locale]}</div>}
        </div>
      )}
    </div>,
    document.body,
  );
}

function SignatureTip({ sig, locale }: { sig: SignatureInfo; locale: Locale }) {
  const cur = declaredArgIndex(sig.fn, sig.argIndex);
  const arg = cur >= 0 ? sig.fn.args[cur] : undefined;
  return (
    <div role="tooltip" className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-slate-800 shadow-lg dark:border-amber-700 dark:bg-slate-800 dark:text-slate-100">
      <div className="font-mono">
        {signatureParts(sig.fn, locale).map((p, i) => (
          <span key={i} className={p.arg >= 0 && p.arg === cur ? "font-bold" : undefined}>
            {p.text}
          </span>
        ))}
      </div>
      {arg && (
        <div className="mt-0.5 text-[11.5px] text-slate-600 dark:text-slate-300">
          <b>{locale === "es" ? arg.es : arg.en}</b>: {arg.d[locale]}
        </div>
      )}
    </div>
  );
}
