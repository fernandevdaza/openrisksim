/**
 * HyperFormula plugin with OpenRiskSim functions (`ORS.*`), similar to Risk Simulator's `RS*` or
 * @RISK's `Risk*` functions. In normal recalculation the distribution functions return the
 * distribution mean; during a simulation the assumption cell is overwritten with sampled values.
 */
import { CellError, ErrorType, FunctionArgumentType, FunctionPlugin, HyperFormula } from "hyperformula";
import { esES } from "hyperformula/i18n/languages";
import { discountedPaybackPeriod, mirr, paybackPeriod, profitabilityIndex } from "@openrisksim/finance";

const N = FunctionArgumentType.NUMBER;
const R = FunctionArgumentType.RANGE;

type Ast = { args: unknown[] };
type State = unknown;
type RangeArg = { valuesFromTopLeftCorner(): unknown[] };

function num(x: number): number | CellError {
  return Number.isFinite(x) ? x : new CellError(ErrorType.NUM);
}

export class OrsPlugin extends FunctionPlugin {
  static override implementedFunctions = {
    "ORS.NORMAL": { method: "orsNormal", parameters: [{ argumentType: N }, { argumentType: N, minValue: 0 }] },
    "ORS.TRIANGULAR": { method: "orsTriangular", parameters: [{ argumentType: N }, { argumentType: N }, { argumentType: N }] },
    "ORS.UNIFORM": { method: "orsUniform", parameters: [{ argumentType: N }, { argumentType: N }] },
    "ORS.PERT": { method: "orsPert", parameters: [{ argumentType: N }, { argumentType: N }, { argumentType: N }] },
    "ORS.LOGNORMAL": { method: "orsLognormal", parameters: [{ argumentType: N, greaterThan: 0 }, { argumentType: N, minValue: 0 }] },
    "ORS.MIRR": { method: "orsMirr", parameters: [{ argumentType: R }, { argumentType: N }, { argumentType: N }] },
    "ORS.PAYBACK": { method: "orsPayback", parameters: [{ argumentType: R }] },
    "ORS.DPAYBACK": { method: "orsDpayback", parameters: [{ argumentType: N }, { argumentType: R }] },
    "ORS.PI": { method: "orsPi", parameters: [{ argumentType: N }, { argumentType: R }] },
  };

  private rangeNumbers(range: RangeArg): number[] | CellError {
    const vals = range.valuesFromTopLeftCorner();
    const out: number[] = [];
    for (const v of vals) {
      if (v instanceof CellError) return v;
      if (typeof v === "number") out.push(v);
      else if (v && typeof v === "object" && typeof (v as { val?: unknown }).val === "number") out.push((v as { val: number }).val); // ExtendedNumber
    }
    return out;
  }

  orsNormal(ast: Ast, state: State): unknown {
    return this.runFunction(ast.args as never, state as never, this.metadata("ORS.NORMAL"), (mean: number) => mean);
  }

  orsTriangular(ast: Ast, state: State): unknown {
    return this.runFunction(ast.args as never, state as never, this.metadata("ORS.TRIANGULAR"), (min: number, mode: number, max: number) =>
      min <= mode && mode <= max ? (min + mode + max) / 3 : new CellError(ErrorType.NUM),
    );
  }

  orsUniform(ast: Ast, state: State): unknown {
    return this.runFunction(ast.args as never, state as never, this.metadata("ORS.UNIFORM"), (min: number, max: number) =>
      min <= max ? (min + max) / 2 : new CellError(ErrorType.NUM),
    );
  }

  orsPert(ast: Ast, state: State): unknown {
    return this.runFunction(ast.args as never, state as never, this.metadata("ORS.PERT"), (min: number, mode: number, max: number) =>
      min <= mode && mode <= max ? (min + 4 * mode + max) / 6 : new CellError(ErrorType.NUM),
    );
  }

  orsLognormal(ast: Ast, state: State): unknown {
    return this.runFunction(ast.args as never, state as never, this.metadata("ORS.LOGNORMAL"), (mean: number) => mean);
  }

  orsMirr(ast: Ast, state: State): unknown {
    return this.runFunction(ast.args as never, state as never, this.metadata("ORS.MIRR"), (range: RangeArg, fin: number, rein: number) => {
      const v = this.rangeNumbers(range);
      return v instanceof CellError ? v : num(mirr(v, fin, rein));
    });
  }

  orsPayback(ast: Ast, state: State): unknown {
    return this.runFunction(ast.args as never, state as never, this.metadata("ORS.PAYBACK"), (range: RangeArg) => {
      const v = this.rangeNumbers(range);
      return v instanceof CellError ? v : num(paybackPeriod(v));
    });
  }

