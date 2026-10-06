# Forecasts & decision variables

## Forecasts

A **forecast** is a **result** cell whose values are recorded in every simulation trial. When the run ends, each forecast gets its own window with histogram, statistics and percentiles.

Typical forecasts in project evaluation: **NPV**, **IRR**, **MIRR**, **payback period**, **net income of a year**, **cumulative cash flow**, **DSCR** (debt service coverage), or an indicator such as `=IF(NPV>0,1,0)`.

### Defining a forecast

1. Select the result cell (usually a **formula**).
2. Click **Simulation → Define forecast**, <kbd>Alt</kbd>+<kbd>F</kbd>, or right-click → **Define forecast**.
3. Fill in:
   - **Name**: proposed from the cell's label. Use short names: they appear on the results tabs.
   - **Result format**: **Number**, **Currency** or **Percent**. Only affects how values are displayed in charts and tables (choose **Percent** for the IRR).
   - **Initial chart certainty (%)**: the **two-tail** band shown when the forecast opens. **90%** by default, like Risk Simulator. Any value greater than 0 and less than 100 is accepted (e.g. 97.5); the **80**, **90**, **95** and **99** buttons set it in one click.
   - **Confidence of the mean interval (%)**: level of the confidence interval of the mean shown in the **Statistics** tab (**95%** by default). Between 50 and 99.9%, with the same quick buttons.
4. Click **OK**. The cell turns <span class="swatch blue"></span>blue.

The dialog shows the cell's **Current value** so you can check you picked the right one.

Both levels are saved with the forecast (inside the `.xlsx`) and apply **immediately** to results already computed: no need to re-run. They are also used in the [exported report](./files#exporting-a-report). Each forecast can have its own levels: for instance 90% for the NPV and 95% for the IRR.

::: tip Certainty ≠ confidence
**Certainty** describes where the outcome will fall (the NPV will lie between A and B with 90% probability); the **confidence of the mean interval** describes how precise the estimate of the expected value is. See [Three intervals not to confuse](./results#three-intervals-not-to-confuse).
:::

::: warning “The cell does not contain a formula”
If the forecast is a constant, it won't change between trials and the histogram will be a single bar. Forecasts are almost always formulas that depend (directly or indirectly) on the assumptions.
:::

### Trials with errors

If in some trial the forecast's formula returns an error or a non-numeric value (e.g. `#NUM!` for an IRR that doesn't exist because all flows are negative), that trial is recorded as an **error** and excluded from the histogram and statistics. The forecast window and the status bar show how many trials had errors. If there are many, review the model: maybe a distribution generates impossible values (negative prices, say) and should be truncated.

::: tip IRR and errors
With very bad cash flows the IRR may not exist. If that happens often, use the **NPV** as the main forecast and the IRR as a complement; mention the share of trials without an IRR in your report.
:::

### Indicator forecasts

A handy trick: create a cell `=IF(B34>0,1,0)` (1 if the NPV is positive) and define it as a forecast with Number format. Its **mean** is directly the **probability of success**. The “Product launch” example does this in cell `B24`.

## Decision variables

A **decision variable** is a cell **you control** and that is not uncertain: quantity to produce, plant size, share of the portfolio in each asset, whether to make an optional investment. It isn't simulated; the [Optimization](../tools/optimization) tool uses it to search for the best value.

### Defining a decision variable

1. Select the cell (it must hold a number used by your formulas).
2. Click **Simulation → Define decision**, <kbd>Alt</kbd>+<kbd>D</kbd>, or right-click → **Define decision**.
3. Fill in:
   - **Name**.
   - **Type**:
     - **Continuous**: any value between the bounds (percentages, amounts).
     - **Integer**: whole numbers only (units, number of machines).
     - **Binary (0/1)**: yes or no (do a project or not).
     - **Discrete (stepped)**: values between the bounds in fixed steps, e.g. 50 at a time.
   - **Lower bound** and **Upper bound** (not for binary); **Step** for discrete.
4. Click **OK**. The cell turns <span class="swatch yellow"></span>yellow.

::: tip
Decision variables don't affect **Run**: the simulation uses whatever value the cell holds. After optimizing, the optimization tool's **Apply solution** button writes the optimal values into the cells.
:::

Example: in the **Inventory (newsvendor)** workbook cell `B11` (order quantity) is an **Integer** decision between 60 and 140, and in **Investment portfolio** the four weights `E6:E9` are **Continuous** decisions between 0 and 1.
