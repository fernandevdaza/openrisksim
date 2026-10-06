# Running the simulation

Once you have at least **one enabled assumption** and **one forecast**, you can simulate.

## Settings

**Simulation → Settings** opens the *Simulation settings* dialog:

| Option | Default | What it does |
|---|---|---|
| **Trials** | 5,000 | Number of scenarios to simulate (10 to 5,000,000). Quick buttons: 1,000, 5,000, 10,000, 100,000 and 1 M. |
| **Seed** → **Fixed seed** / **Random** | Fixed, 12345 | With a fixed seed every run gives exactly the same results. With random, each run differs (the seed used is shown in the status bar). |
| **Sampling method** → **Monte Carlo** / **Latin hypercube (LHS)** | Latin hypercube | How random numbers are generated (see below). |
| **Apply correlations** | On | Uses the [correlation](./correlations) matrix. Shows how many are defined. |
| **Precision control** | Off | Stops the simulation when the mean of the chosen forecast is precise enough (see below). |
| **Acceleration** → **Automatic** / **Standard** / **Multicore CPU** / **Compiled formulas** / **GPU (WebGPU)** | Automatic | How trials are evaluated: on every core, by compiling the formulas or on the graphics card. See [Acceleration](./acceleration). |

Settings are saved with the model inside the `.xlsx`.

### How many trials?

- **1,000**: enough to explore and debug the model.
- **5,000 – 10,000**: typical for an assignment or report. Percentiles and the probability of loss stabilise to the first decimal.
- **50,000 or more**: if you need probabilities of rare events (extreme tails, P < 1%) or high precision. With [acceleration](./acceleration) on Automatic, 100,000 trials of the “Project evaluation” example take about a third of a second.

For reference, in the “Project evaluation” example the probability of a negative NPV is 30.2% with 1,000 trials and 30.3% with 10,000; the margin of error of the NPV mean (95% confidence interval) shrinks from about ±4,300 to ±1,400. More trials reduce the **sampling error** roughly with the square root: halving the error takes four times as many trials.

::: tip Fixed seed for assignments and exams
With a fixed seed, you, your group and your instructor get **exactly the same numbers** from the same file. State the seed, number of trials and sampling method in your report.
:::

### Monte Carlo vs Latin hypercube

- Plain **Monte Carlo**: each value is drawn completely independently. By chance some regions of the distribution may be over- or under-represented.
- **Latin hypercube (LHS)**: splits each assumption's distribution into as many equal-probability strata as there are trials and takes **exactly one value from each stratum**, in random order. It covers the whole distribution evenly, so it **converges faster**: with the same trials, the mean and percentiles are more stable.

Both are statistically equivalent; LHS is almost always preferable, hence the default (Risk Simulator and @RISK offer it too).

### Acceleration

The last section of the dialog, **Acceleration**, decides **how** trials are evaluated: with the spreadsheet engine on one thread (**Standard**), on several cores (**Multicore CPU**), by compiling the formulas to JavaScript (**Compiled formulas**) or on the graphics card (**GPU (WebGPU)**). **Automatic** (the default) picks the fastest mode your model supports and validates the results against the sheet. Every mode uses the same samples: with the same seed the results are identical (on the GPU, except for the last digits). Details, compatibility and measured timings in [Acceleration: multicore CPU, compiled formulas and GPU](./acceleration).

### Precision control

Tick **Precision control (stop when precision is reached)** and choose:

- the **forecast** to monitor,
- the acceptable **Relative error (%)** (1% by default),
- the **Confidence** (90%, 95% or 99%).

The simulation stops as soon as the half-width of the confidence interval of that forecast's mean is below the given relative error (e.g. ±1% of the mean), checked every chunk of trials once 500 are done. **Trials** acts as the maximum. The status bar shows *“precision reached”* if it stopped early.

::: warning
Precision control is based on the **mean**. If the forecast's mean is close to zero (the NPV of a marginal project), a small *relative* error is very hard to reach and the run will go to the maximum number of trials.
:::

## Run

Click **Simulation → Run** (<kbd>Alt</kbd>+<kbd>R</kbd>). The simulation runs in the background (in a *Web Worker*), so the interface doesn't freeze. The status bar shows progress (**Simulating… 45%**).

When it finishes, the **Results** panel opens on the first forecast, and the status bar shows **Trials**, **Time**, **Seed**, the method and the **backend** used with its speed (e.g. *Compiled (CPU) · 323K trials/s*; see [Which mode was used](./acceleration#which-mode-was-used)).

During the simulation the sheet **does not change**: OpenRiskSim works on a copy of the workbook. Your original values stay intact.

### Stop

While running, the **Run** button becomes **Stop** (also <kbd>Esc</kbd> or the status-bar button). **Partial results** from the completed trials are shown.

### Common errors when running

| Message | Fix |
|---|---|
| *Define at least one forecast (output cell) before running.* | Define a forecast. |
| *Define at least one enabled assumption (uncertain input cell) before running.* | Define an assumption or enable a disabled one. |
| *N trials with errors* (status bar) | Some forecast formula failed in those trials. See [Trials with errors](./forecasts-and-decisions#trials-with-errors). |
| *Results out of date* | You changed the model or the sheet after simulating. Click **Re-run**. |

## Step

**Simulation → Step** (<kbd>Alt</kbd>+<kbd>S</kbd>) runs **a single trial** and writes the drawn values into the assumption cells, so you can see in the sheet how the cash flow looks in that particular scenario. The status bar shows *“Step mode: trial N shown in the sheet”* with two buttons:

- **Next trial**: draws another scenario.
- **Restore values**: puts the sheet back to its original values.

It is very useful to **check the model**: verify that when price or units change, the NPV changes as expected, and that no absurd values appear (negative units, for example).

## Reset

**Simulation → Reset** (<kbd>Alt</kbd>+<kbd>X</kbd>) clears the simulation results and, if you were in step mode, restores the sheet's original values. It doesn't delete the model (that's what **New profile** is for).

## Performance

Run time depends on the workbook size (how many formulas are recalculated per trial) and the number of trials. As a reference, the “Project evaluation” example (≈ 90 formulas) simulates 10,000 trials in under a second on a current laptop with the standard engine, and 100,000 trials in about 0.3 s with compiled formulas or the GPU. Workbooks with thousands of formulas can take much longer: start with 1,000 trials to measure, and check in [Acceleration](./acceleration) whether your model can be compiled.

::: tip Large workbooks
Only formulas that depend on the assumptions are recalculated, but if your workbook has large sheets not involved in the model (databases, appendices), consider removing them from the file you simulate.
:::
