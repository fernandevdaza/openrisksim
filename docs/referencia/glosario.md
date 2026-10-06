# Glosario

Términos de simulación, estadística y evaluación de proyectos usados en OpenRiskSim, con su equivalente en inglés.

**AIC / BIC** (*Akaike / Bayesian information criterion*). Criterios para comparar modelos ajustados a los mismos datos; combinan la calidad del ajuste con una penalización por número de parámetros. Menor es mejor.

**Asimetría** (*skewness*). Medida de la falta de simetría de una distribución. Positiva: cola larga hacia la derecha (valores altos); negativa: hacia la izquierda.

**Bootstrap**. Técnica que remuestrea los datos con reemplazo para estimar la precisión de un estadístico sin suponer una distribución.

**Certeza** (*certainty*). Probabilidad, expresada en %, de que un pronóstico caiga dentro de un intervalo. Puede ser de dos colas, cola izquierda o cola derecha.

**Coeficiente de variación (CV)**. Desviación estándar dividida por el valor absoluto de la media. Mide el riesgo relativo.

**Correlación de rangos (Spearman)**. Correlación entre los rangos (posiciones ordenadas) de dos variables; mide relaciones monótonas, aunque no sean lineales. Va de −1 a 1.

**Curtosis (exceso)** (*excess kurtosis*). Mide qué tan pesadas son las colas respecto de una Normal (0). Positiva: más valores extremos.

**Distribución acumulada (CDF)**. Función F(x) = P(X ≤ x). En la vista **Acumulada** de resultados se lee directamente la probabilidad de no superar un valor.

**Distribución de probabilidad**. Descripción de los valores que puede tomar una variable incierta y de su probabilidad. Puede ser **continua** (cualquier valor en un intervalo) o **discreta** (valores separados, como conteos).

**Densidad (PDF)**. Para variables continuas, función cuya área bajo la curva entre dos valores es la probabilidad de caer entre ellos. El histograma de una simulación es una aproximación de la densidad.

**Escudo fiscal** (*tax shield*). Ahorro de impuestos generado por gastos deducibles como los intereses de la deuda o la depreciación.

**Flujo de caja del inversionista** (*equity cash flow*). Flujo del proyecto después de considerar el financiamiento: préstamo recibido, intereses, escudo fiscal y amortización de la deuda. Se descuenta con el costo del capital propio (Ke).

**Flujo de caja del proyecto / flujo libre** (*free cash flow*). Flujo generado por el proyecto independientemente de cómo se financia. Se descuenta con el WACC o la TMAR.

**Frontera eficiente** (*efficient frontier*). Conjunto de soluciones óptimas al variar el límite de una restricción, típicamente rentabilidad máxima para cada nivel de riesgo.

**Hipercubo latino (LHS)** (*Latin Hypercube Sampling*). Método de muestreo que divide cada distribución en tramos de igual probabilidad y toma un valor de cada tramo. Converge más rápido que el Monte Carlo simple.

**Iman–Conover**. Método para inducir correlaciones de rangos entre variables simuladas reordenando sus muestras, sin alterar sus distribuciones.

**Índice de rentabilidad (IR, B/C)** (*profitability index*). Valor presente de los flujos futuros dividido por la inversión inicial. IR > 1 equivale a VAN > 0.

**Intervalo de confianza de la media**. Rango que, con la confianza indicada (95 %), contiene la verdadera media del pronóstico. Mide la precisión de la simulación, no el riesgo del proyecto.

**Intervalo de predicción**. En pronósticos de series de tiempo, rango donde se espera que caiga el valor futuro con una probabilidad dada (80 %, 95 %).

**Media** (*mean*). Promedio de los resultados; el **valor esperado**.

**Mediana**. Valor central: la mitad de las pruebas está por debajo y la mitad por encima.

**Monte Carlo**. Método que estima el comportamiento de un modelo repitiendo muchos escenarios con valores aleatorios.

**Percentil** (*percentile*). El percentil p es el valor por debajo del cual se encuentra el p % de los resultados. P50 = mediana.

**Periodo de recuperación (PRI)** (*payback period*). Tiempo necesario para que el flujo acumulado recupere la inversión. El **PRI descontado** usa flujos descontados.

**Prueba** (*trial*, iteración). Un escenario de la simulación: un sorteo de todos los supuestos y el recálculo del libro.

**Prueba de hipótesis**. Procedimiento estadístico para decidir si una diferencia observada (por ejemplo, entre dos medias) puede deberse al azar. Se rechaza la hipótesis nula si el **p-valor** es menor que el nivel de significancia α.

**p-valor** (*p-value*). Probabilidad de observar un resultado tan extremo como el obtenido si la hipótesis nula fuera cierta. En pruebas de ajuste, un p-valor alto indica que no hay evidencia contra la distribución.

**Pronóstico** (*forecast*). (1) En el modelo de simulación, celda de resultado cuyos valores se registran en cada prueba (VAN, TIR). (2) En la pestaña Pronóstico, proyección de una serie de tiempo hacia el futuro.

**Restricción** (*constraint*). Condición que debe cumplir una solución de optimización (por ejemplo, presupuesto ≤ 100 000).

**Semilla** (*seed*). Número que inicializa el generador aleatorio. Con la misma semilla se obtienen los mismos resultados.

**Sensibilidad** (*sensitivity*). Grado en que un resultado cambia ante cambios en una entrada. Se analiza con el tornado, el gráfico araña y la contribución a la varianza.

**Supuesto** (*assumption*). Celda de entrada incierta modelada con una distribución de probabilidad.

**TIR** (*IRR*, tasa interna de retorno). Tasa de descuento que hace el VAN igual a cero. **TIRM** (*MIRR*): versión modificada que supone reinversión a una tasa explícita.

**TMAR** (tasa mínima atractiva de rendimiento). Rentabilidad mínima exigida por el inversionista; se usa como tasa de descuento.

**Tornado**. Gráfico de sensibilidad que muestra, ordenadas de mayor a menor, cuánto cambia el resultado al mover cada variable entre un valor bajo y uno alto.

**Truncamiento** (*truncation*). Restricción de una distribución a un intervalo [mínimo, máximo].

**VAE** (valor anual equivalente, *EAA*). VAN expresado como una anualidad constante durante la vida del proyecto.

**VAN** (valor actual neto, *NPV*). Suma de los flujos de caja descontados a la tasa exigida, incluida la inversión inicial. VAN > 0: el proyecto crea valor.

**Variable de decisión** (*decision variable*). Celda controlable por quien decide, que el optimizador puede modificar dentro de un rango.

**VaR** (*value at risk*). Pérdida que no se superará con una probabilidad dada; en un proyecto, se aproxima con un percentil bajo del VAN (P5 o P1).

**Varianza**. Promedio de los cuadrados de las desviaciones respecto de la media; la desviación estándar es su raíz cuadrada.

**WACC** (*weighted average cost of capital*). Costo promedio ponderado del capital propio y de la deuda (después de impuestos). Tasa de descuento habitual del flujo del proyecto.
