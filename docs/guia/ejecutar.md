# Ejecutar la simulación

Una vez definidos al menos **un supuesto activo** y **un pronóstico**, ya puedes simular.

## Configuración

**Simulación → Configuración** abre el diálogo *Configuración de simulación*:

| Opción | Valor por defecto | Qué hace |
|---|---|---|
| **Pruebas** | 5 000 | Número de escenarios a simular (entre 10 y 5 000 000). Botones rápidos: 1 000, 5 000, 10 000, 100 000 y 1 M. |
| **Semilla** → **Semilla fija** / **Aleatoria** | Fija, 12345 | Con semilla fija, cada ejecución da exactamente los mismos resultados. Con aleatoria, cada ejecución es distinta (la semilla usada se muestra en la barra de estado). |
| **Método de muestreo** → **Monte Carlo** / **Hipercubo latino (LHS)** | Hipercubo latino | Cómo se generan los números aleatorios (ver abajo). |
| **Aplicar correlaciones** | Activado | Usa la matriz de [correlaciones](./correlaciones). Indica cuántas hay definidas. |
| **Control de precisión** | Desactivado | Detiene la simulación cuando la media del pronóstico elegido es suficientemente precisa (ver abajo). |
| **Aceleración** → **Automático** / **Estándar** / **CPU multinúcleo** / **Fórmulas compiladas** / **GPU (WebGPU)** | Automático | Cómo se evalúan las pruebas: con todos los núcleos, compilando las fórmulas o en la tarjeta gráfica. Ver [Aceleración](./aceleracion). |

La configuración se guarda junto con el modelo dentro del `.xlsx`.

### ¿Cuántas pruebas? {#cuantas-pruebas}

- **1 000**: suficiente para explorar y depurar el modelo.
- **5 000 – 10 000**: lo habitual para un trabajo o informe. Los percentiles y la probabilidad de pérdida se estabilizan en el primer decimal.
- **50 000 o más**: si necesitas probabilidades de eventos raros (colas extremas, P < 1 %) o mucha precisión. Con la [aceleración](./aceleracion) en modo Automático, 100 000 pruebas del ejemplo «Evaluación de proyecto» tardan alrededor de un tercio de segundo.

Como referencia, en el ejemplo «Evaluación de proyecto» la probabilidad de VAN negativo es 30,2 % con 1 000 pruebas y 30,3 % con 10 000; la media del VAN pasa de ±4 300 a ±1 400 de margen de error (intervalo de confianza del 95 %). Más pruebas reducen el **error de muestreo** aproximadamente con la raíz cuadrada: para reducir el error a la mitad necesitas cuatro veces más pruebas.

::: tip Semilla fija para trabajos y exámenes
Con semilla fija, tú, tu grupo y tu docente obtienen **exactamente los mismos números** con el mismo archivo. Indica en el informe la semilla, el número de pruebas y el método de muestreo.
:::

### Monte Carlo vs Hipercubo latino

- **Monte Carlo** simple: cada valor se sortea de forma totalmente independiente. Por azar, algunas zonas de la distribución pueden quedar sobre o subrepresentadas.
- **Hipercubo latino (LHS)**: divide la distribución de cada supuesto en tantos tramos de igual probabilidad como pruebas haya y toma **exactamente un valor de cada tramo**, en orden aleatorio. Cubre toda la distribución de forma pareja, por lo que **converge más rápido**: con las mismas pruebas, la media y los percentiles son más estables.

Ambos métodos dan resultados estadísticamente equivalentes; LHS es preferible casi siempre y por eso es el valor por defecto (Risk Simulator y @RISK también lo ofrecen).

### Aceleración

La última sección del diálogo, **Aceleración**, decide **cómo** se evalúan las pruebas: con el motor de hoja de cálculo en un hilo (**Estándar**), en varios núcleos (**CPU multinúcleo**), compilando las fórmulas a JavaScript (**Fórmulas compiladas**) o en la tarjeta gráfica (**GPU (WebGPU)**). El modo **Automático** (por defecto) elige el más rápido que admite tu modelo y valida los resultados contra la hoja. Todos los modos usan las mismas muestras: con la misma semilla, los resultados son idénticos (en GPU, salvo los últimos dígitos). Detalles, compatibilidad y tiempos medidos en [Aceleración: CPU multinúcleo, fórmulas compiladas y GPU](./aceleracion).

### Control de precisión

