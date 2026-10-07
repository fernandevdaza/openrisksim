/**
 * Function catalog for the formula UI (autocomplete, argument tooltips, Insert Function dialog).
 *
 * Single source of truth for the localised function names: `en` is the engine's canonical name
 * (HyperFormula / .xlsx), `es` the official name in the Spanish edition of Microsoft Excel.
 * `formulaI18n.ts` builds its translation tables from this list (plus HyperFormula's es-ES pack for
 * functions that are not listed here). Every entry must be a function the engine evaluates
 * (checked by a unit test).
 */
import type { UiLocale } from "./numberFormat";

export type FnCategory = "financial" | "math" | "stats" | "logical" | "lookup" | "date" | "text" | "info" | "risk";

export interface Bi {
  en: string;
  es: string;
}

export interface FnArg {
  en: string;
  es: string;
  d: Bi;
  /** Optional argument (shown in [brackets]). */
  opt?: boolean;
  /** Part of the trailing repeating group (e.g. number2, … or criteria_range2/criteria2, …). */
  rep?: boolean;
}

export interface FnInfo {
  en: string;
  es: string;
  cat: FnCategory;
  d: Bi;
  args: FnArg[];
}

export const CATEGORY_LABELS: Record<FnCategory, Bi> = {
  financial: { es: "Financieras", en: "Financial" },
  math: { es: "Matemáticas y trigonométricas", en: "Math & trig" },
  stats: { es: "Estadísticas", en: "Statistical" },
  logical: { es: "Lógicas", en: "Logical" },
  lookup: { es: "Búsqueda y referencia", en: "Lookup & reference" },
  date: { es: "Fecha y hora", en: "Date & time" },
  text: { es: "Texto", en: "Text" },
  info: { es: "Información", en: "Information" },
  risk: { es: "Riesgo (OpenRiskSim)", en: "Risk (OpenRiskSim)" },
};

// ---- tiny DSL ------------------------------------------------------------------------------------
/** flags: "o" optional, "r" repeating group. */
function A(en: string, es: string, dEn: string, dEs: string, flags = ""): FnArg {
  const a: FnArg = { en, es, d: { en: dEn, es: dEs } };
  if (flags.includes("o")) a.opt = true;
  if (flags.includes("r")) a.rep = true;
  return a;
}
function F(en: string, es: string, cat: FnCategory, dEn: string, dEs: string, args: FnArg[] = []): FnInfo {
  return { en, es, cat, d: { en: dEn, es: dEs }, args };
}

// ---- common arguments ------------------------------------------------------------------------------
const number1 = A("number1", "número1", "A number, cell or range.", "Un número, celda o rango.");
const number2 = A("number2", "número2", "More numbers, cells or ranges (optional).", "Más números, celdas o rangos (opcional).", "or");
const value1 = A("value1", "valor1", "A value, cell or range.", "Un valor, celda o rango.");
const value2 = A("value2", "valor2", "More values, cells or ranges (optional).", "Más valores, celdas o rangos (opcional).", "or");
const number = A("number", "número", "The number.", "El número.");
const numDigits = A("num_digits", "núm_decimales", "Number of decimal places (negative rounds to tens, hundreds…).", "Cantidad de decimales (negativo redondea a decenas, centenas…).");
const range = A("range", "rango", "Cells to evaluate against the criteria.", "Celdas que se evalúan con el criterio.");
const criteria = A("criteria", "criterio", 'Condition, e.g. ">0", "Sí" or a cell.', 'Condición, p. ej. ">0", "Sí" o una celda.');
const critRange1 = A("criteria_range1", "rango_criterios1", "First range to test.", "Primer rango a evaluar.");
const crit1 = A("criteria1", "criterio1", "Condition for criteria_range1.", "Condición para rango_criterios1.");
const critRange2 = A("criteria_range2", "rango_criterios2", "Further ranges to test (optional).", "Más rangos a evaluar (opcional).", "or");
const crit2 = A("criteria2", "criterio2", "Condition for the previous range.", "Condición para el rango anterior.", "or");
const array = A("array", "matriz", "Range or array of numbers.", "Rango o matriz de números.");
const array1 = A("array1", "matriz1", "First range or array.", "Primer rango o matriz.");
const array2 = A("array2", "matriz2", "Second range or array (same size).", "Segundo rango o matriz (mismo tamaño).");
const knownY = A("known_y's", "conocido_y", "Dependent values (y).", "Valores dependientes (y).");
const knownX = A("known_x's", "conocido_x", "Independent values (x).", "Valores independientes (x).");
const x = A("x", "x", "Value at which to evaluate the distribution.", "Valor en el que se evalúa la distribución.");
const mean = A("mean", "media", "Mean of the distribution.", "Media de la distribución.");
const sd = A("standard_dev", "desv_estándar", "Standard deviation (> 0).", "Desviación estándar (> 0).");
const cumulative = A("cumulative", "acumulado", "TRUE = cumulative probability (CDF); FALSE = density.", "VERDADERO = probabilidad acumulada; FALSO = densidad.");
const probability = A("probability", "probabilidad", "Probability between 0 and 1.", "Probabilidad entre 0 y 1.");
const degFree = A("deg_freedom", "grados_de_libertad", "Degrees of freedom.", "Grados de libertad.");
const rate = A("rate", "tasa", "Interest/discount rate per period.", "Tasa de interés o descuento por periodo.");
const nper = A("nper", "nper", "Total number of payment periods.", "Número total de periodos de pago.");
const pmt = A("pmt", "pago", "Payment made each period.", "Pago efectuado en cada periodo.");
const pv = A("pv", "va", "Present value (loan amount / investment).", "Valor actual (monto del préstamo o inversión).");
const fvOpt = A("fv", "vf", "Future value after the last payment (default 0).", "Valor futuro tras el último pago (por defecto 0).", "o");
const typeOpt = A("type", "tipo", "0 = payments at the end of the period, 1 = at the beginning.", "0 = pagos al final del periodo, 1 = al inicio.", "o");
const per = A("per", "período", "Period of interest (1…nper).", "Periodo de interés (1…nper).");
const cost = A("cost", "costo", "Initial cost of the asset.", "Costo inicial del activo.");
const salvage = A("salvage", "valor_residual", "Value at the end of its useful life.", "Valor al final de la vida útil.");
const life = A("life", "vida", "Useful life in periods.", "Vida útil en periodos.");
const period = A("period", "período", "Period to depreciate.", "Periodo a depreciar.");
const values = A("values", "valores", "Cash flows (first one usually the negative investment).", "Flujos de caja (el primero suele ser la inversión, negativa).");
const dates = A("dates", "fechas", "Dates of the cash flows.", "Fechas de los flujos de caja.");
const guessOpt = A("guess", "estimar", "Starting guess for the rate (default 10%).", "Estimación inicial de la tasa (por defecto 10%).", "o");
const logical1 = A("logical1", "valor_lógico1", "Condition to test.", "Condición a evaluar.");
const logical2 = A("logical2", "valor_lógico2", "More conditions (optional).", "Más condiciones (opcional).", "or");
const lookupValue = A("lookup_value", "valor_buscado", "Value to look for.", "Valor que se busca.");
const serial = A("serial_number", "núm_de_serie", "A date (cell or serial number).", "Una fecha (celda o número de serie).");
const startDate = A("start_date", "fecha_inicial", "Start date.", "Fecha inicial.");
const endDate = A("end_date", "fecha_final", "End date.", "Fecha final.");
const months = A("months", "meses", "Months before (negative) or after the start date.", "Meses antes (negativo) o después de la fecha inicial.");
const holidaysOpt = A("holidays", "festivos", "Dates to exclude (optional).", "Fechas a excluir (opcional).", "o");
const text = A("text", "texto", "The text (or a cell with text).", "El texto (o una celda con texto).");
const numCharsOpt = A("num_chars", "núm_de_caracteres", "How many characters (default 1).", "Cuántos caracteres (por defecto 1).", "o");
const value = A("value", "valor", "The value to check.", "El valor a comprobar.");
const minA = A("min", "mín", "Minimum value.", "Valor mínimo.");
const modeA = A("most_likely", "más_probable", "Most likely value.", "Valor más probable.");
const maxA = A("max", "máx", "Maximum value.", "Valor máximo.");
const flows = A("cash_flows", "flujos", "Cash flows from period 0 (investment) onwards.", "Flujos de caja desde el periodo 0 (inversión).");
const distMean = A("mean", "media", "Mean of the variable.", "Media de la variable.");
const distSd = A("std_dev", "desv_estándar", "Standard deviation of the variable.", "Desviación estándar de la variable.");

