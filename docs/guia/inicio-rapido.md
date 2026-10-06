# Inicio rápido (5 minutos)

En este recorrido abrirás el ejemplo **«Evaluación de proyecto»**, verás cómo está armado el modelo de riesgo, ejecutarás la simulación y leerás la probabilidad de que el VAN sea positivo.

## 1. Abre el ejemplo

1. Abre <a href="https://fernandevdaza.github.io/openrisksim/" target="_self">la aplicación</a>.
2. En la cinta, pestaña **Archivo**, pulsa **Ejemplos**.
3. Elige **Evaluación de proyecto**. Si ya tenías un libro abierto, la app te pedirá confirmar que se reemplazará (y que el autoguardado se sobrescribirá).

Aparece la hoja `Proyecto`: arriba las **entradas** (filas 4–15), en el centro el **flujo de caja** a 5 años (filas 17–31) y abajo los **indicadores** (VAN, TIR, periodo de recuperación…, filas 34–38).

![Ejemplo «Evaluación de proyecto» abierto, con el explorador del modelo y el panel de resultados](/screenshots/es/overview.png)

## 2. Recorre los supuestos (celdas verdes)

Las celdas pintadas de <span class="swatch green"></span>**verde** son **supuestos**: variables inciertas con una distribución de probabilidad. El panel **Explorador del modelo** (a la izquierda) las lista todas:

| Supuesto | Celda | Distribución |
|---|---|---|
| Unidades vendidas año 1 | `B4` | Normal (media 10 000, desv. 1 500), truncada en mínimo 0 |
| Precio unitario | `B6` | Normal (media 26, desv. 2), truncada en mínimo 0 |
| Costo variable unitario | `B7` | PERT (mín. 10,5; más probable 12; máx. 15) |
| Inversión inicial | `B9` | Triangular (mín. 220 000; más probable 250 000; máx. 310 000) |
| Tasa de descuento | `B14` | Uniforme (0,10 a 0,14) |

Además hay una **correlación de −0,5** entre precio y unidades: cuando el precio sube, las ventas tienden a bajar.

Selecciona la celda `B6` y pulsa **Simulación → Definir supuesto** (o haz clic derecho sobre la celda, o <kbd>Alt</kbd>+<kbd>A</kbd>) para ver la definición: la galería de distribuciones, los parámetros, el truncamiento y la gráfica de la distribución. Pulsa **Cancelar** para salir sin cambios.

![Diálogo «Definir supuesto» con la galería de distribuciones](/screenshots/es/assumption.png)

## 3. Mira los pronósticos (celdas azules)

Las celdas <span class="swatch blue"></span>**azules** son **pronósticos**: los resultados que se registran en cada prueba. En este ejemplo son el **VAN** (`B34`) y la **TIR** (`B35`). Ambas son fórmulas que dependen, directa o indirectamente, de las celdas verdes.

## 4. Ejecuta la simulación

Pulsa **Simulación → Ejecutar** (o <kbd>Alt</kbd>+<kbd>R</kbd>). El ejemplo está configurado con **5 000 pruebas**, muestreo **Hipercubo latino** y **semilla fija 12345**, así que en menos de un segundo verás el panel **Resultados** a la derecha.

::: tip Mismos números que tu compañero
Como la semilla es fija, cualquiera que ejecute el ejemplo con la misma configuración obtiene exactamente los mismos resultados. Es útil para trabajos en grupo y exámenes.
:::

## 5. Lee el histograma y la certeza

![Ventana de resultados del VAN con el histograma y la certeza](/screenshots/es/forecast.png)

En la pestaña **VAN** del panel de resultados verás:

- El **histograma** de los 5 000 VAN simulados. Las barras centrales (azules) son las que quedan dentro del intervalo de certeza; las grises, fuera.
- Debajo, los controles de **certeza**: por defecto **Dos colas** con **Certeza %** = 90, es decir, el intervalo que deja un 5 % de las pruebas a cada lado. La frase de abajo lo resume: *«Certeza del 90,00 % de que el valor esté entre $ −73 851,28 y $ 157 669,64»*.
- Las tarjetas con **Media** (≈ $37 334), **Mediana**, **Desviación estándar**, **Mínimo**, **Máximo** y **Probabilidad ≥ 0** (≈ 70 %).

Ahora responde la pregunta clave — *¿cuál es la probabilidad de que el proyecto sea rentable?*:

1. En **Tipo**, elige **Cola derecha ≥**.
2. En **Límite inferior**, escribe `0`.
3. La **Certeza %** se recalcula: ≈ **70 %**. Hay un 70 % de probabilidad de que el VAN sea mayor o igual a cero y, por lo tanto, un **30 % de probabilidad de pérdida**.

También puedes arrastrar con el mouse las líneas rojas verticales sobre el histograma para mover los límites.

## 6. ¿Y ahora qué?

- Pulsa **Herramientas analíticas → Tornado** para ver qué variables mueven más el VAN.
- Prueba cambiar el número de pruebas en **Simulación → Configuración** y vuelve a ejecutar.
- Exporta el informe con **Archivo → Exportar informe**.
- Haz el [tutorial completo](../tutorial/evaluacion-de-proyecto), donde se construye y analiza este modelo como en un trabajo de la materia.
- Aprende a [definir tus propios supuestos](./supuestos) sobre tu archivo.
