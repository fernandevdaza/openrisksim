# Correlations

By default each assumption is drawn **independently** of the others. In reality many variables move together:

- If the **price rises**, the **quantity demanded** tends to **fall** (negative correlation).
- If **inflation** rises, **costs** and **prices** rise together (positive correlation).
- **Local and international equities** tend to move together.

Ignoring these relationships can **under- or overstate risk**. For instance, if price and quantity are negatively correlated, “high price and high quantity” scenarios are rarer than independence would imply, and revenue is less dispersed.

## Defining correlations

1. Define at least **two enabled assumptions**.
2. Click **Simulation → Correlations** (<kbd>Alt</kbd>+<kbd>C</kbd>).
3. A **matrix** with every assumption appears. Type coefficients in the **upper triangle**; the matrix is symmetric, so the lower triangle fills itself. The diagonal is always 1.
4. Click **OK**.

Dialog buttons:

- **Set all to 0**: removes every correlation.
- **Adjust to nearest**: appears when the matrix is invalid (see below).

The Model explorer footer shows how many correlations are defined.

## What the coefficient means

Coefficients are **rank (Spearman) correlations** between −1 and 1:

| Value | Interpretation |
|---|---|
| +1 | Perfect increasing relationship: when one is at its highest, so is the other. |
| +0.5 | They tend to move in the same direction (moderate). |
| 0 | No relationship (independent). |
| −0.5 | They tend to move in opposite directions. |
| −1 | Perfect decreasing relationship. |

**Rank** correlation (rather than Pearson) is used because it works with any pair of distributions — a Normal with a Triangular, a Poisson with a Lognormal — without changing the shape of either.

::: tip Where do I get the coefficient?
- From **historical data**: compute the correlation between the two series (e.g. with `=CORREL(…)` or the [regression](../tools/forecasting#multiple-regression) tool).
- From the **literature** or market studies (price elasticity of demand).
- From **expert judgement**: −0.3 weak, −0.5 moderate, −0.8 strong. Justify it in your report and test how sensitive the result is to it.
:::

## How they are applied: the Iman–Conover method

OpenRiskSim induces correlations with the **Iman and Conover (1982)** method, the same approach used by Risk Simulator, @RISK and Crystal Ball:

1. Each assumption's samples are generated independently (exactly following its distribution).
2. The samples are **reordered** so that their ranks have the requested correlation.

Because they are only reordered, **each assumption keeps exactly its distribution** (same mean, same percentiles). The achieved correlation is very close to the requested one but not identical: with 5,000 trials the difference is usually in the second decimal.

## Non-positive-definite matrix

Not every combination of coefficients is possible. For example, if A and B have +0.9 correlation, B and C +0.9, but A and C −0.9, the matrix is **inconsistent** (if A and C both move with B, they can't move against each other). Mathematically, the matrix must be **positive definite**.

The dialog tells you:

- ✅ *“Valid matrix (positive definite).”*
- ⚠️ *“The matrix is not positive definite: the engine will use the nearest valid matrix.”*

In the second case you can click **Adjust to nearest** to see and keep the corrected matrix (computed with Higham's nearest-correlation-matrix algorithm). If you don't, the engine corrects it anyway when simulating.

## Turning them on or off

In **Simulation → Settings**, the **Apply correlations** checkbox lets you run with or without them without deleting the matrix. Useful to show in your report how the risk changes when correlation is considered.

## Example: price and demand

The “Project evaluation” example defines a **−0.5** correlation between **Unit price** and **Units sold year 1**. To see its effect:

1. Run with the original settings and note the NPV's standard deviation and the probability of NPV ≥ 0.
2. In **Settings**, untick **Apply correlations** and run again.
3. Compare: without the negative correlation, extreme scenarios (high price *and* many units, or low price *and* few units) are more frequent, so the **NPV's dispersion increases** (with 10,000 trials the standard deviation goes from about $70,400 to $97,200).

::: warning
Correlations only apply between **enabled** assumptions. If you disable an assumption, its correlations are ignored.
:::
