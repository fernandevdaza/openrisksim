# Pronósticos y variables de decisión

## Pronósticos

Un **pronóstico** es una celda de **resultado** cuyos valores se registran en cada prueba de la simulación. Al terminar, cada pronóstico tiene su propia ventana con histograma, estadísticos y percentiles.

Pronósticos típicos en evaluación de proyectos: **VAN**, **TIR**, **TIRM**, **periodo de recuperación**, **utilidad neta de un año**, **flujo acumulado**, **DSCR** (cobertura de la deuda), o un indicador binario como `=SI(VAN>0;1;0)`.

### Definir un pronóstico

1. Selecciona la celda del resultado (normalmente una **fórmula**).
2. Pulsa **Simulación → Definir pronóstico**, <kbd>Alt</kbd>+<kbd>F</kbd>, o clic derecho → **Definir pronóstico**.
3. Completa:
   - **Nombre**: se propone a partir de la etiqueta de la celda (por ejemplo, «VAN / NPV»). Usa nombres cortos: aparecen en las pestañas de resultados.
   - **Formato de los resultados**: **Número**, **Moneda** o **Porcentaje**. Solo afecta a cómo se muestran los valores en gráficos y tablas (para la TIR elige **Porcentaje**).
   - **Certeza inicial del gráfico (%)**: la banda de **dos colas** que se muestra al abrir el pronóstico. Por defecto **90 %**, como Risk Simulator. Acepta cualquier valor mayor que 0 y menor que 100 (por ejemplo 97,5); los botones **80**, **90**, **95** y **99** lo fijan con un clic.
   - **Confianza del intervalo de la media (%)**: nivel del intervalo de confianza de la media que aparece en la pestaña **Estadísticas** (por defecto **95 %**). Entre 50 y 99,9 %, con los mismos botones rápidos.
4. Pulsa **Aceptar**. La celda se pinta de <span class="swatch blue"></span>azul.

El diálogo muestra el **Valor actual** de la celda para que confirmes que elegiste la correcta.

Los dos niveles se guardan con el pronóstico (dentro del `.xlsx`) y se aplican **de inmediato** a los resultados ya calculados: no hace falta volver a simular. También se usan en el [informe exportado](./archivos#exportar-un-informe). Cada pronóstico puede tener sus propios niveles: por ejemplo, 90 % para el VAN y 95 % para la TIR.

::: tip Certeza ≠ confianza
La **certeza** describe dónde caerá el resultado (el VAN estará entre A y B con 90 % de probabilidad); la **confianza del intervalo de la media** describe qué tan precisa es la estimación del valor esperado. Ver [Tres intervalos que no hay que confundir](./resultados#tres-intervalos-que-no-hay-que-confundir).
:::

::: warning «La celda no contiene una fórmula»
Si el pronóstico es un valor constante, no cambiará entre pruebas y el histograma será una sola barra. Los pronósticos casi siempre son fórmulas que dependen (directa o indirectamente) de los supuestos.
:::

### Pruebas con error

Si en alguna prueba la fórmula del pronóstico da error o un valor no numérico (por ejemplo `#NUM!` en una TIR que no existe porque todos los flujos son negativos), esa prueba se registra como **error** y no entra en el histograma ni en los estadísticos. La ventana del pronóstico y la barra de estado muestran cuántas pruebas tuvieron error. Si son muchas, revisa el modelo: quizá una distribución genera valores imposibles (precios negativos, por ejemplo) y conviene truncarla.

::: tip TIR y errores
Con flujos muy malos la TIR puede no existir. Si te pasa con frecuencia, usa el **VAN** como pronóstico principal y la TIR como complementario; en el informe menciona el porcentaje de pruebas sin TIR.
:::

### Pronósticos «indicadores»

Un truco útil: crea una celda `=SI(B34>0;1;0)` (1 si el VAN es positivo) y defínela como pronóstico con formato Número. Su **media** es directamente la **probabilidad de éxito**. El ejemplo «Lanzamiento de producto» lo usa en la celda `B24`.

## Variables de decisión

Una **variable de decisión** es una celda que **tú controlas** y que no es incierta: la cantidad a producir, el tamaño de la planta, el porcentaje de la cartera en cada activo, si se hace o no una inversión opcional. No se simula; la usa la herramienta de [Optimización](../herramientas/optimizacion) para buscar el mejor valor.

### Definir una variable de decisión

1. Selecciona la celda (debe contener un número que tus fórmulas usen).
2. Pulsa **Simulación → Definir decisión**, <kbd>Alt</kbd>+<kbd>D</kbd>, o clic derecho → **Definir decisión**.
3. Completa:
   - **Nombre**.
   - **Tipo**:
     - **Continua**: cualquier valor entre los límites (porcentajes, montos).
     - **Entera**: solo enteros (unidades, número de máquinas).
     - **Binaria (0/1)**: sí o no (hacer o no un proyecto).
     - **Discreta (con paso)**: valores entre los límites en saltos fijos, por ejemplo de 50 en 50.
   - **Límite inferior** y **Límite superior** (no aplican a las binarias); **Paso** para las discretas.
4. Pulsa **Aceptar**. La celda se pinta de <span class="swatch yellow"></span>amarillo.

::: tip
Las variables de decisión no afectan a **Ejecutar**: la simulación usa el valor que tenga la celda en ese momento. Después de optimizar, el botón **Aplicar solución** de la herramienta de optimización escribe los valores óptimos en las celdas.
:::

Ejemplo: en el libro **Inventario (vendedor de periódicos)** la celda `B11` (cantidad a pedir) es una decisión **Entera** entre 60 y 140, y en **Cartera de inversión** los cuatro pesos `E6:E9` son decisiones **Continuas** entre 0 y 1.
