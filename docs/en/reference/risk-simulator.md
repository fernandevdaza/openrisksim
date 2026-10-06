# Risk Simulator equivalents

If you learned with **Risk Simulator** in Excel for Windows, this table helps you find each feature in OpenRiskSim.

::: info
Risk Simulator is a trademark of Real Options Valuation, Inc. OpenRiskSim is an independent, unaffiliated project that reproduces the general workflow; it is not a copy of their software.
:::

## Concepts

| Risk Simulator | OpenRiskSim | Notes |
|---|---|---|
| Simulation profile | The workbook's **model** | OpenRiskSim has one model per workbook. **New profile** clears it. |
| Input assumption | **Assumption** (green cell) | Same. |
| Output forecast | **Forecast** (blue cell) | Same. |
| Decision variable | **Decision variable** (yellow cell) | Same. |
| Trials | **Trials** | Same. |
| Certainty | **Certainty %** | Two-tail, left-tail, right-tail. The initial certainty (90% by default) can be changed per forecast. |
| Seed value | **Fixed seed** | Same concept; numbers don't match Risk Simulator's because the random generator differs. |
| Monte Carlo / Latin Hypercube | **Monte Carlo** / **Latin hypercube (LHS)** | LHS is OpenRiskSim's default. |
| Correlations | **Correlations** | Spearman + Iman–Conover, like Risk Simulator. Edited in a matrix rather than per assumption. |
| Truncation | **Truncate the distribution** | Same. |
| Precision control (error control) | **Precision control** | On a forecast's mean. |

## Simulation menu

| Risk Simulator | OpenRiskSim |
|---|---|
| New Simulation Profile | **Simulation → New profile** |
| Edit Simulation Profile (trials, seed, correlations) | **Simulation → Settings** |
| Set Input Assumption | **Simulation → Define assumption** (<kbd>Alt</kbd>+<kbd>A</kbd>) or right-click |
| Set Output Forecast | **Simulation → Define forecast** (<kbd>Alt</kbd>+<kbd>F</kbd>) |
| Run Simulation | **Simulation → Run** (<kbd>Alt</kbd>+<kbd>R</kbd>) |
| Run Super Speed Simulation | **Simulation → Settings → Acceleration** (**Automatic**, **Compiled formulas** or **GPU (WebGPU)**), then **Run**. See [Acceleration](../guide/acceleration). |
| Step Simulation | **Simulation → Step** (<kbd>Alt</kbd>+<kbd>S</kbd>) |
| Reset Simulation | **Simulation → Reset** (<kbd>Alt</kbd>+<kbd>X</kbd>) |
| Copy / Paste / Remove Parameter | **Copy definition** / **Paste definition** / **Delete definition** |
| Edit Correlations | **Simulation → Correlations** (<kbd>Alt</kbd>+<kbd>C</kbd>) |
| Forecast chart (histogram, cumulative, statistics, percentiles) | **Results** panel → **Histogram** / **Cumulative**, **Statistics**, **Percentiles** |
| Overlay charts | **Overlay** / **Analytical tools → Overlay chart** |
| Create Report | **File → Export report** (.xlsx, PDF, HTML) |
| Extract data | **Simulation data** sheet of the .xlsx report (first 10,000 trials) |
| Save the profile in the workbook | **File → Save .xlsx** (hidden `_openrisksim` sheet) |

## Analytical tools

