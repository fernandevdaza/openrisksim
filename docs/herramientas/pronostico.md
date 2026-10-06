# Pronóstico

La pestaña **Pronóstico** contiene tres herramientas para proyectar variables a partir de datos históricos. Sus resultados te ayudan a **definir supuestos mejor fundamentados**: por ejemplo, usar el pronóstico de demanda como valor esperado y su intervalo de predicción para elegir la dispersión.

::: tip «Pronóstico» tiene dos significados
En esta pestaña, *pronóstico* significa **proyectar una serie hacia el futuro** (*forecasting*). No confundir con las celdas **pronóstico** del modelo de simulación (las celdas azules de resultado), que en Risk Simulator se llaman *forecast* también.
:::

## Series de tiempo

![Series de tiempo con Holt-Winters](/screenshots/es/timeseries.png)

**Para qué sirve.** Pronostica una serie (ventas mensuales, demanda, precios…) varios periodos hacia adelante, con **intervalos de predicción** a los niveles de confianza que elijas (80 % y 95 % por defecto).

**Cómo se usa.**
1. **Serie histórica (en orden cronológico)**: un rango de la hoja o datos pegados. Una sola columna, del dato más antiguo al más reciente, sin huecos.
2. **Método** (ver tabla).
3. **Períodos a pronosticar** (6 por defecto) y, para los métodos estacionales, **Período estacional** (12 = mensual, 4 = trimestral, 1 = sin estacionalidad). Según el método aparecen **Ventana del promedio**, el orden **(p, d, q)** de ARIMA o el **Tipo de tendencia**.
4. **Niveles de confianza** de los intervalos de predicción (ver abajo).
5. Pulsa **Pronosticar**.

### Niveles de confianza

El selector **Niveles de confianza** permite mostrar **hasta 3 intervalos a la vez**:

- Los botones **80 %**, **90 %**, **95 %** y **99 %** activan o desactivan cada nivel (por defecto, 80 % y 95 %).
- En **Otro nivel (%)** puedes escribir cualquier nivel entre **50 y 99,9 %**, con decimales y coma decimal (por ejemplo `97,5`), y pulsar **Agregar** o <kbd>Enter</kbd>. Los niveles personalizados aparecen como botones con una ✕ para quitarlos.
- Siempre queda al menos un nivel. Si ya hay tres, el aviso *«Máximo 3 niveles: quite uno antes de agregar otro.»* pide quitar uno primero.

Cambiar los niveles después de pronosticar **recalcula los intervalos al instante** con los mismos datos y el mismo método. El método **Automático** usa los mismos niveles para todos los candidatos.

### Métodos y cuándo usarlos

| Método | Cuándo usarlo |
|---|---|
| **Automático (elige el mejor)** | Si no sabes cuál elegir. Prueba promedio móvil, suavizamiento simple, Holt, Holt amortiguado, Holt-Winters (si hay al menos dos ciclos completos), ARIMA automático y tendencia lineal; los ajusta con el 80 % inicial de los datos, mide el RMSE en el 20 % final y se queda con el de menor error. La tabla **Comparación de métodos** muestra el ranking. |
| **Promedio móvil** | Series sin tendencia ni estacionalidad, para suavizar ruido. El pronóstico es plano. |
| **Suavizamiento exponencial simple** | Series sin tendencia ni estacionalidad; pondera más los datos recientes (parámetro α). |
| **Holt (tendencia lineal)** | Series con tendencia (crecimiento o caída sostenida). |
| **Holt amortiguado** | Tendencia que se espera que se suavice con el tiempo; suele ser más prudente a largo plazo. |
| **Holt-Winters aditivo (estacional)** | Tendencia + estacionalidad de amplitud **constante** (p. ej. +200 unidades cada diciembre). |
| **Holt-Winters multiplicativo (estacional)** | Estacionalidad **proporcional** al nivel (p. ej. +15 % cada diciembre). Requiere datos positivos. |
| **ARIMA(p, d, q)** | Si sabes qué orden usar (por las gráficas ACF/PACF). *d* = número de diferencias para quitar la tendencia. |
| **ARIMA automático** | Elige *d* con pruebas de Dickey-Fuller y luego prueba todos los *p, q* ≤ 3, quedándose con el de menor AIC (como `auto.arima` de R). |
| **Línea de tendencia** | **Lineal**, **Exponencial**, **Logarítmica**, **Potencial**, **Polinómica grado 2** o **grado 3**, como las líneas de tendencia de Excel. Útil para series cortas. |

