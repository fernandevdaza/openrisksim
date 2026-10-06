# Motor numérico

Esta página resume los **algoritmos** que usa OpenRiskSim y sus **referencias bibliográficas**, para quien quiera auditar los cálculos, citarlos en un trabajo o contribuir. Todo está implementado en TypeScript puro en `packages/*` y probado contra valores de referencia de Excel, R y SciPy. Versión en inglés: [Numerical engine](/en/developers/numerical-engine).

## Números aleatorios

| Componente | Algoritmo | Referencia |
|---|---|---|
| Generador | **xoshiro128\*\*** (estado de 128 bits, período 2¹²⁸ − 1); cada número en [0, 1) usa 53 bits aleatorios | Blackman, D. y Vigna, S. (2021). *Scrambled linear pseudorandom number generators*. ACM TOMS 47(4). |
| Siembra | **SplitMix32** a partir de la semilla, para que semillas cercanas den secuencias independientes | Steele, Lea y Flood (2014). *Fast splittable pseudorandom number generators*. OOPSLA. |

## Muestreo

- **Transformada inversa**: cada valor se obtiene como Q(u), el cuantil de la distribución evaluado en un uniforme u. Esto permite LHS, correlaciones por rangos y truncamiento con un mismo mecanismo.
- **Monte Carlo**: uniformes independientes.
- **Hipercubo latino**: por columna, uᵢ = (π(i) + vᵢ)/n con π una permutación aleatoria y vᵢ ~ U[0, 1): exactamente un valor por estrato de probabilidad 1/n. McKay, M. D., Beckman, R. J. y Conover, W. J. (1979). *A comparison of three methods for selecting values of input variables in the analysis of output from a computer code*. Technometrics 21(2).
- **Truncamiento**: Q_T(u) = Q(F(a) + u·(F(b) − F(a))), usando la función de supervivencia en la cola superior para conservar precisión; la media y la varianza truncadas se calculan por cuadratura de Gauss–Legendre en el dominio de probabilidad.

## Correlaciones

- **Iman–Conover**: reordena las muestras para inducir la correlación de rangos deseada sin alterar las distribuciones marginales. Usa puntajes de van der Waerden Φ⁻¹(i/(n+1)), la conversión de Spearman a Pearson r = 2·sen(πρ/6) y una corrección por la correlación muestral de los puntajes (Cholesky). Iman, R. L. y Conover, W. J. (1982). *A distribution-free approach to inducing rank correlation among input variables*. Communications in Statistics – Simulation and Computation 11(3).
- **Matriz de correlación más cercana**: proyecciones alternadas con corrección de Dykstra. Higham, N. J. (2002). *Computing the nearest correlation matrix — a problem from finance*. IMA Journal of Numerical Analysis 22(3).

## Funciones especiales

| Función | Método |
|---|---|
| erf, erfc | Aproximaciones racionales de fdlibm (Sun Microsystems), error ≲ 1 ulp |
| ln Γ(x) | **Lanczos** (g = 7, n = 9) y serie de Stirling para x ≥ 10 |
| Beta incompleta regularizada | Fracción continua con el método de **Lentz modificado** (Press et al., *Numerical Recipes*) |
| Gamma incompleta regularizada | Serie + fracción continua (*Numerical Recipes*) |
| Cuantil normal | **Wichura (1988), algoritmo AS 241** (PPND16), precisión ~1e−16 |
| Inversas de beta y gamma incompletas | Estimación inicial de *Numerical Recipes* + iteración de Halley acotada (con bisección de respaldo) |

## Estadísticos

- Convenciones de Excel: desviación y varianza muestrales (n − 1, como `DESVEST.M`), asimetría y curtosis en exceso como `COEFICIENTE.ASIMETRIA` y `CURTOSIS`, percentiles con interpolación lineal como `PERCENTIL.INC`, intervalo de confianza de la media con t de Student.
- Histograma: ancho de clase de **Freedman–Diaconis** limitado a 10–100 clases; una clase por entero para datos enteros con pocos valores distintos.
- Sensibilidad: correlación de rangos de **Spearman**; contribución a la varianza = ρ²/Σρ².
- Control de precisión: semiamplitud del intervalo de confianza de la media ≤ error relativo × |media|, verificado por bloques a partir de 500 pruebas.
- Bootstrap no paramétrico con intervalo de percentiles. Efron, B. y Tibshirani, R. (1993). *An Introduction to the Bootstrap*.
- Prueba t de **Welch** con grados de libertad de Welch–Satterthwaite.

