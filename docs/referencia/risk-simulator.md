# Equivalencias con Risk Simulator

Si aprendiste con **Risk Simulator** en Excel para Windows, esta tabla te ayuda a encontrar cada función en OpenRiskSim. Los nombres de Risk Simulator se dan en inglés (como aparecen en la mayoría de las instalaciones), con su traducción habitual entre paréntesis.

::: info
Risk Simulator es una marca de Real Options Valuation, Inc. OpenRiskSim es un proyecto independiente, no afiliado, que reproduce el flujo de trabajo general; no es una copia de su software.
:::

## Conceptos

| Risk Simulator | OpenRiskSim | Notas |
|---|---|---|
| Simulation profile (perfil de simulación) | El **modelo** del libro | OpenRiskSim tiene un solo modelo por libro. **Nuevo perfil** lo vacía. |
| Input assumption (supuesto de entrada) | **Supuesto** (celda verde) | Igual. |
| Output forecast (pronóstico de salida) | **Pronóstico** (celda azul) | Igual. |
| Decision variable (variable de decisión) | **Variable de decisión** (celda amarilla) | Igual. |
| Trials (pruebas) | **Pruebas** | Igual. |
| Certainty (certeza) | **Certeza %** | Dos colas, cola izquierda, cola derecha. La certeza inicial (90 % por defecto) se puede cambiar en cada pronóstico. |
| Seed value (semilla) | **Semilla fija** | Mismo concepto; los números no coinciden con los de Risk Simulator porque el generador aleatorio es distinto. |
| Monte Carlo / Latin Hypercube | **Monte Carlo** / **Hipercubo latino (LHS)** | LHS es el valor por defecto en OpenRiskSim. |
| Correlations (correlaciones) | **Correlaciones** | Spearman + Iman–Conover, como Risk Simulator. Se editan en una matriz en lugar de en cada supuesto. |
| Truncation (truncamiento) | **Truncar la distribución** | Igual. |
| Precision control (control de error) | **Control de precisión** | Sobre la media de un pronóstico. |

## Menú Simulación

| Risk Simulator | OpenRiskSim |
|---|---|
| New Simulation Profile | **Simulación → Nuevo perfil** |
| Edit Simulation Profile (trials, seed, correlations) | **Simulación → Configuración** |
| Set Input Assumption | **Simulación → Definir supuesto** (<kbd>Alt</kbd>+<kbd>A</kbd>) o clic derecho |
| Set Output Forecast | **Simulación → Definir pronóstico** (<kbd>Alt</kbd>+<kbd>F</kbd>) |
| Run Simulation | **Simulación → Ejecutar** (<kbd>Alt</kbd>+<kbd>R</kbd>) |
| Run Super Speed Simulation | **Simulación → Configuración → Aceleración** (**Automático**, **Fórmulas compiladas** o **GPU (WebGPU)**) y luego **Ejecutar**. Ver [Aceleración](../guia/aceleracion). |
| Step Simulation | **Simulación → Paso a paso** (<kbd>Alt</kbd>+<kbd>S</kbd>) |
| Reset Simulation | **Simulación → Restablecer** (<kbd>Alt</kbd>+<kbd>X</kbd>) |
| Copy / Paste / Remove Parameter | **Copiar definición** / **Pegar definición** / **Eliminar definición** |
| Edit Correlations | **Simulación → Correlaciones** (<kbd>Alt</kbd>+<kbd>C</kbd>) |
| Forecast chart (histogram, cumulative, statistics, percentiles) | Panel **Resultados** → **Histograma** / **Acumulada**, **Estadísticas**, **Percentiles** |
| Overlay charts | **Superposición** / **Herramientas analíticas → Gráfico superpuesto** |
| Create Report | **Archivo → Exportar informe** (.xlsx, PDF, HTML) |
| Extract data | Hoja **Datos de simulación** del informe .xlsx (primeras 10 000 pruebas) |
| Save simulation profile in the workbook | **Archivo → Guardar .xlsx** (hoja oculta `_openrisksim`) |

## Herramientas analíticas

| Risk Simulator | OpenRiskSim |
|---|---|
| Tornado Analysis | **Herramientas analíticas → Tornado** |
| Spider chart | **Herramientas analíticas → Gráfico araña** |
| Sensitivity Analysis (rank correlation, contribution to variance) | **Herramientas analíticas → Sensibilidad** |
| Scenario Analysis (two-way table) | **Herramientas analíticas → Tabla de escenarios** |
| Distributional Fitting (single variable) | **Herramientas analíticas → Ajuste de distribuciones** (o **Ajustar a partir de datos…** en el diálogo de supuesto) |
| Bootstrap Nonparametric Simulation | **Herramientas analíticas → Bootstrap** |
| Hypothesis Test | **Herramientas analíticas → Prueba de hipótesis** (t de Welch) |
| Statistical Analysis / Descriptive statistics | **Herramientas analíticas → Estadística descriptiva** |

## Pronóstico

