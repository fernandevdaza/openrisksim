# FAQ

## Is my data uploaded anywhere?

No. OpenRiskSim runs **entirely in your browser**: the file is read on your computer, calculations happen on your computer and what you save is downloaded to your computer. No accounts, no cloud database, no file uploads. Work in progress is autosaved only in the browser's local storage. See [Installation & privacy](../guide/installation#privacy-everything-stays-on-your-computer).

## Do I need internet?

Only the first time, to load the app. After that it works offline, and if you [install it as an app](../guide/installation#install-it-as-an-app-pwa) it opens like any program.

## Does it work on Mac? Linux? Chromebook?

Yes: on any system with a modern browser (Chrome, Edge, Firefox, Safari, Brave). No Excel needed.

## Does it work inside Excel for Mac (as an add-in)?

No. OpenRiskSim is not an Excel add-in but a standalone app that **opens and saves .xlsx files**. The workflow: prepare or edit your model in Excel (or directly in OpenRiskSim), open it in OpenRiskSim, define the risk model, simulate and save. The resulting `.xlsx` still opens normally in Excel.

## Why do my results differ slightly from Risk Simulator's (or my classmate's)?

Because the simulation uses **random numbers**. Each program uses its own generator and each seed produces a different sequence, so results are **estimates** that vary slightly. With 5,000–10,000 trials the difference is usually in the first decimal of probabilities.

- To get **exactly** the same numbers as someone else in OpenRiskSim, use the same file with a **fixed seed**, the same number of trials and the same sampling method. If one of you simulated on the **GPU**, the last digits may differ (see [Does the GPU change my results?](#does-the-gpu-change-my-results)).
- If differences with Risk Simulator are large, check that distributions are identical (watch out for the Lognormal and truncation) and that correlations are applied.

See [Risk Simulator equivalents](./risk-simulator#why-aren-t-the-numbers-identical-to-risk-simulator-s).

## How many trials should I use?

For coursework, **5,000 to 10,000** trials with Latin hypercube is enough. Use 1,000 while building the model and more than 50,000 only for very small probabilities. You can enable **precision control** so the simulation stops itself once the mean is precise enough. See [Running → How many trials?](../guide/running#how-many-trials).

## Monte Carlo or Latin hypercube?

Latin hypercube (the default): it converges faster with the same number of trials. Both are valid.

## Can I simulate hundreds of thousands or millions of trials?

Yes, up to 5,000,000. With [acceleration](../guide/acceleration) on **Automatic** (the default), OpenRiskSim compiles the model's formulas or uses the graphics card: in the “Project evaluation” example, 100,000 trials take about 0.3 s and a million less than 2 s. If your model uses functions that cannot be compiled, every processor core is used instead.

## Can I use my NVIDIA (CUDA) or Apple (MPS) GPU?

Yes, but through **WebGPU**, not CUDA or MPS directly: a browser cannot access those native libraries. WebGPU is the web standard for GPU computing, and the browser runs it on **Metal** on macOS (the same GPU MPS uses), **Direct3D 12** on Windows and **Vulkan** on Linux, Android and ChromeOS. So NVIDIA, AMD, Intel and Apple GPUs are used through their regular drivers, with nothing to install. You need a recent version of Chrome, Edge, Safari (26 or later) or Firefox (on Windows). See [GPU: WebGPU, CUDA and MPS](../guide/acceleration#gpu-webgpu-cuda-and-mps).

## Does the GPU change my results?

Only in the last digits. The GPU computes in single precision (about 7 significant digits) instead of double. Before every run, the first 200 trials are automatically compared with the spreadsheet engine (relative tolerance 10⁻⁴); if they don't match, OpenRiskSim uses another mode and shows the **Fallback** chip. That difference is much smaller than the simulation's own sampling error. **Standard**, **Multicore CPU** and **Compiled formulas** give identical results with the same seed. See [Precision](../guide/acceleration#precision).

## The simulated mean NPV differs from my cash flow's NPV. Is that wrong?

Not necessarily. The deterministic NPV uses each variable's most likely value; the simulated mean averages all scenarios. They differ when distributions are **skewed** (a Triangular 220–250–310 has mean 260, not 250), when the model is **non-linear** (taxes paid only on profits, `MAX`, `IF`) or when there are **correlations**. It is precisely one of the interesting findings of risk analysis. See the [tutorial](../tutorial/project-evaluation#what-these-numbers-say).

## Some trials have errors. What do I do?

A trial with an error is one where the forecast formula couldn't be computed (e.g. a non-existent IRR or a division by zero). They are excluded from statistics and counted. Check whether a distribution generates impossible values (truncate it) or whether the formula needs an `IFERROR`. See [Trials with errors](../guide/forecasts-and-decisions#trials-with-errors).

## Can I open .xls or .ods files?

Not directly. Open them in Excel or LibreOffice and save them as `.xlsx`. See [Files](../guide/files#opening-a-file).

## I saved the file and in Excel I can't see the assumptions

That's normal: the model is stored in a hidden sheet that only OpenRiskSim reads. Excel doesn't know what an “assumption” is. Reopen it in OpenRiskSim to view and edit the model.

## Did I lose my work if I closed the tab?

Probably not: reopening OpenRiskSim in the same browser restores the latest workbook (*“Previous work restored”*). But don't rely on that alone: **save the .xlsx** with <kbd>Ctrl</kbd>+<kbd>S</kbd>.

## Can I cite OpenRiskSim in my report?

Yes. One way to cite it:

> Daza, F. and contributors (2026). *OpenRiskSim: Monte Carlo risk simulation for spreadsheets* (free software, GPL-3.0 licence). https://github.com/fernandevdaza/openrisksim

In the methodology also state the **number of trials**, the **sampling method** (Monte Carlo or Latin hypercube), the **seed**, each assumption's **distribution** and parameters, and the **correlations** used, so the analysis is reproducible. Check with your instructor whether this software is accepted instead of Risk Simulator: concepts and results are equivalent.

## Is it free? What licence does it have?

It is **free and open-source software** under the **GPL-3.0-or-later** licence: you can use it for any purpose (study, work, consulting), study and modify its code, and redistribute it, as long as modified versions you distribute are also GPL. It uses [HyperFormula](https://hyperformula.handsontable.com/) under its GPLv3 licence, plus ExcelJS, ECharts, React, i18next and lucide.

## Can I use it at my company or for consulting?

Yes, the GPL allows it. Note that it comes **without any warranty**: validate your models, as with any tool.

## How accurate are the calculations?

Numerical code is tested against reference values from Excel, R and SciPy (over 460 automated tests). Financial functions follow Excel's conventions. Algorithm details are in [Numerical engine](../developers/numerical-engine).

## Can I use it on my phone?

It works, but the interface is designed for large screens. For serious work use a computer.

## I found a bug or want to suggest an improvement

Thank you! Open an issue on [GitHub](https://github.com/fernandevdaza/openrisksim/issues), in English or Spanish. If you code, see [Contributing](../developers/contributing).