const sumArgs = [number1, number2];
const valArgs = [value1, value2];

export const FUNCTION_CATALOG: FnInfo[] = [
  // ---------------------------------------------------------------- financial
  F("NPV", "VNA", "financial", "Net present value of periodic cash flows (first flow discounted one period).", "Valor neto actual de flujos periódicos (el primer flujo se descuenta un periodo).", [
    A("rate", "tasa", "Discount rate per period.", "Tasa de descuento por periodo."),
    A("value1", "valor1", "Cash flows from period 1 (cells or a range).", "Flujos desde el periodo 1 (celdas o un rango)."),
    A("value2", "valor2", "More cash flows (optional).", "Más flujos (opcional).", "or"),
  ]),
  F("XNPV", "VNA.NO.PER", "financial", "Net present value of cash flows at irregular dates.", "Valor neto actual de flujos en fechas irregulares.", [A("rate", "tasa", "Annual discount rate.", "Tasa de descuento anual."), values, dates]),
  F("IRR", "TIR", "financial", "Internal rate of return of periodic cash flows.", "Tasa interna de retorno de flujos periódicos.", [values, guessOpt]),
  F("XIRR", "TIR.NO.PER", "financial", "Internal rate of return of cash flows at irregular dates.", "Tasa interna de retorno de flujos en fechas irregulares.", [values, dates, guessOpt]),
  F("MIRR", "TIRM", "financial", "Modified IRR (finance and reinvestment rates).", "TIR modificada (tasas de financiamiento y reinversión).", [
    values,
    A("finance_rate", "tasa_financiamiento", "Rate paid on the money used (negative flows).", "Tasa que se paga por el dinero invertido (flujos negativos)."),
    A("reinvest_rate", "tasa_reinversión", "Rate earned when reinvesting positive flows.", "Tasa obtenida al reinvertir los flujos positivos."),
  ]),
  F("PMT", "PAGO", "financial", "Payment of a loan with constant payments and rate.", "Pago de un préstamo con pagos y tasa constantes.", [rate, nper, pv, fvOpt, typeOpt]),
  F("IPMT", "PAGOINT", "financial", "Interest part of a payment for a given period.", "Parte de interés de un pago en un periodo dado.", [rate, per, nper, pv, fvOpt, typeOpt]),
  F("PPMT", "PAGOPRIN", "financial", "Principal part of a payment for a given period.", "Parte de capital (amortización) de un pago en un periodo dado.", [rate, per, nper, pv, fvOpt, typeOpt]),
  F("PV", "VA", "financial", "Present value of a series of equal payments.", "Valor actual de una serie de pagos iguales.", [rate, nper, pmt, fvOpt, typeOpt]),
  F("FV", "VF", "financial", "Future value of an investment with periodic payments.", "Valor futuro de una inversión con pagos periódicos.", [rate, nper, pmt, A("pv", "va", "Present value (default 0).", "Valor actual (por defecto 0).", "o"), typeOpt]),
  F("NPER", "NPER", "financial", "Number of periods of an investment or loan.", "Número de periodos de una inversión o préstamo.", [rate, pmt, pv, fvOpt, typeOpt]),
  F("RATE", "TASA", "financial", "Interest rate per period of an annuity.", "Tasa de interés por periodo de una anualidad.", [nper, pmt, pv, fvOpt, typeOpt, guessOpt]),
  F("CUMIPMT", "PAGO.INT.ENTRE", "financial", "Cumulative interest paid between two periods.", "Interés acumulado pagado entre dos periodos.", [
    rate, nper, pv,
    A("start_period", "período_inicial", "First period.", "Primer periodo."),
    A("end_period", "período_final", "Last period.", "Último periodo."),
    A("type", "tipo", "0 = end of period, 1 = beginning.", "0 = final del periodo, 1 = inicio."),
  ]),
  F("CUMPRINC", "PAGO.PRINC.ENTRE", "financial", "Cumulative principal paid between two periods.", "Capital acumulado pagado entre dos periodos.", [
    rate, nper, pv,
    A("start_period", "período_inicial", "First period.", "Primer periodo."),
    A("end_period", "período_final", "Last period.", "Último periodo."),
    A("type", "tipo", "0 = end of period, 1 = beginning.", "0 = final del periodo, 1 = inicio."),
  ]),
  F("ISPMT", "INT.PAGO.DIR", "financial", "Interest paid in a period with equal principal payments.", "Interés pagado en un periodo con amortizaciones de capital iguales.", [rate, per, nper, pv]),
  F("SLN", "SLN", "financial", "Straight-line depreciation for one period.", "Depreciación lineal de un periodo.", [cost, salvage, life]),
  F("DB", "DB", "financial", "Fixed-declining balance depreciation.", "Depreciación por saldo fijo decreciente.", [cost, salvage, life, period, A("month", "mes", "Months in the first year (default 12).", "Meses del primer año (por defecto 12).", "o")]),
  F("DDB", "DDB", "financial", "Double-declining balance depreciation.", "Depreciación por doble saldo decreciente.", [cost, salvage, life, period, A("factor", "factor", "Rate of decline (default 2).", "Tasa de disminución (por defecto 2).", "o")]),
  F("SYD", "SYD", "financial", "Sum-of-years' digits depreciation.", "Depreciación por suma de dígitos de los años.", [cost, salvage, life, A("per", "período", "Period to depreciate.", "Periodo a depreciar.")]),
  F("EFFECT", "INT.EFECTIVO", "financial", "Effective annual rate from a nominal rate.", "Tasa efectiva anual a partir de una tasa nominal.", [
    A("nominal_rate", "int_nominal", "Nominal annual rate.", "Tasa nominal anual."),
    A("npery", "núm_per_año", "Compounding periods per year.", "Periodos de capitalización por año."),
  ]),
  F("NOMINAL", "TASA.NOMINAL", "financial", "Nominal annual rate from an effective rate.", "Tasa nominal anual a partir de una tasa efectiva.", [
    A("effect_rate", "tasa_efectiva", "Effective annual rate.", "Tasa efectiva anual."),
    A("npery", "núm_per_año", "Compounding periods per year.", "Periodos de capitalización por año."),
  ]),
  F("FVSCHEDULE", "VF.PLAN", "financial", "Future value of a principal after a series of rates.", "Valor futuro de un capital tras una serie de tasas.", [
    A("principal", "capital", "Present value.", "Valor actual."),
    A("schedule", "plan_tasas", "Range of interest rates.", "Rango de tasas de interés."),
  ]),
  F("PDURATION", "P.DURACION", "financial", "Periods needed to reach a future value.", "Periodos necesarios para alcanzar un valor futuro.", [rate, pv, A("fv", "vf", "Desired future value.", "Valor futuro deseado.")]),
  F("RRI", "RRI", "financial", "Equivalent rate for the growth of an investment.", "Tasa equivalente del crecimiento de una inversión.", [nper, pv, A("fv", "vf", "Future value.", "Valor futuro.")]),

  // ---------------------------------------------------------------- math
  F("SUM", "SUMA", "math", "Adds all the numbers.", "Suma todos los números.", sumArgs),
  F("SUMIF", "SUMAR.SI", "math", "Adds the cells that meet a condition.", "Suma las celdas que cumplen una condición.", [range, criteria, A("sum_range", "rango_suma", "Cells to add (default: range).", "Celdas a sumar (por defecto: rango).", "o")]),
  F("SUMIFS", "SUMAR.SI.CONJUNTO", "math", "Adds the cells that meet several conditions.", "Suma las celdas que cumplen varias condiciones.", [A("sum_range", "rango_suma", "Cells to add.", "Celdas a sumar."), critRange1, crit1, critRange2, crit2]),
  F("SUMPRODUCT", "SUMAPRODUCTO", "math", "Sum of the products of corresponding elements.", "Suma de los productos de los elementos correspondientes.", [array1, A("array2", "matriz2", "More arrays (optional, same size).", "Más matrices (opcional, mismo tamaño).", "or")]),
  F("SUMSQ", "SUMA.CUADRADOS", "math", "Sum of the squares of the arguments.", "Suma de los cuadrados de los argumentos.", sumArgs),
  F("PRODUCT", "PRODUCTO", "math", "Multiplies all the numbers.", "Multiplica todos los números.", sumArgs),
  F("ROUND", "REDONDEAR", "math", "Rounds a number to a number of digits.", "Redondea un número a una cantidad de decimales.", [number, numDigits]),
  F("ROUNDUP", "REDONDEAR.MAS", "math", "Rounds a number up, away from zero.", "Redondea un número hacia arriba (alejándose de cero).", [number, numDigits]),
  F("ROUNDDOWN", "REDONDEAR.MENOS", "math", "Rounds a number down, towards zero.", "Redondea un número hacia abajo (hacia cero).", [number, numDigits]),
  F("MROUND", "REDOND.MULT", "math", "Rounds to the nearest multiple.", "Redondea al múltiplo más cercano.", [number, A("multiple", "múltiplo", "The multiple.", "El múltiplo.")]),
  F("CEILING", "MULTIPLO.SUPERIOR", "math", "Rounds up to the nearest multiple of significance.", "Redondea hacia arriba al múltiplo más cercano.", [number, A("significance", "cifra_significativa", "The multiple.", "El múltiplo.")]),
  F("FLOOR", "MULTIPLO.INFERIOR", "math", "Rounds down to the nearest multiple of significance.", "Redondea hacia abajo al múltiplo más cercano.", [number, A("significance", "cifra_significativa", "The multiple.", "El múltiplo.")]),
  F("TRUNC", "TRUNCAR", "math", "Truncates a number (drops decimals).", "Trunca un número (quita decimales).", [number, A("num_digits", "núm_decimales", "Decimals to keep (default 0).", "Decimales a conservar (por defecto 0).", "o")]),
  F("INT", "ENTERO", "math", "Rounds down to the nearest integer.", "Redondea hacia abajo al entero más próximo.", [number]),
  F("ABS", "ABS", "math", "Absolute value.", "Valor absoluto.", [number]),
  F("SIGN", "SIGNO", "math", "Sign of a number: 1, 0 or -1.", "Signo de un número: 1, 0 o -1.", [number]),
  F("SQRT", "RAIZ", "math", "Square root.", "Raíz cuadrada.", [A("number", "número", "Non-negative number.", "Número no negativo.")]),
  F("POWER", "POTENCIA", "math", "A number raised to a power.", "Un número elevado a una potencia.", [number, A("power", "potencia", "The exponent.", "El exponente.")]),
  F("EXP", "EXP", "math", "e raised to a power.", "e elevado a una potencia.", [number]),
  F("LN", "LN", "math", "Natural logarithm.", "Logaritmo natural.", [A("number", "número", "Positive number.", "Número positivo.")]),
  F("LOG", "LOG", "math", "Logarithm in a given base.", "Logaritmo en una base dada.", [A("number", "número", "Positive number.", "Número positivo."), A("base", "base", "Base (default 10).", "Base (por defecto 10).", "o")]),
  F("LOG10", "LOG10", "math", "Base-10 logarithm.", "Logaritmo en base 10.", [A("number", "número", "Positive number.", "Número positivo.")]),
  F("MOD", "RESIDUO", "math", "Remainder of a division.", "Residuo de una división.", [number, A("divisor", "núm_divisor", "The divisor.", "El divisor.")]),
  F("QUOTIENT", "COCIENTE", "math", "Integer part of a division.", "Parte entera de una división.", [A("numerator", "numerador", "Dividend.", "Dividendo."), A("denominator", "denominador", "Divisor.", "Divisor.")]),
  F("PI", "PI", "math", "The number π (3.14159…).", "El número π (3,14159…)."),
  F("RAND", "ALEATORIO", "math", "Random number between 0 and 1 (recalculates).", "Número aleatorio entre 0 y 1 (se recalcula)."),
  F("RANDBETWEEN", "ALEATORIO.ENTRE", "math", "Random integer between two numbers.", "Entero aleatorio entre dos números.", [A("bottom", "inferior", "Smallest integer.", "Entero menor."), A("top", "superior", "Largest integer.", "Entero mayor.")]),
  F("FACT", "FACT", "math", "Factorial of a number.", "Factorial de un número.", [number]),
  F("COMBIN", "COMBINAT", "math", "Number of combinations of k items out of n.", "Número de combinaciones de k elementos entre n.", [A("number", "número", "Total items (n).", "Total de elementos (n)."), A("number_chosen", "tamaño", "Items in each combination (k).", "Elementos en cada combinación (k).")]),
  F("MMULT", "MMULT", "math", "Matrix product of two arrays.", "Producto matricial de dos matrices.", [array1, array2]),
  F("SUBTOTAL", "SUBTOTALES", "math", "Subtotal with a chosen function (9 = SUM, 1 = AVERAGE…).", "Subtotal con la función elegida (9 = SUMA, 1 = PROMEDIO…).", [
    A("function_num", "núm_función", "1 AVERAGE, 2 COUNT, 4 MAX, 5 MIN, 9 SUM…", "1 PROMEDIO, 2 CONTAR, 4 MAX, 5 MIN, 9 SUMA…"),
    A("ref1", "ref1", "Range to subtotal.", "Rango del subtotal."),
    A("ref2", "ref2", "More ranges (optional).", "Más rangos (opcional).", "or"),
  ]),

  // ---------------------------------------------------------------- statistical
  F("AVERAGE", "PROMEDIO", "stats", "Arithmetic mean.", "Media aritmética.", sumArgs),
  F("AVERAGEIF", "PROMEDIO.SI", "stats", "Average of the cells that meet a condition.", "Promedio de las celdas que cumplen una condición.", [range, criteria, A("average_range", "rango_promedio", "Cells to average (default: range).", "Celdas a promediar (por defecto: rango).", "o")]),
  F("COUNT", "CONTAR", "stats", "Counts the cells that contain numbers.", "Cuenta las celdas que contienen números.", valArgs),
  F("COUNTA", "CONTARA", "stats", "Counts the non-empty cells.", "Cuenta las celdas no vacías.", valArgs),
  F("COUNTBLANK", "CONTAR.BLANCO", "stats", "Counts the empty cells of a range.", "Cuenta las celdas vacías de un rango.", [A("range", "rango", "The range.", "El rango.")]),
  F("COUNTIF", "CONTAR.SI", "stats", "Counts the cells that meet a condition.", "Cuenta las celdas que cumplen una condición.", [range, criteria]),
  F("COUNTIFS", "CONTAR.SI.CONJUNTO", "stats", "Counts the cells that meet several conditions.", "Cuenta las celdas que cumplen varias condiciones.", [critRange1, crit1, critRange2, crit2]),
  F("MIN", "MIN", "stats", "Smallest value.", "Valor mínimo.", sumArgs),
  F("MAX", "MAX", "stats", "Largest value.", "Valor máximo.", sumArgs),
  F("MINIFS", "MIN.SI.CONJUNTO", "stats", "Minimum of the cells that meet conditions.", "Mínimo de las celdas que cumplen condiciones.", [A("min_range", "rango_mín", "Cells to evaluate.", "Celdas a evaluar."), critRange1, crit1, critRange2, crit2]),
  F("MAXIFS", "MAX.SI.CONJUNTO", "stats", "Maximum of the cells that meet conditions.", "Máximo de las celdas que cumplen condiciones.", [A("max_range", "rango_máx", "Cells to evaluate.", "Celdas a evaluar."), critRange1, crit1, critRange2, crit2]),
  F("MEDIAN", "MEDIANA", "stats", "Median (middle value).", "Mediana (valor central).", sumArgs),
  F("LARGE", "K.ESIMO.MAYOR", "stats", "k-th largest value.", "k-ésimo valor mayor.", [array, A("k", "k", "Position (1 = largest).", "Posición (1 = el mayor).")]),
  F("SMALL", "K.ESIMO.MENOR", "stats", "k-th smallest value.", "k-ésimo valor menor.", [array, A("k", "k", "Position (1 = smallest).", "Posición (1 = el menor).")]),
  F("STDEV", "DESVEST", "stats", "Sample standard deviation (compatibility).", "Desviación estándar de una muestra (compatibilidad).", sumArgs),
  F("STDEV.S", "DESVEST.M", "stats", "Sample standard deviation.", "Desviación estándar de una muestra.", sumArgs),
  F("STDEV.P", "DESVEST.P", "stats", "Population standard deviation.", "Desviación estándar de la población.", sumArgs),
  F("VAR", "VAR", "stats", "Sample variance (compatibility).", "Varianza de una muestra (compatibilidad).", sumArgs),
  F("VAR.S", "VAR.S", "stats", "Sample variance.", "Varianza de una muestra.", sumArgs),
  F("VAR.P", "VAR.P", "stats", "Population variance.", "Varianza de la población.", sumArgs),
  F("PERCENTILE", "PERCENTIL", "stats", "k-th percentile (compatibility).", "Percentil k (compatibilidad).", [array, A("k", "k", "Percentile between 0 and 1.", "Percentil entre 0 y 1.")]),
  F("PERCENTILE.INC", "PERCENTIL.INC", "stats", "k-th percentile, 0 ≤ k ≤ 1.", "Percentil k, 0 ≤ k ≤ 1.", [array, A("k", "k", "Percentile between 0 and 1.", "Percentil entre 0 y 1.")]),
  F("PERCENTILE.EXC", "PERCENTIL.EXC", "stats", "k-th percentile, 0 < k < 1.", "Percentil k, 0 < k < 1.", [array, A("k", "k", "Percentile strictly between 0 and 1.", "Percentil estrictamente entre 0 y 1.")]),
  F("QUARTILE", "CUARTIL", "stats", "Quartile of a data set (compatibility).", "Cuartil de un conjunto de datos (compatibilidad).", [array, A("quart", "cuartil", "0 min, 1 Q1, 2 median, 3 Q3, 4 max.", "0 mín, 1 Q1, 2 mediana, 3 Q3, 4 máx.")]),
  F("QUARTILE.INC", "CUARTIL.INC", "stats", "Quartile of a data set.", "Cuartil de un conjunto de datos.", [array, A("quart", "cuartil", "0 min, 1 Q1, 2 median, 3 Q3, 4 max.", "0 mín, 1 Q1, 2 mediana, 3 Q3, 4 máx.")]),
  F("CORREL", "COEF.DE.CORREL", "stats", "Correlation coefficient of two data sets.", "Coeficiente de correlación de dos conjuntos de datos.", [array1, array2]),
  F("PEARSON", "PEARSON", "stats", "Pearson correlation coefficient.", "Coeficiente de correlación de Pearson.", [array1, array2]),
  F("RSQ", "COEFICIENTE.R2", "stats", "R² of the linear regression.", "R² de la regresión lineal.", [knownY, knownX]),
  F("SLOPE", "PENDIENTE", "stats", "Slope of the linear regression line.", "Pendiente de la recta de regresión lineal.", [knownY, knownX]),
  F("STEYX", "ERROR.TIPICO.XY", "stats", "Standard error of the predicted y in a regression.", "Error típico del y estimado en una regresión.", [knownY, knownX]),
  F("COVARIANCE.S", "COVARIANZA.M", "stats", "Sample covariance.", "Covarianza de una muestra.", [array1, array2]),
  F("COVARIANCE.P", "COVARIANZA.P", "stats", "Population covariance.", "Covarianza de la población.", [array1, array2]),
  F("SKEW", "COEFICIENTE.ASIMETRIA", "stats", "Skewness of a distribution.", "Coeficiente de asimetría de una distribución.", sumArgs),
  F("GEOMEAN", "MEDIA.GEOM", "stats", "Geometric mean.", "Media geométrica.", sumArgs),
  F("HARMEAN", "MEDIA.ARMO", "stats", "Harmonic mean.", "Media armónica.", sumArgs),
  F("AVEDEV", "DESVPROM", "stats", "Average absolute deviation from the mean.", "Promedio de las desviaciones absolutas respecto de la media.", sumArgs),
  F("DEVSQ", "DESVIA2", "stats", "Sum of squared deviations from the mean.", "Suma de los cuadrados de las desviaciones.", sumArgs),
  F("STANDARDIZE", "NORMALIZACION", "stats", "Standardised value (z-score).", "Valor normalizado (puntuación z).", [A("x", "x", "Value to standardise.", "Valor a normalizar."), mean, sd]),
  F("NORM.DIST", "DISTR.NORM.N", "stats", "Normal distribution (density or cumulative).", "Distribución normal (densidad o acumulada).", [x, mean, sd, cumulative]),
  F("NORM.INV", "INV.NORM", "stats", "Inverse of the normal cumulative distribution.", "Inversa de la distribución normal acumulada.", [probability, mean, sd]),
  F("NORM.S.DIST", "DISTR.NORM.ESTAND.N", "stats", "Standard normal distribution.", "Distribución normal estándar.", [A("z", "z", "Value (z-score).", "Valor (puntuación z)."), cumulative]),
  F("NORM.S.INV", "INV.NORM.ESTAND", "stats", "Inverse of the standard normal distribution.", "Inversa de la distribución normal estándar.", [probability]),
  F("LOGNORM.DIST", "DISTR.LOGNORM", "stats", "Lognormal distribution (parameters of ln x).", "Distribución lognormal (parámetros de ln x).", [x, A("mean", "media", "Mean of ln(x).", "Media de ln(x)."), A("standard_dev", "desv_estándar", "Standard deviation of ln(x).", "Desviación estándar de ln(x)."), cumulative]),
  F("LOGNORM.INV", "INV.LOGNORM", "stats", "Inverse of the lognormal cumulative distribution.", "Inversa de la distribución lognormal acumulada.", [probability, A("mean", "media", "Mean of ln(x).", "Media de ln(x)."), A("standard_dev", "desv_estándar", "Standard deviation of ln(x).", "Desviación estándar de ln(x).")]),
  F("T.DIST", "DISTR.T.N", "stats", "Student's t distribution (left tail).", "Distribución t de Student (cola izquierda).", [x, degFree, cumulative]),
  F("T.DIST.2T", "DISTR.T.2C", "stats", "Two-tailed Student's t distribution.", "Distribución t de Student de dos colas.", [x, degFree]),
  F("T.DIST.RT", "DISTR.T.CD", "stats", "Right-tailed Student's t distribution.", "Distribución t de Student de cola derecha.", [x, degFree]),
  F("T.INV", "INV.T", "stats", "Inverse of Student's t (left tail).", "Inversa de la t de Student (cola izquierda).", [probability, degFree]),
  F("T.INV.2T", "INV.T.2C", "stats", "Two-tailed inverse of Student's t.", "Inversa de dos colas de la t de Student.", [probability, degFree]),
  F("CONFIDENCE.NORM", "INTERVALO.CONFIANZA.NORM", "stats", "Half-width of a confidence interval (normal).", "Semiamplitud de un intervalo de confianza (normal).", [
    A("alpha", "alfa", "Significance level (e.g. 0.05).", "Nivel de significación (p. ej. 0,05)."), sd, A("size", "tamaño", "Sample size.", "Tamaño de la muestra."),
  ]),
  F("CONFIDENCE.T", "INTERVALO.CONFIANZA.T", "stats", "Half-width of a confidence interval (Student's t).", "Semiamplitud de un intervalo de confianza (t de Student).", [
    A("alpha", "alfa", "Significance level (e.g. 0.05).", "Nivel de significación (p. ej. 0,05)."), sd, A("size", "tamaño", "Sample size.", "Tamaño de la muestra."),
  ]),
  F("BINOM.DIST", "DISTR.BINOM.N", "stats", "Binomial distribution.", "Distribución binomial.", [
    A("number_s", "núm_éxito", "Number of successes.", "Número de éxitos."), A("trials", "ensayos", "Number of trials.", "Número de ensayos."), A("probability_s", "prob_éxito", "Probability of success.", "Probabilidad de éxito."), cumulative,
  ]),
  F("POISSON.DIST", "POISSON.DIST", "stats", "Poisson distribution.", "Distribución de Poisson.", [A("x", "x", "Number of events.", "Número de eventos."), A("mean", "media", "Expected number of events.", "Número esperado de eventos."), cumulative]),
  F("EXPON.DIST", "DISTR.EXP.N", "stats", "Exponential distribution.", "Distribución exponencial.", [x, A("lambda", "lambda", "Rate parameter.", "Parámetro de tasa."), cumulative]),
  F("GAMMA.DIST", "DISTR.GAMMA.N", "stats", "Gamma distribution.", "Distribución gamma.", [x, A("alpha", "alfa", "Shape.", "Forma."), A("beta", "beta", "Scale.", "Escala."), cumulative]),
  F("BETA.DIST", "DISTR.BETA.N", "stats", "Beta distribution.", "Distribución beta.", [
    x, A("alpha", "alfa", "Shape α.", "Forma α."), A("beta", "beta", "Shape β.", "Forma β."), cumulative,
    A("A", "A", "Lower bound (default 0).", "Límite inferior (por defecto 0).", "o"), A("B", "B", "Upper bound (default 1).", "Límite superior (por defecto 1).", "o"),
  ]),
  F("CHISQ.DIST", "DISTR.CHICUAD", "stats", "Chi-squared distribution (left tail).", "Distribución chi cuadrado (cola izquierda).", [x, degFree, cumulative]),
  F("F.DIST", "DISTR.F.N", "stats", "F distribution.", "Distribución F.", [
    x, A("deg_freedom1", "grados_de_libertad1", "Numerator degrees of freedom.", "Grados de libertad del numerador."), A("deg_freedom2", "grados_de_libertad2", "Denominator degrees of freedom.", "Grados de libertad del denominador."), cumulative,
  ]),
  F("WEIBULL.DIST", "DISTR.WEIBULL", "stats", "Weibull distribution.", "Distribución de Weibull.", [x, A("alpha", "alfa", "Shape.", "Forma."), A("beta", "beta", "Scale.", "Escala."), cumulative]),

  // ---------------------------------------------------------------- logical
  F("IF", "SI", "logical", "Returns one value if a condition is true and another if it is false.", "Devuelve un valor si la condición es verdadera y otro si es falsa.", [
    A("logical_test", "prueba_lógica", "Condition, e.g. B5>0.", "Condición, p. ej. B5>0."),
    A("value_if_true", "valor_si_verdadero", "Result when the condition is true.", "Resultado si la condición es verdadera.", "o"),
    A("value_if_false", "valor_si_falso", "Result when the condition is false.", "Resultado si la condición es falsa.", "o"),
  ]),
  F("IFS", "SI.CONJUNTO", "logical", "Checks conditions in order and returns the value of the first true one.", "Evalúa condiciones en orden y devuelve el valor de la primera verdadera.", [
    A("logical_test1", "prueba_lógica1", "First condition.", "Primera condición."),
    A("value_if_true1", "valor_si_verdadero1", "Result for the first condition.", "Resultado de la primera condición."),
    A("logical_test2", "prueba_lógica2", "More conditions (optional).", "Más condiciones (opcional).", "or"),
    A("value_if_true2", "valor_si_verdadero2", "Result for the previous condition.", "Resultado de la condición anterior.", "or"),
  ]),
  F("IFERROR", "SI.ERROR", "logical", "Returns a value when an expression gives an error.", "Devuelve un valor si la expresión da error.", [
    A("value", "valor", "Expression to check.", "Expresión a comprobar."), A("value_if_error", "valor_si_error", "Result if it is an error.", "Resultado si da error."),
  ]),
  F("IFNA", "SI.ND", "logical", "Returns a value when an expression gives #N/A.", "Devuelve un valor si la expresión da #N/D.", [
    A("value", "valor", "Expression to check.", "Expresión a comprobar."), A("value_if_na", "valor_si_nd", "Result if it is #N/A.", "Resultado si da #N/D."),
  ]),
  F("AND", "Y", "logical", "TRUE if all the conditions are true.", "VERDADERO si todas las condiciones son verdaderas.", [logical1, logical2]),
  F("OR", "O", "logical", "TRUE if any condition is true.", "VERDADERO si alguna condición es verdadera.", [logical1, logical2]),
  F("XOR", "XO", "logical", "Exclusive OR of the conditions.", "O exclusivo de las condiciones.", [logical1, logical2]),
  F("NOT", "NO", "logical", "Reverses a logical value.", "Invierte un valor lógico.", [A("logical", "valor_lógico", "Condition to reverse.", "Condición a invertir.")]),
  F("SWITCH", "CAMBIAR", "logical", "Compares an expression with a list of values.", "Compara una expresión con una lista de valores.", [
    A("expression", "expresión", "Value to compare.", "Valor a comparar."),
    A("value1", "valor1", "Value to match.", "Valor a coincidir."),
    A("result1", "resultado1", "Result when it matches.", "Resultado si coincide."),
    A("value2", "valor2", "More values (optional).", "Más valores (opcional).", "or"),
    A("result2", "resultado2", "Result for the previous value.", "Resultado del valor anterior.", "or"),
  ]),
  F("TRUE", "VERDADERO", "logical", "The logical value TRUE.", "El valor lógico VERDADERO."),
  F("FALSE", "FALSO", "logical", "The logical value FALSE.", "El valor lógico FALSO."),

  // ---------------------------------------------------------------- lookup & reference
  F("VLOOKUP", "BUSCARV", "lookup", "Looks for a value in the first column of a table and returns a value of the same row.", "Busca un valor en la primera columna de una tabla y devuelve un valor de la misma fila.", [
    lookupValue,
    A("table_array", "matriz_tabla", "Table to search (first column = keys).", "Tabla donde buscar (primera columna = claves)."),
    A("col_index_num", "indicador_columnas", "Column number of the result (1 = first).", "Número de columna del resultado (1 = la primera)."),
    A("range_lookup", "rango", "FALSE = exact match; TRUE = approximate (sorted).", "FALSO = coincidencia exacta; VERDADERO = aproximada (ordenada).", "o"),
  ]),
  F("HLOOKUP", "BUSCARH", "lookup", "Looks for a value in the first row of a table and returns a value of the same column.", "Busca un valor en la primera fila de una tabla y devuelve un valor de la misma columna.", [
    lookupValue,
    A("table_array", "matriz_buscar_en", "Table to search (first row = keys).", "Tabla donde buscar (primera fila = claves)."),
    A("row_index_num", "indicador_filas", "Row number of the result (1 = first).", "Número de fila del resultado (1 = la primera)."),
    A("range_lookup", "ordenado", "FALSE = exact match; TRUE = approximate.", "FALSO = coincidencia exacta; VERDADERO = aproximada.", "o"),
  ]),
  F("XLOOKUP", "BUSCARX", "lookup", "Looks for a value in a range and returns the matching item of another range.", "Busca un valor en un rango y devuelve el elemento correspondiente de otro rango.", [
    lookupValue,
    A("lookup_array", "matriz_buscada", "Range to search.", "Rango donde buscar."),
    A("return_array", "matriz_devuelta", "Range with the results.", "Rango con los resultados."),
    A("if_not_found", "si_no_se_encuentra", "Result when nothing is found.", "Resultado si no se encuentra.", "o"),
    A("match_mode", "modo_de_coincidencia", "0 exact, -1 next smaller, 1 next larger.", "0 exacta, -1 menor siguiente, 1 mayor siguiente.", "o"),
    A("search_mode", "modo_de_búsqueda", "1 first to last, -1 last to first.", "1 del primero al último, -1 del último al primero.", "o"),
  ]),
  F("INDEX", "INDICE", "lookup", "Value at a given row and column of a range.", "Valor en una fila y columna dadas de un rango.", [
    A("array", "matriz", "Range of cells.", "Rango de celdas."), A("row_num", "núm_fila", "Row within the range.", "Fila dentro del rango."), A("column_num", "núm_columna", "Column within the range.", "Columna dentro del rango.", "o"),
  ]),
  F("MATCH", "COINCIDIR", "lookup", "Position of a value in a range.", "Posición de un valor en un rango.", [
    lookupValue, A("lookup_array", "matriz_buscada", "Range to search.", "Rango donde buscar."), A("match_type", "tipo_de_coincidencia", "0 exact, 1 less than (sorted), -1 greater than.", "0 exacta, 1 menor que (ordenado), -1 mayor que.", "o"),
  ]),
  F("CHOOSE", "ELEGIR", "lookup", "Chooses a value from a list by its position.", "Elige un valor de una lista según su posición.", [
    A("index_num", "núm_índice", "Position (1, 2, …).", "Posición (1, 2, …)."), A("value1", "valor1", "First option.", "Primera opción."), A("value2", "valor2", "More options.", "Más opciones.", "or"),
  ]),
  F("OFFSET", "DESREF", "lookup", "Reference shifted a number of rows and columns.", "Referencia desplazada un número de filas y columnas.", [
    A("reference", "ref", "Starting reference.", "Referencia inicial."), A("rows", "filas", "Rows to move (negative = up).", "Filas a desplazar (negativo = arriba)."), A("cols", "columnas", "Columns to move (negative = left).", "Columnas a desplazar (negativo = izquierda)."),
    A("height", "alto", "Height of the result (optional).", "Alto del resultado (opcional).", "o"), A("width", "ancho", "Width of the result (optional).", "Ancho del resultado (opcional).", "o"),
  ]),
  F("ROW", "FILA", "lookup", "Row number of a reference.", "Número de fila de una referencia.", [A("reference", "ref", "Cell (default: this cell).", "Celda (por defecto: esta celda).", "o")]),
  F("COLUMN", "COLUMNA", "lookup", "Column number of a reference.", "Número de columna de una referencia.", [A("reference", "ref", "Cell (default: this cell).", "Celda (por defecto: esta celda).", "o")]),
  F("ROWS", "FILAS", "lookup", "Number of rows of a range.", "Número de filas de un rango.", [A("array", "matriz", "The range.", "El rango.")]),
  F("COLUMNS", "COLUMNAS", "lookup", "Number of columns of a range.", "Número de columnas de un rango.", [A("array", "matriz", "The range.", "El rango.")]),
  F("TRANSPOSE", "TRANSPONER", "lookup", "Swaps the rows and columns of a range.", "Intercambia las filas y columnas de un rango.", [A("array", "matriz", "The range.", "El rango.")]),

  // ---------------------------------------------------------------- date & time
  F("TODAY", "HOY", "date", "Today's date.", "La fecha de hoy."),
  F("NOW", "AHORA", "date", "Current date and time.", "Fecha y hora actuales."),
  F("DATE", "FECHA", "date", "Builds a date from year, month and day.", "Construye una fecha a partir de año, mes y día.", [A("year", "año", "Year.", "Año."), A("month", "mes", "Month (1-12).", "Mes (1-12)."), A("day", "día", "Day (1-31).", "Día (1-31).")]),
  F("YEAR", "AÑO", "date", "Year of a date.", "Año de una fecha.", [serial]),
  F("MONTH", "MES", "date", "Month of a date (1-12).", "Mes de una fecha (1-12).", [serial]),
  F("DAY", "DIA", "date", "Day of the month of a date.", "Día del mes de una fecha.", [serial]),
  F("EDATE", "FECHA.MES", "date", "Date a number of months before or after a date.", "Fecha un número de meses antes o después de otra.", [startDate, months]),
  F("EOMONTH", "FIN.MES", "date", "Last day of the month, some months away.", "Último día del mes, a cierta cantidad de meses.", [startDate, months]),
  F("DAYS", "DIAS", "date", "Number of days between two dates.", "Número de días entre dos fechas.", [endDate, startDate]),
  F("DATEDIF", "SIFECHA", "date", "Difference between two dates in years, months or days.", "Diferencia entre dos fechas en años, meses o días.", [startDate, endDate, A("unit", "unidad", '"Y" years, "M" months, "D" days…', '"Y" años, "M" meses, "D" días…')]),
  F("YEARFRAC", "FRAC.AÑO", "date", "Fraction of a year between two dates.", "Fracción de año entre dos fechas.", [startDate, endDate, A("basis", "base", "Day count basis (default 0 = 30/360).", "Base de cómputo de días (por defecto 0 = 30/360).", "o")]),
  F("WEEKDAY", "DIASEM", "date", "Day of the week of a date.", "Día de la semana de una fecha.", [serial, A("return_type", "tipo", "1 = Sunday is 1, 2 = Monday is 1…", "1 = domingo es 1, 2 = lunes es 1…", "o")]),
  F("NETWORKDAYS", "DIAS.LAB", "date", "Working days between two dates.", "Días laborables entre dos fechas.", [startDate, endDate, holidaysOpt]),
  F("WORKDAY", "DIA.LAB", "date", "Date a number of working days away.", "Fecha a cierta cantidad de días laborables.", [startDate, A("days", "días_lab", "Working days to add.", "Días laborables a sumar."), holidaysOpt]),

  // ---------------------------------------------------------------- text
  F("TEXT", "TEXTO", "text", "Formats a number as text.", "Da formato de texto a un número.", [A("value", "valor", "Number to format.", "Número a formatear."), A("format_text", "formato", 'Format code, e.g. "0.00%".', 'Código de formato, p. ej. "0,00%".')]),
  F("CONCATENATE", "CONCATENAR", "text", "Joins several texts.", "Une varios textos.", [A("text1", "texto1", "First text.", "Primer texto."), A("text2", "texto2", "More texts.", "Más textos.", "or")]),
  F("TEXTJOIN", "UNIRCADENAS", "text", "Joins texts with a delimiter.", "Une textos con un delimitador.", [
    A("delimiter", "delimitador", 'Separator, e.g. ", ".', 'Separador, p. ej. ", ".'), A("ignore_empty", "ignorar_vacías", "TRUE to skip empty cells.", "VERDADERO para omitir celdas vacías."), A("text1", "texto1", "First text or range.", "Primer texto o rango."), A("text2", "texto2", "More texts.", "Más textos.", "or"),
  ]),
  F("LEFT", "IZQUIERDA", "text", "First characters of a text.", "Primeros caracteres de un texto.", [text, numCharsOpt]),
  F("RIGHT", "DERECHA", "text", "Last characters of a text.", "Últimos caracteres de un texto.", [text, numCharsOpt]),
  F("MID", "EXTRAE", "text", "Characters from the middle of a text.", "Caracteres del medio de un texto.", [text, A("start_num", "posición_inicial", "Position of the first character.", "Posición del primer carácter."), A("num_chars", "núm_de_caracteres", "How many characters.", "Cuántos caracteres.")]),
  F("LEN", "LARGO", "text", "Number of characters of a text.", "Número de caracteres de un texto.", [text]),
  F("UPPER", "MAYUSC", "text", "Converts a text to upper case.", "Convierte un texto a mayúsculas.", [text]),
  F("LOWER", "MINUSC", "text", "Converts a text to lower case.", "Convierte un texto a minúsculas.", [text]),
  F("PROPER", "NOMPROPIO", "text", "Capitalises each word.", "Pone en mayúscula la primera letra de cada palabra.", [text]),
  F("TRIM", "ESPACIOS", "text", "Removes extra spaces.", "Quita los espacios sobrantes.", [text]),
  F("VALUE", "VALOR", "text", "Converts a text into a number.", "Convierte un texto en número.", [text]),
  F("SUBSTITUTE", "SUSTITUIR", "text", "Replaces text inside a text.", "Reemplaza texto dentro de un texto.", [
    text, A("old_text", "texto_original", "Text to replace.", "Texto a reemplazar."), A("new_text", "texto_nuevo", "Replacement.", "Reemplazo."), A("instance_num", "núm_de_instancia", "Which occurrence (default: all).", "Qué aparición (por defecto: todas).", "o"),
  ]),
  F("FIND", "ENCONTRAR", "text", "Position of a text inside another (case-sensitive).", "Posición de un texto dentro de otro (distingue mayúsculas).", [
    A("find_text", "texto_buscado", "Text to find.", "Texto a buscar."), A("within_text", "dentro_del_texto", "Text to search in.", "Texto donde buscar."), A("start_num", "núm_inicial", "Starting position (default 1).", "Posición inicial (por defecto 1).", "o"),
  ]),
  F("SEARCH", "HALLAR", "text", "Position of a text inside another (not case-sensitive).", "Posición de un texto dentro de otro (sin distinguir mayúsculas).", [
    A("find_text", "texto_buscado", "Text to find.", "Texto a buscar."), A("within_text", "dentro_del_texto", "Text to search in.", "Texto donde buscar."), A("start_num", "núm_inicial", "Starting position (default 1).", "Posición inicial (por defecto 1).", "o"),
  ]),
  F("REPT", "REPETIR", "text", "Repeats a text a number of times.", "Repite un texto un número de veces.", [text, A("number_times", "núm_de_veces", "Repetitions.", "Repeticiones.")]),
  F("EXACT", "IGUAL", "text", "TRUE if two texts are exactly equal.", "VERDADERO si dos textos son exactamente iguales.", [A("text1", "texto1", "First text.", "Primer texto."), A("text2", "texto2", "Second text.", "Segundo texto.")]),

  // ---------------------------------------------------------------- information
  F("ISERROR", "ESERROR", "info", "TRUE if the value is an error.", "VERDADERO si el valor es un error.", [value]),
  F("ISNA", "ESNOD", "info", "TRUE if the value is #N/A.", "VERDADERO si el valor es #N/D.", [value]),
  F("ISNUMBER", "ESNUMERO", "info", "TRUE if the value is a number.", "VERDADERO si el valor es un número.", [value]),
  F("ISTEXT", "ESTEXTO", "info", "TRUE if the value is text.", "VERDADERO si el valor es texto.", [value]),
  F("ISBLANK", "ESBLANCO", "info", "TRUE if the cell is empty.", "VERDADERO si la celda está vacía.", [value]),
  F("NA", "NOD", "info", "The error value #N/A.", "El valor de error #N/D."),

  // ---------------------------------------------------------------- risk (ORS.*)
  F("ORS.NORMAL", "ORS.NORMAL", "risk", "Normal assumption; shows the mean, sampled during the simulation.", "Supuesto normal; muestra la media y se muestrea durante la simulación.", [distMean, distSd]),
  F("ORS.TRIANGULAR", "ORS.TRIANGULAR", "risk", "Triangular assumption; shows the mean.", "Supuesto triangular; muestra la media.", [minA, modeA, maxA]),
  F("ORS.UNIFORM", "ORS.UNIFORME", "risk", "Uniform assumption; shows the mean.", "Supuesto uniforme; muestra la media.", [minA, maxA]),
  F("ORS.PERT", "ORS.PERT", "risk", "PERT assumption; shows the mean.", "Supuesto PERT; muestra la media.", [minA, modeA, maxA]),
  F("ORS.LOGNORMAL", "ORS.LOGNORMAL", "risk", "Lognormal assumption (mean/std. dev. of the variable); shows the mean.", "Supuesto lognormal (media/desv. de la variable); muestra la media.", [distMean, distSd]),
  F("ORS.MIRR", "ORS.TIRM", "risk", "Modified internal rate of return of a cash-flow range.", "Tasa interna de retorno modificada de un rango de flujos.", [
    flows, A("finance_rate", "tasa_financiamiento", "Finance rate.", "Tasa de financiamiento."), A("reinvest_rate", "tasa_reinversión", "Reinvestment rate.", "Tasa de reinversión."),
  ]),
  F("ORS.PAYBACK", "ORS.RECUPERACION", "risk", "Payback period (fractional).", "Periodo de recuperación (fraccional).", [flows]),
  F("ORS.DPAYBACK", "ORS.RECUPERACIONDESC", "risk", "Discounted payback period.", "Periodo de recuperación descontado.", [A("rate", "tasa", "Discount rate.", "Tasa de descuento."), flows]),
  F("ORS.PI", "ORS.IR", "risk", "Profitability index: PV of later flows / |initial investment|.", "Índice de rentabilidad: VA de los flujos posteriores / |inversión inicial|.", [A("rate", "tasa", "Discount rate.", "Tasa de descuento."), flows]),
];