## Ajuste de distribuciones

- Estimación por **máxima verosimilitud** (forma cerrada cuando existe; si no, Nelder–Mead sobre una parametrización sin restricciones, con inversa de digamma por Newton según Minka).
- **Kolmogorov–Smirnov**: distribución exacta de Marsaglia, G., Tsang, W. W. y Wang, J. (2003). *Evaluating Kolmogorov's distribution*. Journal of Statistical Software 8(18).
- **Anderson–Darling**: Marsaglia, G. y Marsaglia, J. (2004). *Evaluating the Anderson–Darling distribution*. JSS 9(2); con la corrección de D'Agostino, R. B. y Stephens, M. A. (1986), *Goodness-of-Fit Techniques*, para Normal/Lognormal con parámetros estimados.
- **χ²** con clases equiprobables (continuas) o clases por entero con frecuencia esperada ≥ 5 (discretas).
- **AIC** = 2k − 2 ln L; **BIC** = k ln n − 2 ln L.

## Pronóstico

- **Suavizamiento exponencial** (simple, Holt, Holt amortiguado, Holt–Winters aditivo y multiplicativo) en forma de corrección de error, con parámetros optimizados por mínimos cuadrados (Nelder–Mead acotado) e intervalos de predicción de la representación de innovaciones. Hyndman, R. J. y Athanasopoulos, G. *Forecasting: Principles and Practice* (FPP); Hyndman, R. J. et al. (2008). *Forecasting with Exponential Smoothing*. Springer.
- **ARIMA** estimado como el método por defecto de R (*CSS-ML*): valores iniciales de Hannan–Rissanen, suma de cuadrados condicional (CSS) y luego verosimilitud gaussiana exacta con **filtro de Kalman** (representación de espacio de estados de Gardner, Harvey y Phillips, 1980); intervalos con los pesos ψ.
- **ARIMA automático**: *d* por pruebas ADF sucesivas y búsqueda de *p, q* ≤ 3 por AIC, descartando raíces casi unitarias (como `auto.arima`, Hyndman y Khandakar, 2008).
- **Dickey–Fuller aumentada** con p-valores aproximados de MacKinnon, J. G. (1994). *Approximate asymptotic distribution functions for unit-root and cointegration tests*. JBES 12(2).
- **Ljung–Box**: Ljung, G. M. y Box, G. E. P. (1978). Biometrika 65(2). **PACF** por Durbin–Levinson. Descomposición clásica con media móvil centrada.
- **Selección automática**: RMSE en el 20 % final de la serie (*holdout*).
- **Métricas**: MAE, RMSE, MAPE, sMAPE, R² y U de Theil (frente al pronóstico ingenuo).
- **Regresión** por mínimos cuadrados con **descomposición QR de Householder**; errores estándar, t, p-valores, IC, F, ANOVA, **VIF** y **Durbin–Watson**; regresión por pasos con umbrales de entrada/salida.
- **Tendencias** como las líneas de tendencia de Excel (exponencial y potencial ajustadas sobre ln y).
- **Procesos estocásticos** con discretización exacta: movimiento browniano geométrico (log-normal), Ornstein–Uhlenbeck y difusión con saltos de Merton, R. C. (1976). *Option pricing when underlying stock returns are discontinuous*. JFE 3.

## Optimización

- **Nelder–Mead** acotado (mapeo al hipercubo unitario) con reinicios; restricciones por lagrangiano aumentado. Nelder, J. A. y Mead, R. (1965). *A simplex method for function minimization*. The Computer Journal 7(4).
- **Algoritmo genético**: cruce SBX y mutación polinomial (variables continuas/enteras/discretas), cruce uniforme y mutación de bits (binarias), selección por torneo binario y supervivencia elitista (μ+λ), todo con las **reglas de factibilidad de Deb**. Deb, K. (2000). *An efficient constraint handling method for genetic algorithms*. CMAME 186.
- **Recocido simulado** con pasos adaptativos por coordenada (estilo Corana et al., 1987) y enfriamiento geométrico. Kirkpatrick, S., Gelatt, C. D. y Vecchi, M. P. (1983). Science 220.
- **Automático**: genético si hay variables no continuas; genético + Nelder–Mead si todas son continuas, hay restricciones y la evaluación es rápida; si no, Nelder–Mead.
- **Optimización estocástica**: cada candidato corre una simulación completa en el *worker* y se optimiza un estadístico del pronóstico.

