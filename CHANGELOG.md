# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org).

## [0.2.0] — 2026-10-07

### Added
- **Desktop apps** for macOS (dmg, Apple Silicon + Intel), Windows (installer, x64 + ARM64) and Linux (AppImage + deb,
  x64 + ARM64), built with Electron; installers are attached to each release and built by CI on every push.
- **Excel-like formula editing**: click-to-reference (Point mode) with coloured reference boxes, F4, localized function
  autocomplete with argument tooltips, Insert Function dialog, fill handle and Ctrl+D/R/Enter, copy/cut/paste with
  reference adjustment and paste values, Formulas tab (AutoSum, show formulas, trace precedents/dependents, evaluate
  formula, defined names), explained error cells and syntax checks, expandable formula bar.
- **Tornado / spider**: "± % of base value" method (Risk Simulator style) and grouping of assumptions with the same name.
- **Mobile layout**: scrollable ribbon, bottom navigation with run button, model drawer, full-screen results, dialogs
  and tools; touch-friendly grid.
- Documentation: new Formulas guide; tornado methods and why rankings can differ from Risk Simulator.

## [0.1.0] — 2026-10-05

First public release.

### Added
- Web app (PWA) that opens and saves `.xlsx` / `.csv` with an Excel-compatible formula engine (HyperFormula), including
  Spanish function names and decimal commas. The risk model is stored inside the workbook.
- Monte Carlo and Latin Hypercube simulation with 33 distributions, truncation, rank correlations (Iman–Conover),
  reproducible seeds, precision control, step mode and a Web Worker runner.
- Forecast charts with two-tail / left-tail / right-tail certainty, full statistics, percentiles, overlay charts,
  PNG export and report export (.xlsx and printable PDF).
- Analytical tools: tornado, spider, sensitivity, scenario table, distribution fitting (KS, AD, χ², AIC/BIC),
  bootstrap, hypothesis test, descriptive statistics, overlay chart.
- Forecasting: moving average, exponential smoothing, Holt, Holt–Winters, ARIMA / auto-ARIMA, trend models,
  multiple and stepwise regression, stochastic processes (GBM, mean reversion, jump diffusion).
- Optimization: static and stochastic, Nelder–Mead, genetic algorithm, simulated annealing, efficient frontier.
- Finance: project evaluator (project and equity cash flows, NPV, IRR, MIRR, payback, PI, EAA) with export to a sheet
  with live formulas, NPV/IRR calculator, loans, depreciation, WACC/CAPM, break-even, scenario analysis.
- Optional acceleration (Simulation → Settings → Acceleration): multi-core CPU, formulas compiled to exact JavaScript,
  and a WebGPU compute-shader backend (Metal / Direct3D 12 / Vulkan). Accelerated runs are validated against the
  spreadsheet engine and fall back automatically; GPU trials that fail in f32 are re-evaluated exactly on the CPU.
- Configurable confidence levels: per-forecast certainty band and confidence of the mean; up to three
  prediction-interval levels in time series, confidence level for regression coefficients, fan-chart levels for
  stochastic processes.
- Five example models, English/Spanish interface, light/dark themes, autosave.
- Documentation site (Spanish and English).

[0.2.0]: https://github.com/fernandevdaza/openrisksim/releases/tag/v0.2.0
[0.1.0]: https://github.com/fernandevdaza/openrisksim/releases/tag/v0.1.0
