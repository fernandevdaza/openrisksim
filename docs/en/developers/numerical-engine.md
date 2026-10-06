# Numerical engine

This page summarises the **algorithms** OpenRiskSim uses and their **references**, for anyone who wants to audit the calculations, cite them or contribute. Everything is implemented in pure TypeScript in `packages/*` and tested against reference values from Excel, R and SciPy.

## Random numbers

| Component | Algorithm | Reference |
|---|---|---|
| Generator | **xoshiro128\*\*** (128-bit state, period 2¹²⁸ − 1); each double in [0, 1) uses 53 random bits | Blackman, D. & Vigna, S. (2021). *Scrambled linear pseudorandom number generators*. ACM TOMS 47(4). |
| Seeding | **SplitMix32** from the seed, so nearby seeds give unrelated streams | Steele, Lea & Flood (2014). *Fast splittable pseudorandom number generators*. OOPSLA. |

## Sampling

- **Inverse transform**: every value is Q(u), the distribution's quantile at a uniform u. This lets LHS, rank correlation and truncation share one mechanism.
- **Monte Carlo**: independent uniforms.
- **Latin hypercube**: per column, uᵢ = (π(i) + vᵢ)/n with π a random permutation and vᵢ ~ U[0, 1): exactly one value per 1/n probability stratum. McKay, M. D., Beckman, R. J. & Conover, W. J. (1979). *A comparison of three methods for selecting values of input variables in the analysis of output from a computer code*. Technometrics 21(2).
- **Truncation**: Q_T(u) = Q(F(a) + u·(F(b) − F(a))), using the survival function in the upper tail to keep precision; truncated mean and variance by Gauss–Legendre quadrature in the probability domain.

## Correlations

- **Iman–Conover**: reorders samples to induce the target rank correlation without changing the marginals. Uses van der Waerden scores Φ⁻¹(i/(n+1)), the Spearman-to-Pearson conversion r = 2·sin(πρ/6) and a correction for the scores' sample correlation (Cholesky). Iman, R. L. & Conover, W. J. (1982). *A distribution-free approach to inducing rank correlation among input variables*. Communications in Statistics – Simulation and Computation 11(3).
- **Nearest correlation matrix**: alternating projections with Dykstra's correction. Higham, N. J. (2002). *Computing the nearest correlation matrix — a problem from finance*. IMA Journal of Numerical Analysis 22(3).

## Special functions

| Function | Method |
|---|---|
| erf, erfc | Rational approximations from fdlibm (Sun Microsystems), error ≲ 1 ulp |
| ln Γ(x) | **Lanczos** (g = 7, n = 9) and Stirling series for x ≥ 10 |
| Regularized incomplete beta | Continued fraction with the **modified Lentz** method (Press et al., *Numerical Recipes*) |
| Regularized incomplete gamma | Series + continued fraction (*Numerical Recipes*) |
| Normal quantile | **Wichura (1988), algorithm AS 241** (PPND16), ~1e−16 accuracy |
| Inverse incomplete beta / gamma | *Numerical Recipes* initial guess + bracketed Halley iteration (bisection fallback) |

## Statistics

- Excel conventions: sample standard deviation and variance (n − 1, like `STDEV.S`), skewness and excess kurtosis like `SKEW` and `KURT`, percentiles with linear interpolation like `PERCENTILE.INC`, Student-t confidence interval of the mean.
- Histogram: **Freedman–Diaconis** bin width clamped to 10–100 bins; one bin per integer for integer data with few distinct values.
- Sensitivity: **Spearman** rank correlation; contribution to variance = ρ²/Σρ².
- Precision control: CI half-width of the mean ≤ relative error × |mean|, checked per chunk once 500 trials are done.
- Non-parametric bootstrap with percentile intervals. Efron, B. & Tibshirani, R. (1993). *An Introduction to the Bootstrap*.
- **Welch's** t-test with Welch–Satterthwaite degrees of freedom.

## Distribution fitting

