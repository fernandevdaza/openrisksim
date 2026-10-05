import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import es from "./es.json";
import en from "./en.json";
// Tool translations (namespace "tools") are owned by the tools engineer.
import toolsEs from "../tools/i18n/es.json";
import toolsEn from "../tools/i18n/en.json";

export type Locale = "es" | "en";
const STORAGE_KEY = "openrisksim.locale";

export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language || "" : "";
  return nav.toLowerCase().startsWith("en") ? "en" : "es";
}

export function persistLocale(l: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* ignore */
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es, tools: toolsEs },
    en: { translation: en, tools: toolsEn },
  },
  lng: detectLocale(),
  fallbackLng: "es",
  ns: ["translation", "tools"],
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnNull: false,
});

if (typeof document !== "undefined") document.documentElement.lang = i18n.language;

export default i18n;
