# Aceleración: CPU multinúcleo, fórmulas compiladas y GPU

En cada prueba, OpenRiskSim escribe los valores sorteados en las celdas de los supuestos, recalcula el libro y lee los pronósticos. Con el motor de hoja de cálculo completo (HyperFormula) eso da, como mucho, unas **decenas de miles de pruebas por segundo**: suficiente para 5 000 – 10 000 pruebas, pero lento si quieres 100 000 o un millón. La sección **Aceleración** permite evaluar las pruebas mucho más rápido usando **todos los núcleos del procesador**, **compilando las fórmulas** o usando la **tarjeta gráfica (GPU)**.

::: tip En resumen
Deja el modo en **Automático**. OpenRiskSim elige el modo más rápido que admite tu modelo, comprueba que los resultados coincidan con la hoja y, si algo falla, vuelve al modo estándar. La aceleración **nunca hace fallar una simulación**.
:::

![Sección Aceleración del diálogo Configuración de simulación](/screenshots/es/acceleration.png)

## Dónde se configura

**Simulación → Configuración** → sección **Aceleración**, al final del diálogo *Configuración de simulación*. Como el resto de la configuración, el modo elegido se guarda con el modelo dentro del `.xlsx`.

Todos los modos usan **exactamente las mismas muestras**: los valores de los supuestos se sortean una sola vez antes de evaluar (con la semilla, el método de muestreo y las correlaciones configurados), y luego se reparten entre los evaluadores. Por eso, con la misma semilla, cambiar de modo solo cambia la **velocidad** (y, en GPU, los últimos dígitos; ver [Precisión](#precision)).

## Los cinco modos

| Modo | Qué hace | Precisión | Cuándo usarlo |
|---|---|---|---|
| **Automático** <Badge type="tip" text="recomendado" /> | Elige el modo más rápido que admite tu modelo y vuelve al estándar si algo falla. | La del modo elegido | Siempre, salvo que quieras forzar un modo concreto. |
| **Estándar** | Un hilo con el motor de hoja de cálculo completo. Admite todas las fórmulas. | Doble (f64), referencia | Para comparar, o si sospechas de un problema con la aceleración. |
| **CPU multinúcleo** | Varios hilos (*Web Workers*), cada uno con su propia copia de la hoja. | Idéntica al estándar | Modelos que no se pueden compilar (usan funciones no soportadas) con muchas pruebas. |
| **Fórmulas compiladas** | Traduce las fórmulas que hay entre los supuestos y los pronósticos a JavaScript y las ejecuta directamente, sin pasar por el motor de hoja de cálculo. | Doble (f64) | Cualquier modelo compatible; es el más rápido hasta unas decenas de miles de pruebas. |
| **GPU (WebGPU)** | Ejecuta el modelo compilado en la tarjeta gráfica, miles de pruebas en paralelo. | Simple (f32), validada | Cientos de miles o millones de pruebas. |

Si un modo no puede usarse en tu equipo o con tu modelo, aparece marcado como **no disponible**. Puedes elegirlo igualmente: la simulación correrá con el siguiente modo posible y te lo indicará (ver [El chip Respaldo](#el-chip-respaldo)).

### Hilos (workers)

Con **CPU multinúcleo** o **Automático** aparece el selector **Hilos (workers)**. **Automático (n)** usa el número de hilos del procesador menos uno (el que queda libre mantiene fluida la interfaz), con un máximo de 16. Puedes fijar un número entre 1 y 16.

### Qué elige el modo Automático

En este orden:

1. **GPU**, si WebGPU está disponible, el modelo es compatible con GPU y hay **20 000 pruebas o más**.
2. Si no, **Fórmulas compiladas**, si el modelo se puede compilar (con cualquier número de pruebas).
3. Si no, **CPU multinúcleo**, si hay **2 000 pruebas o más** y el equipo tiene más de un hilo.
4. Si no, **Estándar**.

Con menos de 20 000 pruebas no compensa preparar la GPU: el modo compilado ya termina en fracciones de segundo.

Si eliges un modo concreto y no se puede usar, se recurre a otro: **GPU** → **Fórmulas compiladas** (si el modelo compila) → **Estándar**; **Fórmulas compiladas** → **Estándar**; **CPU multinúcleo** → **Estándar**.

### Muchas pruebas sin aceleración

El número de **Pruebas** admite hasta **5 000 000** (botones rápidos: 1 000, 5 000, 10 000, 100 000 y 1 M). Si pides más de 200 000 pruebas y la simulación va a correr con el motor estándar (modo **Estándar**, o **Automático** con un modelo que no compila), el diálogo advierte: *«Más de 200.000 pruebas sin aceleración puede tardar varios minutos y usar mucha memoria. Considere el modo Automático, Compilado o GPU.»*

## El panel Este equipo y tu modelo

Debajo de los modos, el diálogo analiza tu navegador y tu modelo (*Detectando capacidades…* durante un instante):

| Fila | Qué muestra |
|---|---|
| **GPU** | ✓ el nombre de la tarjeta y la API que usa el navegador, por ejemplo *apple metal-3 · Metal* (muchos navegadores, por privacidad, solo informan el fabricante y la arquitectura, no el modelo exacto; *(software)* indica que solo hay un adaptador emulado). O bien ✗ el motivo: *WebGPU no está disponible en este navegador* o *No se encontró un adaptador de GPU compatible*. |
| **CPU** | Cuántos hilos tiene el procesador, por ejemplo *14 hilos*. |
| **Tu modelo** | ✓ *N fórmulas compiladas*, o ✗ *no se puede compilar:* seguido de la **celda** y el **motivo** (por ejemplo *Hoja1!B12: la función VLOOKUP no está soportada por el compilador*; «(+3)» indica que hay más celdas con problemas). Si compila, una segunda línea indica ✓ *compatible con GPU* o ✗ *no compatible con GPU:* y el motivo. Si aún no hay supuestos y pronósticos: *Defina supuestos y pronósticos para analizar el modelo.* |

La nota final recuerda que la GPU calcula en precisión simple y que los resultados se validan automáticamente (ver abajo).

::: tip Cómo hacer compatible un modelo
El motivo indica la celda exacta. Normalmente basta con reescribir esa fórmula con funciones soportadas (por ejemplo, un `BUSCARV` sobre una tabla fija se puede reemplazar por `INDICE` con una posición constante, o mover el cálculo a una celda que no dependa de los supuestos). Ver [Qué modelos se pueden compilar](#que-modelos-se-pueden-compilar).
:::

## Saber qué modo se usó

Al terminar, la **barra de estado** muestra, junto a *Pruebas*, *Tiempo* y *Semilla*, una etiqueta con el motor usado y la velocidad:

- **GPU · apple metal-3 · Metal · 685 mil pruebas/s** (icono de rayo),
- **Compilado (CPU) · 323 mil pruebas/s**,
- **14 núcleos · 95 mil pruebas/s** (CPU multinúcleo con 14 workers),
- **Estándar · 23 mil pruebas/s**.

(Cifras del ejemplo «Evaluación de proyecto»; ver [Rendimiento medido](#rendimiento-medido).)

La cabecera del panel **Resultados** repite el resumen (*N pruebas · tiempo · motor*). Al pasar el ratón sobre la etiqueta se ve el detalle: *Motor* y precisión (`f64` o `f32`), pruebas por segundo, *Modo solicitado* (si difiere del usado), *Validado contra la hoja: N valores, error relativo máx. …* (modos compilado y GPU) y, si lo hubo, el motivo del respaldo.

La velocidad incluye todo el proceso (muestreo, evaluación, estadísticos y sensibilidad), no solo la evaluación de las fórmulas.

### El chip Respaldo

Si se pidió un modo y se terminó usando otro **porque algo falló**, aparece el chip ámbar **Respaldo**. Al pasar el ratón: *Se usó otro modo:* y el motivo. Los más habituales:

| Motivo | Qué significa |
|---|---|
| *El modelo no se puede compilar — Hoja1!C8: …* | Una fórmula entre los supuestos y los pronósticos usa algo que el compilador no admite. |
| *No compatible con GPU — …* | El modelo compila, pero algo solo existe en CPU (por ejemplo `MEDIAN`) o es demasiado grande para la GPU. |
| *WebGPU no está disponible en este navegador* / *No se encontró un adaptador de GPU compatible* | Ver [Problemas frecuentes](#problemas-frecuentes). |
| *Los resultados de la GPU no coinciden con el motor de hoja de cálculo (error relativo máx. …)* | La validación detectó una diferencia mayor que la tolerancia; se usó el modo compilado o el estándar. |
| *No se pueden iniciar Web Workers aquí* | El navegador no permite hilos adicionales (raro). |

En modo **Automático**, que la GPU no exista o que el modelo no compile no se considera un fallo: simplemente se elige el siguiente modo, sin chip. El chip aparece solo cuando un modo que se iba a usar falló (inicialización de la GPU, validación, error durante la ejecución).

## GPU: WebGPU, CUDA y MPS

Un navegador **no puede llamar directamente a CUDA** (NVIDIA) **ni a MPS / Metal Performance Shaders** (Apple): esas son bibliotecas nativas a las que una página web no tiene acceso. Lo que sí ofrecen los navegadores modernos es **WebGPU**, un estándar web para cálculo en la GPU que el navegador traduce a la API nativa de cada sistema:

| Sistema | WebGPU se ejecuta sobre |
|---|---|
| macOS, iPadOS, iOS | **Metal** — la misma GPU (Apple Silicon, AMD o Intel) que usa MPS |
| Windows | **Direct3D 12** |
| Linux, Android, ChromeOS | **Vulkan** |

Así, las GPU de **NVIDIA, AMD, Intel y Apple** se aprovechan a través de sus controladores habituales, sin instalar nada. Cuando hay dos GPU (integrada y dedicada), OpenRiskSim pide la de **alto rendimiento**; el navegador decide cuál entrega.

**Navegadores con WebGPU** (versiones recientes): **Chrome** y **Edge** 113 o posterior en Windows, macOS y ChromeOS (y Chrome en Android reciente); **Safari 26** o posterior en macOS, iPadOS e iOS; **Firefox 141** o posterior en Windows (en otros sistemas, Firefox lo está habilitando progresivamente). En Linux, el soporte de Chrome depende de la versión y del controlador. Si tu navegador no tiene WebGPU, OpenRiskSim usa el modo compilado, que también es muy rápido.

## Precisión

- **Estándar**, **CPU multinúcleo** y **Fórmulas compiladas** calculan en **doble precisión (f64)**, como Excel. Con la misma semilla dan resultados **idénticos bit a bit**: multinúcleo usa el mismo motor de hoja en cada hilo y reúne las pruebas en su orden; el modo compilado redondea sus resultados igual que el motor de hoja de cálculo. Además, al compilar se comprueba que el programa compilado reproduce los valores actuales de la hoja, y antes de cada simulación se comparan las primeras 200 pruebas con el motor de hoja (tolerancia relativa 10⁻⁹).
- **GPU** calcula en **precisión simple (f32)**, unos **7 dígitos significativos**. Antes de cada simulación, las **primeras 200 pruebas** se evalúan también con el motor de hoja de cálculo y se comparan pronóstico por pronóstico, con una tolerancia relativa de **10⁻⁴** (medida respecto a la escala del pronóstico, para que un VAN cercano a cero no se juzgue por el ruido de redondeo). Si no coinciden, la simulación pasa automáticamente al modo compilado o al estándar.

¿Importa la diferencia? En la práctica, no: un error relativo de 10⁻⁴ en un VAN de $40 000 son unos $4, muy por debajo del **error de muestreo** de cualquier simulación (con 100 000 pruebas, el error estándar de la media de ese VAN ronda los $220). Las probabilidades y los percentiles solo pueden variar mínimamente si alguna prueba cae justo en un límite. Si necesitas reproducir exactamente los números de otra persona, usen el mismo modo (o cualquier modo que no sea GPU) con la misma semilla.

## Qué modelos se pueden compilar

El compilador analiza solo las celdas que hay **entre los supuestos y los pronósticos**: parte de cada pronóstico, sigue sus referencias hacia atrás y compila las fórmulas que dependen (directa o indirectamente) de algún supuesto o variable de decisión.

::: tip Las celdas que no dependen de los supuestos pueden usar cualquier función
Una fórmula que no depende de ningún supuesto da el mismo valor en todas las pruebas, así que se toma como **constante** con el valor que calcula la hoja. Puede usar `BUSCARV`, `SUMAR.SI`, fechas, texto… sin impedir la compilación. Solo hay que evitar las funciones volátiles de la lista de abajo.
:::

### Funciones soportadas

Los nombres de la tabla son los de Excel en inglés (el nombre en español de Excel entre paréntesis); las fórmulas escritas en español se reconocen igual.

| Grupo | Funciones | CPU (JS) | GPU |
|---|---|---|---|
| Aritmética y operadores | `+ - * / ^`, `%`, comparaciones `= <> < <= > >=` | ✓ | ✓ |
| Agregados | `SUM` (SUMA), `AVERAGE` (PROMEDIO), `MIN`, `MAX`, `COUNT` (CONTAR), `PRODUCT` (PRODUCTO), `SUMPRODUCT` (SUMAPRODUCTO) | ✓ | ✓ |
| | `MEDIAN` (MEDIANA) | ✓ | — |
| Matemáticas | `ABS`, `SQRT` (RAIZ), `EXP`, `LN`, `LOG`, `LOG10`, `POWER` (POTENCIA), `MOD` (RESIDUO), `ROUND`/`ROUNDUP`/`ROUNDDOWN` (REDONDEAR, .MAS, .MENOS), `TRUNC` (TRUNCAR), `INT` (ENTERO), `SIGN` (SIGNO), `PI` | ✓ | ✓ |
| Lógicas | `IF` (SI), `IFERROR` (SI.ERROR), `AND` (Y), `OR` (O), `NOT` (NO), `TRUE`/`FALSE`, `ISERROR`/`ISERR` (ESERROR, ESERR), `ISNUMBER` (ESNUMERO) | ✓ | ✓ |
| Búsqueda | `CHOOSE` (ELEGIR) e `INDEX` (INDICE), con **posición constante** | ✓ | ✓ |
| Financieras | `NPV` (VNA), `IRR` (TIR), `MIRR` (TIRM), `PV` (VA), `FV` (VF), `PMT` (PAGO), `NPER` | ✓ | ✓ |
| OpenRiskSim | `ORS.NORMAL`, `ORS.LOGNORMAL`, `ORS.UNIFORM`, `ORS.TRIANGULAR`, `ORS.PERT`, `ORS.MIRR`, `ORS.PAYBACK`, `ORS.DPAYBACK`, `ORS.PI` | ✓ | ✓ |

También se admiten referencias a otras hojas, rangos (hasta 100 000 celdas) y **nombres definidos**.

### Qué impide compilar

| Causa | Ejemplo de motivo |
|---|---|
| Funciones **volátiles** o con **referencias ocultas** en cualquier celda de la que dependa un pronóstico: `RAND` (ALEATORIO), `RANDBETWEEN` (ALEATORIO.ENTRE), `RANDARRAY`, `NOW` (AHORA), `TODAY` (HOY), `INDIRECT` (INDIRECTO), `OFFSET` (DESREF), `CELL`, `INFO` | *RAND es volátil o usa referencias ocultas y no se puede compilar* |
| Cualquier otra función no soportada **en una celda que depende de los supuestos** (`VLOOKUP`/BUSCARV, `SUMIF`/SUMAR.SI, funciones de fecha o texto…) | *la función VLOOKUP no está soportada por el compilador* |
| `CHOOSE` o `INDEX` con una posición que depende de los supuestos | *INDICE con una posición simulada no está soportado* |
| Fórmulas que producen **texto**, o concatenación de texto con valores simulados | *la fórmula produce texto, que no se puede simular* |
| Referencias a **columnas o filas completas** (`A:A`, `3:3`) o rangos de más de 100 000 celdas | *Las referencias a columnas/filas completas no están soportadas* |
| **Referencias circulares** | *referencia circular* |
| Modelos que alcanzan más de 500 000 celdas | *el modelo referencia más de 500000 celdas* |

### Qué impide usar la GPU (aunque compile)

- `MEDIAN` en una celda simulada (*MEDIAN solo está disponible en la CPU*).
- Más de **5 000 fórmulas compiladas** (*el shader de GPU admite hasta 5000*).
- Constantes fuera del rango de precisión simple (mayores que unos 3,4 × 10³⁸).

En esos casos se usa el modo compilado, cuya evaluación sigue siendo unas 100 veces más rápida que la del motor estándar.

## Rendimiento medido

Ejemplo **Evaluación de proyecto**, Apple M5 Pro con Chrome, tiempo total de la simulación (muestreo, evaluación, estadísticos y sensibilidad):

| Modo | 100 000 pruebas | 1 000 000 pruebas | 5 000 000 pruebas |
|---|---|---|---|
| Estándar | 4,31 s | — | — |
| CPU multinúcleo (14 workers) | 1,05 s | — | — |
| Fórmulas compiladas | 0,31 s | 1,76 s | — |
| GPU (WebGPU) | 0,31 s | 1,46 s | 8,0 s |

Velocidad de **evaluación** de las fórmulas, sin contar el muestreo ni las estadísticas:

| Motor | Pruebas por segundo (orden de magnitud) |
|---|---|
| Motor de hoja de cálculo (HyperFormula) | ~15 000 |
| Fórmulas compiladas (JavaScript) | ~1,5 millones |
| GPU (WebGPU) | 64 – 120 millones |

Estas velocidades de evaluación se midieron por separado, con modelos de prueba, y varían según el tamaño del modelo y el equipo.

Con muchas pruebas, la evaluación deja de ser el cuello de botella: el tiempo restante se va en **sortear las muestras** (incluidas LHS y correlaciones) y en **calcular estadísticos y sensibilidad**, que se hacen en la CPU. Por eso la GPU, aunque evalúa casi 100 veces más rápido que el modo compilado, solo reduce el tiempo total de 1,76 s a 1,46 s con un millón de pruebas. Tus tiempos dependerán del equipo, del navegador y del tamaño del modelo.

## Problemas frecuentes

**«WebGPU no está disponible en este navegador».**
- Actualiza el navegador a una versión reciente (ver [navegadores con WebGPU](#gpu-webgpu-cuda-y-mps)).
- En Chrome o Edge, abre `chrome://gpu` (o `edge://gpu`) y busca la línea *WebGPU*: si dice *Disabled* o *Software only*, actualiza los **controladores de la tarjeta gráfica**; a veces el navegador desactiva la GPU en controladores con errores conocidos.
- Las opciones experimentales de `chrome://flags` o `about:flags` (por ejemplo *Unsafe WebGPU*) sirven **solo para pruebas**: no las dejes activadas para el uso diario.
- En Safari anterior a la versión 26, WebGPU puede probarse en **Safari Technology Preview**.
- En **Linux**, Chrome puede necesitar que **Vulkan** esté habilitado (controlador Vulkan instalado y, según la versión, la opción de Vulkan en `chrome://flags`).

**«No se encontró un adaptador de GPU compatible».** El navegador tiene WebGPU, pero no ofrece ninguna GPU: puede estar en una lista de bloqueo, desactivada por la aceleración por hardware del navegador (*Configuración → Sistema → Usar aceleración por hardware*) o en una máquina virtual o escritorio remoto.

**La simulación es lenta aunque elegí GPU.** Mira la etiqueta de la barra de estado: si no dice *GPU*, pasa el ratón sobre el chip **Respaldo** para ver el motivo. Si dice *Estándar*, el modelo no compila: el panel **Tu modelo** indica la celda responsable.

**Los resultados en GPU difieren en los últimos decimales.** Es lo esperado por la precisión simple (ver [Precisión](#precision)). Para un informe que deba coincidir exactamente con el de un compañero, usen el mismo modo y la misma semilla.

::: info Para desarrolladores
El compilador está en el paquete `@openrisksim/accel`. Ver [Arquitectura](../desarrolladores/arquitectura#aceleracion) y [Motor numérico](../desarrolladores/motor-numerico#compilador-de-formulas-y-gpu).
:::
