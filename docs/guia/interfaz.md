# La interfaz

La ventana de OpenRiskSim imita la organización de Excel con Risk Simulator: una **cinta de opciones** arriba, la **hoja de cálculo** al centro, el **explorador del modelo** a la izquierda, el panel de **resultados** a la derecha y la **barra de estado** abajo.

![Vista general de la aplicación](/screenshots/es/overview.png)

## La cinta de opciones

La cinta tiene siete pestañas. Los nombres de esta tabla son exactamente los que verás en pantalla.

### Archivo

| Grupo | Botón | Qué hace |
|---|---|---|
| Libro | **Abrir** | Abre un libro `.xlsx` o un archivo `.csv` (<kbd>Ctrl</kbd>+<kbd>O</kbd>). También puedes **arrastrar el archivo** sobre la ventana. |
| | **Ejemplos** | Modelos listos para practicar (ver abajo). |
| | **Nuevo libro** | Crea un libro en blanco (`Hoja1`). |
| Guardar y exportar | **Guardar .xlsx** | Descarga el libro con el modelo de riesgo incluido (<kbd>Ctrl</kbd>+<kbd>S</kbd>). |
| | **Exportar informe** | Informe de la última simulación en `.xlsx`, PDF o HTML. Se activa después de ejecutar. |
| Preferencias | **English / Español** | Cambia el idioma de la interfaz. |
| | **Tema oscuro / Tema claro** | Cambia la apariencia. |

Los **ejemplos** incluidos son:

| Ejemplo | Qué enseña |
|---|---|
| **Evaluación de proyecto** | Flujo de caja a 5 años con VAN, TIR y periodo de recuperación; precio y unidades correlacionados negativamente. Es la base del [tutorial](../tutorial/evaluacion-de-proyecto). |
| **Inventario (vendedor de periódicos)** | Demanda Poisson; variable de decisión «cantidad a pedir»; pronósticos utilidad y nivel de servicio. Ideal para [optimización](../herramientas/optimizacion). |
| **Cartera de inversión** | Cuatro activos con retornos normales/lognormales correlacionados; pesos como variables de decisión. |
| **Lanzamiento de producto** | Eventos discretos: aprobación regulatoria (Bernoulli) y número de distribuidores (binomial). |
| **Préstamo y flujo del inversionista** | Proyecto financiado con deuda a tasa variable; VAN y TIR del inversionista y DSCR mínimo. |

### Simulación

| Grupo | Botón | Qué hace |
|---|---|---|
| Perfil | **Nuevo perfil** | Limpia el modelo: elimina todos los supuestos, pronósticos, decisiones y correlaciones. **La hoja no se modifica** y la configuración se conserva. |
| Definir | **Definir supuesto** | Asigna una distribución a la celda activa (<kbd>Alt</kbd>+<kbd>A</kbd>). Ver [Supuestos](./supuestos). |
| | **Definir pronóstico** | Marca la celda activa como resultado (<kbd>Alt</kbd>+<kbd>F</kbd>). Ver [Pronósticos y decisiones](./pronosticos-y-decisiones). |
| | **Definir decisión** | Marca la celda activa como variable de decisión (<kbd>Alt</kbd>+<kbd>D</kbd>). |
| Modelo | **Correlaciones** | Matriz de correlaciones entre supuestos (<kbd>Alt</kbd>+<kbd>C</kbd>). Requiere al menos dos supuestos activos. Ver [Correlaciones](./correlaciones). |
| | **Configuración** | Pruebas, semilla, método de muestreo, correlaciones y control de precisión. Ver [Ejecutar](./ejecutar). |
| Ejecutar | **Ejecutar** / **Detener** | Corre la simulación (<kbd>Alt</kbd>+<kbd>R</kbd>); mientras corre, el botón cambia a **Detener** (<kbd>Esc</kbd>). |
| | **Paso a paso** | Ejecuta una sola prueba y muestra los valores simulados en la hoja (<kbd>Alt</kbd>+<kbd>S</kbd>). |
| | **Restablecer** | Borra los resultados y restaura los valores originales de la hoja (<kbd>Alt</kbd>+<kbd>X</kbd>). |
| Definiciones | **Copiar definición** / **Pegar definición** / **Eliminar definición** | Copia la definición de la celda activa y la pega en todas las celdas seleccionadas, o elimina las definiciones de la selección. |
| Ventanas | **Resultados** | Muestra u oculta el panel de resultados. |
| | **Superposición** | Abre la comparación de varios pronósticos en una gráfica (después de ejecutar). |
| | **Explorador del modelo** | Muestra u oculta el panel izquierdo. |