  orsDpayback(ast: Ast, state: State): unknown {
    return this.runFunction(ast.args as never, state as never, this.metadata("ORS.DPAYBACK"), (rate: number, range: RangeArg) => {
      const v = this.rangeNumbers(range);
      return v instanceof CellError ? v : num(discountedPaybackPeriod(rate, v));
    });
  }

  orsPi(ast: Ast, state: State): unknown {
    return this.runFunction(ast.args as never, state as never, this.metadata("ORS.PI"), (rate: number, range: RangeArg) => {
      const v = this.rangeNumbers(range);
      return v instanceof CellError ? v : num(profitabilityIndex(rate, v));
    });
  }
}

const EN_NAMES: Record<string, string> = {
  "ORS.NORMAL": "ORS.NORMAL",
  "ORS.TRIANGULAR": "ORS.TRIANGULAR",
  "ORS.UNIFORM": "ORS.UNIFORM",
  "ORS.PERT": "ORS.PERT",
  "ORS.LOGNORMAL": "ORS.LOGNORMAL",
  "ORS.MIRR": "ORS.MIRR",
  "ORS.PAYBACK": "ORS.PAYBACK",
  "ORS.DPAYBACK": "ORS.DPAYBACK",
  "ORS.PI": "ORS.PI",
};

/** Spanish function names (used when the engine language is `esES`). */
export const ORS_FUNCTION_NAMES_ES: Record<string, string> = {
  "ORS.NORMAL": "ORS.NORMAL",
  "ORS.TRIANGULAR": "ORS.TRIANGULAR",
  "ORS.UNIFORM": "ORS.UNIFORME",
  "ORS.PERT": "ORS.PERT",
  "ORS.LOGNORMAL": "ORS.LOGNORMAL",
  "ORS.MIRR": "ORS.TIRM",
  "ORS.PAYBACK": "ORS.RECUPERACION",
  "ORS.DPAYBACK": "ORS.RECUPERACIONDESC",
  "ORS.PI": "ORS.IR",
};

export const ORS_TRANSLATIONS = { enGB: EN_NAMES, enUS: EN_NAMES, esES: ORS_FUNCTION_NAMES_ES };

/** Bilingual descriptions of the ORS functions (for the UI's function help). */
export const ORS_FUNCTION_HELP: { name: string; syntax: string; description: { en: string; es: string } }[] = [
  { name: "ORS.NORMAL", syntax: "ORS.NORMAL(mean, stdDev)", description: { en: "Normal assumption; returns the mean in normal recalculation.", es: "Supuesto normal; devuelve la media en el recálculo normal." } },
  { name: "ORS.TRIANGULAR", syntax: "ORS.TRIANGULAR(min, mode, max)", description: { en: "Triangular assumption; returns the mean.", es: "Supuesto triangular; devuelve la media." } },
  { name: "ORS.UNIFORM", syntax: "ORS.UNIFORM(min, max)", description: { en: "Uniform assumption; returns the mean.", es: "Supuesto uniforme; devuelve la media." } },
  { name: "ORS.PERT", syntax: "ORS.PERT(min, mode, max)", description: { en: "PERT assumption; returns the mean.", es: "Supuesto PERT; devuelve la media." } },
  { name: "ORS.LOGNORMAL", syntax: "ORS.LOGNORMAL(mean, stdDev)", description: { en: "Lognormal assumption (mean/stdDev of the variable); returns the mean.", es: "Supuesto lognormal (media/desv. de la variable); devuelve la media." } },
  { name: "ORS.MIRR", syntax: "ORS.MIRR(cashFlows, financeRate, reinvestRate)", description: { en: "Modified internal rate of return.", es: "Tasa interna de retorno modificada." } },
  { name: "ORS.PAYBACK", syntax: "ORS.PAYBACK(cashFlows)", description: { en: "Payback period (fractional periods, flows start at period 0).", es: "Periodo de recuperación (fraccional, flujos desde el periodo 0)." } },
  { name: "ORS.DPAYBACK", syntax: "ORS.DPAYBACK(rate, cashFlows)", description: { en: "Discounted payback period.", es: "Periodo de recuperación descontado." } },
  { name: "ORS.PI", syntax: "ORS.PI(rate, cashFlows)", description: { en: "Profitability index: PV of inflows after t0 / |initial investment|.", es: "Índice de rentabilidad: VP de flujos posteriores a t0 / |inversión inicial|." } },
];

let registered = false;

/** Register the Spanish language and the ORS plugin (idempotent). */
export function registerOrsFunctions(): void {
  if (registered) return;
  registered = true;
  if (!HyperFormula.getRegisteredLanguagesCodes().includes("esES")) {
    HyperFormula.registerLanguage("esES", esES);
  }
  const already = HyperFormula.getRegisteredFunctionNames("enGB").includes("ORS.NORMAL");
  if (!already) HyperFormula.registerFunctionPlugin(OrsPlugin as never, ORS_TRANSLATIONS);
}
