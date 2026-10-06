# Interpretar los resultados

Al terminar la simulación, el panel **Resultados** muestra una pestaña por cada pronóstico (por ejemplo **VAN** y **TIR**) y la pestaña **Superposición**. Cada pronóstico tiene tres pestañas internas: **Histograma**, **Estadísticas** y **Percentiles**.

![Ventana de resultados del VAN](/screenshots/es/forecast.png)

En la cabecera verás el nombre del pronóstico, su celda (haz clic para ir a ella) y el número de pruebas válidas; si hubo pruebas con error, se indica cuántas y qué porcentaje.

## Histograma y distribución acumulada

El selector **Histograma / Acumulada** cambia la vista:

- **Histograma**: cada barra indica qué porcentaje de las pruebas cayó en ese intervalo de valores. La línea punteada marca la **media**. Te muestra la forma del riesgo: dónde se concentran los resultados, si es simétrico o tiene una cola larga.
- **Acumulada**: para cada valor *x*, la probabilidad de obtener un resultado **menor o igual** a *x*. Es la forma más directa de leer probabilidades: busca VAN = 0 en el eje horizontal y lee en el vertical la probabilidad de pérdida.

El botón **PNG** descarga la gráfica como imagen para tu informe.

## Certeza

La **certeza** es la probabilidad de que el pronóstico caiga en un intervalo. Se controla con cuatro campos debajo de la gráfica:

| Campo | Uso |
|---|---|
| **Tipo** | **Dos colas** (entre dos límites), **Cola izquierda ≤** (menor o igual que un límite superior) o **Cola derecha ≥** (mayor o igual que un límite inferior). |
| **Límite inferior** / **Límite superior** | Escribe un valor y la certeza se recalcula. |
| **Certeza %** | Escribe un porcentaje y los límites se recalculan. El pequeño desplegable ▾ a su derecha (*Certezas rápidas (80 / 90 / 95 / 99 %)*) aplica uno de esos niveles con un clic. |

También puedes **arrastrar las líneas rojas** sobre el histograma. Las barras dentro del intervalo se pintan de azul; las de fuera, de gris. Una frase resume el resultado, por ejemplo: *«Certeza del 90,00 % de que el valor esté entre $ −73 851,28 y $ 157 669,64»*.

