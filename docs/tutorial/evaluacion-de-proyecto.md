# Tutorial: análisis de riesgo de un proyecto de inversión

Este tutorial recorre, de principio a fin, un análisis de riesgo como el que se pide en un trabajo práctico de **Preparación y Evaluación de Proyectos**: desde el flujo de caja determinista hasta la recomendación final. Usaremos el modelo del ejemplo **«Evaluación de proyecto»** que trae la aplicación, para que puedas reproducir exactamente las mismas cifras.

**Tiempo estimado:** 45 minutos. **Requisitos:** haber leído el [inicio rápido](../guia/inicio-rapido).

## 1. El caso

Una empresa evalúa lanzar un producto con un horizonte de 5 años:

| Variable | Valor base | Celda |
|---|---|---|
| Unidades vendidas el año 1 | 10 000 | `B4` |
| Crecimiento anual de unidades | 5 % | `B5` |
| Precio unitario (año 1) | $26,00 | `B6` |
| Costo variable unitario (año 1) | $12,00 | `B7` |
| Costos fijos anuales | $60 000 | `B8` |
| Inversión inicial (activo fijo) | $250 000 | `B9` |
| Vida útil (depreciación lineal) | 5 años | `B10` |
| Valor de rescate | $25 000 | `B11` |
| Tasa de impuesto | 25 % | `B12` |
| Capital de trabajo | 10 % de las ventas del año siguiente | `B13` |
| Tasa de descuento (TMAR) | 12 % | `B14` |
| Inflación de precios y costos | 3 % | `B15` |

## 2. Armar el flujo de caja

Tienes tres caminos. Elige uno:

**A. Usar el ejemplo (recomendado para este tutorial).** `Archivo → Ejemplos → Evaluación de proyecto`. Ya trae el flujo de caja (filas 17–31) y los indicadores (filas 33–38). Para empezar desde cero con el modelo de riesgo, pulsa **Simulación → Nuevo perfil**: borra los supuestos y pronósticos, pero deja la hoja intacta.

