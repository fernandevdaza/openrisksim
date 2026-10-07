/**
 * Cell error values: Spanish spellings (as in Excel-es) and plain-language explanations.
 */
export type Lang = "es" | "en";

export const ERR_ES_TO_EN: Record<string, string> = {
  "#¡DIV/0!": "#DIV/0!",
  "#¿NOMBRE?": "#NAME?",
  "#¡VALOR!": "#VALUE!",
  "#¡REF!": "#REF!",
  "#¡NUM!": "#NUM!",
  "#¡NULO!": "#NULL!",
  "#N/D": "#N/A",
  "#¡CICLO!": "#CYCLE!",
  "#¡ERROR!": "#ERROR!",
  "#¡DESBORDAMIENTO!": "#SPILL!",
};
const ERR_EN_TO_ES: Record<string, string> = Object.fromEntries(Object.entries(ERR_ES_TO_EN).map(([es, en]) => [en, es]));

/** Error value in the UI locale ("#DIV/0!" → "#¡DIV/0!" in es). */
export function localizeError(err: string, locale: Lang): string {
  if (locale !== "es") return err;
  return ERR_EN_TO_ES[err.toUpperCase()] ?? err;
}

const BY_VALUE: Record<string, string> = {
  "#DIV/0!": "DIV_BY_ZERO",
  "#NAME?": "NAME",
  "#VALUE!": "VALUE",
  "#REF!": "REF",
  "#NUM!": "NUM",
  "#N/A": "NA",
  "#CYCLE!": "CYCLE",
  "#SPILL!": "SPILL",
  "#ERROR!": "ERROR",
  "#NULL!": "ERROR",
};

const TEXT: Record<string, { es: string; en: string }> = {
  DIV_BY_ZERO: {
    es: "División por cero: el divisor es 0 o una celda vacía. Revise el denominador o use SI.ERROR.",
    en: "Division by zero: the divisor is 0 or an empty cell. Check the denominator or use IFERROR.",
  },
  NAME: {
    es: "Nombre no reconocido: una función o un nombre definido no existe o está mal escrito (¿falta una comilla en un texto?).",
    en: "Unknown name: a function or defined name does not exist or is misspelled (missing quotes around a text?).",
  },
  VALUE: {
    es: "Tipo de valor incorrecto: la fórmula usa texto donde se espera un número, o un rango donde se espera una sola celda.",
    en: "Wrong type of value: the formula uses text where a number is expected, or a range where a single cell is expected.",
  },
  REF: {
    es: "Referencia no válida: la celda a la que apunta la fórmula ya no existe (fue movida o eliminada).",
    en: "Invalid reference: the cell the formula points to no longer exists (it was moved or deleted).",
  },
  NUM: {
    es: "Número no válido: un argumento está fuera de rango o el cálculo no converge (p. ej. TIR sin cambio de signo en los flujos).",
    en: "Invalid number: an argument is out of range or the calculation does not converge (e.g. IRR without a sign change in the cash flows).",
  },
  NA: {
    es: "Valor no disponible: la búsqueda no encontró el valor (BUSCARV, COINCIDIR…) o falta un dato.",
    en: "Value not available: a lookup did not find the value (VLOOKUP, MATCH…) or some data is missing.",
  },
  CYCLE: {
    es: "Referencia circular: la fórmula depende, directa o indirectamente, de su propia celda.",
    en: "Circular reference: the formula depends, directly or indirectly, on its own cell.",
  },
  SPILL: {
    es: "Desbordamiento: el resultado matricial no cabe porque hay celdas ocupadas en el camino.",
    en: "Spill: the array result does not fit because other cells are in the way.",
  },
  ERROR: {
    es: "La fórmula no se puede interpretar (error de sintaxis).",
    en: "The formula cannot be parsed (syntax error).",
  },
  LIC: { es: "Error de licencia del motor de cálculo.", en: "Formula engine licence error." },
};

/** Plain-language explanation of an error (type from the engine, or deduced from the value). */
export function explainError(err: { value: string; type?: string; message?: string }, locale: Lang): string {
  const type = err.type && TEXT[err.type] ? err.type : (BY_VALUE[err.value.toUpperCase()] ?? "ERROR");
  let text = TEXT[type][locale];
  const msg = err.message ?? "";
  const fn = /^Function name (.+) not recognized/i.exec(msg);
  const nm = /^Named-expression (.+) not recognized/i.exec(msg);
  if (fn) text = locale === "es" ? `La función «${fn[1]}» no existe o no está disponible. ${TEXT.NAME.es}` : `Function “${fn[1]}” does not exist or is not available. ${TEXT.NAME.en}`;
  else if (nm) text = locale === "es" ? `El nombre «${nm[1]}» no está definido (Fórmulas → Nombres definidos).` : `The name “${nm[1]}” is not defined (Formulas → Defined names).`;
  else if (msg && locale === "en" && !/^Parsing error/i.test(msg)) text += ` (${msg})`;
  return text;
}
