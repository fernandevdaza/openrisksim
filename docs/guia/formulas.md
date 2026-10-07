# Fórmulas

La hoja de OpenRiskSim se comporta como Excel: escribes fórmulas en español (`=SUMA(A1:A5)`, `=VNA(B14;C30:G30)`) con **punto y coma** como separador y **coma decimal**, o en inglés si la interfaz está en inglés. Internamente se guardan en el formato estándar de Excel, así que el `.xlsx` se abre igual en Excel, LibreOffice o WPS.

## Escribir una fórmula

1. Selecciona una celda y escribe `=`.
2. Empieza a escribir el nombre de la función: aparece una lista de **autocompletado** (`=SU` → SUBTOTALES, SUMA, SUMAPRODUCTO…). Muévete con ↑ ↓ y pulsa **Tab** o **Enter** para insertarla.
3. Mientras escribes los argumentos, una **ayuda** muestra la firma de la función con el argumento actual en negrita, por ejemplo `VNA(tasa; **valor1**; [valor2]; …)`, y qué significa.
4. Pulsa **Enter** para confirmar (o **Escape** para cancelar). Si faltan paréntesis de cierre se agregan solos, como en Excel.

::: tip Insertar función (fx)
El botón **fx** junto al cuadro de nombres (o **Fórmulas → Insertar función**, o **Mayús+F3**) abre un buscador de funciones por nombre o categoría. Al elegir una aparece un formulario con un campo por argumento, su explicación, un botón para **elegir el rango en la hoja** y el **resultado en vivo** antes de aceptar.
:::

## Referencias con clic (modo «Señalar»)

Después de `=`, de un operador (`+ - * /`), de `(` o de `;`, puedes **hacer clic en una celda** para insertar su referencia, **arrastrar** o hacer **Mayús+clic** para un rango (`B4:B9`), o moverte con las **flechas** (Mayús+flechas amplía el rango). Para referirte a otra hoja, haz clic en su pestaña y luego en la celda: se inserta `'Hoja 2'!C5`.

La barra de estado indica el modo, igual que Excel: **Listo**, **Introducir**, **Señalar** o **Modificar** (**F2** alterna entre Introducir y Modificar).

Cada referencia de la fórmula aparece **de un color** en el texto y con un **recuadro del mismo color** sobre la hoja. Puedes arrastrar la esquina del recuadro para ampliar o mover la referencia.

### Referencias absolutas: F4

Con el cursor sobre una referencia, **F4** la alterna entre `A1 → $A$1 → A$1 → $A1 → A1`. Úsalo para fijar, por ejemplo, la tasa de descuento antes de copiar una fórmula: `=C30/(1+$B$14)^C17`.

## Copiar y rellenar

| Acción | Cómo |
|---|---|
| Rellenar arrastrando | Arrastra el **cuadrito** de la esquina inferior derecha de la selección hacia abajo o a la derecha. Las referencias relativas se ajustan (`=A1*2` → `=A2*2`…), las absolutas (`$`) se mantienen. Dos números seleccionados se extienden como serie (1, 2 → 3, 4, 5…); un texto con número al final también («Año 1» → «Año 2»…). |
| Rellenar hasta el final de los datos | **Doble clic** en el cuadrito: rellena hacia abajo tantas filas como tenga la columna vecina. |
| Rellenar abajo / a la derecha | **Ctrl+D** / **Ctrl+R** (⌘ en Mac). |
| Escribir en varias celdas a la vez | Selecciona el rango, escribe la fórmula y pulsa **Ctrl+Enter**. |
| Copiar / pegar | **Ctrl+C** y **Ctrl+V**: la fórmula pegada ajusta sus referencias. Un borde animado marca lo copiado hasta pulsar Escape. Al pegar en Excel se pegan los valores. |
| Cortar / pegar | **Ctrl+X** y **Ctrl+V** mueven las celdas y actualizan las fórmulas que apuntan a ellas. Si la celda tenía un **supuesto o pronóstico**, la definición se mueve con ella. |
| Pegar solo valores | **Ctrl+Mayús+V**. |

## Pestaña «Fórmulas»

- **Insertar función** y **Autosuma** (**Alt+=**): Autosuma propone `=SUMA(…)` con el rango contiguo de arriba o de la izquierda.
- **Mostrar fórmulas** (**Ctrl+`**): la hoja muestra las fórmulas en lugar de los resultados. Útil para revisar un flujo de caja.
- **Rastrear precedentes / dependientes**: dibuja flechas desde las celdas que usa la fórmula (o hacia las que dependen de ella). Un segundo clic muestra el siguiente nivel; **Quitar flechas** las borra. Ideal para entender de qué depende el VAN.
- **Evaluar fórmula**: muestra paso a paso cómo se calcula, reemplazando cada referencia y función por su valor.
- **Nombres definidos**: crea nombres como `TasaDesc` para una celda o rango y úsalos en las fórmulas (`=VNA(TasaDesc;C30:G30)`); también aparecen en el autocompletado.

## Errores

Las celdas con error muestran el código como en Excel en español (`#¡DIV/0!`, `#¿NOMBRE?`, `#¡REF!`, `#¡VALOR!`, `#N/D`, `#¡NUM!`) con una pequeña marca. Al seleccionarla, un globo explica la causa en palabras simples (por ejemplo «se está dividiendo entre cero»). Si escribes una fórmula mal formada, el editor no se cierra y avisa: «Hay un problema con esta fórmula…».

## Barra de fórmulas

La barra colorea referencias, funciones, textos y números. Para fórmulas largas, amplíala con la flecha de la derecha o **Ctrl+Mayús+U**, y usa **Alt+Enter** para saltos de línea.

::: warning Funciones no disponibles
El motor de cálculo ([HyperFormula](https://hyperformula.handsontable.com)) cubre cientos de funciones de Excel, pero no todas. Por ahora no están: MODA, JERARQUIA, INTERSECCION.EJE, PRONOSTICO, TENDENCIA, CRECIMIENTO, DVS, CONCAT y PROMEDIO.SI.CONJUNTO; si las escribes verás `#¿NOMBRE?`. En el celular, las referencias con clic y el relleno arrastrando están desactivados para no interferir con el desplazamiento.
:::
