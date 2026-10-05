/**
 * Distribution registry: bilingual metadata for the UI, validation, construction of live
 * `Distribution` objects (with truncation) and plotting helpers.
 */
import {
  DISTRIBUTION_IDS,
  type Distribution,
  type DistributionId,
  type DistributionMeta,
  type DistributionSpec,
  type I18nText,
  type ParamMeta,
  type Rng,
} from "@openrisksim/core";
import { FAMILY_FACTORIES, type BaseDist } from "./families";
import { TruncationError, truncateDist } from "./truncate";

/* ------------------------------------------------------------------------------------------ */
/* Metadata                                                                                    */
/* ------------------------------------------------------------------------------------------ */

const t = (en: string, es: string): I18nText => ({ en, es });

const L = {
  mean: t("Mean", "Media"),
  stdDev: t("Standard deviation", "Desviación estándar"),
  min: t("Minimum", "Mínimo"),
  max: t("Maximum", "Máximo"),
  mode: t("Most likely", "Más probable"),
  alpha: t("Alpha (shape 1)", "Alfa (forma 1)"),
  beta: t("Beta (shape 2)", "Beta (forma 2)"),
  shape: t("Shape", "Forma"),
  scale: t("Scale", "Escala"),
  location: t("Location", "Ubicación"),
  rate: t("Rate", "Tasa"),
  df: t("Degrees of freedom", "Grados de libertad"),
};

type PM = ParamMeta;
const pos = (key: string, label: I18nText, def: number, extra: Partial<PM> = {}): PM => ({
  key,
  label,
  default: def,
  min: 0,
  exclusiveMin: true,
  ...extra,
});
const any = (key: string, label: I18nText, def: number, extra: Partial<PM> = {}): PM => ({
  key,
  label,
  default: def,
  ...extra,
});
const prob = (key: string, label: I18nText, def: number, exclusiveMin = false): PM => ({
  key,
  label,
  default: def,
  min: 0,
  max: 1,
  exclusiveMin,
});

