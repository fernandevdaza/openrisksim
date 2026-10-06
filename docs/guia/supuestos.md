# Supuestos

Un **supuesto** es una celda de entrada incierta a la que asignas una **distribución de probabilidad**. En cada prueba de la simulación, OpenRiskSim reemplaza el valor de la celda por un número sorteado de esa distribución y recalcula el libro.

## Definir un supuesto

1. Selecciona la celda **que contiene el valor de entrada** (por ejemplo, el precio `26`), no su etiqueta.
2. Pulsa **Simulación → Definir supuesto**, <kbd>Alt</kbd>+<kbd>A</kbd>, o clic derecho → **Definir supuesto**.
3. Elige la distribución en la **galería**, ajusta los **parámetros** y pulsa **Aceptar**.

La celda se pinta de <span class="swatch green"></span>verde y aparece en el **Explorador del modelo**.

![Diálogo «Definir supuesto»](/screenshots/es/assumption.png)

### Partes del diálogo

| Parte | Para qué sirve |
|---|---|
| **Buscar distribución…** y filtros **Todas / Continuas / Discretas** | Encontrar rápido una de las [33 distribuciones](../referencia/distribuciones). Cada tarjeta muestra la forma típica. |
| **Nombre** | Se propone automáticamente con el texto más cercano a la izquierda (o arriba) de la celda, como «Precio unitario». Puedes cambiarlo. |
| **Activo** | Si lo desmarcas, el supuesto se conserva pero **no se simula**: la celda mantiene su valor fijo. Útil para comparar «con y sin» la incertidumbre de una variable. |
| Recuadro de descripción | Qué es la distribución y su uso típico. |
| **Parámetros** | Campos propios de cada distribución (Media, Desviación estándar, Mínimo, Más probable, Máximo…). Si un valor no es válido, el campo lo indica en rojo. |
| **Truncar la distribución (límites mínimo/máximo)** | Restringe los valores posibles (ver abajo). |
| Gráfica **Densidad (PDF)** / **Acumulada (CDF)** | Vista previa de la distribución elegida, con la media marcada y los valores de **Media**, **Desviación estándar**, **P5**, **P10**, **P50**, **P90** y **P95**. |
| **Ajustar a partir de datos…** | Elige la distribución que mejor describe tus datos históricos (ver abajo). |
| **Eliminar** | Quita el supuesto (solo si la celda ya tenía uno). |

::: tip Valores sugeridos
Al elegir una distribución, los parámetros se proponen alrededor del valor actual de la celda (por ejemplo, con un precio de 26, una Triangular de 23,4 a 28,6 con moda 26). Son solo un punto de partida: **reemplázalos por tus propias estimaciones**.
:::

### Avisos frecuentes

- *«La celda contiene una fórmula…»*: durante la simulación la fórmula será reemplazada por valores aleatorios (se restaura al terminar). Normalmente los supuestos se definen sobre celdas con **valores constantes**; si la celda es una fórmula, probablemente debas poner el supuesto en alguna de las celdas de las que depende.
- *«La celda no contiene un número…»*: estás sobre una etiqueta o una celda vacía. Mueve el cursor a la celda del valor.

## Truncamiento

Abre **Truncar la distribución**, marca **Mínimo** y/o **Máximo** y escribe el límite. Los valores fuera del rango no se generan; la probabilidad se redistribuye dentro de él (técnicamente se aplica la inversa de la función de distribución acumulada sobre el intervalo restringido).

Usos típicos:

- Una Normal para **unidades vendidas** o **precio** con mínimo 0, para que nunca salgan negativos (así está en el ejemplo «Evaluación de proyecto»).
- Una tasa de interés Normal limitada a un rango realista (por ejemplo, 2 %–16 %).

::: warning
Truncar cambia la media y la desviación de la distribución. Si truncas mucho (por ejemplo, cortas una Normal en su media), la media resultante se desplaza. Mira la vista previa: los valores P5–P95 y la media ya incluyen el truncamiento.
:::

## Distribución personalizada (tus propios datos)

La distribución **Personalizada** se define con una lista de **Valores** (separados por espacios, `;` o saltos de línea) y, opcionalmente, sus **Probabilidades**:

- **Con probabilidades** → distribución discreta. Ejemplo de escenarios: valores `80; 100; 130` con probabilidades `0,25; 0,5; 0,25`. Si no suman 1, se normalizan.
- **Sin probabilidades** → distribución **empírica continua** que remuestrea tus datos interpolando entre ellos. Útil cuando tienes datos históricos que no se parecen a ninguna distribución estándar.

Con **Cargar valores desde un rango** puedes traer los valores directamente de la hoja (escribe el rango, p. ej. `Datos!B2:B37`, o usa la selección actual) y pulsar **Cargar**.

## Ajustar a partir de datos

Si tienes datos históricos (precios de los últimos 36 meses, demanda semanal…):

1. En el diálogo pulsa **Ajustar a partir de datos…**
2. Indica el rango con los datos (al menos **5 valores numéricos**) y pulsa **Ajustar**.
3. Verás las 8 mejores distribuciones ordenadas por **AIC** (menor es mejor), con sus parámetros estimados. Pulsa **Usar** en la que prefieras: sus parámetros se copian al supuesto.

