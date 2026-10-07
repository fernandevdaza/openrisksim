import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { clsx } from "../components/ui";
import { useUiStore } from "../store/ui";
import { useWorkbookStore } from "../store/workbook";
import { functionCompletions, rankCompletions, type Completion } from "../lib/autocomplete";
import { caretContext } from "../lib/formulaTokens";
import { catalogEntry } from "../lib/functionCatalog";
import { canonicalFunctionName } from "../lib/formulaI18n";
import { canPoint, commitEdit, cycleRefAtCaret, focusEditor, focusGridKeys, pointMove, useEditStore } from "./editState";
import { highlightFormula } from "./formulaHighlight";
import { openInsertFunction } from "./formulaActions";
import { EditorPopups, type SignatureInfo } from "./EditorPopups";

const MOVES: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
let measureCtx: CanvasRenderingContext2D | null = null;

/**
 * Formula editor used by the in-cell editor and the formula bar: a transparent textarea over a
 * coloured copy of the text, with autocomplete, argument tooltip, F4, Point-mode arrows and the
 * Excel commit keys.
 */
export function FormulaInput({
  variant,
  idleText = "",
  typo,
  className,
  style,
  wrap = false,
  disabled,
  ariaLabel,
}: {
  variant: "cell" | "bar";
  idleText?: string;
  typo: string;
  className?: string;
  style?: CSSProperties;
  wrap?: boolean;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const editing = useEditStore((s) => s.editing);
  const locale = useUiStore((s) => s.locale);
  const dark = useUiStore((s) => s.theme) === "dark";
  const version = useWorkbookStore((s) => s.version);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState("");
  const mine = !!editing && editing.source === variant;
  const text = editing ? editing.text : idleText;

  // push programmatic caret changes into the DOM
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el || !editing || editing.source !== variant) return;
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    if (el.selectionStart !== editing.caret || el.selectionEnd !== editing.caretEnd) el.setSelectionRange(Math.min(editing.caret, editing.caretEnd), Math.max(editing.caret, editing.caretEnd));
    syncScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.selNonce, editing?.source, editing?.address]);

  const syncScroll = () => {
    const el = taRef.current;
    const hl = hlRef.current;
    if (el && hl) {
      hl.scrollTop = el.scrollTop;
      hl.scrollLeft = el.scrollLeft;
    }
  };

  // ---- assistance: autocomplete + argument tooltip
  const names = useMemo<Completion[]>(() => {
    try {
      return (useWorkbookStore.getState().engine?.listNames() ?? []).map((n) => ({ kind: "name", label: n.name, en: n.name }));
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  const active = mine && focused && !!editing && editing.text.startsWith("=");
  const ctx = useMemo(() => (active && editing ? caretContext(editing.text, editing.caret, locale) : null), [active, editing, locale]);
  const key = editing ? `${editing.text}|${editing.caret}` : "";
  const items = useMemo(() => {
    if (!ctx?.ident || dismissed === key) return [];
    return rankCompletions(ctx.ident.text, [...functionCompletions(locale), ...names]);
  }, [ctx, dismissed, key, locale, names]);
  const identText = ctx?.ident?.text ?? "";
  useLayoutEffect(() => setIndex(0), [identText]);
  const signature = useMemo<SignatureInfo | null>(() => {
    if (!ctx?.fn) return null;
    const fn = catalogEntry(canonicalFunctionName(ctx.fn.name) ?? "");
    return fn ? { fn, argIndex: ctx.fn.argIndex } : null;
  }, [ctx]);

  const caretX = useMemo(() => {
    const el = taRef.current;
    if (!el || !editing || !mine) return 0;
    measureCtx ??= document.createElement("canvas").getContext("2d");
    if (!measureCtx) return 0;
    const cs = getComputedStyle(el);
    measureCtx.font = `${cs.fontSize} ${cs.fontFamily}`;
    const before = editing.text.slice(0, ctx?.ident?.start ?? editing.caret);
    const line = before.slice(before.lastIndexOf("\n") + 1);
    return Math.max(0, Math.min(el.clientWidth - 40, measureCtx.measureText(line).width + parseFloat(cs.paddingLeft) - el.scrollLeft));
  }, [editing, mine, ctx]);

  const accept = (i: number) => {
    const ed = useEditStore.getState().editing;
    const it = items[i];
    if (!ed || !it || !ctx?.ident) return;
    const ins = it.kind === "fn" ? `${it.label}(` : it.label;
    const t = ed.text.slice(0, ctx.ident.start) + ins + ed.text.slice(ctx.ident.end);
    useEditStore.getState().replace(t, ctx.ident.start + ins.length, undefined, null);
  };

  const startIfIdle = (value: string, caret: number) => {
    if (useEditStore.getState().editing) return;
    const st = useWorkbookStore.getState();
    useEditStore.getState().start({ sheet: st.activeSheet, address: st.cursor, text: value, mode: "edit", source: "bar", caret, caretEnd: caret });
  };

  const commit = (move?: [number, number], all = false) => {
    if (commitEdit({ move, all })) focusGridKeys();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    const ed = useEditStore.getState().editing;
    if (!ed) return;
    const mod = e.ctrlKey || e.metaKey;
    if (items.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !mod && !e.altKey)) {
        e.preventDefault();
        accept(index);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(key);
        return;
      }
    }
    if (e.key === "Enter" && e.altKey) {
      e.preventDefault();
      const s = ed.caret;
      useEditStore.getState().replace(ed.text.slice(0, s) + "\n" + ed.text.slice(ed.caretEnd), s + 1, s + 1, null);
      return;
    }
    if (mod && e.shiftKey && e.code === "KeyU") {
      e.preventDefault();
      useUiStore.getState().setFormulaBarExpanded(!useUiStore.getState().formulaBarExpanded);
      return;
    }
    if (e.key === "F3" && e.shiftKey) {
      e.preventDefault();
      openInsertFunction();
      return;
    }
    switch (e.key) {
      case "F4":
        e.preventDefault();
        cycleRefAtCaret();
        return;
      case "F2":
        e.preventDefault();
        useEditStore.getState().patch({ mode: ed.mode === "enter" ? "edit" : "enter", point: null });
        return;
      case "Enter":
        e.preventDefault();
        return mod ? commit(undefined, true) : commit([e.shiftKey ? -1 : 1, 0]);
      case "Tab":
        e.preventDefault();
        return commit([0, e.shiftKey ? -1 : 1]);
      case "Escape":
        e.preventDefault();
        useEditStore.getState().cancel();
        focusGridKeys();
        return;
    }
    const mv = MOVES[e.key];
    if (mv && ed.mode === "enter" && !mod && !e.altKey) {
      e.preventDefault();
      if (ed.text.startsWith("=") && canPoint()) pointMove(mv[0], mv[1], e.shiftKey);
      else commit(mv);
    }
  };

  return (
    <div className={clsx("relative", className)} style={style}>
      <div ref={hlRef} aria-hidden className={clsx(typo, "ors-formula-hl pointer-events-none absolute inset-0 overflow-hidden text-slate-900 dark:text-slate-100", wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre")}>
        {highlightFormula(text, locale, dark)}
        {"​"}
      </div>
      <textarea
        ref={taRef}
        {...(variant === "cell" ? { "data-cell-editor": "" } : { "data-formula-input": "" })}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        disabled={disabled}
        rows={1}
        wrap={wrap ? "soft" : "off"}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={clsx(typo, "absolute inset-0 h-full w-full resize-none border-0 bg-transparent text-transparent caret-slate-900 outline-none selection:bg-blue-300/50 dark:caret-slate-100", wrap ? "overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all" : "overflow-hidden whitespace-pre")}
        value={text}
        onFocus={(e) => {
          setFocused(true);
          if (variant === "bar") {
            const ed = useEditStore.getState().editing;
            if (!ed) startIfIdle(idleText, e.currentTarget.selectionStart ?? idleText.length);
            else if (ed.source !== "bar") useEditStore.getState().patch({ source: "bar", mode: "edit" });
          }
        }}
        onChange={(e) => {
          const el = e.currentTarget;
          if (!useEditStore.getState().editing) startIfIdle(el.value, el.selectionStart);
          useEditStore.getState().setText(el.value, el.selectionStart, el.selectionEnd);
          syncScroll();
        }}
        onSelect={(e) => {
          const el = e.currentTarget;
          if (useEditStore.getState().editing?.source === variant) useEditStore.getState().setCaret(el.selectionStart, el.selectionEnd);
          syncScroll();
        }}
        onScroll={syncScroll}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          setFocused(false);
          const next = e.relatedTarget as HTMLElement | null;
          if (next?.closest("[data-cell-editor],[data-formula-input],[data-keep-edit]")) return;
          const ed = useEditStore.getState().editing;
          if (!ed || ed.hold || ed.source !== variant) return;
          if (!commitEdit()) requestAnimationFrame(focusEditor);
        }}
      />
      {mine && <EditorPopups anchor={focused ? taRef.current : null} caretX={caretX} locale={locale} error={editing?.error ?? null} items={items} index={index} onPick={accept} onHover={setIndex} signature={signature} />}
    </div>
  );
}