## Finanzas

- **TIR**: Newton–Raphson desde 10 %; si falla, búsqueda de cambios de signo en (−99 %, 1000 %] y refinamiento con el método de **Brent** (1973). Todas las TIR: búsqueda en una grilla de tasas y refinamiento de cada raíz.
- Convenciones de Excel para `VNA`/`NPV` (descuenta desde el primer valor), `PAGO`, `VA`, `VF`, `NPER`, `TIRM`, `SLN`, `DB`, `DDB`/`VDB` y `SYD`.

## Compilador de fórmulas y GPU

El paquete `@openrisksim/accel` compila las fórmulas que hay entre los supuestos y los pronósticos para evaluarlas sin HyperFormula (guía de usuario: [Aceleración](../guia/aceleracion)).

- **Alcance**: recorrido en profundidad desde cada pronóstico hacia sus precedentes (orden topológico; las referencias circulares se rechazan). Solo se compilan las celdas que dependen de un supuesto o de una variable de decisión; el resto se toma como constante con el valor que calculó la hoja.
- **Semántica**: la IR tipada reproduce las reglas de coerción de HyperFormula (vacío = 0, VERDADERO/FALSO = 1/0, texto numérico simple; el texto ambiguo, como fechas o porcentajes escritos, se rechaza) y las convenciones de Excel de las funciones financieras (`NPV`, `IRR`, `PMT`…). Las constantes se pliegan en tiempo de compilación. Los errores (`#DIV/0!`, `#NUM!`…) se representan como `NaN` y se propagan como en la hoja (`IFERROR`, `ISERROR`).
- **Back-end JavaScript (f64)**: genera una secuencia lineal de instrucciones por prueba, dentro de un bucle sobre el lote. Los resultados se redondean a 14 cifras significativas, como hace HyperFormula (`smartRounding`), por lo que coinciden bit a bit con el modo estándar. Si el entorno prohíbe `new Function`, se usa un intérprete de la IR.
- **Autocomprobación y validación**: al compilar, el programa se ejecuta con los valores actuales del libro y cada celda compilada se compara con la hoja (tolerancia relativa 10⁻⁹). Antes de cada simulación, las primeras 200 pruebas se evalúan también con HyperFormula (tolerancia 10⁻⁹ para JS, 10⁻⁴ para GPU); cualquier discrepancia hace pasar al siguiente modo.

### Consideraciones de precisión simple (f32) en GPU

- El *compute shader* WGSL usa `f32`: mantisa de 24 bits (ε ≈ 1,19 × 10⁻⁷, unos 7 dígitos significativos) y rango de ±3,4 × 10³⁸. Las muestras se generan en f64 en la CPU y se convierten a f32 al subirlas; los resultados vuelven como `Float64Array`. El muestreo, las correlaciones, los estadísticos y la sensibilidad se siguen calculando en f64: solo la evaluación de las fórmulas es f32.
- WGSL permite a las implementaciones suponer que no hay `NaN` ni infinitos, así que cada valor lleva una **bandera de error** explícita; un error se escribe como un patrón de bits *quiet NaN* y se convierte en `NaN` al leerlo.
- El error relativo de la validación se mide respecto a max(|referencia|, |GPU|, 1 % de la escala del pronóstico), para que los valores cercanos a cero (un VAN casi nulo, resultado de restar flujos grandes) no se juzguen por la cancelación de f32.
- `IRR` se resuelve en GPU con Newton (hasta 60 iteraciones, tolerancia relativa 10⁻⁶ sobre la tasa); las sumas largas (`SUM`, `NPV`) acumulan error de redondeo proporcional al número de términos, que la validación vigila.
- `MEDIAN` (requiere ordenar) solo existe en CPU, y el *shader* admite hasta 5 000 fórmulas compiladas. Una invocación por prueba, `@workgroup_size(64)`, en bloques de hasta 2²⁰ pruebas limitados por `maxStorageBufferBindingSize`.

## Motor de hoja de cálculo

Las fórmulas se evalúan con [HyperFormula](https://hyperformula.handsontable.com/) (Handsontable), un motor compatible con Excel con recálculo por dependencias, usado bajo licencia GPLv3. La lectura y escritura de `.xlsx` usa [ExcelJS](https://github.com/exceljs/exceljs) y la de CSV, [Papa Parse](https://www.papaparse.com/).