export const DISTRIBUTION_META: DistributionMeta[] = [
  {
    id: "normal",
    kind: "continuous",
    name: t("Normal", "Normal"),
    description: t(
      "Symmetric bell-shaped distribution defined by its mean and standard deviation.",
      "Distribución simétrica en forma de campana, definida por su media y su desviación estándar.",
    ),
    usage: t(
      "Measurement errors, natural phenomena and quantities that add up many small independent effects (central limit theorem).",
      "Errores de medición, fenómenos naturales y magnitudes que resultan de sumar muchos efectos pequeños e independientes (teorema central del límite).",
    ),
    params: [any("mean", L.mean, 100), pos("stdDev", L.stdDev, 10)],
  },
  {
    id: "lognormal",
    kind: "continuous",
    name: t("Lognormal", "Lognormal"),
    description: t(
      "Positive, right-skewed distribution whose logarithm is normal. Parameters are the mean and standard deviation of the variable itself (not of its logarithm).",
      "Distribución positiva y asimétrica a la derecha cuyo logaritmo es normal. Los parámetros son la media y la desviación estándar de la propia variable (no de su logaritmo).",
    ),
    usage: t(
      "Prices, costs, incomes, real-estate values and other quantities that cannot be negative and grow multiplicatively.",
      "Precios, costos, ingresos, valores inmobiliarios y otras magnitudes que no pueden ser negativas y crecen de forma multiplicativa.",
    ),
    params: [pos("mean", L.mean, 100), pos("stdDev", L.stdDev, 30)],
  },
  {
    id: "uniform",
    kind: "continuous",
    name: t("Uniform", "Uniforme"),
    description: t(
      "Every value between the minimum and the maximum is equally likely.",
      "Todos los valores entre el mínimo y el máximo son igualmente probables.",
    ),
    usage: t(
      "When only the range is known and no value is more plausible than another.",
      "Cuando solo se conoce el rango y ningún valor es más verosímil que otro.",
    ),
    params: [any("min", L.min, 80), any("max", L.max, 120)],
  },
  {
    id: "triangular",
    kind: "continuous",
    name: t("Triangular", "Triangular"),
    description: t(
      "Defined by a minimum, a most likely value and a maximum; the density is a triangle.",
      "Definida por un mínimo, un valor más probable y un máximo; la densidad tiene forma de triángulo.",
    ),
    usage: t(
      "Expert estimates (pessimistic / most likely / optimistic) of costs, durations or sales when data are scarce.",
      "Estimaciones de expertos (pesimista / más probable / optimista) de costos, duraciones o ventas cuando hay pocos datos.",
    ),
    params: [any("min", L.min, 80), any("mode", L.mode, 100), any("max", L.max, 130)],
  },
  {
    id: "pert",
    kind: "continuous",
    name: t("PERT", "PERT"),
    description: t(
      "Smooth beta-shaped alternative to the triangular distribution that gives more weight to the most likely value; mean = (min + 4·mode + max)/6.",
      "Alternativa suave a la triangular, con forma beta, que da más peso al valor más probable; media = (mín + 4·moda + máx)/6.",
    ),
    usage: t(
      "Task durations and costs in project management (three-point estimates).",
      "Duraciones y costos de tareas en gestión de proyectos (estimaciones de tres puntos).",
    ),
    params: [any("min", L.min, 80), any("mode", L.mode, 100), any("max", L.max, 130)],
  },
  {
    id: "beta",
    kind: "continuous",
    name: t("Beta", "Beta"),
    description: t(
      "Very flexible distribution on a bounded interval [min, max] (by default [0, 1]) controlled by two shape parameters.",
      "Distribución muy flexible sobre un intervalo acotado [mín, máx] (por defecto [0, 1]) controlada por dos parámetros de forma.",
    ),
    usage: t(
      "Proportions, percentages, probabilities and rates bounded between two limits.",
      "Proporciones, porcentajes, probabilidades y tasas acotadas entre dos límites.",
    ),
    params: [pos("alpha", L.alpha, 2), pos("beta", L.beta, 5), any("min", L.min, 0), any("max", L.max, 1)],
  },
  {
    id: "gamma",
    kind: "continuous",
    name: t("Gamma", "Gamma"),
    description: t(
      "Positive, right-skewed distribution with shape and scale parameters; mean = shape·scale.",
      "Distribución positiva y asimétrica a la derecha con parámetros de forma y escala; media = forma·escala.",
    ),
    usage: t(
      "Waiting times, insurance claim sizes, rainfall amounts and other positive skewed quantities.",
      "Tiempos de espera, montos de siniestros, precipitaciones y otras magnitudes positivas y asimétricas.",
    ),
    params: [pos("shape", L.shape, 2), pos("scale", L.scale, 10)],
  },
  {
    id: "exponential",
    kind: "continuous",
    name: t("Exponential", "Exponencial"),
    description: t(
      "Time between events of a Poisson process with a constant rate; memoryless. Mean = 1/rate.",
      "Tiempo entre eventos de un proceso de Poisson con tasa constante; sin memoria. Media = 1/tasa.",
    ),
    usage: t(
      "Time between arrivals, failures of components with a constant failure rate, service times.",
      "Tiempo entre llegadas, fallas de componentes con tasa de falla constante, tiempos de servicio.",
    ),
    params: [pos("rate", L.rate, 0.1)],
  },
  {
    id: "weibull",
    kind: "continuous",
    name: t("Weibull", "Weibull"),
    description: t(
      "Flexible distribution for lifetimes; shape < 1 means decreasing failure rate, = 1 exponential, > 1 wear-out.",
      "Distribución flexible para tiempos de vida; forma < 1 indica tasa de falla decreciente, = 1 exponencial y > 1 desgaste.",
    ),
    usage: t(
      "Reliability and lifetime of equipment, wind speeds, time to failure.",
      "Confiabilidad y vida útil de equipos, velocidad del viento, tiempo hasta la falla.",
    ),
    params: [pos("shape", L.shape, 2), pos("scale", L.scale, 100), any("location", L.location, 0)],
  },
  {
    id: "logistic",
    kind: "continuous",
    name: t("Logistic", "Logística"),
    description: t(
      "Symmetric bell-shaped distribution similar to the normal but with heavier tails.",
      "Distribución simétrica en forma de campana, parecida a la normal pero con colas más pesadas.",
    ),
    usage: t(
      "Growth processes, demographic and market-share models, alternative to the normal with more extreme values.",
      "Procesos de crecimiento, modelos demográficos y de participación de mercado; alternativa a la normal con más valores extremos.",
    ),
    params: [any("mean", L.mean, 100), pos("scale", L.scale, 5)],
  },
  {
    id: "studentT",
    kind: "continuous",
    name: t("Student's t", "t de Student"),
    description: t(
      "Symmetric distribution with heavier tails than the normal; with location (mean) and scale. Approaches the normal as the degrees of freedom grow.",
      "Distribución simétrica con colas más pesadas que la normal, con ubicación (media) y escala. Se aproxima a la normal cuando aumentan los grados de libertad.",
    ),
    usage: t(
      "Financial returns with fat tails, small-sample uncertainty.",
      "Rendimientos financieros con colas pesadas, incertidumbre con muestras pequeñas.",
    ),
    params: [pos("df", L.df, 5), any("mean", L.mean, 0), pos("scale", L.scale, 1)],
  },
  {
    id: "chiSquare",
    kind: "continuous",
    name: t("Chi-square", "Chi-cuadrado"),
    description: t(
      "Sum of squares of independent standard normal variables; mean = degrees of freedom.",
      "Suma de cuadrados de variables normales estándar independientes; media = grados de libertad.",
    ),
    usage: t("Variances, goodness-of-fit and hypothesis testing.", "Varianzas, bondad de ajuste y pruebas de hipótesis."),
    params: [pos("df", L.df, 5)],
  },
  {
    id: "f",
    kind: "continuous",
    name: t("F (Fisher–Snedecor)", "F (Fisher–Snedecor)"),
    description: t(
      "Ratio of two independent chi-square variables, each divided by its degrees of freedom.",
      "Cociente de dos variables chi-cuadrado independientes, cada una dividida entre sus grados de libertad.",
    ),
    usage: t("Ratios of variances, analysis of variance (ANOVA).", "Cocientes de varianzas, análisis de varianza (ANOVA)."),
    params: [
      pos("df1", t("Numerator degrees of freedom", "Grados de libertad del numerador"), 5),
      pos("df2", t("Denominator degrees of freedom", "Grados de libertad del denominador"), 10),
    ],
  },
  {
    id: "cauchy",
    kind: "continuous",
    name: t("Cauchy", "Cauchy"),
    description: t(
      "Symmetric distribution with extremely heavy tails; its mean and variance are undefined.",
      "Distribución simétrica de colas extremadamente pesadas; su media y su varianza no están definidas.",
    ),
    usage: t(
      "Stress-testing models with very extreme outcomes; resonance phenomena in physics.",
      "Pruebas de estrés de modelos con resultados muy extremos; fenómenos de resonancia en física.",
    ),
    params: [any("location", L.location, 0), pos("scale", L.scale, 1)],
  },
  {
    id: "gumbel",
    kind: "continuous",
    name: t("Gumbel (maximum)", "Gumbel (máximo)"),
    description: t(
      "Extreme value distribution of the maximum of many observations; right-skewed.",
      "Distribución de valores extremos para el máximo de muchas observaciones; asimétrica a la derecha.",
    ),
    usage: t(
      "Maximum floods, peak loads, largest daily losses, extreme weather.",
      "Crecidas máximas, cargas pico, mayores pérdidas diarias, eventos climáticos extremos.",
    ),
    params: [any("location", L.location, 100), pos("scale", L.scale, 10)],
  },
  {
    id: "frechet",
    kind: "continuous",
    name: t("Fréchet", "Fréchet"),
    description: t(
      "Heavy-tailed extreme value distribution (type II), bounded below by the location.",
      "Distribución de valores extremos de cola pesada (tipo II), acotada inferiormente por la ubicación.",
    ),
    usage: t(
      "Extreme financial losses, maximum rainfall, catastrophic insurance claims.",
      "Pérdidas financieras extremas, precipitaciones máximas, siniestros catastróficos.",
    ),
    params: [pos("shape", L.shape, 3), pos("scale", L.scale, 100), any("location", L.location, 0)],
  },
  {
    id: "pareto",
    kind: "continuous",
    name: t("Pareto", "Pareto"),
    description: t(
      "Power-law distribution starting at the scale (minimum value); small shapes produce very heavy tails.",
      "Distribución de ley de potencia que empieza en la escala (valor mínimo); formas pequeñas producen colas muy pesadas.",
    ),
    usage: t(
      "Income and wealth distribution, city sizes, large insurance losses (80/20 rule).",
      "Distribución del ingreso y la riqueza, tamaño de ciudades, grandes pérdidas aseguradas (regla 80/20).",
    ),
    params: [pos("shape", L.shape, 3), pos("scale", t("Scale (minimum)", "Escala (mínimo)"), 100)],
  },
  {
    id: "laplace",
    kind: "continuous",
    name: t("Laplace (double exponential)", "Laplace (doble exponencial)"),
    description: t(
      "Symmetric distribution with a sharp peak at the location and exponential tails.",
      "Distribución simétrica con un pico agudo en la ubicación y colas exponenciales.",
    ),
    usage: t(
      "Daily price changes, forecast errors, differences between two exponential variables.",
      "Variaciones diarias de precios, errores de pronóstico, diferencias entre dos variables exponenciales.",
    ),
    params: [any("location", L.location, 100), pos("scale", L.scale, 10)],
  },
  {
    id: "rayleigh",
    kind: "continuous",
    name: t("Rayleigh", "Rayleigh"),
    description: t(
      "Magnitude of a two-dimensional vector whose components are independent normals.",
      "Magnitud de un vector bidimensional cuyas componentes son normales independientes.",
    ),
    usage: t("Wind speeds, wave heights, signal amplitudes.", "Velocidad del viento, altura de olas, amplitud de señales."),
    params: [pos("scale", L.scale, 10)],
  },
  {
    id: "erlang",
    kind: "continuous",
    name: t("Erlang", "Erlang"),
    description: t(
      "Sum of k independent exponential times with the same rate (gamma with integer shape).",
      "Suma de k tiempos exponenciales independientes con la misma tasa (gamma con forma entera).",
    ),
    usage: t(
      "Total time to complete k sequential tasks, queueing and call-centre models.",
      "Tiempo total para completar k tareas sucesivas, modelos de colas y centros de llamadas.",
    ),
    params: [
      { key: "k", label: t("Shape (k)", "Forma (k)"), default: 3, integer: true, min: 1 },
      pos("rate", L.rate, 0.5),
    ],
  },
  {
    id: "arcsine",
    kind: "continuous",
    name: t("Arcsine", "Arcoseno"),
    description: t(
      "U-shaped distribution on [min, max]: values near the extremes are the most likely.",
      "Distribución en forma de U sobre [mín, máx]: los valores cercanos a los extremos son los más probables.",
    ),
    usage: t(
      "Proportion of time a random walk stays positive; variables that tend to the extremes.",
      "Proporción del tiempo en que una caminata aleatoria permanece positiva; variables que tienden a los extremos.",
    ),
    params: [any("min", L.min, 0), any("max", L.max, 1)],
  },
  {
    id: "cosine",
    kind: "continuous",
    name: t("Cosine", "Coseno"),
    description: t(
      "Symmetric bell-shaped distribution on a bounded interval, with a cosine density.",
      "Distribución simétrica en forma de campana sobre un intervalo acotado, con densidad cosenoidal.",
    ),
    usage: t(
      "Bounded symmetric quantities, an alternative to the triangular or the truncated normal.",
      "Magnitudes simétricas y acotadas; alternativa a la triangular o a la normal truncada.",
    ),
    params: [any("min", L.min, 0), any("max", L.max, 100)],
  },
  {
    id: "powerFunction",
    kind: "continuous",
    name: t("Power function", "Función potencia"),
    description: t(
      "Distribution on [min, max] with F(x) = ((x − min)/(max − min))^α; a beta with β = 1.",
      "Distribución sobre [mín, máx] con F(x) = ((x − mín)/(máx − mín))^α; una beta con β = 1.",
    ),
    usage: t(
      "Bounded quantities skewed towards one end, such as utilisation rates or yields.",
      "Magnitudes acotadas sesgadas hacia uno de los extremos, como tasas de utilización o rendimientos.",
    ),
    params: [pos("alpha", t("Alpha (shape)", "Alfa (forma)"), 2), any("min", L.min, 0), any("max", L.max, 100)],
  },
  {
    id: "trapezoidal",
    kind: "continuous",
    name: t("Trapezoidal", "Trapezoidal"),
    description: t(
      "Density rises linearly from the minimum to the first mode, stays flat up to the second mode and falls to the maximum.",
      "La densidad sube linealmente del mínimo a la primera moda, se mantiene constante hasta la segunda y baja hasta el máximo.",
    ),
    usage: t(
      "Expert estimates where a whole range of values is considered equally likely.",
      "Estimaciones de expertos en las que todo un rango de valores se considera igualmente probable.",
    ),
    params: [
      any("min", L.min, 0),
      any("mode1", t("Lower mode", "Moda inferior"), 30),
      any("mode2", t("Upper mode", "Moda superior"), 70),
      any("max", L.max, 100),
    ],
  },
  {
    id: "bernoulli",
    kind: "discrete",
    name: t("Bernoulli (yes/no)", "Bernoulli (sí/no)"),
    description: t(
      "Takes the value 1 with probability p and 0 otherwise.",
      "Toma el valor 1 con probabilidad p y 0 en caso contrario.",
    ),
    usage: t(
      "Whether an event happens: a risk materialises, a contract is won, a test passes.",
      "Si un evento ocurre o no: se materializa un riesgo, se gana un contrato, se aprueba una prueba.",
    ),
    params: [prob("p", t("Probability of success", "Probabilidad de éxito"), 0.5)],
  },
  {
    id: "binomial",
    kind: "discrete",
    name: t("Binomial", "Binomial"),
    description: t(
      "Number of successes in n independent trials with the same probability of success p.",
      "Número de éxitos en n ensayos independientes con la misma probabilidad de éxito p.",
    ),
    usage: t(
      "Defective units in a batch, customers who buy out of n contacted, approved projects.",
      "Unidades defectuosas en un lote, clientes que compran de n contactados, proyectos aprobados.",
    ),
    params: [
      { key: "n", label: t("Number of trials", "Número de ensayos"), default: 10, integer: true, min: 1 },
      prob("p", t("Probability of success", "Probabilidad de éxito"), 0.5),
    ],
  },
  {
    id: "poisson",
    kind: "discrete",
    name: t("Poisson", "Poisson"),
    description: t(
      "Number of events in a fixed interval when they occur independently at a constant average rate λ.",
      "Número de eventos en un intervalo fijo cuando ocurren de forma independiente a una tasa media constante λ.",
    ),
    usage: t(
      "Customer arrivals per hour, accidents per month, defects per unit, calls received.",
      "Llegadas de clientes por hora, accidentes por mes, defectos por unidad, llamadas recibidas.",
    ),
    params: [pos("lambda", t("Mean number of events (λ)", "Número medio de eventos (λ)"), 5)],
  },
  {
    id: "geometric",
    kind: "discrete",
    name: t("Geometric", "Geométrica"),
    description: t(
      "Number of failures before the first success in independent trials with probability p.",
      "Número de fracasos antes del primer éxito en ensayos independientes con probabilidad p.",
    ),
    usage: t(
      "Attempts needed before closing a sale, wells drilled before finding oil.",
      "Intentos necesarios antes de cerrar una venta, pozos perforados antes de encontrar petróleo.",
    ),
    params: [prob("p", t("Probability of success", "Probabilidad de éxito"), 0.2, true)],
  },
  {
    id: "negativeBinomial",
    kind: "discrete",
    name: t("Negative binomial", "Binomial negativa"),
    description: t(
      "Number of failures before the r-th success in independent trials with probability p.",
      "Número de fracasos antes del r-ésimo éxito en ensayos independientes con probabilidad p.",
    ),
    usage: t(
      "Over-dispersed counts (variance greater than the mean), calls needed to reach r sales.",
      "Conteos sobredispersos (varianza mayor que la media), llamadas necesarias para lograr r ventas.",
    ),
    params: [
      pos("r", t("Number of successes (r)", "Número de éxitos (r)"), 5),
      prob("p", t("Probability of success", "Probabilidad de éxito"), 0.5, true),
    ],
  },
  {
    id: "hypergeometric",
    kind: "discrete",
    name: t("Hypergeometric", "Hipergeométrica"),
    description: t(
      "Number of successes in a sample drawn without replacement from a finite population.",
      "Número de éxitos en una muestra extraída sin reemplazo de una población finita.",
    ),
    usage: t(
      "Quality inspection of lots, audits, sampling from a finite list.",
      "Inspección de calidad de lotes, auditorías, muestreo de una lista finita.",
    ),
    params: [
      { key: "population", label: t("Population size", "Tamaño de la población"), default: 50, integer: true, min: 1 },
      { key: "successes", label: t("Successes in the population", "Éxitos en la población"), default: 15, integer: true, min: 0 },
      { key: "draws", label: t("Sample size (draws)", "Tamaño de la muestra (extracciones)"), default: 10, integer: true, min: 0 },
    ],
  },
  {
    id: "discreteUniform",
    kind: "discrete",
    name: t("Discrete uniform", "Uniforme discreta"),
    description: t(
      "Every integer between the minimum and the maximum is equally likely.",
      "Todos los enteros entre el mínimo y el máximo son igualmente probables.",
    ),
    usage: t("Dice, random choice among numbered options.", "Dados, elección al azar entre opciones numeradas."),
    params: [
      { key: "min", label: L.min, default: 1, integer: true },
      { key: "max", label: L.max, default: 6, integer: true },
    ],
  },
  {
    id: "custom",
    kind: "discrete",
    name: t("Custom", "Personalizada"),
    description: t(
      "Defined by your own data: a list of values with weights (discrete) or, without weights, an empirical continuous distribution that interpolates the data.",
      "Definida con sus propios datos: una lista de valores con pesos (discreta) o, sin pesos, una distribución empírica continua que interpola los datos.",
    ),
    usage: t(
      "Historical data, scenarios with subjective probabilities, any shape not covered by the standard families.",
      "Datos históricos, escenarios con probabilidades subjetivas o cualquier forma que no cubran las familias estándar.",
    ),
    params: [],
  },
  {
    id: "fixed",
    kind: "discrete",
    name: t("Fixed value", "Valor fijo"),
    description: t("A constant: always takes the same value.", "Una constante: siempre toma el mismo valor."),
    usage: t(
      "Temporarily removing the uncertainty of an input without deleting the assumption.",
      "Eliminar temporalmente la incertidumbre de una variable sin borrar el supuesto.",
    ),
    params: [any("value", t("Value", "Valor"), 100)],
  },
];

