/**
 * Shared UI primitives. Keep them small and dependency-free (Tailwind classes only).
 * Both the shell and the tools use these — change signatures only with care.
 */
import { useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

export { Chart } from "./Chart";
export type { ChartProps } from "./Chart";
export { RangeInput, resolveRangeRef, readRangeNumbers, formatRangeRef } from "./RangeInput";
export { clsx };

type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        // phones: comfortable touch targets (≥ 36/40px)
        size === "sm" ? "px-2 py-1 text-xs max-md:min-h-9 max-md:px-3 max-md:text-sm" : "px-3 py-1.5 text-sm max-md:min-h-10 max-md:px-4",
        variant === "primary" && "bg-blue-700 text-white hover:bg-blue-800",
        variant === "secondary" && "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
        variant === "ghost" && "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        className,
      )}
      {...rest}
    />
  );
}

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(inputCls, className)} {...rest} />;
}

/** Number input that accepts "," or "." decimals and only commits valid numbers. */
export function NumberInput({
  value,
  onChange,
  step,
  min,
  max,
  className,
  disabled,
}: {
  value: number | null | undefined;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const { i18n } = useTranslation();
  const comma = decimalCommaLocale(i18n.language);
  const shown = text ?? (value == null || Number.isNaN(value) ? "" : comma ? String(value).replace(".", ",") : String(value));
  return (
    <input
      inputMode="decimal"
      className={clsx(inputCls, "text-right tabular-nums", className)}
      value={shown}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseNumberInput(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setText(null)}
    />
  );
}

/** Locales that write decimals with a comma (es, pt, fr, de, it…). */
export function decimalCommaLocale(lang: string | undefined): boolean {
  return /^(es|pt|fr|de|it|nl|ru|tr|pl)/i.test(lang ?? "");
}

/**
 * Parses what a user typed in a number field, accepting either decimal separator:
 * "12,5", "12.5", "1.234,5", "1,234.5", "-3e4". Returns NaN for empty/invalid input.
 */
export function parseNumberInput(raw: string): number {
  let s = raw.trim().replace(/\s|%$/g, "");
  if (s === "") return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // the separator that appears last is the decimal one
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  }
  return Number(s);
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select className={clsx(inputCls, className)} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("flex flex-col gap-1 text-sm", className)}>
      <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx("no-scrollbar-mobile flex gap-1 border-b border-slate-200 dark:border-slate-700 max-md:overflow-x-auto max-md:overflow-y-hidden", className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={clsx(
            "-mb-px border-b-2 px-3 py-1.5 text-sm max-md:shrink-0 max-md:whitespace-nowrap max-md:py-2.5",
            t.id === value
              ? "border-blue-700 font-semibold text-blue-800 dark:text-blue-300"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Simple data table. `format` per column for numbers. */
export function Table({
  columns,
  rows,
  className,
  maxHeight,
}: {
  columns: { key: string; label: ReactNode; align?: "left" | "right" | "center"; format?: (v: unknown) => ReactNode }[];
  rows: Record<string, unknown>[];
  className?: string;
  maxHeight?: number;
}) {
  return (
    <div className={clsx("overflow-auto rounded-md border border-slate-200 dark:border-slate-700", className)} style={{ maxHeight }}>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={clsx("px-2 py-1.5 font-semibold", c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 odd:bg-white even:bg-slate-50 dark:border-slate-800 dark:odd:bg-slate-900 dark:even:bg-slate-900/60">
              {columns.map((c) => (
                <td key={c.key} className={clsx("px-2 py-1 tabular-nums", c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left")}>
                  {c.format ? c.format(r[c.key]) : (r[c.key] as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Modal window. `size` controls max width. Rendered by the shell for tools; usable for dialogs too. */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = "md",
  mobile = "full",
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Phones (< 768px): "full" = full-screen sheet (default), "card" = keep a centred card (short confirmations). */
  mobile?: "full" | "card";
}) {
  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" }[size];
  const full = mobile === "full";
  return (
    <div className={clsx("ors-modal fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4", full && "max-md:p-0")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={clsx(
          "flex max-h-[92vh] w-full flex-col rounded-lg bg-white shadow-2xl dark:bg-slate-900",
          // phones: full-screen sheet (header and footer stay put, the body scrolls)
          full && "ors-modal-full max-md:h-full max-md:max-h-none max-md:max-w-none max-md:rounded-none max-md:shadow-none",
          w,
        )}
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !e.defaultPrevented) {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700 max-md:min-h-12 max-md:py-1.5 max-md:pl-3 max-md:pr-1 max-md:pt-[max(0.375rem,env(safe-area-inset-top))]">
          <h2 className="min-w-0 truncate text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 max-md:flex max-md:h-10 max-md:w-10 max-md:items-center max-md:justify-center max-md:text-lg"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className={clsx("min-h-0 flex-1 overflow-auto p-4 max-md:px-3 max-md:overscroll-contain", !footer && "max-md:pb-[max(1rem,env(safe-area-inset-bottom))]")}>{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-2.5 dark:border-slate-700 max-md:px-3 max-md:pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Number formatting helpers shared by tools. */
export function fmtNum(v: number, digits = 2, locale = "es"): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (!Number.isFinite(v)) return v > 0 ? "∞" : "−∞";
  return v.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
export function fmtPct(v: number, digits = 1, locale = "es"): string {
  if (v == null || Number.isNaN(v)) return "—";
  return (v * 100).toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }) + " %";
}
