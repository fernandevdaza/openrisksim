/**
 * @openrisksim/distributions — RNG, special functions, 33 probability distributions,
 * registry/validation and distribution fitting.
 */
export { createRng, Xoshiro128 } from "./rng";
export {
  erf,
  erfc,
  lnGamma,
  gamma,
  lnBeta,
  digamma,
  trigamma,
  regIncBeta,
  regIncBetaComplement,
  invRegIncBeta,
  regIncGammaP,
  regIncGammaQ,
  invRegIncGammaP,
  normalCdf,
  normalPdf,
  normalQuantile,
  studentTCdf,
  studentTSf,
  studentTQuantile,
  chiSquareCdf,
  chiSquareSf,
  chiSquareQuantile,
  fCdf,
  fSf,
  fQuantile,
  lnFactorial,
  lnChoose,
} from "./special";
export {
  DISTRIBUTION_META,
  getDistributionMeta,
  createDistribution,
  validateSpec,
  DistributionError,
  distributionCurve,
  defaultSpec,
  type DistributionExt,
  type SpecError,
} from "./registry";
export {
  fitDistributions,
  kolmogorovCdf,
  andersonDarlingCdf,
  type FitResult,
  type FitOptions,
} from "./fitting";