const META_BY_ID = new Map<DistributionId, DistributionMeta>(DISTRIBUTION_META.map((m) => [m.id, m]));

/** Parameters that may be omitted (filled with these defaults). */
const OPTIONAL_PARAMS: Partial<Record<DistributionId, Record<string, number>>> = {
  weibull: { location: 0 },
  frechet: { location: 0 },
  beta: { min: 0, max: 1 },
};

export function getDistributionMeta(id: DistributionId): DistributionMeta {
  const m = META_BY_ID.get(id);
  if (!m) throw new DistributionError(`Unknown distribution "${String(id)}"`);
  return m;
}

/** Default spec for a family (parameter defaults from the metadata). */
export function defaultSpec(id: DistributionId): DistributionSpec {
  const meta = getDistributionMeta(id);
  const params: Record<string, number> = {};
  for (const p of meta.params) params[p.key] = p.default;
  if (id === "custom") return { id, params, values: [1, 2, 3], weights: [0.25, 0.5, 0.25] };
  return { id, params };
}

/* ------------------------------------------------------------------------------------------ */
/* Validation                                                                                  */
/* ------------------------------------------------------------------------------------------ */

export interface SpecError {
  key: string;
  message: I18nText;
}

export class DistributionError extends Error {
  readonly errors: SpecError[];
  constructor(message: string, errors: SpecError[] = []) {
    super(message);
    this.name = "DistributionError";
    this.errors = errors;
  }
}

