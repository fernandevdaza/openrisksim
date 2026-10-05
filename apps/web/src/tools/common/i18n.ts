import { useTranslation } from "react-i18next";
import i18next, { type i18n as I18n } from "i18next";
import type { I18nText } from "@openrisksim/core";
import es from "../i18n/es.json";
import en from "../i18n/en.json";
import { useUiStore } from "../../store/ui";
import type { Locale } from "./format";

/** Adds the "tools" namespace to an i18next instance if the shell did not register it already. */
export function registerToolTranslations(instance: I18n): void {
  if (!instance.hasResourceBundle?.("es", "tools")) instance.addResourceBundle?.("es", "tools", es, true, false);
  if (!instance.hasResourceBundle?.("en", "tools")) instance.addResourceBundle?.("en", "tools", en, true, false);
}

if (i18next.isInitialized) registerToolTranslations(i18next);
else i18next.on?.("initialized", () => registerToolTranslations(i18next));

/** Translation + locale helpers for tool components. */
export function useToolsT() {
  const { t, i18n } = useTranslation("tools", { useSuspense: false });
  if (i18n?.isInitialized) registerToolTranslations(i18n);
  const uiLocale = useUiStore((s) => s.locale);
  const locale: Locale = uiLocale ?? (i18n?.language?.startsWith("en") ? "en" : "es");
  const L = (x: I18nText | undefined | null) => (x ? x[locale] ?? x.es : "");
  return { t, locale, L };
}