const BY_EN = new Map(FUNCTION_CATALOG.map((f) => [f.en, f]));

/** Catalog entry by canonical (English) name, case-insensitive. */
export function catalogEntry(enName: string): FnInfo | undefined {
  return BY_EN.get(enName.toUpperCase());
}

/** Name of a function in the UI locale. */
export function fnName(f: FnInfo, locale: UiLocale): string {
  return locale === "es" ? f.es : f.en;
}

export interface SignaturePart {
  text: string;
  /** index of the argument this part stands for (-1 for punctuation) */
  arg: number;
}

/**
 * Signature split in parts, e.g. VNA(tasa; valor1; [valor2]; …). For repeating groups the
 * `active` argument index (0-based, possibly beyond the declared args) is mapped onto the group.
 */
export function signatureParts(f: FnInfo, locale: UiLocale): SignaturePart[] {
  const sep = locale === "es" ? "; " : ", ";
  const parts: SignaturePart[] = [{ text: `${fnName(f, locale)}(`, arg: -1 }];
  f.args.forEach((a, i) => {
    if (i > 0) parts.push({ text: sep, arg: -1 });
    const name = locale === "es" ? a.es : a.en;
    parts.push({ text: a.opt ? `[${name}]` : name, arg: i });
  });
  if (f.args.some((a) => a.rep)) parts.push({ text: `${sep}…`, arg: -1 });
  parts.push({ text: ")", arg: -1 });
  return parts;
}

/** Map a call's argument index onto the declared argument (repeating groups wrap around). */
export function declaredArgIndex(f: FnInfo, index: number): number {
  const n = f.args.length;
  if (n === 0) return -1;
  if (index < n) return index;
  const first = f.args.findIndex((a) => a.rep);
  if (first < 0) return -1;
  const group = n - first;
  return first + ((index - first) % group);
}