const fmt = (v: number): string => String(v);

function paramValue(spec: DistributionSpec, key: string): number | undefined {
  const opt = OPTIONAL_PARAMS[spec.id];
  const v = spec.params?.[key];
  if (v === undefined || v === null) return opt && key in opt ? opt[key] : undefined;
  return v;
}

function crossChecks(id: DistributionId, v: Record<string, number>, errors: SpecError[]): void {
  const minLtMax = (minKey = "min", maxKey = "max"): boolean => {
    if (!(v[minKey] < v[maxKey])) {
      errors.push({
        key: maxKey,
        message: t("The minimum must be less than the maximum", "El mínimo debe ser menor que el máximo"),
      });
      return false;
    }
    return true;
  };
  switch (id) {
    case "uniform":
    case "beta":
    case "arcsine":
    case "cosine":
    case "powerFunction":
      minLtMax();
      break;
    case "triangular":
    case "pert":
      if (minLtMax() && !(v.mode >= v.min && v.mode <= v.max)) {
        errors.push({
          key: "mode",
          message: t(
            "The most likely value must lie between the minimum and the maximum (min ≤ mode ≤ max)",
            "El valor más probable debe estar entre el mínimo y el máximo (mín ≤ moda ≤ máx)",
          ),
        });
      }
      break;
    case "trapezoidal":
      if (minLtMax()) {
        if (!(v.mode1 >= v.min && v.mode1 <= v.mode2)) {
          errors.push({
            key: "mode1",
            message: t(
              "The lower mode must lie between the minimum and the upper mode (min ≤ mode1 ≤ mode2)",
              "La moda inferior debe estar entre el mínimo y la moda superior (mín ≤ moda inferior ≤ moda superior)",
            ),
          });
        } else if (!(v.mode2 <= v.max)) {
          errors.push({
            key: "mode2",
            message: t(
              "The upper mode cannot exceed the maximum (mode2 ≤ max)",
              "La moda superior no puede superar el máximo (moda superior ≤ máx)",
            ),
          });
        }
      }
      break;
    case "discreteUniform":
      if (!(v.min <= v.max)) {
        errors.push({
          key: "max",
          message: t(
            "The minimum must be less than or equal to the maximum",
            "El mínimo debe ser menor o igual que el máximo",
          ),
        });
      }
      break;
    case "hypergeometric":
      if (v.successes > v.population) {
        errors.push({
          key: "successes",
          message: t(
            "The successes cannot exceed the population size",
            "Los éxitos no pueden superar el tamaño de la población",
          ),
        });
      }
      if (v.draws > v.population) {
        errors.push({
          key: "draws",
          message: t(
            "The sample size cannot exceed the population size",
            "El tamaño de la muestra no puede superar el tamaño de la población",
          ),
        });
      }
      break;
    default:
      break;
  }
}

