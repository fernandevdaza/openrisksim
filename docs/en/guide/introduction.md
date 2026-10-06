# Introduction to risk analysis

This page explains, without heavy maths, **what a Monte Carlo simulation is** and why it is used in project evaluation. If you already know, jump to the [quick start](./quick-start).

## The problem: a single NPV doesn't tell the whole story

In the traditional (deterministic) evaluation you build the cash flow with **one value per variable** — say 10,000 units a year at $26 each — and you get **a single NPV**:

> NPV = $58,250 ⇒ “the project is worth it”.

But none of those figures is certain. The price could be $23 or $29, demand could fall short, the investment could cost more than budgeted. The deterministic NPV answers *“what if everything turns out exactly as estimated?”*, which is rarely the important question.

The questions decision-makers actually care about are:

- What is the **probability that the NPV is negative** (of losing money)?
- Between which values will the NPV fall with 90% confidence?
- Which variables **drive most of the risk** and deserve more study?

## The idea of Monte Carlo simulation

Instead of a fixed value, each uncertain variable gets a **probability distribution** describing which values it can take and how often. Then the computer:

1. Draws a value for each uncertain variable (respecting its distribution and correlations).
2. Recalculates the whole spreadsheet with those values and records the result (e.g. the NPV).
3. Repeats steps 1 and 2 thousands of times (each repetition is a **trial**).

In the end you don't have one NPV but **thousands of possible NPVs**. From them you draw a histogram and compute probabilities, percentiles and statistics.

<div class="formula">Deterministic NPV:  one number           →  $58,250
Simulated NPV:      a distribution       →  mean $37,300, P(NPV &lt; 0) ≈ 30%</div>

In the “Project evaluation” example shipped with OpenRiskSim, the base-case NPV is positive, but the simulation shows **about a 30% chance that the project destroys value**. That is information the deterministic NPV hides. (Notice also that the *mean* simulated NPV is lower than the base NPV — see the [tutorial](../tutorial/project-evaluation).)

## Key concepts

These terms are used throughout the app and this documentation. They are the same as in Risk Simulator.

| Concept | What it is | In OpenRiskSim |
|---|---|---|
| **Assumption** (input) | Uncertain input cell with a probability distribution: price, quantity, cost, investment, rate… | <span class="swatch green"></span>Green cell. `Simulation → Define assumption` |
| **Forecast** (output) | Result cell whose behaviour you want to study. Usually a formula: NPV, IRR, profit. | <span class="swatch blue"></span>Blue cell. `Simulation → Define forecast` |
| **Decision variable** | A cell **you control** (quantity to produce, share invested) that the optimizer can move within a range. | <span class="swatch yellow"></span>Yellow cell. `Simulation → Define decision` |
| **Trial** (iteration) | One scenario: a draw of every assumption and a recalculation of the sheet. | `Settings → Trials` (5,000 by default) |
| **Certainty** | Probability (in %) that the forecast falls within an interval. “70% certainty that the NPV is ≥ 0”. | Results window |
| **Correlation** | How much two assumptions move together (e.g. higher price, lower demand). | `Simulation → Correlations` |
| **Seed** | Number that fixes the random sequence: same seed, exactly the same results. | `Settings → Seed` |

## When is simulation worth it?

- When the result depends on **several uncertain variables at once** and you want their combined effect (which one-at-a-time sensitivity analysis doesn't show).
- When the decision depends on a **risk** (probability of loss, of not covering debt service, of missing a target).
- When your course requires it 🙂 — it is a standard part of risk analysis in project evaluation, together with sensitivity and scenario analysis.

::: warning Simulation does not fix a bad model
Results are only as good as the distributions you choose. Justify each assumption (historical data, quotes, expert opinion) and check that the cash flow is right before simulating. See [choosing a distribution](./assumptions#choosing-a-distribution).
:::

## Next steps

- [Installation & privacy](./installation): how to open or install the app.
- [Quick start](./quick-start): your first simulation in 5 minutes.