| Risk Simulator | OpenRiskSim |
|---|---|
| Tornado Analysis | **Analytical tools → Tornado** |
| Spider chart | **Analytical tools → Spider chart** |
| Sensitivity Analysis (rank correlation, contribution to variance) | **Analytical tools → Sensitivity** |
| Scenario Analysis (two-way table) | **Analytical tools → Scenario table** |
| Distributional Fitting (single variable) | **Analytical tools → Distribution fitting** (or **Fit from data…** in the assumption dialog) |
| Bootstrap Nonparametric Simulation | **Analytical tools → Bootstrap** |
| Hypothesis Test | **Analytical tools → Hypothesis test** (Welch's t) |
| Statistical Analysis / Descriptive statistics | **Analytical tools → Descriptive statistics** |

## Forecasting

| Risk Simulator | OpenRiskSim |
|---|---|
| Time-Series Analysis (moving average, exponential smoothing, Holt, Holt–Winters) | **Forecasting → Time series** |
| ARIMA / Auto ARIMA | **Time series** → **ARIMA(p, d, q)** / **Auto-ARIMA** |
| Trendlines | **Time series** → **Trend line** |
| Multiple Regression / Stepwise Regression | **Forecasting → Multiple regression** |
| Stochastic Processes (Brownian motion, mean reversion, jump diffusion) | **Forecasting → Stochastic processes** |
| Autocorrelation, seasonality and stationarity tests | **Time series** → **ACF / PACF**, **Decomposition**, **Diagnostics** tabs |

## Optimization

| Risk Simulator | OpenRiskSim |
|---|---|
| Set Decision | **Simulation → Define decision** |
| Set Objective | **Optimization** → **Objective** and **Sense** |
| Set Constraint | **Optimization** → **Constraints → Add** |
| Static optimization | **Optimization type: Static (deterministic)** |
| Stochastic optimization | **Optimization type: Stochastic (with simulation)** |
| Efficient frontier | **Efficient frontier** |

## Worksheet functions

| Risk Simulator | OpenRiskSim |
|---|---|
| `RSDistNormal(mean, sd)` | `ORS.NORMAL(mean, sd)` |
| `RSDistTriangular(min, mode, max)` | `ORS.TRIANGULAR(min, mode, max)` |
| `RSDistUniform(min, max)` | `ORS.UNIFORM(min, max)` |
| `RSDistPERT(min, mode, max)` | `ORS.PERT(min, mode, max)` |
| `RSDistLognormal(mean, sd)` | `ORS.LOGNORMAL(mean, sd)` |
| Other `RS*` functions | Not available: define the assumption with the dialog. |

Details in [Files → ORS.* risk functions](../guide/files#ors-risk-functions).

::: warning Risk Simulator files don't carry the model
If you open in OpenRiskSim an `.xlsx` prepared with Risk Simulator, sheets and formulas load but assumptions and forecasts **don't** (Risk Simulator stores them in its own format). You'll need to define them again; with **Copy definition** / **Paste definition** it's quick. Cells with `RS*` functions will show errors: replace them with their value.
:::

## What OpenRiskSim adds

- **Automatic acceleration**: multicore CPU, compiled formulas and **GPU (WebGPU)** on any system (Windows, macOS, Linux), with automatic validation of the results against the sheet and fallback if anything fails; up to 5,000,000 trials. See [Acceleration](../guide/acceleration).
- **Configurable confidence levels**: initial certainty and confidence of the mean interval per forecast, and up to three levels at once (including values such as 97.5%) for time-series and stochastic-process bands. See [Forecasting](../tools/forecasting#confidence-levels).
- Runs in the browser, with no Excel or add-in to install.

## What OpenRiskSim doesn't have (yet)

- Multiple **simulation profiles** per workbook.
- **Alternate parameters** (defining a distribution by percentiles, e.g. “Normal with P10 = 80 and P90 = 120”).
- **Multivariate** distribution fitting (joint fitting with correlations).
- Advanced forecasting models: GARCH, Markov chains, J/S curves, splines, non-linear extrapolation, advanced econometrics (panel data, Box–Cox…).
- **Dynamic** optimization and real options (Real Options SLS).
- Scatter plots of assumptions vs forecasts inside the results window (you can build them from the exported data).

Need any of these? [Open an issue](https://github.com/fernandevdaza/openrisksim/issues) or [contribute](../developers/contributing).

## Why aren't the numbers identical to Risk Simulator's?

A Monte Carlo simulation produces **estimates** based on random numbers. Two programs (or two runs with different seeds) give slightly different results even with the same model. With enough trials (5,000–10,000) differences should be small: tenths of a percentage point in probabilities and about one standard error in the mean. If you see large differences, check that distributions and parameters are exactly the same (especially Lognormal, PERT and truncation) and that correlations are applied. See also the [FAQ](./faq).
