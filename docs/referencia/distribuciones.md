---
outline: [2, 2]
---

<script setup>
import DistributionReference from "../.vitepress/theme/components/DistributionReference.vue";
</script>

# Referencia de distribuciones

OpenRiskSim incluye **33 distribuciones**: 24 continuas, 8 discretas (incluida la personalizada) y el valor fijo. Esta página se genera automáticamente a partir del mismo registro que usa la aplicación (`packages/distributions/src/registry.ts`), así que los nombres, las **claves de los parámetros**, los valores predeterminados y las descripciones coinciden exactamente con la galería del diálogo **Definir supuesto**.

Para saber cuál elegir, consulta [Cómo elegir una distribución](../guia/supuestos#como-elegir-una-distribucion).

::: tip Claves de parámetros
La columna **Clave** es el nombre interno del parámetro (por ejemplo `stdDev` o `mode`). Es lo que verás si inspeccionas el modelo guardado en el `.xlsx` y lo que usan los desarrolladores. En la interfaz se muestra la etiqueta de la columna **Parámetro**.
:::

## Fórmulas de media y varianza

Notación: *a* = mínimo, *b* = máximo, *m* = más probable (moda), Γ = función gamma, γ ≈ 0,5772 (constante de Euler–Mascheroni). Todas las distribuciones admiten además [truncamiento](../guia/supuestos#truncamiento), que modifica la media y la varianza (OpenRiskSim las recalcula numéricamente).

| Distribución | Soporte | Media | Varianza |
|---|---|---|---|
| Normal (`mean` μ, `stdDev` σ) | (−∞, ∞) | μ | σ² |
| Lognormal (`mean`, `stdDev` de la variable) | (0, ∞) | `mean` | `stdDev`² |
| Uniforme | [a, b] | (a + b)/2 | (b − a)²/12 |
| Triangular | [a, b] | (a + m + b)/3 | (a² + m² + b² − am − ab − mb)/18 |
| PERT | [a, b] | (a + 4m + b)/6 | (μ − a)(b − μ)/7 |
| Beta (`alpha` α, `beta` β, en [a, b]) | [a, b] | a + (b − a)·α/(α + β) | (b − a)²·αβ / [(α + β)²(α + β + 1)] |
| Gamma (`shape` k, `scale` θ) | (0, ∞) | kθ | kθ² |
| Exponencial (`rate` λ) | [0, ∞) | 1/λ | 1/λ² |
| Weibull (`shape` k, `scale` λ, `location` c) | [c, ∞) | c + λ·Γ(1 + 1/k) | λ²·[Γ(1 + 2/k) − Γ(1 + 1/k)²] |
| Logística (`mean` μ, `scale` s) | (−∞, ∞) | μ | s²π²/3 |
| t de Student (`df` ν, `mean` μ, `scale` s) | (−∞, ∞) | μ (si ν > 1) | s²·ν/(ν − 2) (si ν > 2) |
| Chi-cuadrado (`df` k) | [0, ∞) | k | 2k |
| F (`df1` d₁, `df2` d₂) | [0, ∞) | d₂/(d₂ − 2) (si d₂ > 2) | 2d₂²(d₁ + d₂ − 2) / [d₁(d₂ − 2)²(d₂ − 4)] (si d₂ > 4) |
| Cauchy | (−∞, ∞) | no definida | no definida |
| Gumbel (máximo) (`location` μ, `scale` β) | (−∞, ∞) | μ + γβ | π²β²/6 |
| Fréchet (`shape` α, `scale` s, `location` m) | (m, ∞) | m + s·Γ(1 − 1/α) (si α > 1) | s²·[Γ(1 − 2/α) − Γ(1 − 1/α)²] (si α > 2) |
| Pareto (`shape` α, `scale` xₘ) | [xₘ, ∞) | α·xₘ/(α − 1) (si α > 1) | xₘ²·α / [(α − 1)²(α − 2)] (si α > 2) |
| Laplace (`location` μ, `scale` b) | (−∞, ∞) | μ | 2b² |
| Rayleigh (`scale` σ) | [0, ∞) | σ·√(π/2) | (4 − π)σ²/2 |
| Erlang (`k`, `rate` λ) | [0, ∞) | k/λ | k/λ² |
| Arcoseno | [a, b] | (a + b)/2 | (b − a)²/8 |
| Coseno | [a, b] | (a + b)/2 | (b − a)²·(1/4 − 2/π²) |
| Función potencia (`alpha` α) | [a, b] | a + (b − a)·α/(α + 1) | (b − a)²·α / [(α + 1)²(α + 2)] |
| Trapezoidal (`min`, `mode1`, `mode2`, `max`) | [a, b] | se calcula numéricamente | se calcula numéricamente |
| Bernoulli (`p`) | &#123;0, 1&#125; | p | p(1 − p) |
| Binomial (`n`, `p`) | &#123;0, …, n&#125; | np | np(1 − p) |
| Poisson (`lambda` λ) | &#123;0, 1, 2, …&#125; | λ | λ |
| Geométrica (`p`, fracasos antes del primer éxito) | &#123;0, 1, 2, …&#125; | (1 − p)/p | (1 − p)/p² |
| Binomial negativa (`r`, `p`, fracasos antes del r-ésimo éxito) | &#123;0, 1, 2, …&#125; | r(1 − p)/p | r(1 − p)/p² |
| Hipergeométrica (`population` N, `successes` K, `draws` n) | &#123;máx(0, n+K−N), …, mín(n, K)&#125; | nK/N | n(K/N)(1 − K/N)(N − n)/(N − 1) |
| Uniforme discreta | &#123;a, …, b&#125; | (a + b)/2 | [(b − a + 1)² − 1]/12 |
| Personalizada | los valores dados | promedio ponderado | varianza ponderada |
| Valor fijo (`value`) | &#123;value&#125; | value | 0 |

::: warning Restricciones entre parámetros
Además de los rangos de cada parámetro, se validan relaciones entre ellos: mínimo < máximo, mínimo ≤ más probable ≤ máximo (Triangular, PERT), `mode1` ≤ `mode2` (Trapezoidal), `successes` y `draws` ≤ `population` (Hipergeométrica), etc. El diálogo muestra el error junto al campo.
:::

::: tip La Lognormal se parametriza con la media y la desviación de la variable
En OpenRiskSim (igual que en Risk Simulator) los parámetros de la Lognormal son la **media y la desviación estándar de la propia variable**, no las de su logaritmo (como en `DISTR.LOGNORM` de Excel). Si quieres un precio con media $26 y desviación $3, escribe 26 y 3 directamente.
:::

## Catálogo completo

<DistributionReference lang="es" />