function validateCustom(spec: DistributionSpec, errors: SpecError[]): void {
  const values = spec.values;
  if (!Array.isArray(values) || values.length === 0) {
    errors.push({ key: "values", message: t("Enter at least one value", "Ingrese al menos un valor") });
    return;
  }
  if (!values.every((x) => typeof x === "number" && Number.isFinite(x))) {
    errors.push({
      key: "values",
      message: t("All values must be finite numbers", "Todos los valores deben ser números finitos"),
    });
  }
  const w = spec.weights;
  if (w && w.length > 0) {
    if (w.length !== values.length) {
      errors.push({
        key: "weights",
        message: t("There must be exactly one weight per value", "Debe haber exactamente un peso por cada valor"),
      });
      return;
    }
    if (!w.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0)) {
      errors.push({
        key: "weights",
        message: t("Weights must be non-negative numbers", "Los pesos deben ser números no negativos"),
      });
    } else if (!(w.reduce((s, x) => s + x, 0) > 0)) {
      errors.push({
        key: "weights",
        message: t("At least one weight must be positive", "Al menos un peso debe ser positivo"),
      });
    }
  }
}

/** Effective params with optional ones filled in. Assumes the spec is valid. */
function effectiveSpec(spec: DistributionSpec): DistributionSpec {
  const opt = OPTIONAL_PARAMS[spec.id];
  const params = { ...(opt ?? {}), ...(spec.params ?? {}) };
  for (const k of Object.keys(params)) {
    if (params[k] === undefined || params[k] === null) params[k] = opt?.[k] as number;
  }
  return { ...spec, params };
}