Para un análisis más completo (pruebas Kolmogorov–Smirnov, Anderson–Darling, χ², gráficos P–P y Q–Q) usa **Herramientas analíticas → [Ajuste de distribuciones](../herramientas/analiticas#ajuste-de-distribuciones)**, que también puede crear el supuesto directamente.

## Copiar y pegar definiciones

Para usar la misma distribución en muchas celdas (por ejemplo, el crecimiento de cada año):

1. Selecciona la celda que ya tiene el supuesto y pulsa **Simulación → Copiar definición**.
2. Selecciona el rango de destino (puede ser de varias celdas) y pulsa **Pegar definición**.

Cada celda recibe una copia independiente de la definición, con un nombre tomado de su propia etiqueta. Si una celda ya tenía un supuesto, se reemplaza. **Eliminar definición** quita todas las definiciones (supuestos, pronósticos o decisiones) del rango seleccionado. Copiar/pegar también funciona con pronósticos y variables de decisión.

::: tip Copiar celdas no copia definiciones
<kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd> copian **valores y fórmulas**, como en Excel. Las definiciones del modelo se copian solo con **Copiar definición** / **Pegar definición**.
:::

## Editar o eliminar

- Vuelve a pulsar **Definir supuesto** sobre la celda (o el ícono de editar en el Explorador del modelo).
- Para eliminar: botón **Eliminar** del diálogo, ícono de papelera en el explorador o **Eliminar definición**.
- **Nuevo perfil** elimina todo el modelo de una vez (la hoja no cambia).

## Cómo elegir una distribución

No existe una distribución «correcta» universal: elige la que mejor represente **lo que sabes** sobre la variable, y **justifícala** en tu informe.

| Si tienes… | Usa… | Por qué |
|---|---|---|
| Un mínimo, un valor más probable y un máximo (opinión de expertos, cotizaciones) | **Triangular** o **PERT** | Tres estimaciones fáciles de obtener. La PERT da más peso al valor más probable y tiene colas más suaves; la Triangular es más conservadora (más dispersión). |
| Solo un rango, sin valor preferido | **Uniforme** | Todos los valores del rango igualmente probables. Representa máxima ignorancia dentro del rango. |
| Un valor medio y una dispersión simétrica (errores, variables que suman muchos efectos) | **Normal** (truncada si no puede ser negativa) | Clásica, simétrica. |
| Una variable positiva y asimétrica a la derecha (precios, costos, ingresos, valores de inmuebles) | **Lognormal** | Nunca negativa; crece de forma multiplicativa. Sus parámetros son la media y desviación **de la variable**, no de su logaritmo. |
| **Datos históricos** suficientes (≥ 30 idealmente) | **[Ajuste de distribuciones](../herramientas/analiticas#ajuste-de-distribuciones)** o **Personalizada** | Que los datos decidan. |
| Conteos de eventos en un periodo (clientes por hora, fallas por mes) | **Poisson** | Eventos independientes a tasa constante λ. |
| Un evento que ocurre o no (aprobación de un permiso, ganar una licitación) | **Bernoulli (sí/no)** | Vale 1 con probabilidad p y 0 si no. Multiplica el efecto del evento por la celda. |
| Número de éxitos en n intentos (distribuidores que firman de 20 contactados) | **Binomial** | n ensayos independientes con probabilidad p. |
| Proporciones o porcentajes acotados (participación de mercado, tasa de ocupación) | **Beta** | Muy flexible en un intervalo [mín, máx]. |
| Tiempos entre eventos, duraciones | **Exponencial**, **Gamma**, **Weibull**, **Erlang** | Positivas y asimétricas; Weibull es estándar en confiabilidad. |
| Valores extremos (máxima crecida, peor pérdida) | **Gumbel**, **Fréchet**, **Pareto** | Colas pesadas. |
| Escenarios discretos con probabilidades subjetivas (pesimista / base / optimista) | **Personalizada** con probabilidades | Exactamente tus escenarios. |
| Una constante que quieres «apagar» sin borrar el supuesto | **Valor fijo** (o desmarcar **Activo**) | Elimina la incertidumbre temporalmente. |

::: tip Una regla práctica para el curso
Para la mayoría de las variables de un proyecto (precio, cantidad, costo unitario, inversión) la **Triangular** o la **PERT** con estimaciones pesimista / más probable / optimista son suficientes y fáciles de justificar. Usa la **Normal** cuando tengas una media y una desviación de una fuente, y el **ajuste a datos** cuando tengas series históricas. Las [herramientas de sensibilidad](../herramientas/analiticas#tornado) te dirán en qué variables vale la pena invertir más esfuerzo.
:::

Consulta la [referencia de distribuciones](../referencia/distribuciones) para ver los parámetros de las 33 distribuciones.

## ¿Qué celdas deben ser supuestos?

- Las **entradas** del modelo con incertidumbre relevante: precio, volumen, costos unitarios, inversión, tasa de crecimiento, tasa de descuento (si no es fija por política).
- **No** las celdas calculadas (ingresos = precio × cantidad): esas cambian solas.
- **No** las variables que no influyen: si el [tornado](../herramientas/analiticas#tornado) muestra que una variable casi no mueve el VAN, déjala fija y simplifica el modelo.
- Si una variable se repite cada año (por ejemplo, el precio de cada año), puedes poner un supuesto en el **precio del año 1** y proyectar los demás con una fórmula de crecimiento, o un supuesto por año. Lo primero modela un shock permanente; lo segundo, variaciones independientes cada año (que tienden a compensarse). Elige según la realidad de tu proyecto, o usa [correlaciones](./correlaciones) entre los años.