Al abrir un pronóstico la certeza empieza en **Dos colas** con la **Certeza inicial del gráfico** definida en el [pronóstico](./pronosticos-y-decisiones#definir-un-pronostico): **90 %** por defecto (el intervalo que deja un 5 % de las pruebas a cada lado). Si cambias ese valor editando el pronóstico, la banda se actualiza al instante (conservando el tipo de cola), sin volver a simular.

### Las tres preguntas más comunes

| Pregunta | Cómo responderla |
|---|---|
| ¿Probabilidad de que el proyecto sea rentable? | **Cola derecha ≥**, Límite inferior `0` → Certeza % = P(VAN ≥ 0). |
| ¿Probabilidad de pérdida? | **Cola izquierda ≤**, Límite superior `0` → Certeza % = P(VAN ≤ 0). (O 100 % menos la anterior.) |
| ¿Entre qué valores estará el VAN con 90 % de confianza? | **Dos colas**, Certeza % `90` → lee los límites. |
| ¿Probabilidad de que la TIR supere la TMAR del 12 %? | En la ventana de la TIR: **Cola derecha ≥**, Límite inferior `0,12` (los límites se escriben como fracción aunque el pronóstico se muestre en %). |
| ¿Cuál es el VAN que se supera con 95 % de probabilidad? | **Cola derecha ≥**, Certeza % `95` → el límite inferior es ese valor (el percentil 5). |

Los rangos de certeza que fijes se usan también en las gráficas del [informe exportado](./archivos#exportar-un-informe).

## Estadísticos rápidos

Debajo de la gráfica hay seis tarjetas: **Media**, **Mediana**, **Desviación estándar**, **Mínimo**, **Máximo** y **Probabilidad ≥ 0**. La última responde de inmediato la pregunta de rentabilidad cuando el pronóstico es un VAN.

## Pestaña Estadísticas

| Estadístico | Qué significa | Cómo usarlo |
|---|---|---|
| **Pruebas válidas** | Número de pruebas sin error. | Si es mucho menor que las pruebas configuradas, revisa los errores. |
| **Media** | Promedio de todos los resultados: el **valor esperado**. | El VAN esperado del proyecto. Es la cifra central del análisis de riesgo. |
| **Mediana** | Valor que deja la mitad de las pruebas por debajo y la mitad por encima (percentil 50). | Si difiere mucho de la media, la distribución es asimétrica. |
| **Moda** | Valor más frecuente (para resultados continuos, el centro de la barra más alta). | Orientativo. |
| **Desviación estándar** | Dispersión típica alrededor de la media, en las mismas unidades (estimador muestral, n − 1). | Medida clásica del **riesgo absoluto**: cuanto mayor, más incierto el resultado. |
| **Varianza** | Desviación estándar al cuadrado. | Se usa en fórmulas; es menos intuitiva. |
| **Coeficiente de variación** | Desviación estándar / \|media\|. | **Riesgo relativo**: permite comparar proyectos de distinto tamaño. Un CV mayor que 1 (100 %) indica que la dispersión supera al valor esperado. |
| **Mínimo / Máximo / Rango** | Peor y mejor resultado simulado, y su diferencia. | Dependen mucho del número de pruebas; mejor usa percentiles (P5, P95). |
| **Asimetría** | 0 = simétrica; > 0 = cola larga hacia valores altos; < 0 = cola larga hacia valores bajos. | Asimetría negativa en un VAN significa pérdidas grandes poco probables pero posibles. |
| **Curtosis (exceso)** | 0 = colas como una Normal; > 0 = colas pesadas (más valores extremos); < 0 = colas livianas. | Curtosis alta advierte de eventos extremos. |
| **Error estándar de la media** | Desviación estándar / √n: cuánto variaría la media si repitieras la simulación. | Si es grande respecto a la media, aumenta las pruebas. |
| **IC 95 % de la media** | Intervalo de confianza para la media (t de Student), al nivel de **Confianza del intervalo de la media** del pronóstico: 95 % por defecto; la fila se llama, por ejemplo, *IC 99 % de la media* si eliges 99 %. | Precisión de la estimación del valor esperado. **No** es el intervalo donde caerá el VAN (para eso usa la certeza). |
| **Percentil 10 / Percentil 90** | Valores que dejan el 10 % de las pruebas por debajo / por encima. | Escenario pesimista y optimista «razonables». |
| **Probabilidad ≥ 0** | Proporción de pruebas con resultado mayor o igual a cero. | P(VAN ≥ 0). |
| **Pruebas con error** | Pruebas en las que el pronóstico no se pudo calcular. | Idealmente 0. |

Los estadísticos siguen las convenciones de Excel (`DESVEST.M`, `COEFICIENTE.ASIMETRIA`, `CURTOSIS`, `PERCENTIL.INC`), así que puedes verificarlos exportando los datos de simulación al `.xlsx`.

## Tres intervalos que no hay que confundir

OpenRiskSim muestra tres tipos de intervalo con «niveles» parecidos (90 %, 95 %…), pero responden preguntas distintas:

| Intervalo | Dónde aparece | Pregunta que responde | Qué pasa con más pruebas |
|---|---|---|---|
| **Banda de certeza** de la distribución simulada | Histograma del pronóstico (**Certeza %**) | ¿Entre qué valores caerá **el resultado** (el VAN de este proyecto) con 90 % de probabilidad? | Se estabiliza, pero **no se estrecha**: refleja la incertidumbre real del proyecto. |
| **Intervalo de confianza de la media** | Pestaña **Estadísticas** (*IC 95 % de la media*) | ¿Qué tan precisa es la estimación del **valor esperado** que dio la simulación? | **Se estrecha** (≈ 1/√n): con suficientes pruebas, la media se conoce con mucha precisión. |
| **Intervalo de predicción** de un pronóstico de series de tiempo | [Pronóstico → Series de tiempo](../herramientas/pronostico#series-de-tiempo) (*Intervalo 95 %*) | ¿Entre qué valores estará la **próxima observación** de la serie (las ventas del mes 13)? | Depende de los datos históricos, no de pruebas; **se ensancha** con el horizonte. |

Ejemplo con el modelo «Evaluación de proyecto» (10 000 pruebas): la banda de certeza del 90 % del VAN va de unos −$74 000 a $157 000, mientras que el IC 95 % de la **media** es de aproximadamente $37 387 ± $1 400. Decir «el VAN estará entre $36 000 y $39 000 con 95 % de confianza» sería un error grave: eso es la precisión de la media, no el rango del VAN.

::: tip Regresión
Los intervalos de confianza de los **coeficientes** de una [regresión](../herramientas/pronostico#regresion-multiple) son del segundo tipo: indican la precisión con la que se estimó cada coeficiente, no el rango de Y.
:::

## Pestaña Percentiles

Tabla con los percentiles 1, 5, 10, 15, …, 90, 95 y 99. El **percentil p** es el valor por debajo del cual se encuentra el p % de las pruebas. Por ejemplo, si el percentil 5 del VAN es −$74 000, hay un 5 % de probabilidad de que el VAN sea aún peor.

::: tip VaR del proyecto
El percentil 5 (o 1) del VAN es una medida tipo *Value at Risk*: «con 95 % de confianza, el proyecto no perderá más de X».
:::

## Gráfico superpuesto

La pestaña **Superposición** (o **Simulación → Superposición**) dibuja varios pronósticos en la misma gráfica, como densidad o acumulada. Sirve para comparar alternativas: por ejemplo, el VAN del proyecto con y sin financiamiento, o dos tamaños de planta. Una curva desplazada a la derecha tiene valores mayores; una más ancha, más riesgo. Para más opciones (número de clases, resumen) usa **Herramientas analíticas → [Gráfico superpuesto](../herramientas/analiticas#grafico-superpuesto)**.

::: warning Compara en la misma escala
La superposición tiene sentido entre pronósticos de la misma naturaleza (dos VAN, dos utilidades). No superpongas un VAN con una TIR.
:::

## Sensibilidad

Para saber **qué supuestos explican el riesgo** del pronóstico usa **Herramientas analíticas → [Sensibilidad](../herramientas/analiticas#sensibilidad)** (usa los resultados de la última simulación) y **[Tornado](../herramientas/analiticas#tornado)**.

## Cómo redactar la interpretación en el informe

Un buen párrafo de análisis de riesgo menciona: qué se simuló (supuestos y distribuciones, correlaciones), cómo (pruebas, método, semilla), el valor esperado, la dispersión, la probabilidad de pérdida, un intervalo de certeza y las variables más influyentes. Ejemplo con el modelo «Evaluación de proyecto» (10 000 pruebas):

> Se realizó una simulación de Monte Carlo de 10 000 pruebas (muestreo por hipercubo latino, semilla 12345) sobre el flujo de caja del proyecto, modelando como inciertos las unidades vendidas del año 1 (Normal, μ = 10 000, σ = 1 500), el precio unitario (Normal, μ = $26, σ = $2), el costo variable unitario (PERT 10,5 – 12 – 15), la inversión inicial (Triangular 220 000 – 250 000 – 310 000) y la tasa de descuento (Uniforme 10 % – 14 %), con una correlación de −0,5 entre precio y unidades.
>
> El VAN esperado es de **$37 387**, inferior al VAN del escenario base ($58 250), con una desviación estándar de $70 370 (CV = 1,88). Existe una **probabilidad del 30,3 % de que el VAN sea negativo**. Con un 90 % de certeza, el VAN estará entre −$74 287 y $157 001. La TIR esperada es de 16,2 %, con un 69,8 % de probabilidad de superar la tasa de descuento de referencia del 12 %.
>
> El análisis de sensibilidad muestra que las unidades vendidas (33,6 % de la varianza del VAN), el precio (29,7 %) y el costo variable unitario (24,5 %) explican cerca del 88 % del riesgo; la inversión y la tasa de descuento tienen un efecto menor. Se recomienda profundizar el estudio de mercado para reducir la incertidumbre sobre volumen y precio antes de tomar la decisión de inversión.

Más detalles sobre cómo llegar a esas cifras en el [tutorial](../tutorial/evaluacion-de-proyecto).
