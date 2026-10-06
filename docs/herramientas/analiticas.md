# Herramientas analíticas

La pestaña **Herramientas analíticas** reúne nueve herramientas para entender **qué causa el riesgo**, **describir datos** y **elegir distribuciones**. Cada una se abre en su propia ventana, tiene un recuadro **¿Qué hace?** con una explicación breve y, en la mayoría, un botón **Exportar a hoja** que copia la tabla de resultados a una hoja nueva del libro.

| Herramienta | ¿Necesita haber simulado? | Pregunta que responde |
|---|---|---|
| [Tornado](#tornado) | No | ¿Qué variables mueven más el resultado, una a la vez? |
| [Gráfico araña](#grafico-arana) | No | ¿Cómo responde el resultado a cada variable en todo su rango? |
| [Sensibilidad](#sensibilidad) | **Sí** | ¿Qué supuestos explican la varianza del pronóstico en la simulación? |
| [Tabla de escenarios](#tabla-de-escenarios) | No | ¿Cuánto vale el resultado para combinaciones de dos variables? |
| [Ajuste de distribuciones](#ajuste-de-distribuciones) | No | ¿Qué distribución describe mejor mis datos? |
| [Bootstrap](#bootstrap) | Opcional | ¿Qué tan preciso es un estadístico? |
| [Prueba de hipótesis](#prueba-de-hipotesis) | Opcional | ¿Son distintas las medias de dos muestras? |
| [Estadística descriptiva](#estadistica-descriptiva) | Opcional | ¿Cómo son mis datos? |
| [Gráfico superpuesto](#grafico-superpuesto) | **Sí** | ¿Cómo se comparan varios pronósticos? |

## Fuentes de datos

Las herramientas que trabajan con datos (ajuste, bootstrap, prueba de hipótesis, estadística descriptiva) ofrecen hasta tres fuentes:

- **Rango de la hoja**: escribe un rango como `Hoja1!B2:B40`, pulsa **Usar selección** para tomar el rango seleccionado o el botón de selección para elegirlo en la hoja (el diálogo se oculta mientras seleccionas).
- **Pegar datos**: pega números separados por saltos de línea, tabulaciones o `;`. Acepta coma decimal (`12,5`).
- **Pronóstico simulado**: usa los valores de un pronóstico de la última simulación.

---

## Tornado

**Para qué sirve.** Es el análisis de sensibilidad clásico «una variable a la vez». Mueve cada supuesto desde un **percentil bajo** hasta un **percentil alto** de su distribución (por defecto P10 y P90) dejando los demás en su **valor base** (el valor actual de la celda), y mide cuánto cambia el pronóstico.

**Cómo se usa.**
1. Elige el **Pronóstico**.
2. Ajusta **Percentil bajo (%)** y **Percentil alto (%)** si quieres (por ejemplo 5 y 95 para rangos más amplios).
3. Pulsa **Calcular**.

![Tornado del VAN en el ejemplo de evaluación de proyecto](/screenshots/es/tornado.png)

**Cómo interpretarlo.**
- Las barras se ordenan de mayor a menor **amplitud** (diferencia entre el resultado con la entrada baja y con la alta). Las de arriba son las **variables críticas**: conviene estimarlas con más cuidado.
- Colores: naranja = supuesto en el percentil bajo, azul = supuesto en el percentil alto. Si el azul queda a la derecha, la relación es directa (sube la variable, sube el resultado); si queda a la izquierda, es inversa.
- La tabla muestra **Entrada baja**, **Entrada base**, **Entrada alta**, **Resultado con entrada baja / alta**, **Amplitud** y **% de la variación** (amplitud al cuadrado sobre la suma de amplitudes al cuadrado).
- Una barra que cruza la línea del cero del VAN indica que esa variable, por sí sola, puede volver el proyecto no rentable.

::: tip
El tornado no requiere simular y es rápido. Úsalo al principio para decidir qué variables modelar como supuestos y al final para explicar el riesgo en tu informe.
:::

::: warning Limitación
Al mover una variable a la vez, el tornado **ignora las correlaciones y las interacciones** entre variables. Para la contribución al riesgo «con todo variando a la vez» usa [Sensibilidad](#sensibilidad).
:::

## Gráfico araña

**Para qué sirve.** Complementa al tornado: en lugar de dos puntos, recorre varios percentiles de cada supuesto (por defecto 9 **Puntos de la araña**) y dibuja una línea por variable.

**Cómo se usa.** Elige el pronóstico y el número de puntos, y pulsa **Calcular**. También está disponible como pestaña **Araña** dentro de la ventana del tornado.

**Cómo interpretarlo.** El eje horizontal es el **percentil del supuesto**; el vertical, el pronóstico. Cuanto **más inclinada** la línea, más sensible el resultado a esa variable; una línea horizontal indica que casi no influye. Las curvaturas revelan efectos no lineales (por ejemplo, impuestos que solo se pagan con utilidad). El gráfico muestra las variables más influyentes; la tabla las incluye todas.

## Sensibilidad

**Para qué sirve.** Usa los resultados de la **última simulación** para medir la relación entre cada supuesto y el pronóstico **con todas las variables moviéndose a la vez** (incluidas las correlaciones).

**Cómo se usa.** Ejecuta la simulación, abre **Sensibilidad** y elige el pronóstico.

**Cómo interpretarlo.**
- **Correlación de rangos** (Spearman, de −1 a 1): dirección y fuerza de la relación. Positiva: si sube el supuesto, sube el pronóstico; negativa: si sube, baja.
- **Contribución a la varianza**: qué porcentaje de la incertidumbre del pronóstico se explica por cada supuesto (correlación al cuadrado normalizada para que sumen 100 %). Es la medida que publica Risk Simulator en su gráfico de sensibilidad.
- Correlaciones cercanas a 0 (|ρ| < 0,1) indican poca influencia: puedes fijar esas variables en su valor base para simplificar el modelo.

## Tabla de escenarios

**Para qué sirve.** Calcula el pronóstico para **todas las combinaciones** de dos supuestos, como una «tabla de datos» de Excel de dos variables. Los demás supuestos se mantienen en su valor base.

**Cómo se usa.**
1. Elige el **Pronóstico**.
2. Elige el **Supuesto en filas** y el **Supuesto en columnas** (deben ser distintos), con su rango **Desde**/**Hasta** (se propone de P10 a P90 de cada distribución) y el número de **Pasos**.
3. Pulsa **Calcular**.

**Cómo interpretarlo.** Las celdas **rojas** son combinaciones con resultado negativo (p. ej. VAN < 0 ⇒ el proyecto no conviene); las **azules**, positivo. Sirve para mostrar la «frontera» de rentabilidad: por ejemplo, qué precio mínimo necesitas para cada nivel de ventas.

## Ajuste de distribuciones

**Para qué sirve.** Encuentra la distribución de probabilidad que mejor describe un conjunto de datos históricos, para usarla como supuesto. Equivale al *Distribution Fitting* de Risk Simulator.

![Ajuste de distribuciones](/screenshots/es/fitting.png)

**Cómo se usa.**
1. Elige los **Datos** (rango, pegar o pronóstico simulado). Cuantos más datos, mejor: con menos de 30 los resultados son orientativos.
2. **Ordenar por**: **AIC** (por defecto), **BIC**, **Kolmogorov–Smirnov** o **Anderson–Darling**.
3. **Tipo de datos**: **Automático** (si todos son enteros, prueba distribuciones discretas), **Continuos** o **Discretos (enteros)**.
4. Pulsa **Ajustar**. Se prueban 24 distribuciones continuas (Normal, Lognormal, Gamma, Weibull, Beta, Triangular, PERT…) o 6 discretas (Poisson, Binomial, Binomial negativa, Geométrica, Bernoulli, Uniforme discreta) estimando sus parámetros por **máxima verosimilitud**. Las que no se pueden ajustar a esos datos (por ejemplo, una Lognormal con datos negativos) se omiten.
5. La tabla **Distribuciones ajustadas** muestra para cada candidata sus parámetros estimados, los estadísticos **KS**, **AD** y **χ²** con sus p-valores, y **AIC** y **BIC**. Debajo, un recuadro resume si la prueba KS rechaza o no la distribución seleccionada.
6. Selecciona una fila para ver el **Histograma** con la curva ajustada y los gráficos **P–P** y **Q–Q**.
7. En **Usar en el modelo**, selecciona una celda en la hoja y pulsa **Crear supuesto con esta distribución**. Si la celda ya tenía un supuesto, se reemplaza su distribución.

**Cómo interpretar los criterios.**

| Criterio | Regla | Comentario |
|---|---|---|
| **AIC** / **BIC** | **Menor es mejor** | Premian el buen ajuste (verosimilitud) y penalizan el número de parámetros. BIC penaliza más, así que prefiere modelos más simples. Solo sirven para **comparar** distribuciones sobre los mismos datos. |
| **p (KS)** | **Mayor es mejor**; p ≥ 0,05 ⇒ no se rechaza el ajuste | Prueba de Kolmogorov–Smirnov: mide la máxima distancia entre la distribución acumulada empírica y la teórica. Sensible al centro de la distribución. |
| **p (AD)** | **Mayor es mejor** | Anderson–Darling: como KS pero da más peso a las **colas**. Solo para distribuciones continuas. |
| **p (χ²)** | **Mayor es mejor** | Chi-cuadrado de bondad de ajuste con clases equiprobables (o una clase por entero en datos discretos). |

**Gráficos P–P y Q–Q.** Si los puntos siguen la diagonal, la distribución describe bien los datos. El P–P es más sensible al **centro**; el Q–Q, a las **colas** (valores extremos).

::: warning Los p-valores son aproximados
Como los parámetros se estiman con los mismos datos que se prueban, los p-valores de KS y AD son **conservadores** (tienden a ser más altos de lo que deberían), salvo AD para Normal y Lognormal, que usa la corrección de D'Agostino–Stephens. Úsalos para **ordenar** candidatas y descartar las claramente malas, no como prueba formal. Y elige siempre una distribución que tenga **sentido** para la variable (por ejemplo, no uses una Normal para algo que no puede ser negativo si hay riesgo de valores bajos).
:::

::: tip ¿Ninguna ajusta bien?
Si todas las p son menores que 0,05, considera usar los datos directamente con la distribución **Personalizada** (empírica). Ver [Supuestos → Distribución personalizada](../guia/supuestos#distribucion-personalizada-tus-propios-datos).
:::

## Bootstrap

**Para qué sirve.** Estima qué tan **preciso** es un estadístico (media, mediana, desviación, percentil…) sin suponer ninguna distribución. Remuestrea los datos con reemplazo muchas veces y calcula el estadístico en cada remuestra.

**Cómo se usa.** Elige los **Datos** (por defecto, un pronóstico simulado), el **Estadístico** (Media, Mediana, Desviación estándar, Coeficiente de variación, Percentil 5/10/90/95, Asimetría o Curtosis), el número de **Remuestras** (2 000 por defecto), la **Confianza** y la **Semilla aleatoria**, y pulsa **Calcular**.

**Cómo interpretarlo.** Se muestran la **Estimación**, el **Intervalo de confianza** (método de percentiles), el **Error estándar (bootstrap)** y el histograma de la distribución bootstrap. Ejemplo: «Con 95 % de confianza, el verdadero percentil 5 del VAN está entre X e Y». Si el intervalo es muy ancho, el estadístico es poco preciso: aumenta las pruebas de la simulación.

## Prueba de hipótesis

**Para qué sirve.** Compara las **medias** de dos muestras: dos pronósticos simulados (el VAN de la alternativa A y el de la B) o dos rangos de datos. Usa la **prueba t de Welch**, que no supone varianzas iguales.

**Cómo se usa.** Elige la **Muestra A** y la **Muestra B**, la **Significancia α** (0,05 por defecto) y la **Hipótesis alternativa** (**Media A ≠ media B**, **Media A > media B** o **Media A < media B**), y pulsa **Probar**.

**Cómo interpretarlo.** H₀: las medias son iguales. Si el **p-valor** es menor que α, se rechaza H₀ y la diferencia es estadísticamente significativa. Se muestran el **Estadístico t**, los **Grados de libertad**, el **IC de la diferencia (A − B)**, un resumen de cada muestra y sus distribuciones acumuladas.

::: warning Significativo no es lo mismo que importante
Con miles de pruebas simuladas, incluso diferencias minúsculas resultan «significativas». Mira también el **tamaño** de la diferencia y su intervalo de confianza.
:::

## Estadística descriptiva

**Para qué sirve.** Resume un conjunto de datos: número de datos, media, mediana, moda (aprox.), desviación estándar, varianza, coeficiente de variación, mínimo, máximo, rango, asimetría, curtosis (exceso), error estándar e intervalo de confianza del 95 % de la media, y una tabla de percentiles. Dibuja el **Histograma** y la **Distribución acumulada**.

**Cómo interpretarlo.** La herramienta redacta una interpretación automática: dónde se centran los datos, si hay asimetría (la media supera a la mediana ⇒ cola hacia valores altos) y si las colas son más pesadas que las de una Normal. Es un buen primer paso antes del [ajuste de distribuciones](#ajuste-de-distribuciones).

## Gráfico superpuesto

**Para qué sirve.** Superpone las distribuciones simuladas de varios pronósticos (hasta 8) para compararlas, por ejemplo el VAN de dos alternativas de inversión.

**Cómo se usa.** Marca los **Pronósticos**, elige **Frecuencias (PDF)** o **Acumulada (CDF)** y el **Número de clases** del histograma (40 por defecto). Debajo aparece un **Resumen** con los estadísticos de cada uno.

**Cómo interpretarlo.** Una curva desplazada a la **derecha** tiene valores mayores; una más **ancha**, más riesgo. En la vista acumulada, si la curva de A está siempre por debajo y a la derecha de la de B, A es mejor en todos los niveles de probabilidad (*dominancia estocástica*).
