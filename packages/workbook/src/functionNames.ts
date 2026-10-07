/**
 * Function names known to the formula engine (used by the UI for autocomplete, localisation and
 * validation of its function catalog).
 */
import { HyperFormula } from "hyperformula";
import { esES } from "hyperformula/i18n/languages";
import { ORS_FUNCTION_NAMES_ES, registerOrsFunctions } from "./orsFunctions";

/** English (canonical) name → Spanish name, from HyperFormula's es-ES pack plus the ORS functions. */
export const HF_FUNCTION_NAMES_ES: Readonly<Record<string, string>> = Object.freeze({
  ...(esES.functions as Record<string, string>),
  ...ORS_FUNCTION_NAMES_ES,
});

/** Canonical (English) names of every function the engine can evaluate (including ORS.*). */
export function registeredFunctionNames(): string[] {
  registerOrsFunctions();
  return HyperFormula.getRegisteredFunctionNames("enGB");
}