### Herramientas analíticas, Pronóstico, Optimización y Finanzas

Estas cuatro pestañas abren herramientas en ventanas propias:

- **Herramientas analíticas**: Tornado, Gráfico araña, Sensibilidad, Tabla de escenarios, Ajuste de distribuciones, Bootstrap, Prueba de hipótesis, Estadística descriptiva, Gráfico superpuesto. → [Herramientas analíticas](../herramientas/analiticas)
- **Pronóstico**: Series de tiempo, Regresión múltiple, Procesos estocásticos. → [Pronóstico](../herramientas/pronostico)
- **Optimización**: Optimización. → [Optimización](../herramientas/optimizacion)
- **Finanzas**: Evaluador de proyectos, Calculadora VAN/TIR, Amortización de préstamos, Depreciación, Costo de capital, Punto de equilibrio, Análisis de escenarios. → [Finanzas](../herramientas/finanzas)

Cada herramienta tiene un recuadro **«¿Qué hace?»** con una explicación breve y, en la mayoría, un botón **Exportar a hoja** que copia los resultados a una hoja nueva del libro.

### Ayuda

**Guía rápida** (<kbd>F1</kbd>), **Glosario de distribuciones**, **Atajos de teclado** y **Acerca de** (licencia y créditos).

## La hoja de cálculo

La hoja funciona como Excel: haces clic en una celda, escribes y pulsas <kbd>Enter</kbd>. Arriba están el **cuadro de nombres** (muestra la celda activa; escribe una referencia como `B34` o `Proyecto!B34` y pulsa <kbd>Enter</kbd> para saltar a ella) y la **barra de fórmulas**. Abajo están las **pestañas de hojas** y el botón **+** (**Agregar hoja**).

El **clic derecho** sobre una celda abre un menú con **Definir supuesto**, **Definir pronóstico**, **Definir decisión**, **Copiar definición**, **Pegar definición**, **Eliminar definición** y **Borrar contenido**.

### Colores de las celdas

| Color | Significado |
|---|---|
| <span class="swatch green"></span> Verde | Supuesto (entrada incierta) |
| <span class="swatch blue"></span> Azul | Pronóstico (resultado) |
| <span class="swatch yellow"></span> Amarillo | Variable de decisión |

Las celdas definidas llevan además una pequeña marca triangular en la esquina. (Algunos libros, como los ejemplos, usan también un relleno amarillo claro para las «entradas» fijas; eso es solo formato de la hoja.)

### Atajos de la hoja

| Tecla | Acción |
|---|---|
| <kbd>F2</kbd> o doble clic | Editar la celda activa |
| <kbd>Enter</kbd> / <kbd>Tab</kbd> | Confirmar y moverse abajo / a la derecha (<kbd>Shift</kbd> invierte la dirección) |
| <kbd>Esc</kbd> | Cancelar la edición |
| <kbd>Shift</kbd>+flechas | Extender la selección |
| <kbd>Ctrl</kbd>+flechas | Saltar al borde de los datos |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Seleccionar toda la hoja |
| <kbd>Ctrl</kbd>+<kbd>Inicio</kbd> | Ir a `A1` |
| <kbd>Re Pág</kbd> / <kbd>Av Pág</kbd> | Subir / bajar una pantalla |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>X</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd> | Copiar, cortar y pegar (compatible con Excel y Google Sheets: puedes pegar un rango copiado desde ellos) |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> | Deshacer / rehacer |
| <kbd>Supr</kbd> / <kbd>Retroceso</kbd> | Borrar el contenido de la selección |

