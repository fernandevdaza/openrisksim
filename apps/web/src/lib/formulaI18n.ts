/**
 * Spanish Excel function names → English (the formula engine uses English names, like the .xlsx
 * file format). Lets students type "=SUMA(A1:A3)" or "=VNA(B1;C2:C9)" as they would in Excel-es.
 */
const ES_TO_EN: Record<string, string> = {
  SUMA: "SUM",
  PRODUCTO: "PRODUCT",
  COCIENTE: "QUOTIENT",
  SIGNO: "SIGN",
  TRUNCAR: "TRUNC",
  "MULTIPLO.SUPERIOR": "CEILING",
  "MULTIPLO.INFERIOR": "FLOOR",
  "REDOND.MULT": "MROUND",
  "PROMEDIO.SI.CONJUNTO": "AVERAGEIFS",
  "BUSCARX": "XLOOKUP",
  TRANSPONER: "TRANSPOSE",
  "FIN.MES": "EOMONTH",
  "FECHA.MES": "EDATE",
  DIAS: "DAYS",
  "DÍAS": "DAYS",
  CRECIMIENTO: "GROWTH",
  TENDENCIA: "TREND",
  "ESTIMACION.LINEAL": "LINEST",
  "COVARIANZA.M": "COVARIANCE.S",
  "DISTR.LOGNORM": "LOGNORM.DIST",
  "INV.LOGNORM": "LOGNORM.INV",
  "JERARQUIA": "RANK",
  "K.ESIMO.MAYOR": "LARGE",
  "K.ESIMO.MENOR": "SMALL",
  "SUMA.CUADRADOS": "SUMSQ",
  "ESERROR": "ISERROR",
  "ESNUMERO": "ISNUMBER",
  "ESBLANCO": "ISBLANK",
  "SUMA.PRODUCTO": "SUMPRODUCT",
  SUMAPRODUCTO: "SUMPRODUCT",
  "SUMAR.SI": "SUMIF",
  "SUMAR.SI.CONJUNTO": "SUMIFS",
  PROMEDIO: "AVERAGE",
  "PROMEDIO.SI": "AVERAGEIF",
  CONTAR: "COUNT",
  CONTARA: "COUNTA",
  "CONTAR.SI": "COUNTIF",
  "CONTAR.SI.CONJUNTO": "COUNTIFS",
  "CONTAR.BLANCO": "COUNTBLANK",
  SI: "IF",
  "SI.ERROR": "IFERROR",
  Y: "AND",
  O: "OR",
  NO: "NOT",
  MAX: "MAX",
  MIN: "MIN",
  ABS: "ABS",
  REDONDEAR: "ROUND",
  "REDONDEAR.MAS": "ROUNDUP",
  "REDONDEAR.MENOS": "ROUNDDOWN",
  ENTERO: "INT",
  RESIDUO: "MOD",
  POTENCIA: "POWER",
  RAIZ: "SQRT",
  EXP: "EXP",
  LN: "LN",
  LOG: "LOG",
  LOG10: "LOG10",
  PI: "PI",
  VNA: "NPV",
  TIR: "IRR",
  TIRM: "MIRR",
  "VNA.NO.PER": "XNPV",
  "TIR.NO.PER": "XIRR",
  VA: "PV",
  VF: "FV",
  PAGO: "PMT",
  PAGOINT: "IPMT",
  PAGOPRIN: "PPMT",
  NPER: "NPER",
  TASA: "RATE",
  "INT.EFECTIVO": "EFFECT",
  "TASA.NOMINAL": "NOMINAL",
  SLN: "SLN",
  SYD: "SYD",
  DB: "DB",
  DDB: "DDB",
  BUSCARV: "VLOOKUP",
  BUSCARH: "HLOOKUP",
  BUSCAR: "LOOKUP",
  INDICE: "INDEX",
  COINCIDIR: "MATCH",
  ELEGIR: "CHOOSE",
  DESREF: "OFFSET",
  HOY: "TODAY",
  AHORA: "NOW",
  FECHA: "DATE",
  "AÑO": "YEAR",
  ANO: "YEAR",
  MES: "MONTH",
  DIA: "DAY",
  "DÍA": "DAY",
  CONCATENAR: "CONCATENATE",
  TEXTO: "TEXT",
  VALOR: "VALUE",
  IZQUIERDA: "LEFT",
  DERECHA: "RIGHT",
  EXTRAE: "MID",
  LARGO: "LEN",
  MAYUSC: "UPPER",
  MINUSC: "LOWER",
  ESPACIOS: "TRIM",
  MEDIANA: "MEDIAN",
  MODA: "MODE",
  "DESVEST": "STDEV",
  "DESVEST.M": "STDEV.S",
  "DESVEST.P": "STDEV.P",
  "VAR.S": "VAR.S",
  "VAR.P": "VAR.P",
  "PERCENTIL": "PERCENTILE",
  "PERCENTIL.INC": "PERCENTILE.INC",
  "PRONOSTICO": "FORECAST",
  "PRONÓSTICO": "FORECAST",
  PENDIENTE: "SLOPE",
  "INTERSECCION.EJE": "INTERCEPT",
  "COEF.DE.CORREL": "CORREL",
  "DISTR.NORM.N": "NORM.DIST",
  "INV.NORM": "NORM.INV",
  "DISTR.NORM.ESTAND.N": "NORM.S.DIST",
  "INV.NORM.ESTAND": "NORM.S.INV",
  ALEATORIO: "RAND",
  "ALEATORIO.ENTRE": "RANDBETWEEN",
  VERDADERO: "TRUE",
  FALSO: "FALSE",
  "ORS.UNIFORME": "ORS.UNIFORM",
  "ORS.TIRM": "ORS.MIRR",
  "ORS.RECUPERACION": "ORS.PAYBACK",
  "ORS.RECUPERACIONDESC": "ORS.DPAYBACK",
  "ORS.IR": "ORS.PI",
};

/** Translate function names (identifiers immediately followed by "(") outside string literals. */
export function translateFormulaToEnglish(formula: string): string {
  let out = "";
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === '"') {
      const end = formula.indexOf('"', i + 1);
      const stop = end < 0 ? formula.length : end + 1;
      out += formula.slice(i, stop);
      i = stop;
      continue;
    }
    const m = /^[A-Za-zÁÉÍÓÚÑáéíóúñ_][A-Za-z0-9ÁÉÍÓÚÑáéíóúñ_.]*/.exec(formula.slice(i));
    if (m) {
      const word = m[0];
      const next = formula[i + word.length];
      const prev = i > 0 ? formula[i - 1] : "";
      const isFn = next === "(" && prev !== "!" && prev !== "'";
      const mapped = isFn ? ES_TO_EN[word.toUpperCase()] : undefined;
      out += mapped ?? word;
      i += word.length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
