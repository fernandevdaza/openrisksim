---
layout: home
title: OpenRiskSim
titleTemplate: Monte Carlo risk simulation in your browser

hero:
  name: OpenRiskSim
  text: Risk analysis for your spreadsheets, in the browser
  tagline: Monte Carlo simulation, forecasting, optimization and project evaluation on top of your .xlsx files. Free, open source, nothing to install — on Windows, macOS and Linux.
  image:
    src: /icon.svg
    alt: OpenRiskSim logo
  actions:
    - theme: brand
      text: Open the app
      link: https://fernandevdaza.github.io/openrisksim/
      target: _self
    - theme: alt
      text: Quick start
      link: /en/guide/quick-start
    - theme: alt
      text: What is risk analysis?
      link: /en/guide/introduction

features:
  - icon: 🎲
    title: Monte Carlo simulation
    details: 33 distributions, truncation, Monte Carlo or Latin Hypercube sampling, correlations (Iman–Conover), reproducible seeds and precision control. Thousands of scenarios in seconds.
    link: /en/guide/assumptions
    linkText: Define assumptions
  - icon: ⚡
    title: GPU acceleration
    details: Up to 5 million trials. Uses every processor core, compiles the formulas or runs them on the graphics card (WebGPU) — 100,000 trials in a third of a second, with results validated against the sheet.
    link: /en/guide/acceleration
    linkText: Acceleration
  - icon: 📊
    title: Results you can read
    details: Histogram and cumulative chart with two-tail, left-tail or right-tail certainty; configurable certainty and confidence levels; full statistics, percentiles, overlay charts and an .xlsx or PDF report.
    link: /en/guide/results
    linkText: Interpreting results
  - icon: 🌪️
    title: Sensitivity & fitting
    details: Tornado, spider, rank-correlation sensitivity, scenario tables, distribution fitting (KS, Anderson–Darling, χ², AIC/BIC), bootstrap and hypothesis tests.
    link: /en/tools/analytics
    linkText: Analytical tools
  - icon: 📈
    title: Forecasting
    details: Moving averages, exponential smoothing, Holt, Holt–Winters, ARIMA and auto-ARIMA, trend lines, multiple and stepwise regression, and stochastic processes, with up to three confidence levels of your choice (80, 90, 95, 99% or e.g. 97.5%).
    link: /en/tools/forecasting
    linkText: Forecasting
  - icon: 🎯
    title: Optimization
    details: Continuous, integer, binary or discrete decision variables; constraints; static or stochastic optimization; Nelder–Mead, genetic algorithm, simulated annealing and efficient frontiers.
    link: /en/tools/optimization
    linkText: Optimization
  - icon: 💼
    title: Project evaluation
    details: Project and equity cash flows, NPV, IRR, MIRR, payback, PI, EAA, loans, depreciation, WACC/CAPM with country risk and break-even analysis.
    link: /en/tools/finance
    linkText: Finance
  - icon: 📂
    title: Your usual files
    details: Open and save .xlsx from Excel, LibreOffice, WPS or Google Sheets. The risk model is stored inside the workbook itself.
    link: /en/guide/files
    linkText: Files
  - icon: 🔒
    title: Private and offline
    details: Everything is computed on your computer; no data is uploaded. Installable as an app that works without internet.
    link: /en/guide/installation
    linkText: Installation
  - icon: 🎓
    title: Built for students
    details: Bilingual interface with names and workflow similar to Risk Simulator, ready-made examples and help texts that explain how to read every result.
    link: /en/tutorial/project-evaluation
    linkText: Full tutorial
---

## Why OpenRiskSim?

Project-evaluation courses often use **Risk Simulator**, an Excel add-in that only runs on **Windows**. If you have a Mac, use Linux or LibreOffice, or simply don't have a licence, you are left without a tool for the risk analysis of your project.

OpenRiskSim fixes that: it is a free web application that reproduces the Risk Simulator workflow — **assumptions**, **forecasts**, **run**, **certainty**, **tornado** — on your own `.xlsx` files, right in the browser.

![OpenRiskSim with the “Project evaluation” example: spreadsheet, model explorer and results panel](/screenshots/en/overview.png)

## How it works, in four steps

1. **Open your model** (`File → Open`) or an example (`File → Examples`).
2. **Mark the uncertain cells** as assumptions (price, demand, investment…) and pick their probability distributions.
3. **Mark the results** as forecasts (NPV, IRR…).
4. **Run** thousands of scenarios and read the histogram — for example, the **probability that the NPV is negative**.

::: tip First time?
Follow the [5-minute quick start](/en/guide/quick-start) with the bundled example, then the [full project-evaluation tutorial](/en/tutorial/project-evaluation), written like a course assignment.
:::

<p style="font-size:0.85rem;color:var(--vp-c-text-2)">Risk Simulator, @RISK and Crystal Ball are trademarks of their respective owners; OpenRiskSim is not affiliated with them.</p>
