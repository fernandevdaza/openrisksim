---
outline: [2, 2]
---

<script setup>
import DistributionReference from "../../.vitepress/theme/components/DistributionReference.vue";
</script>

# Distribution reference

OpenRiskSim ships **33 distributions**: 24 continuous, 8 discrete (including custom) and the fixed value. This page is generated automatically from the same registry the app uses (`packages/distributions/src/registry.ts`), so names, **parameter keys**, defaults and descriptions match the gallery of the **Define assumption** dialog exactly.

To decide which one to use, see [Choosing a distribution](../guide/assumptions#choosing-a-distribution).

::: tip Parameter keys
The **Key** column is the parameter's internal name (e.g. `stdDev` or `mode`). It is what you'll see if you inspect the model saved in the `.xlsx`, and what developers use. The interface shows the **Parameter** label.
:::

## Mean and variance formulas

Notation: *a* = minimum, *b* = maximum, *m* = most likely (mode), Γ = gamma function, γ ≈ 0.5772 (Euler–Mascheroni constant). Every distribution also supports [truncation](../guide/assumptions#truncation), which changes the mean and variance (OpenRiskSim recomputes them numerically).

| Distribution | Support | Mean | Variance |
|---|---|---|---|
| Normal (`mean` μ, `stdDev` σ) | (−∞, ∞) | μ | σ² |
| Lognormal (`mean`, `stdDev` of the variable) | (0, ∞) | `mean` | `stdDev`² |
| Uniform | [a, b] | (a + b)/2 | (b − a)²/12 |
| Triangular | [a, b] | (a + m + b)/3 | (a² + m² + b² − am − ab − mb)/18 |
| PERT | [a, b] | (a + 4m + b)/6 | (μ − a)(b − μ)/7 |
| Beta (`alpha` α, `beta` β, on [a, b]) | [a, b] | a + (b − a)·α/(α + β) | (b − a)²·αβ / [(α + β)²(α + β + 1)] |
| Gamma (`shape` k, `scale` θ) | (0, ∞) | kθ | kθ² |
| Exponential (`rate` λ) | [0, ∞) | 1/λ | 1/λ² |
| Weibull (`shape` k, `scale` λ, `location` c) | [c, ∞) | c + λ·Γ(1 + 1/k) | λ²·[Γ(1 + 2/k) − Γ(1 + 1/k)²] |
| Logistic (`mean` μ, `scale` s) | (−∞, ∞) | μ | s²π²/3 |
| Student's t (`df` ν, `mean` μ, `scale` s) | (−∞, ∞) | μ (if ν > 1) | s²·ν/(ν − 2) (if ν > 2) |
| Chi-square (`df` k) | [0, ∞) | k | 2k |
| F (`df1` d₁, `df2` d₂) | [0, ∞) | d₂/(d₂ − 2) (if d₂ > 2) | 2d₂²(d₁ + d₂ − 2) / [d₁(d₂ − 2)²(d₂ − 4)] (if d₂ > 4) |
| Cauchy | (−∞, ∞) | undefined | undefined |
| Gumbel (maximum) (`location` μ, `scale` β) | (−∞, ∞) | μ + γβ | π²β²/6 |
| Fréchet (`shape` α, `scale` s, `location` m) | (m, ∞) | m + s·Γ(1 − 1/α) (if α > 1) | s²·[Γ(1 − 2/α) − Γ(1 − 1/α)²] (if α > 2) |
| Pareto (`shape` α, `scale` xₘ) | [xₘ, ∞) | α·xₘ/(α − 1) (if α > 1) | xₘ²·α / [(α − 1)²(α − 2)] (if α > 2) |
| Laplace (`location` μ, `scale` b) | (−∞, ∞) | μ | 2b² |
| Rayleigh (`scale` σ) | [0, ∞) | σ·√(π/2) | (4 − π)σ²/2 |
| Erlang (`k`, `rate` λ) | [0, ∞) | k/λ | k/λ² |
| Arcsine | [a, b] | (a + b)/2 | (b − a)²/8 |
| Cosine | [a, b] | (a + b)/2 | (b − a)²·(1/4 − 2/π²) |
| Power function (`alpha` α) | [a, b] | a + (b − a)·α/(α + 1) | (b − a)²·α / [(α + 1)²(α + 2)] |
| Trapezoidal (`min`, `mode1`, `mode2`, `max`) | [a, b] | computed numerically | computed numerically |
| Bernoulli (`p`) | &#123;0, 1&#125; | p | p(1 − p) |
| Binomial (`n`, `p`) | &#123;0, …, n&#125; | np | np(1 − p) |
| Poisson (`lambda` λ) | &#123;0, 1, 2, …&#125; | λ | λ |
| Geometric (`p`, failures before the first success) | &#123;0, 1, 2, …&#125; | (1 − p)/p | (1 − p)/p² |
| Negative binomial (`r`, `p`, failures before the r-th success) | &#123;0, 1, 2, …&#125; | r(1 − p)/p | r(1 − p)/p² |
| Hypergeometric (`population` N, `successes` K, `draws` n) | &#123;max(0, n+K−N), …, min(n, K)&#125; | nK/N | n(K/N)(1 − K/N)(N − n)/(N − 1) |
| Discrete uniform | &#123;a, …, b&#125; | (a + b)/2 | [(b − a + 1)² − 1]/12 |
| Custom | the given values | weighted mean | weighted variance |
| Fixed value (`value`) | &#123;value&#125; | value | 0 |

::: warning Constraints between parameters
Besides each parameter's range, relationships are validated: minimum < maximum, minimum ≤ most likely ≤ maximum (Triangular, PERT), `mode1` ≤ `mode2` (Trapezoidal), `successes` and `draws` ≤ `population` (Hypergeometric), etc. The dialog shows the error next to the field.
:::

::: tip The Lognormal uses the variable's mean and standard deviation
In OpenRiskSim (as in Risk Simulator) the Lognormal's parameters are the **mean and standard deviation of the variable itself**, not of its logarithm (as in Excel's `LOGNORM.DIST`). For a price with mean $26 and sd $3, type 26 and 3 directly.
:::

## Full catalogue

<DistributionReference lang="en" />