**B. Usar el Evaluador de proyectos.** `Finanzas → Evaluador de proyectos`: completa los datos generales, los datos por año y (si corresponde) el financiamiento, y pulsa **Exportar con fórmulas**. Se crea una hoja `Proyecto` con el flujo de caja **con fórmulas vivas**, y un mensaje te indica en qué celda está el VAN y dónde están el precio y las unidades para definir los supuestos. Ver [Finanzas → Evaluador de proyectos](../herramientas/finanzas#evaluador-de-proyectos).

**C. Abrir tu propio Excel.** `Archivo → Abrir` con el `.xlsx` de tu proyecto. Asegúrate de que el VAN sea una **fórmula** que dependa de las celdas de entrada (no un valor pegado).

::: warning Revisa que el modelo esté «vivo»
Antes de simular, cambia a mano una entrada (por ejemplo, el precio de 26 a 20) y comprueba que el VAN cambia. Si no cambia, hay valores pegados en lugar de fórmulas o referencias rotas. Luego deshaz el cambio (<kbd>Ctrl</kbd>+<kbd>Z</kbd>).
:::

## 3. Resultado determinista

Con los valores base, el ejemplo da:

| Indicador | Celda | Valor | Decisión |
|---|---|---|---|
| VAN (12 %) | `B34` | **$58 250** | VAN > 0 ⇒ se acepta |
| TIR | `B35` | **19,1 %** | TIR > 12 % ⇒ se acepta |
| Periodo de recuperación | `B36` | 3,51 años | Menor que el horizonte |
| Índice de rentabilidad | `B37` | 1,21 | > 1 |
| VAE | `B38` | $16 159 por año | > 0 |

El flujo de caja libre es: año 0 −$276 000 (inversión + capital de trabajo), años 1–5: $69 131, $76 166, $83 843, $92 218 y $164 818 (este último incluye el rescate y la recuperación del capital de trabajo).

La conclusión determinista sería «el proyecto conviene». La pregunta del análisis de riesgo es: **¿con qué probabilidad?**

## 4. Identificar las variables críticas (tornado)

No todas las variables merecen ser supuestos. Para saber cuáles importan, haz un análisis de sensibilidad **antes** de simular. El tornado de OpenRiskSim necesita supuestos ya definidos, así que en la práctica se procede así: define provisionalmente supuestos amplios en todas las entradas candidatas, corre el tornado y luego refina las que resulten críticas.

Con los supuestos del paso 5 ya definidos, abre **Herramientas analíticas → Tornado**, elige el pronóstico **VAN**, deja los percentiles en **10** y **90** y pulsa **Calcular**:

![Tornado del VAN](/screenshots/es/tornado.png)

| Supuesto | VAN con P10 | VAN con P90 | Amplitud | % de la variación |
|---|---|---|---|---|
| Unidades vendidas año 1 | −$23 374 | $139 874 | $163 247 | 45,2 % |
| Precio unitario | −$20 586 | $137 086 | $157 671 | 42,2 % |
| Costo variable unitario | $83 612 | $14 487 | $69 125 | 8,1 % |
| Inversión inicial | $69 373 | $28 114 | $41 259 | 2,9 % |
| Tasa de descuento | $73 998 | $43 560 | $30 438 | 1,6 % |

**Lectura:** unidades y precio son, de lejos, las variables críticas: cada una, moviéndose sola entre su P10 y su P90, hace que el VAN cambie de signo. El costo variable tiene un efecto intermedio; la inversión y la tasa, menor. En las barras con los colores invertidos (costo, inversión y tasa: el azul, «supuesto en 90 %», queda a la izquierda) la relación es **inversa**: si la variable sube, el VAN baja.

::: tip
Variables como los costos fijos, la tasa de impuesto o el valor de rescate no se modelaron como inciertas en este ejemplo. Si en tu proyecto tienen incertidumbre relevante, inclúyelas y verifica su peso en el tornado.
:::

## 5. Definir los supuestos (con justificación)

Para cada variable crítica, define un supuesto (**Simulación → Definir supuesto**) y **escribe en el informe por qué** elegiste esa distribución y esos parámetros. Así está en el ejemplo:

| Supuesto | Celda | Distribución | Justificación (ejemplo de redacción) |
|---|---|---|---|
| Unidades vendidas año 1 | `B4` | Normal (μ = 10 000; σ = 1 500), truncada en mínimo 0 | El estudio de mercado estima una demanda de 10 000 unidades con un error estándar de ±15 %. La normal refleja errores simétricos; se trunca en 0 porque no hay ventas negativas. |
| Precio unitario | `B6` | Normal (μ = 26; σ = 2), truncada en mínimo 0 | Precio promedio de la competencia: $26, con dispersión observada de ±$2. |
| Costo variable unitario | `B7` | PERT (10,5 – 12 – 15) | Cotizaciones de proveedores: el más probable es $12; el mínimo negociable $10,50 y el máximo, ante alzas de insumos, $15 (asimetría hacia arriba). |
| Inversión inicial | `B9` | Triangular (220 000 – 250 000 – 310 000) | Presupuesto de obra: $250 000 más probable, con posibles sobrecostos de hasta 24 % y ahorros de hasta 12 %. |
| Tasa de descuento | `B14` | Uniforme (10 % – 14 %) | La TMAR del inversionista está entre 10 % y 14 % según el WACC calculado con distintos supuestos de riesgo país. |

Cómo hacerlo con la primera:

1. Selecciona `B4` y pulsa <kbd>Alt</kbd>+<kbd>A</kbd>.
2. El nombre se propone solo («Unidades vendidas año 1 / Units sold year 1»); acórtalo si quieres.
3. En la galería elige **Normal**, escribe **Media** `10000` y **Desviación estándar** `1500`.
4. Abre **Truncar la distribución**, marca **Mínimo** y escribe `0`.
5. Verifica en la vista previa que los valores P5–P95 sean razonables (≈ 7 500 a 12 500) y pulsa **Aceptar**.

Repite con las demás. Luego selecciona `B34` y define el pronóstico **VAN** (formato **Moneda**), y `B35` el pronóstico **TIR** (formato **Porcentaje**).

::: warning ¿Supuesto en el año 1 o en cada año?
En este modelo el supuesto está en las **unidades del año 1** y los demás años se proyectan con la tasa de crecimiento. Eso significa que, si el primer año la demanda es baja, **todos** los años lo serán (un error de estimación persistente). Es el enfoque más común y conservador. Si en cambio crees que cada año varía de forma independiente, define un supuesto por año (más trabajo, y suele dar menos riesgo porque las variaciones se compensan).
:::

## 6. Correlación precio–cantidad

Un precio más alto suele reducir la cantidad vendida. Para reflejarlo:

1. **Simulación → Correlaciones**.
2. En la fila **Precio unitario**, columna **Unidades vendidas año 1** (o viceversa), escribe `-0,5`.
3. Comprueba el mensaje *«Matriz válida (definida positiva)»* y pulsa **Aceptar**.

Justificación sugerida: «Se asume una correlación de rangos de −0,5 entre precio y unidades, consistente con una demanda moderadamente elástica».

## 7. Configurar y ejecutar

**Simulación → Configuración**:

- **Pruebas**: `10000`
- **Semilla**: **Semilla fija**, `12345`
- **Método de muestreo**: **Hipercubo latino (LHS)**
- **Aplicar correlaciones**: marcado

Pulsa **Aceptar** y luego **Ejecutar** (<kbd>Alt</kbd>+<kbd>R</kbd>). Tarda alrededor de un segundo.

## 8. Interpretar los resultados

Resultados del VAN con 10 000 pruebas (si usaste la misma configuración, verás exactamente estos números):

| Estadístico | VAN | TIR |
|---|---|---|
| Media | $37 387 | 16,2 % |
| Mediana | $35 358 | 16,2 % |
| Desviación estándar | $70 370 | 8,2 % |
| Coeficiente de variación | 1,88 | 0,51 |
| Asimetría | 0,14 | −0,10 |
| Percentil 5 | −$74 287 | 2,6 % |
| Percentil 10 | −$49 805 | 5,9 % |
| Percentil 90 | $128 981 | 26,5 % |
| Percentil 95 | $157 001 | 29,7 % |
| IC 95 % de la media | [$36 008 ; $38 766] | [16,0 % ; 16,3 %] |
| **P(VAN ≥ 0)** / **P(TIR ≥ 12 %)** | **69,7 %** | **69,8 %** |

Cómo obtener las probabilidades en la ventana:

- **P(VAN < 0)**: en la pestaña **VAN**, **Tipo** = **Cola izquierda ≤**, **Límite superior** = `0` → ≈ **30,3 %**.
- **P(TIR ≥ 12 %)**: en la pestaña **TIR**, **Cola derecha ≥**, **Límite inferior** = `0,12` → ≈ **69,8 %**.
- **Intervalo de 90 %**: **Dos colas**, **Certeza %** = `90` → entre −$74 287 y $157 001.

### Lo que dicen estos números

1. **El VAN esperado ($37 387) es menor que el VAN determinista ($58 250).** No es un error: varias distribuciones son asimétricas (el costo variable PERT tiene media 12,25 > 12; la inversión Triangular tiene media 260 000 > 250 000), los impuestos solo se pagan cuando hay utilidad (efecto no lineal) y la correlación negativa reduce el ingreso esperado (precio alto con menos unidades). El escenario «todo en su valor más probable» resultaba optimista.
2. **El riesgo es alto**: hay casi **una probabilidad en tres de destruir valor** (30,3 %), y el CV de 1,88 indica que la dispersión casi duplica el valor esperado.
3. **La pérdida posible es acotada pero relevante**: en el 5 % de los peores escenarios el VAN es menor que −$74 287 (cerca del 27 % de la inversión inicial).
4. **La TIR y el VAN cuentan la misma historia**: P(TIR ≥ 12 %) ≈ P(VAN ≥ 0), como se espera cuando la tasa de descuento está alrededor del 12 %.

## 9. Sensibilidad de la simulación

**Herramientas analíticas → Sensibilidad**, pronóstico **VAN**. A diferencia del tornado (que mueve una variable a la vez), esta herramienta usa las 10 000 pruebas, donde todo varía a la vez:

| Supuesto | Correlación de rangos | Contribución a la varianza |
|---|---|---|
| Unidades vendidas año 1 | +0,43 | 33,6 % |
| Precio unitario | +0,40 | 29,7 % |
| Costo variable unitario | −0,36 | 24,5 % |
| Inversión inicial | −0,20 | 7,4 % |
| Tasa de descuento | −0,16 | 4,8 % |

El costo variable gana peso respecto al tornado porque su distribución PERT es asimétrica hacia costos altos y porque en la simulación interactúa con el volumen. Las tres primeras variables explican cerca del **88 %** de la incertidumbre del VAN.

## 10. ¿Y si no hubiera correlación?

Como prueba de robustez, en **Configuración** desmarca **Aplicar correlaciones** y ejecuta de nuevo:

| | Con correlación −0,5 | Sin correlación |
|---|---|---|
| Media del VAN | $37 387 | $41 662 |
| Desviación estándar | $70 370 | $97 232 |
| P(VAN < 0) | 30,3 % | 34,2 % |
| Intervalo de 90 % | −$74 287 a $157 001 | −$110 828 a $210 373 |

Ignorar la relación precio–demanda **exagera la dispersión** (los escenarios de precio alto *y* mucha demanda, o precio bajo *y* poca demanda, se vuelven más frecuentes). La conclusión cualitativa no cambia, pero las cifras de riesgo sí: justificar el coeficiente es importante. Vuelve a marcar **Aplicar correlaciones** antes de continuar.

## 11. Conclusión y recomendación

Un ejemplo de redacción para el informe:

> **Conclusión.** En el escenario base el proyecto es rentable (VAN = $58 250; TIR = 19,1 %). Sin embargo, la simulación de Monte Carlo (10 000 pruebas, LHS, semilla 12345) muestra un VAN esperado de $37 387 con una desviación estándar de $70 370, y una **probabilidad del 30,3 % de obtener un VAN negativo**. Con 90 % de certeza el VAN estará entre −$74 287 y $157 001. El riesgo proviene principalmente del volumen de ventas, el precio y el costo variable, que explican el 88 % de la varianza del VAN.
>
> **Recomendación.** El proyecto presenta un valor esperado positivo pero un riesgo elevado para un inversionista conservador. Se recomienda: (1) profundizar el estudio de mercado para reducir la incertidumbre sobre volumen y precio; (2) negociar contratos de suministro a precio fijo para acotar el costo variable; (3) evaluar una entrada por etapas o una inversión inicial menor. Si el inversionista tolera una probabilidad de pérdida cercana al 30 %, el proyecto puede aceptarse; en caso contrario, conviene postergar la decisión hasta contar con mejor información.

Puedes complementar con:

- **Finanzas → Punto de equilibrio**, pestaña **VAN = 0 (modelo)**: ¿hasta qué precio o qué volumen puede caer la variable antes de que el VAN sea cero? Ver [Punto de equilibrio](../herramientas/finanzas#punto-de-equilibrio).
- **Herramientas analíticas → Tabla de escenarios**: VAN para combinaciones de precio y unidades.

## 12. Entregar el trabajo

1. **Archivo → Guardar .xlsx**: tu libro con el modelo (lo puede reabrir tu docente en OpenRiskSim).
2. Antes de exportar el informe, deja en la ventana del VAN la certeza que quieras mostrar (por ejemplo **Cola derecha ≥ 0**).
3. **Archivo → Exportar informe → Imprimir / Guardar como PDF** para anexar al informe, o **Libro .xlsx con hojas de informe**.
4. Usa el botón **PNG** de cada gráfica para insertar el histograma y el tornado en tu documento.
5. En la metodología indica: software (OpenRiskSim), número de pruebas, método de muestreo, semilla, distribuciones y correlaciones. Ver [¿Puedo citarlo en mi informe?](../referencia/preguntas-frecuentes#puedo-citar-openrisksim-en-mi-informe).