- **Maximum likelihood** estimation (closed form where available; otherwise Nelder–Mead on an unconstrained parametrisation, with Minka's Newton inverse digamma).
- **Kolmogorov–Smirnov**: exact distribution by Marsaglia, G., Tsang, W. W. & Wang, J. (2003). *Evaluating Kolmogorov's distribution*. Journal of Statistical Software 8(18).
- **Anderson–Darling**: Marsaglia, G. & Marsaglia, J. (2004). *Evaluating the Anderson–Darling distribution*. JSS 9(2); with the D'Agostino, R. B. & Stephens, M. A. (1986), *Goodness-of-Fit Techniques*, correction for Normal/Lognormal with estimated parameters.
- **χ²** with equiprobable bins (continuous) or integer bins with expected count ≥ 5 (discrete).
- **AIC** = 2k − 2 ln L; **BIC** = k ln n − 2 ln L.

## Forecasting

- **Exponential smoothing** (simple, Holt, damped Holt, additive and multiplicative Holt–Winters) in error-correction form, parameters optimised by least squares (bounded Nelder–Mead) and prediction intervals from the innovations representation. Hyndman, R. J. & Athanasopoulos, G. *Forecasting: Principles and Practice* (FPP); Hyndman, R. J. et al. (2008). *Forecasting with Exponential Smoothing*. Springer.
- **ARIMA** estimated like R's default (*CSS-ML*): Hannan–Rissanen starting values, conditional sum of squares (CSS), then exact Gaussian likelihood with a **Kalman filter** (Gardner, Harvey & Phillips, 1980 state-space form); intervals from the ψ-weights.
- **Auto-ARIMA**: *d* from successive ADF tests, then *p, q* ≤ 3 by AIC, discarding near-unit roots (like `auto.arima`, Hyndman & Khandakar, 2008).
- **Augmented Dickey–Fuller** with approximate p-values from MacKinnon, J. G. (1994). *Approximate asymptotic distribution functions for unit-root and cointegration tests*. JBES 12(2).
- **Ljung–Box**: Ljung, G. M. & Box, G. E. P. (1978). Biometrika 65(2). **PACF** by Durbin–Levinson. Classical decomposition with a centred moving average.
- **Automatic selection**: RMSE on the last 20% of the series (holdout).
- **Metrics**: MAE, RMSE, MAPE, sMAPE, R² and Theil's U (against the naive forecast).
- **Regression** by least squares via **Householder QR**; standard errors, t, p-values, CIs, F, ANOVA, **VIF** and **Durbin–Watson**; stepwise regression with entry/removal thresholds.
- **Trend lines** like Excel's (exponential and power fitted on ln y).
- **Stochastic processes** with exact discretisation: geometric Brownian motion (log-normal), Ornstein–Uhlenbeck and Merton jump diffusion. Merton, R. C. (1976). *Option pricing when underlying stock returns are discontinuous*. JFE 3.

## Optimization

- Bounded **Nelder–Mead** (mapped to the unit box) with restarts; constraints via augmented Lagrangian. Nelder, J. A. & Mead, R. (1965). *A simplex method for function minimization*. The Computer Journal 7(4).
- **Genetic algorithm**: SBX crossover and polynomial mutation (continuous/integer/discrete genes), uniform crossover and bit-flip mutation (binary), binary tournament selection and elitist (μ+λ) survival, all ranked with **Deb's feasibility rules**. Deb, K. (2000). *An efficient constraint handling method for genetic algorithms*. CMAME 186.
- **Simulated annealing** with per-coordinate adaptive steps (Corana et al., 1987 style) and geometric cooling. Kirkpatrick, S., Gelatt, C. D. & Vecchi, M. P. (1983). Science 220.
- **Automatic**: GA when any variable is non-continuous; GA + Nelder–Mead when all are continuous, there are constraints and evaluations are cheap; otherwise Nelder–Mead.
- **Stochastic optimization**: each candidate runs a full simulation in the worker and a statistic of the forecast is optimised.

## Finance

- **IRR**: Newton–Raphson from 10%; on failure, a scan of (−99%, 1000%] for sign changes refined with **Brent's** method (1973). All IRRs: grid search of rates and refinement of each root.
- Excel conventions for `NPV` (discounts from the first value), `PMT`, `PV`, `FV`, `NPER`, `MIRR`, `SLN`, `DB`, `DDB`/`VDB` and `SYD`.

## Formula compiler and GPU

The `@openrisksim/accel` package compiles the formulas between assumptions and forecasts so they can be evaluated without HyperFormula (user guide: [Acceleration](../guide/acceleration)).

- **Scope**: depth-first walk from each forecast to its precedents (topological order; circular references are rejected). Only cells that depend on an assumption or a decision variable are compiled; everything else is taken as a constant with the value the sheet computed.
- **Semantics**: the typed IR reproduces HyperFormula's coercion rules (empty = 0, TRUE/FALSE = 1/0, simple numeric text; ambiguous text such as typed dates or percentages is rejected) and Excel's conventions for the financial functions (`NPV`, `IRR`, `PMT`…). Constants are folded at compile time. Errors (`#DIV/0!`, `#NUM!`…) are represented as `NaN` and propagate as in the sheet (`IFERROR`, `ISERROR`).
- **JavaScript back end (f64)**: generates a straight-line instruction sequence per trial inside a loop over the batch. Results are rounded to 14 significant digits like HyperFormula does (`smartRounding`), so they match standard mode bit for bit. If the environment forbids `new Function`, an IR interpreter is used.
- **Self-check and validation**: after compiling, the program runs on the workbook's current values and every compiled cell is compared with the sheet (relative tolerance 10⁻⁹). Before every run, the first 200 trials are also evaluated with HyperFormula (tolerance 10⁻⁹ for JS, 10⁻⁴ for GPU); any mismatch moves on to the next mode.

### Single-precision (f32) considerations on the GPU

- The WGSL compute shader uses `f32`: 24-bit mantissa (ε ≈ 1.19 × 10⁻⁷, about 7 significant digits) and a ±3.4 × 10³⁸ range. Samples are drawn in f64 on the CPU and converted to f32 on upload; results come back as a `Float64Array`. Sampling, correlations, statistics and sensitivity are still computed in f64: only formula evaluation is f32.
- WGSL lets implementations assume there are no `NaN`s or infinities, so every value carries an explicit **error flag**; an error is written as a quiet-NaN bit pattern and turned into `NaN` on read-back.
- The validation's relative error is measured against max(|reference|, |GPU|, 1% of the forecast's scale), so values close to zero (an almost-zero NPV obtained by subtracting large cash flows) are not judged by f32 cancellation.
- `IRR` is solved on the GPU with Newton's method (up to 60 iterations, 10⁻⁶ relative tolerance on the rate); long sums (`SUM`, `NPV`) accumulate rounding error proportional to the number of terms, which validation monitors.
- `MEDIAN` (needs sorting) is CPU-only, and the shader accepts up to 5,000 compiled formulas. One invocation per trial, `@workgroup_size(64)`, in chunks of up to 2²⁰ trials bounded by `maxStorageBufferBindingSize`.

## Spreadsheet engine

Formulas are evaluated with [HyperFormula](https://hyperformula.handsontable.com/) (Handsontable), an Excel-compatible engine with dependency-based recalculation, used under GPLv3. `.xlsx` I/O uses [ExcelJS](https://github.com/exceljs/exceljs) and CSV parsing [Papa Parse](https://www.papaparse.com/).
