import type { DistributionId, DistributionSpec } from "@openrisksim/core";
import { arcsine, betaDist, cosine, pert, powerFunction, trapezoidal, triangular, uniform } from "./bounded";
import { customDiscrete, customEmpirical, fixedValue } from "./custom";
import {
  bernoulli,
  binomial,
  discreteUniform,
  geometric,
  hypergeometric,
  negativeBinomial,
  poisson,
} from "./discrete";
import { chiSquare, erlang, exponential, fDist, frechet, gammaDist, pareto, rayleigh, weibull } from "./positive";
import { cauchy, gumbel, laplace, logistic, lognormal, normal, studentT } from "./realLine";
import type { BaseDist } from "./types";

export type { BaseDist } from "./types";

type Factory = (spec: DistributionSpec) => BaseDist;

const P = (f: (p: Record<string, number>) => BaseDist): Factory => (spec) => f(spec.params);

/** Builds the un-truncated base distribution. Parameters must already be validated. */
export const FAMILY_FACTORIES: Record<DistributionId, Factory> = {
  normal: P(normal),
  lognormal: P(lognormal),
  uniform: P(uniform),
  triangular: P(triangular),
  pert: P(pert),
  beta: P(betaDist),
  gamma: P(gammaDist),
  exponential: P(exponential),
  weibull: P(weibull),
  logistic: P(logistic),
  studentT: P(studentT),
  chiSquare: P(chiSquare),
  f: P(fDist),
  cauchy: P(cauchy),
  gumbel: P(gumbel),
  frechet: P(frechet),
  pareto: P(pareto),
  laplace: P(laplace),
  rayleigh: P(rayleigh),
  erlang: P(erlang),
  arcsine: P(arcsine),
  cosine: P(cosine),
  powerFunction: P(powerFunction),
  trapezoidal: P(trapezoidal),
  bernoulli: P(bernoulli),
  binomial: P(binomial),
  poisson: P(poisson),
  geometric: P(geometric),
  negativeBinomial: P(negativeBinomial),
  hypergeometric: P(hypergeometric),
  discreteUniform: P(discreteUniform),
  custom: (spec) => {
    const values = spec.values ?? [];
    if (spec.weights && spec.weights.length > 0) return customDiscrete(values, spec.weights);
    return customEmpirical(values);
  },
  fixed: (spec) => fixedValue(spec.params.value),
};