Los métodos estacionales necesitan al menos **dos ciclos completos** (24 datos mensuales con período 12).

### Cómo interpretar

**Pestaña Pronóstico.** La gráfica muestra la serie **Real**, los valores **Ajustados** por el modelo y el **Pronóstico** con una banda por nivel elegido (**Intervalo 80 %**, **Intervalo 95 %**, **Intervalo 97,5 %**…): cuanto más alto el nivel, más ancha la banda, y cuanto más lejos en el horizonte, también. Debajo:

| Métrica | Significado |
|---|---|
| **RMSE** | Raíz del error cuadrático medio, en unidades de la serie. Penaliza más los errores grandes. |
| **MAE** | Error absoluto medio, en unidades de la serie. |
| **MAPE** | Error porcentual absoluto medio. Menos de 10 % suele considerarse muy bueno; 10–20 % bueno. No sirve si la serie tiene ceros. |
| **R²** | Proporción de la variación de la serie explicada por los valores ajustados. |
| **U de Theil** | Compara el modelo con el pronóstico ingenuo «el próximo valor será igual al último». **U < 1** ⇒ el modelo es mejor que el ingenuo; **U ≥ 1** ⇒ no aporta, prueba otro método. |

Un recuadro redacta la interpretación de cada nivel para el primer período pronosticado, por ejemplo: *«Con 95 % de confianza, el valor del período 25 estará entre 1 180 y 1 420.»*, y recuerda que *«La incertidumbre crece con el horizonte»* dando el intervalo del nivel más alto para el último período.

También verás los **Parámetros estimados** (α, β, γ, coeficientes ARIMA…) y la tabla de **Valores pronosticados**, con las columnas **Período**, los límites inferiores (**Inf. 95 %**, **Inf. 80 %**, del más ancho al más estrecho), el **Pronóstico** y los límites superiores (**Sup. 80 %**, **Sup. 95 %**). **Exportar a hoja** crea una hoja con **Período**, **Real**, **Ajustado**, **Pronóstico** y un par de columnas **Límite inferior X %** / **Límite superior X %** por cada nivel.

