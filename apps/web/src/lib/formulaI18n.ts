/**
 * Formula localisation (Excel in Spanish ↔ engine syntax).
 *
 * The engine (HyperFormula, like the .xlsx format) stores English function names, `,` as the
 * argument separator and `.` as the decimal separator. Students type Excel-es formulas
 * (`=SUMA(A1:A3;2,5)`, `=VNA(B1;C2:C9)`), so:
 *  - `toEngineFormula` turns what the user typed (in the UI locale) into engine syntax;
 *  - `toDisplayFormula` shows an engine formula in the UI locale (Spanish names and `;` in es).
 *
 * Names come from the function catalog (official Excel-es names) with HyperFormula's es-ES pack as
 * fallback for functions the catalog does not list, plus a few common aliases.
 */
import { HF_FUNCTION_NAMES_ES, registeredFunctionNames } from "@openrisksim/workbook";
import { FUNCTION_CATALOG } from "./functionCatalog";
import { stripFnPrefix, tokenize, type Locale } from "./formulaTokens";
import { ERR_ES_TO_EN, localizeError } from "./errorInfo";

export { localizeError };

/** Extra Spanish spellings accepted on input (accents, older Excel names). */
const ES_ALIASES: Record<string, string> = {
  "DÍAS": "DAYS",
  "DÍA": "DAY",
  ANO: "YEAR",
  "ÍNDICE": "INDEX",
  "RAÍZ": "SQRT",
  "SUMA.PRODUCTO": "SUMPRODUCT",
  "PRONÓSTICO": "FORECAST",
  "PRONOSTICO": "FORECAST",
  "PRONOSTICO.LINEAL": "FORECAST.LINEAR",
  "JERARQUIA": "RANK",
  "JERARQUIA.EQV": "RANK.EQ",
  "MODA": "MODE",
  "MODA.UNO": "MODE.SNGL",
  "INTERSECCION.EJE": "INTERCEPT",
  "TENDENCIA": "TREND",
  "CRECIMIENTO": "GROWTH",
  "ESTIMACION.LINEAL": "LINEST",
  "PROMEDIO.SI.CONJUNTO": "AVERAGEIFS",
  "DVS": "VDB",
  CONCAT: "CONCAT",
  "NORMALIZACIÓN": "STANDARDIZE",
};

let EN_SET: Set<string> | null = null;
let ES_TO_EN: Map<string, string> | null = null;
let EN_TO_ES: Map<string, string> | null = null;

function tables() {
  if (!EN_SET || !ES_TO_EN || !EN_TO_ES) {
    EN_SET = new Set(registeredFunctionNames());
    EN_TO_ES = new Map();
    ES_TO_EN = new Map();
    for (const [en, es] of Object.entries(HF_FUNCTION_NAMES_ES)) {
      EN_TO_ES.set(en, es);
      ES_TO_EN.set(es.toUpperCase(), en);
    }
    for (const [es, en] of Object.entries(ES_ALIASES)) ES_TO_EN.set(es, en);
    // the catalog (official Excel names) wins over the fallbacks
    for (const f of FUNCTION_CATALOG) {
      EN_TO_ES.set(f.en, f.es);
      ES_TO_EN.set(f.es.toUpperCase(), f.en);
    }
  }
  return { EN_SET, ES_TO_EN, EN_TO_ES };
}

/** Canonical (English) name of a function typed in English or Spanish, or null if unknown. */
export function canonicalFunctionName(name: string): string | null {
  const { EN_SET, ES_TO_EN } = tables();
  const up = stripFnPrefix(name).toUpperCase();
  if (EN_SET.has(up)) return up;
  return ES_TO_EN.get(up) ?? null;
}

/** Localised name of a canonical (English) function name. */
export function localFunctionName(en: string, locale: Locale): string {
  const up = stripFnPrefix(en).toUpperCase();
  if (locale === "en") return up;
  return tables().EN_TO_ES.get(up) ?? up;
}

/** Every function the engine knows (canonical names). */
export function engineFunctionNames(): string[] {
  return [...tables().EN_SET];
}

/**
 * What the user typed (UI locale) → engine syntax: English function names (Spanish ones and
 * `_xlfn.` prefixes accepted), `,` separators, `.` decimals, TRUE/FALSE and English error values.
 */
export function toEngineFormula(text: string, locale: Locale): string {
  if (!text.startsWith("=")) return text;
  const { EN_SET, ES_TO_EN } = tables();
  let out = "";
  for (const t of tokenize(text, locale)) {
    switch (t.type) {
      case "func": {
        const name = stripFnPrefix(t.text);
        const up = name.toUpperCase();
        out += EN_SET.has(up) ? name : (ES_TO_EN.get(up) ?? name);
        break;
      }
      case "sep":
        out += ",";
        break;
      case "number":
        out += t.text.replace(",", ".");
        break;
      case "bool": {
        const up = t.text.toUpperCase();
        out += up === "VERDADERO" ? "TRUE" : up === "FALSO" ? "FALSE" : t.text;
        break;
      }
      case "error":
        out += ERR_ES_TO_EN[t.text.toUpperCase()] ?? t.text;
        break;
      default:
        out += t.text;
    }
  }
  return out;
}

/** Engine formula → UI locale (Spanish names, `;` separators and decimal commas in es). */
export function toDisplayFormula(formula: string, locale: Locale): string {
  if (!formula.startsWith("=")) return formula;
  const { EN_TO_ES } = tables();
  let out = "";
  for (const t of tokenize(formula, "en")) {
    switch (t.type) {
      case "func": {
        const name = stripFnPrefix(t.text);
        out += locale === "es" ? (EN_TO_ES.get(name.toUpperCase()) ?? name) : name;
        break;
      }
      case "sep":
        out += locale === "es" ? ";" : ",";
        break;
      case "number":
        out += locale === "es" ? t.text.replace(".", ",") : t.text;
        break;
      case "bool": {
        const up = t.text.toUpperCase();
        out += locale === "es" ? (up === "TRUE" ? "VERDADERO" : up === "FALSE" ? "FALSO" : t.text) : t.text;
        break;
      }
      case "error":
        out += localizeError(t.text, locale);
        break;
      default:
        out += t.text;
    }
  }
  return out;
}

/** Translate Spanish function names (and `;`) to engine syntax. Kept for backwards compatibility. */
export function translateFormulaToEnglish(formula: string): string {
  return toEngineFormula(formula, "en");
}
