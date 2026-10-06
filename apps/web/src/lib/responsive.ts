/**
 * Responsive helpers shared by the shell.
 *
 * Breakpoints (match Tailwind's `md` / `lg`):
 *  - mobile  : < 768px  → phone layout (bottom navigation, full-screen sheets and dialogs)
 *  - compact : < 1024px → the model explorer becomes a slide-over drawer (tablets reuse the desktop ribbon)
 */
import { useSyncExternalStore } from "react";

export const MOBILE_QUERY = "(max-width: 767px)";
export const COMPACT_QUERY = "(max-width: 1023px)";

function mq(query: string): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
}

export function matches(query: string): boolean {
  return mq(query)?.matches ?? false;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = mq(query);
      if (!m) return () => {};
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matches(query),
    () => false,
  );
}

export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
export const useIsCompact = () => useMediaQuery(COMPACT_QUERY);

/** Last time a touch pointer went down anywhere (used to tell real mouse events from touch-compat ones). */
let lastTouchAt = 0;
if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "touch" || e.pointerType === "pen") lastTouchAt = Date.now();
    },
    { capture: true, passive: true },
  );
}

/** True right after a touch (compatibility mouse events follow a tap by a few hundred ms). */
export function touchedRecently(ms = 800): boolean {
  return Date.now() - lastTouchAt < ms;
}

/** Touch-first device (phones/tablets): the hidden keyboard textarea must not grab focus there, or the on-screen keyboard pops up. */
export function isCoarsePointer(): boolean {
  return matches("(pointer: coarse)") || touchedRecently(1500);
}
