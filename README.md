# OpenRiskSim

**Simulación de riesgo Monte Carlo, pronósticos y optimización para hojas de cálculo — gratis, open source y en tu navegador.**
Una alternativa libre a Risk Simulator, @RISK y Crystal Ball que funciona en **macOS, Linux y Windows** con archivos de **Excel, LibreOffice, WPS o Google Sheets** (.xlsx / .csv). No necesita instalación ni servidor: todo se calcula localmente en tu navegador.

*English below.*

---

## ¿Para qué sirve?

Pensado primero para cursos de **Preparación y Evaluación de Proyectos**, finanzas e investigación operativa:

1. Abres tu modelo en Excel (.xlsx) — por ejemplo el flujo de caja de tu proyecto.
2. Marcas las celdas inciertas como **supuestos** (precio, demanda, inversión…) y eliges su distribución de probabilidad.
3. Marcas los resultados como **pronósticos** (VAN, TIR…).
4. Ejecutas miles de escenarios y obtienes el histograma, la **probabilidad de que el VAN sea negativo**, percentiles, intervalos de certeza, sensibilidad (tornado) y un informe exportable.

## Funcionalidades

| Módulo | Incluye |
|---|---|
| **Simulación** | 33 distribuciones (Normal, Triangular, PERT, Lognormal, Beta, Gamma, Weibull, Poisson, Binomial, personalizada…), truncamiento, Monte Carlo y **Latin Hypercube**, **correlaciones** (Iman–Conover), semilla reproducible, control de precisión, simulación paso a paso, Web Worker |
| **Resultados** | Histograma y distribución acumulada, certeza de dos colas / izquierda / derecha, estadísticos completos, percentiles, gráfico superpuesto, exportación PNG, informe .xlsx y PDF |
| **Herramientas analíticas** | Tornado, spider, sensibilidad (correlación de rangos y contribución a la varianza), tabla de escenarios, **ajuste de distribuciones** a datos (KS, Anderson–Darling, χ², AIC/BIC), bootstrap, prueba de hipótesis, estadística descriptiva |
| **Pronóstico** | Series de tiempo (promedio móvil, suavizamiento exponencial, Holt, Holt–Winters, ARIMA y auto-ARIMA, tendencias), regresión múltiple y por pasos, procesos estocásticos (movimiento browniano geométrico, reversión a la media, saltos) |
| **Optimización** | Variables de decisión continuas, enteras, binarias y discretas; restricciones; optimización estática y **estocástica**; Nelder–Mead, algoritmo genético y recocido simulado; frontera eficiente |
| **Finanzas** | Evaluador de proyectos (flujo de caja del proyecto y del inversionista, VAN, TIR, TIRM, periodo de recuperación, IR, VAE), calculadora VAN/TIR, préstamos (francés/alemán/americano), depreciación, WACC/CAPM, punto de equilibrio, análisis de escenarios |
| **Hoja de cálculo** | Abre y guarda .xlsx con fórmulas y formatos, motor de fórmulas compatible con Excel ([HyperFormula](https://hyperformula.handsontable.com/)), fórmulas en español (`=SUMA`, `=VNA`, `=TIR`), el modelo de riesgo se guarda dentro del propio .xlsx |
| **Interfaz** | Español / English, modo claro y oscuro, instalable como app (PWA, funciona sin conexión) |

Incluye libros de ejemplo listos para practicar en [`examples/`](examples): evaluación de proyecto, inventario (newsvendor), cartera de inversión, lanzamiento de producto y préstamo/flujo del inversionista.

## Empezar

**Usarla:** abre la versión publicada en GitHub Pages (una vez que el repositorio esté publicado) — no hay que instalar nada.

**Ejecutarla localmente** (requiere [Node.js](https://nodejs.org) ≥ 20 y pnpm):

```bash
corepack enable
pnpm install
pnpm dev
```

Luego abre <http://localhost:5173>, ve a **Archivo → Ejemplos → Evaluación de proyecto** y pulsa **Ejecutar**.

## Equivalencias con Risk Simulator

| Risk Simulator | OpenRiskSim |
|---|---|
| Nuevo perfil de simulación | Simulación → Nuevo perfil |
| Establecer supuesto de entrada | Simulación → Definir supuesto (o clic derecho en la celda) |
| Establecer pronóstico de salida | Simulación → Definir pronóstico |
| Ejecutar / Paso a paso / Restablecer | Simulación → Ejecutar / Paso a paso / Restablecer |
| Gráfico de pronóstico (certeza) | Panel de resultados → Histograma |
| Tornado, Sensibilidad, Escenarios | Herramientas analíticas |
| Ajuste de distribuciones | Herramientas analíticas → Ajuste de distribuciones |
| Pronóstico (ARIMA, series de tiempo, regresión) | Pronóstico |
| Optimizador | Optimización |

---

## English

OpenRiskSim is a free, open-source, browser-based alternative to Risk Simulator / @RISK / Crystal Ball. Open an `.xlsx` or `.csv`, define **assumption** cells with probability distributions and **forecast** cells, run Monte Carlo or Latin Hypercube simulations with correlations, and analyse the results (histograms, certainty levels, statistics, tornado/spider/sensitivity charts, reports). It also ships distribution fitting, time-series forecasting (ARIMA, Holt–Winters…), regression, stochastic processes, static and stochastic optimization, and a project-finance toolkit (NPV, IRR, MIRR, payback, cash-flow builder, loans, depreciation, WACC). Everything runs locally; nothing is uploaded.

```bash
pnpm install && pnpm dev     # http://localhost:5173
pnpm test                    # unit tests (Vitest)
pnpm typecheck
```

## Project structure

pnpm monorepo, TypeScript strict. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the package contracts.

| Package | |
|---|---|
| [`packages/core`](packages/core) | Shared types |
| [`packages/distributions`](packages/distributions) | RNG, special functions, 33 distributions, distribution fitting |
| [`packages/engine`](packages/engine) | Sampling, correlations, statistics, simulation runner, sensitivity |
| [`packages/finance`](packages/finance) | Project finance |
| [`packages/forecast`](packages/forecast) | Forecasting, regression, stochastic processes |
| [`packages/optimizer`](packages/optimizer) | Optimization algorithms |
| [`packages/workbook`](packages/workbook) | xlsx/csv I/O, formula engine, model evaluator, worker, reports, examples |
| [`apps/web`](apps/web) | React web app |

Numerical code is tested against reference values from Excel, R and SciPy (460+ tests).

## Contributing

Issues and pull requests are welcome, in Spanish or English — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GPL-3.0-or-later](LICENSE). OpenRiskSim uses HyperFormula under its GPLv3 license.

*Risk Simulator, @RISK and Crystal Ball are trademarks of their respective owners; OpenRiskSim is not affiliated with them.*