Marca **Control de precisión (detener al alcanzar la precisión)** y elige:

- el **pronóstico** a vigilar,
- el **Error relativo (%)** aceptable (por defecto 1 %),
- la **Confianza** (90 %, 95 % o 99 %).

La simulación se detiene en cuanto el intervalo de confianza de la media de ese pronóstico tiene una semiamplitud menor que el error relativo indicado (por ejemplo, ±1 % de la media), comprobándolo cada cierto número de pruebas a partir de las 500. El número de **Pruebas** actúa como máximo. La barra de estado indica *«precisión alcanzada»* si se detuvo antes.

::: warning
El control de precisión se basa en la **media**. Si el pronóstico tiene media cercana a cero (un VAN de un proyecto marginal), un error *relativo* pequeño es muy difícil de alcanzar y la simulación llegará al máximo de pruebas.
:::

## Ejecutar

Pulsa **Simulación → Ejecutar** (<kbd>Alt</kbd>+<kbd>R</kbd>). La simulación corre en segundo plano (en un *Web Worker*), así que la interfaz no se congela. La barra de estado muestra el progreso (**Simulando… 45 %**).

Al terminar, se abre el panel **Resultados** con la ventana del primer pronóstico, y la barra de estado muestra **Pruebas**, **Tiempo**, **Semilla**, el método y el **motor** usado con su velocidad (por ejemplo *Compilado (CPU) · 323 mil pruebas/s*; ver [Saber qué modo se usó](./aceleracion#saber-que-modo-se-uso)).

Durante la simulación, la hoja **no cambia**: OpenRiskSim trabaja sobre una copia del libro. Tus valores originales quedan intactos.

### Detener

Mientras corre, el botón **Ejecutar** se convierte en **Detener** (también <kbd>Esc</kbd> o el botón de la barra de estado). Se muestran los **resultados parciales** de las pruebas completadas hasta ese momento.

### Errores comunes al ejecutar

| Mensaje | Solución |
|---|---|
| *Defina al menos un pronóstico (celda de salida) antes de ejecutar.* | Define un pronóstico. |
| *Defina al menos un supuesto activo (celda de entrada incierta) antes de ejecutar.* | Define un supuesto o activa uno desactivado. |
| *N pruebas con error* (barra de estado) | Alguna fórmula del pronóstico dio error en esas pruebas. Ver [Pruebas con error](./pronosticos-y-decisiones#pruebas-con-error). |
| *Resultados desactualizados* | Cambiaste el modelo o la hoja después de simular. Pulsa **Volver a ejecutar**. |

## Paso a paso

**Simulación → Paso a paso** (<kbd>Alt</kbd>+<kbd>S</kbd>) ejecuta **una sola prueba** y escribe los valores sorteados en las celdas de los supuestos, de modo que ves en la hoja cómo queda el flujo de caja en ese escenario concreto. La barra de estado muestra *«Paso a paso: prueba N mostrada en la hoja»* con dos botones:

- **Siguiente prueba**: sortea otro escenario.
- **Restaurar valores**: devuelve la hoja a sus valores originales.

Es muy útil para **verificar el modelo**: comprueba que, al cambiar el precio o las unidades, el VAN cambia como esperas, y que no aparecen valores absurdos (unidades negativas, por ejemplo).

## Restablecer

**Simulación → Restablecer** (<kbd>Alt</kbd>+<kbd>X</kbd>) borra los resultados de la simulación y, si estabas en modo paso a paso, restaura los valores originales de la hoja. No borra el modelo (para eso está **Nuevo perfil**).

## Rendimiento

El tiempo depende del tamaño del libro (cuántas fórmulas se recalculan en cada prueba) y del número de pruebas. Como referencia, el ejemplo «Evaluación de proyecto» (≈ 90 fórmulas) simula 10 000 pruebas en menos de un segundo en una computadora portátil actual con el motor estándar, y 100 000 pruebas en unos 0,3 s con fórmulas compiladas o GPU. Libros con miles de fórmulas pueden tardar bastante más: empieza con 1 000 pruebas para medir el tiempo, y revisa en [Aceleración](./aceleracion) si tu modelo se puede compilar.

::: tip Libros grandes
Solo se recalculan las fórmulas que dependen de los supuestos, pero si tu libro tiene hojas grandes que no intervienen en el modelo (bases de datos, anexos), considera quitarlas del archivo que simulas.
:::