/** Validate a spec without building it. Messages are bilingual. */
export function validateSpec(
  spec: DistributionSpec,
): { ok: true } | { ok: false; errors: { key: string; message: I18nText }[] } {
  const errors: SpecError[] = [];
  const meta = spec && META_BY_ID.get(spec.id);
  if (!meta) {
    return {
      ok: false,
      errors: [
        {
          key: "id",
          message: t(
            `Unknown distribution "${String(spec?.id)}"`,
            `Distribución desconocida «${String(spec?.id)}»`,
          ),
        },
      ],
    };
  }
  const values: Record<string, number> = {};
  if (spec.id === "custom") {
    validateCustom(spec, errors);
  } else {
    for (const pm of meta.params) {
      const v = paramValue(spec, pm.key);
      const { en, es } = pm.label;
      if (v === undefined) {
        errors.push({ key: pm.key, message: t(`Missing parameter "${en}"`, `Falta el parámetro «${es}»`) });
        continue;
      }
      if (typeof v !== "number" || !Number.isFinite(v)) {
        errors.push({ key: pm.key, message: t(`${en} must be a finite number`, `${es} debe ser un número finito`) });
        continue;
      }
      if (pm.integer && !Number.isInteger(v)) {
        errors.push({ key: pm.key, message: t(`${en} must be an integer`, `${es} debe ser un número entero`) });
        continue;
      }
      if (pm.min !== undefined) {
        if (pm.exclusiveMin && !(v > pm.min)) {
          errors.push({
            key: pm.key,
            message: t(`${en} must be greater than ${fmt(pm.min)}`, `${es} debe ser mayor que ${fmt(pm.min)}`),
          });
          continue;
        }
        if (!pm.exclusiveMin && !(v >= pm.min)) {
          errors.push({
            key: pm.key,
            message: t(
              `${en} must be greater than or equal to ${fmt(pm.min)}`,
              `${es} debe ser mayor o igual que ${fmt(pm.min)}`,
            ),
          });
          continue;
        }
      }
      if (pm.max !== undefined && !(v <= pm.max)) {
        errors.push({
          key: pm.key,
          message: t(
            `${en} must be less than or equal to ${fmt(pm.max)}`,
            `${es} debe ser menor o igual que ${fmt(pm.max)}`,
          ),
        });
        continue;
      }
      values[pm.key] = v;
    }
    if (errors.length === 0) crossChecks(spec.id, values, errors);
  }

  const tr = spec.truncate;
  if (tr) {
    const okNum = (x: unknown): boolean => x === undefined || x === null || (typeof x === "number" && !Number.isNaN(x));
    if (!okNum(tr.min) || !okNum(tr.max)) {
      errors.push({
        key: "truncate",
        message: t("Truncation limits must be numbers", "Los límites de truncamiento deben ser números"),
      });
    } else if (tr.min != null && tr.max != null && tr.min > tr.max) {
      errors.push({
        key: "truncate",
        message: t(
          "The truncation minimum must be less than the truncation maximum",
          "El mínimo de truncamiento debe ser menor que el máximo de truncamiento",
        ),
      });
    } else if (errors.length === 0) {
      try {
        const base = FAMILY_FACTORIES[spec.id](effectiveSpec(spec));
        truncateDist(base, tr.min ?? undefined, tr.max ?? undefined);
      } catch (e) {
        if (!(e instanceof TruncationError)) throw e;
        errors.push({
          key: "truncate",
          message: t(
            "The truncation range has zero probability for this distribution",
            "El rango de truncamiento tiene probabilidad nula para esta distribución",
          ),
        });
      }
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/* ------------------------------------------------------------------------------------------ */
/* Construction                                                                               */
/* ------------------------------------------------------------------------------------------ */

const TINY_U = 1.1102230246251565e-16; // 2^-53: replaces an exact 0 from the RNG

/** Build the (possibly truncated) internal distribution. Throws DistributionError if invalid. */
export function buildBase(spec: DistributionSpec): BaseDist {
  const v = validateSpec(spec);
  if (!v.ok) {
    throw new DistributionError(
      `Invalid ${String(spec?.id)} distribution: ${v.errors.map((e) => e.message.en).join("; ")}`,
      v.errors,
    );
  }
  const eff = effectiveSpec(spec);
  const base = FAMILY_FACTORIES[spec.id](eff);
  const tr = spec.truncate;
  if (tr && (tr.min != null || tr.max != null)) {
    return truncateDist(base, tr.min ?? undefined, tr.max ?? undefined);
  }
  return base;
}

/** Live distribution object with optional extras (logPdf, survival function). */
export interface DistributionExt extends Distribution {
  logPdf(x: number): number;
  /** P(X > x) */
  sf(x: number): number;
  /** Sorted support points for discrete distributions on arbitrary values (custom, fixed). */
  points?: Float64Array;
}

/** Build a live distribution from a serialisable spec (validates; throws DistributionError). */
export function createDistribution(spec: DistributionSpec): DistributionExt {
  const base = buildBase(spec);
  const frozen: DistributionSpec = {
    ...spec,
    params: { ...(spec.params ?? {}) },
    ...(spec.values ? { values: [...spec.values] } : {}),
    ...(spec.weights ? { weights: [...spec.weights] } : {}),
    ...(spec.truncate ? { truncate: { ...spec.truncate } } : {}),
  };
  const q = base.quantile;
  const sample =
    base.sample ??
    ((rng: Rng): number => {
      const u = rng.next();
      return q(u > 0 ? u : TINY_U);
    });
  const logPdf = base.logPdf ?? ((x: number) => Math.log(base.pdf(x)));
  const sf = base.sf ?? ((x: number) => 1 - base.cdf(x));
  return {
    spec: frozen,
    kind: base.kind,
    pdf: base.pdf,
    cdf: base.cdf,
    quantile: q,
    sample,
    mean: base.mean,
    variance: base.variance,
    support: base.support,
    logPdf,
    sf,
    ...(base.points ? { points: base.points } : {}),
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Plotting                                                                                   */
/* ------------------------------------------------------------------------------------------ */

const MAX_DISCRETE_POINTS = 2000;

/**
 * Points for plotting pdf/pmf + cdf: continuous → `n` evenly spaced x over [q(0.001), q(0.999)];
 * discrete → each integer in that range (or each support point for custom/fixed).
 */
export function distributionCurve(d: Distribution, n = 200): { x: number[]; pdf: number[]; cdf: number[] } {
  const [s0, s1] = d.support();
  let lo = d.quantile(0.001);
  let hi = d.quantile(0.999);
  if (!Number.isFinite(lo)) lo = Number.isFinite(s0) ? s0 : -1;
  if (!Number.isFinite(hi)) hi = Number.isFinite(s1) ? s1 : lo + 1;
  const x: number[] = [];
  if (d.kind === "discrete") {
    const pts = (d as unknown as { points?: Float64Array }).points;
    if (pts) {
      for (let i = 0; i < pts.length && x.length < MAX_DISCRETE_POINTS * 5; i++) x.push(pts[i]);
    } else {
      // include the full support when it is small
      if (Number.isFinite(s0) && Number.isFinite(s1) && s1 - s0 <= 100) {
        lo = s0;
        hi = s1;
      }
      const a = Math.floor(lo);
      const b = Math.ceil(hi);
      const count = b - a + 1;
      const step = count > MAX_DISCRETE_POINTS ? Math.ceil(count / MAX_DISCRETE_POINTS) : 1;
      for (let k = a; k <= b; k += step) x.push(k);
    }
  } else {
    if (hi === lo) {
      lo -= 1;
      hi += 1;
    }
    const m = Math.max(2, Math.floor(n));
    for (let i = 0; i < m; i++) x.push(lo + ((hi - lo) * i) / (m - 1));
  }
  const pdf = x.map((v) => {
    const y = d.pdf(v);
    return Number.isFinite(y) ? y : NaN;
  });
  const cdf = x.map((v) => d.cdf(v));
  return { x, pdf, cdf };
}

/** All registered ids (re-exported for convenience). */
export const SUPPORTED_DISTRIBUTIONS: readonly DistributionId[] = DISTRIBUTION_IDS;