| Risk Simulator | OpenRiskSim |
|---|---|
| Time-Series Analysis (moving average, exponential smoothing, Holt, Holt–Winters) | **Pronóstico → Series de tiempo** |
| ARIMA / Auto ARIMA | **Series de tiempo** → método **ARIMA(p, d, q)** / **ARIMA automático** |
| Trendlines | **Series de tiempo** → **Línea de tendencia** |
| Multiple Regression / Stepwise Regression | **Pronóstico → Regresión múltiple** |
| Stochastic Processes (Brownian motion, mean reversion, jump diffusion) | **Pronóstico → Procesos estocásticos** |
| Autocorrelation, seasonality and stationarity tests | **Series de tiempo** → pestañas **ACF / PACF**, **Descomposición**, **Diagnóstico** |

## Optimización

| Risk Simulator | OpenRiskSim |
|---|---|
| Set Decision | **Simulación → Definir decisión** |
| Set Objective | **Optimización** → **Objetivo** y **Sentido** |
| Set Constraint | **Optimización** → **Restricciones → Agregar** |
| Static optimization | **Tipo de optimización: Estática (determinística)** |
| Stochastic optimization | **Tipo de optimización: Estocástica (con simulación)** |
| Efficient frontier | **Frontera eficiente** |

## Funciones de hoja

| Risk Simulator | OpenRiskSim |
|---|---|
| `RSDistNormal(media, desv)` | `ORS.NORMAL(media; desv)` |
| `RSDistTriangular(mín, moda, máx)` | `ORS.TRIANGULAR(mín; moda; máx)` |
| `RSDistUniform(mín, máx)` | `ORS.UNIFORM(mín; máx)` / `ORS.UNIFORME` |
| `RSDistPERT(mín, moda, máx)` | `ORS.PERT(mín; moda; máx)` |
| `RSDistLognormal(media, desv)` | `ORS.LOGNORMAL(media; desv)` |
| Otras funciones `RS*` | No disponibles: define el supuesto con el diálogo. |

Detalles en [Archivos → Funciones de riesgo ORS.*](../guia/archivos#funciones-de-riesgo-ors).

::: warning Los archivos de Risk Simulator no traen el modelo
Si abres en OpenRiskSim un `.xlsx` preparado con Risk Simulator, se cargan las hojas y las fórmulas, pero **no** los supuestos y pronósticos (Risk Simulator los guarda en un formato propio). Tendrás que definirlos de nuevo; con **Copiar definición** / **Pegar definición** es rápido. Las celdas con funciones `RS*` darán error: reemplázalas por su valor.
:::

## Lo que OpenRiskSim agrega

- **Aceleración automática**: CPU multinúcleo, fórmulas compiladas y **GPU (WebGPU)** en cualquier sistema (Windows, macOS, Linux), con validación automática de los resultados contra la hoja y respaldo si algo falla; hasta 5 000 000 de pruebas. Ver [Aceleración](../guia/aceleracion).
- **Niveles de confianza configurables**: certeza inicial y confianza del intervalo de la media por pronóstico, y hasta tres niveles a la vez (incluidos valores como 97,5 %) en las bandas de series de tiempo y procesos estocásticos. Ver [Pronóstico](../herramientas/pronostico#niveles-de-confianza).
- Funciona en el navegador, sin instalar Excel ni complementos.

## ¿Qué no tiene OpenRiskSim (todavía)?

- Varios **perfiles de simulación** por libro.
- **Parámetros alternativos** (definir una distribución por percentiles, como «Normal con P10 = 80 y P90 = 120»).
- Ajuste de distribuciones **multivariable** (ajuste simultáneo con correlaciones).
- Modelos de pronóstico avanzados: GARCH, cadenas de Markov, curvas J/S, *splines*, extrapolación no lineal, econometría avanzada (datos de panel, Box–Cox…).
- Optimización **dinámica** (con simulación por cada paso de un horizonte) y opciones reales (Real Options SLS).
- Gráficos de dispersión de supuestos vs pronósticos dentro de la ventana de resultados (puedes hacerlo con los datos exportados).

¿Necesitas alguna de estas funciones? [Abre un *issue*](https://github.com/fernandevdaza/openrisksim/issues) o [contribuye](../desarrolladores/contribuir).

## ¿Por qué los números no son idénticos a los de Risk Simulator? {#por-que-los-numeros-no-son-identicos-a-los-de-risk-simulator}

Una simulación Monte Carlo produce **estimaciones** basadas en números aleatorios. Dos programas (o dos ejecuciones con distinta semilla) dan resultados ligeramente distintos, aunque el modelo sea el mismo. Con suficientes pruebas (5 000–10 000) las diferencias deberían ser pequeñas: del orden de décimas de punto porcentual en las probabilidades y del error estándar en la media. Si ves diferencias grandes, revisa que las distribuciones y sus parámetros sean exactamente los mismos (en especial la Lognormal, la PERT y el truncamiento) y que las correlaciones estén aplicadas. Ver también [Preguntas frecuentes](./preguntas-frecuentes).