::: info Intervalo de predicción, no de confianza de la media
Estos intervalos indican dónde caerá **cada valor futuro** de la serie, incluida su variabilidad propia: por eso son anchos y se ensanchan con el horizonte. No son la precisión del valor medio pronosticado. Ver [Tres intervalos que no hay que confundir](../guia/resultados#tres-intervalos-que-no-hay-que-confundir).
:::

**Pestaña ACF / PACF.** Autocorrelaciones simple y parcial por **Rezago**. Las barras que salen de las líneas punteadas (±1,96/√n) son significativas. Picos en los rezagos 12, 24… sugieren estacionalidad mensual; una ACF que decae lentamente sugiere tendencia (serie no estacionaria). Guía clásica para ARIMA: una PACF que se corta en el rezago *p* sugiere AR(*p*); una ACF que se corta en *q* sugiere MA(*q*).

**Pestaña Descomposición.** Separa la **Serie observada** en **Tendencia**, **Componente estacional** (patrón que se repite cada período) y **Residuo (irregular)**.

**Pestaña Diagnóstico.**
- **Prueba de Dickey-Fuller aumentada**: p < 0,05 ⇒ la serie es estacionaria; p ≥ 0,05 ⇒ tiene tendencia o raíz unitaria y ARIMA necesitará *d* ≥ 1.
- **Prueba de Ljung-Box de los residuos**: p ≥ 0,05 ⇒ los residuos son ruido blanco (el modelo capturó la estructura); p < 0,05 ⇒ queda autocorrelación y el modelo puede mejorarse.
- **Períodos estacionales candidatos** con su **Fuerza** (cercana a 1 ⇒ patrón estacional marcado).

::: tip Del pronóstico al supuesto
Para usar el pronóstico de ventas del año 1 en tu simulación: pon como supuesto una **Normal** con media = valor pronosticado y desviación ≈ (límite superior 95 % − límite inferior 95 %) / 3,92 (con el nivel 95 % seleccionado; para 90 % divide entre 3,29 y para 80 %, entre 2,56). Si la banda es asimétrica, una **Triangular** o **PERT** con los límites del 95 % como mínimo y máximo es una alternativa sencilla.
:::

## Regresión múltiple

**Para qué sirve.** Estima una ecuación lineal **Y = b₀ + b₁·X₁ + … + bₖ·Xₖ** por mínimos cuadrados: por ejemplo, demanda en función del precio, el ingreso y la publicidad. Equivale a la herramienta *Regresión* del complemento de análisis de datos de Excel.

**Cómo se usa.**
1. **Variable dependiente (Y)**: una sola columna.
2. **Variables independientes (X)**: uno o más rangos (**Agregar rango X**); cada rango puede tener varias columnas. Si pegas una tabla de Excel, las columnas van separadas por tabulación.
3. **Primera fila con encabezados**: **Detectar automáticamente**, sí o no. Los encabezados dan nombre a las variables.
4. **Incluir constante (b₀)** (marcado por defecto).
5. **Regresión por pasos (stepwise)**, opcional, con **p para entrar** (0,05) y **p para salir** (0,10).
6. **Nivel de confianza** de los intervalos de confianza de los coeficientes: un solo nivel, **95 %** por defecto (como Excel). Elige **80**, **90**, **95** o **99 %**, o escribe otro entre 50 y 99,9 % (por ejemplo `97,5`) y pulsa **Usar**. Si lo cambias después de estimar, la regresión se recalcula con los mismos datos.
7. Pulsa **Estimar**. Las filas con datos faltantes o no numéricos se omiten (se indica cuántas).

**Cómo interpretar.**

| Resultado | Lectura |
|---|---|
| **R²** / **R² ajustado** | Porcentaje de la variación de Y explicado por el modelo. El ajustado penaliza variables innecesarias: úsalo para comparar modelos con distinto número de X. |
| **Estadístico F** y su p-valor | p < 0,05 ⇒ el modelo en conjunto es significativo. |
| **Error estándar de la regresión** | Error típico de la predicción, en unidades de Y. |
| **Coeficientes** | Cada coeficiente es el cambio en Y por una unidad más de esa X, manteniendo las demás constantes. Se muestran su **Error estándar**, estadístico t, **p-valor** e **IC** al nivel elegido (columna **IC 95 %**, **IC 90 %**…; al exportar, **IC X % inferior** e **IC X % superior**). Un `*` marca p < 0,05 (la variable es significativa). |
| **VIF** | Factor de inflación de la varianza. **VIF > 10** (⚠) ⇒ multicolinealidad: esas X están muy correlacionadas entre sí y sus coeficientes son inestables. |
| **Durbin-Watson** | Cercano a 2 ⇒ sin autocorrelación de los residuos. Menor que 1,5 o mayor que 2,5 ⇒ posible autocorrelación (frecuente con series de tiempo): los p-valores pueden no ser confiables. |
| **Tabla ANOVA** | Sumas de cuadrados de **Regresión**, **Residuos** y **Total**, con grados de libertad y cuadrados medios. |
| **Gráficos de residuos** | **Residuos vs ajustados**, **Real vs ajustado**, **Residuos en orden** e **Histograma de residuos**. Los residuos deberían ser una nube sin patrón alrededor de 0. Forma de embudo ⇒ heterocedasticidad; curva ⇒ falta una relación no lineal. |

La herramienta también redacta la interpretación de cada coeficiente significativo, por ejemplo: *«Por cada unidad adicional de "Publicidad", "Ventas" aumenta en 3,2 unidades, manteniendo lo demás constante (significativo al 5 %). Con 95 % de confianza, el coeficiente de "Publicidad" está entre 2,1 y 4,3.»* El IC del coeficiente indica la precisión con que se estimó el efecto, no el rango de Y. La significación (`*`) se evalúa siempre al 5 %, independientemente del nivel elegido para los intervalos.

**Regresión por pasos.** Agrega en cada paso la variable más significativa (si su p-valor es menor que *p para entrar*) y quita las que dejan de serlo (p-valor mayor que *p para salir*). El resultado indica las **Variables seleccionadas**. Útil cuando tienes muchas X candidatas, pero no reemplaza el criterio económico: una variable sin sentido teórico no debería quedarse solo por su p-valor.

## Procesos estocásticos

**Para qué sirve.** Simula **trayectorias** futuras de una variable financiera (precio de un commodity, tipo de cambio, tasa de interés) y muestra un **abanico** de percentiles en cada momento.

**Cómo se usa.**
1. Elige el **Proceso**:
   - **Movimiento browniano geométrico**: el valor crece a una **Deriva (crecimiento anual)** con shocks proporcionales a la **Volatilidad anual**. Es el modelo clásico de precios de acciones; el valor nunca es negativo.
   - **Reversión a la media** (Ornstein-Uhlenbeck): la variable tiende a volver a una **Media de largo plazo** con cierta **Velocidad de reversión**; la volatilidad se expresa en unidades de la variable. Adecuada para tasas de interés, precios de commodities o costos.
   - **Difusión con saltos** (Merton): como el browniano geométrico, más **Saltos por año** ocasionales de **Tamaño medio del salto** y **Desv. del salto** dados (crisis, noticias).
2. Define el **Valor inicial**, **Δt (años por paso)** (1/12 = mensual, 1/252 = diario hábil), **Pasos** (36 por defecto) y **Trayectorias** (1 000 por defecto, hasta 20 000), y la semilla.
3. Elige los **Niveles de confianza** de las bandas del abanico: hasta 3, por defecto **50 %**, **80 %** y **90 %** (mismo selector que en Series de tiempo; acepta niveles como `97,5`).
4. Pulsa **Simular**.

**Estimar parámetros desde datos históricos.** Pega o selecciona una **Serie histórica de precios**, indica el **Δt de los datos (años)** y pulsa **Estimar**: la herramienta calcula la deriva y la volatilidad (browniano geométrico) o la media de largo plazo, la velocidad y la volatilidad (reversión a la media), y toma como valor inicial el último dato.

**Cómo interpretar.** El gráfico muestra la **Mediana** y una banda por nivel, con sus percentiles: con los niveles por defecto, **90 % central (P5–P95)**, **80 % central (P10–P90)** y **50 % central (P25–P75)**; un nivel de 95 % se rotula **95 % central (P2,5–P97,5)**. Además se dibujan algunas **Trayectorias de ejemplo**. Las bandas son percentiles de las trayectorias simuladas en cada momento (una banda de certeza, como la del histograma de un pronóstico), y cambiar los niveles las recalcula sin volver a simular. La conclusión se resume con el nivel más alto: *«Al final del horizonte (3 años) la mediana es X y hay un 90 % de probabilidad de que el valor quede entre A y B»*, y la tabla del final del horizonte incluye el intervalo de cada banda. El histograma **Distribución al final del horizonte** puede servirte para definir un supuesto: por ejemplo, una PERT con el P5, la mediana y el P95 del último período como mínimo, más probable y máximo. **Exportar a hoja** copia, para cada momento, los percentiles (P5, P10, P25, P50, P75, P90, P95) y los límites **Inferior X %** / **Superior X %** de cada banda.