En macOS puedes usar <kbd>⌘</kbd> en lugar de <kbd>Ctrl</kbd>. Lista completa en [Atajos de teclado](../referencia/atajos).

### Fórmulas en español

El motor de fórmulas es compatible con Excel ([HyperFormula](https://hyperformula.handsontable.com/), casi 400 funciones). Puedes escribir las fórmulas **como en Excel en español**:

- Nombres de funciones en español: `=SUMA(B2:B9)`, `=PROMEDIO(…)`, `=SI(…)`, `=VNA(…)`, `=TIR(…)`, `=TIRM(…)`, `=PAGO(…)`, `=BUSCARV(…)`, `=SUMAPRODUCTO(…)`, `=REDONDEAR(…)`, `=ALEATORIO()`…
- Separador de argumentos **punto y coma** `;` (también acepta la coma).
- Coma decimal al escribir **números en las celdas** cuando la interfaz está en español: `12,5` se guarda como 12,5.

```
=VNA(B14; C30:G30) + B30
=SI(B23>0; 1; 0)
=TIR(B30:G30)
```

::: warning Detalles a tener en cuenta
- Al confirmar, la fórmula se **guarda con nombres en inglés y comas** (`=NPV(B14,C30:G30)+B30`), igual que en el archivo `.xlsx`. Es normal: así la lee cualquier versión de Excel.
- **Dentro de una fórmula usa el punto decimal**: `=B4*1.05`, no `=B4*1,05` (la coma se interpreta como separador de argumentos).
- Como en Excel, `VNA`/`NPV` descuenta **desde el primer valor**: la inversión del año 0 se suma aparte (`=B30+VNA(tasa; C30:G30)`).
:::

## Explorador del modelo

El panel izquierdo muestra el árbol del modelo: **Supuestos**, **Pronósticos** y **Decisiones**, cada uno con su nombre, celda y distribución o tipo. Al pasar el mouse sobre un elemento aparecen botones para **ir a la celda**, **ver la gráfica de resultados** (pronósticos), **editar** y **eliminar**. Al pie se resume la configuración: número de pruebas, método (MC o LHS), semilla y número de correlaciones.

## Panel de resultados

Después de **Ejecutar**, el panel derecho muestra una pestaña por pronóstico (por ejemplo **VAN** y **TIR**) más **Superposición**. Dentro de cada pronóstico hay tres pestañas: **Histograma**, **Estadísticas** y **Percentiles**. Todo se explica en [Interpretar los resultados](./resultados).

Si cambias el modelo o la hoja después de simular, aparece el aviso **«Resultados desactualizados»** con un botón **Volver a ejecutar**.

## Barra de estado

- Con varias celdas numéricas seleccionadas muestra **Promedio**, **Recuento** y **Suma**, como Excel.
- Durante la simulación muestra el progreso (**Simulando… 45 %**) y un botón **Detener**.
- En modo paso a paso muestra la prueba actual con los botones **Siguiente prueba** y **Restaurar valores**.
- Al terminar muestra **Pruebas**, **Tiempo**, **Semilla**, el método de muestreo y el **motor** usado con su velocidad (por ejemplo *GPU · apple metal-3 · Metal*; ver [Aceleración](./aceleracion#saber-que-modo-se-uso)), además de avisos como pruebas con error, «precisión alcanzada» o el chip **Respaldo**.

## Idioma y tema

- **Archivo → English / Español** cambia el idioma de toda la interfaz (también el formato de números: `1.234,56` en español, `1,234.56` en inglés).
- **Archivo → Tema oscuro / Tema claro** cambia la apariencia.

Ambas preferencias se recuerdan en el navegador.
