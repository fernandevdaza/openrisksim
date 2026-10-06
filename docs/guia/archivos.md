# Archivos: abrir, guardar y exportar

OpenRiskSim trabaja con archivos **`.xlsx`** (el formato de Excel desde 2007) y **`.csv`**. Los procesa dentro del navegador: no se suben a ningún servidor.

## Abrir un archivo

- **Archivo → Abrir** (<kbd>Ctrl</kbd>+<kbd>O</kbd>) y elige el archivo, o
- **arrastra** el archivo `.xlsx` o `.csv` sobre la ventana de la aplicación.

### ¿De dónde puede venir el archivo?

| Programa | Qué hacer |
|---|---|
| **Excel** (Windows o Mac) | Guarda como *Libro de Excel (.xlsx)*. Si tu archivo es `.xlsm` (con macros) también se puede abrir; las macros se ignoran. |
| **LibreOffice Calc** | `Archivo → Guardar como…` → tipo *Excel 2007-365 (.xlsx)*. |
| **WPS Office** | Guarda como `.xlsx`. |
| **Google Sheets** | `Archivo → Descargar → Microsoft Excel (.xlsx)`. |
| **Numbers** (Mac) | `Archivo → Exportar a → Excel…`. |
| Cualquier programa | `.csv`, `.tsv` o `.txt` con datos separados por `,` `;` tabulador o `|`. |

Al abrir un CSV, OpenRiskSim **detecta automáticamente** el separador de columnas y el separador decimal (`1.234,56` o `1,234.56`), y reconoce porcentajes, símbolos de moneda y negativos entre paréntesis. El resultado se trata como un libro de una hoja y se guardará como `.xlsx`.

::: warning Formatos no soportados
Los formatos antiguos **`.xls`** (Excel 97-2003) y **`.ods`** (OpenDocument) no se pueden leer. Ábrelos en Excel o LibreOffice y guárdalos como `.xlsx`. La app te mostrará este mismo mensaje si lo intentas.
:::

### Qué se conserva al abrir

| Se conserva | No se conserva |
|---|---|
| Todas las hojas, valores y **fórmulas** (las fórmulas compartidas se expanden) | Gráficos e imágenes |
| Formatos de número (moneda, %, decimales, fechas como número de serie) | Bordes, formato condicional, validación de datos y comentarios |
| Negrita, cursiva, color de texto, color de relleno y alineación | Macros VBA |
| Anchos de columna | Tablas dinámicas y segmentaciones |
| Nombres definidos | |
| El modelo de riesgo de OpenRiskSim (si el archivo se guardó con la app) | |

Las **celdas combinadas** se leen y se vuelven a guardar como combinadas, pero en la hoja de OpenRiskSim se muestran como celdas separadas (el valor está en la primera celda del rango).

::: tip Trabaja sobre una copia
Como al guardar se genera un archivo nuevo sin gráficos ni bordes, conserva tu archivo original de Excel y guarda el de OpenRiskSim con otro nombre (por ejemplo, `proyecto_riesgo.xlsx`).
:::

## Guardar con el modelo

**Archivo → Guardar .xlsx** (<kbd>Ctrl</kbd>+<kbd>S</kbd>) descarga el libro a tu carpeta de descargas. El archivo contiene:

- tus hojas con sus fórmulas, valores y formatos, y
- el **modelo de riesgo** (supuestos, pronósticos, decisiones, correlaciones y configuración) en una hoja oculta llamada `_openrisksim`.

Esa hoja está marcada como *muy oculta* (`veryHidden`): no aparece en Excel ni siquiera con «Mostrar hojas», así que el archivo se ve y funciona normalmente en Excel, LibreOffice o Google Sheets. Cuando lo vuelvas a abrir en OpenRiskSim, el modelo se restaura y verás el mensaje *«Abierto … con N definiciones de modelo»*.

::: warning No edites el archivo en Excel si quieres conservar el modelo
Puedes abrir el `.xlsx` en Excel para mirarlo o imprimirlo. Pero si lo guardas desde Excel, LibreOffice o Google Sheets, es posible que la hoja oculta se pierda o que las referencias del modelo dejen de coincidir si insertaste filas o columnas. Haz los cambios estructurales en OpenRiskSim.
:::

## Exportar un informe

Después de ejecutar una simulación, **Archivo → Exportar informe** ofrece tres opciones:

| Opción | Resultado |
|---|---|
| **Libro .xlsx con hojas de informe** | Descarga `<nombre>_informe.xlsx`: tu libro con el modelo más las hojas **Resumen**, **Pronósticos**, **Supuestos**, **Sensibilidad**, **Datos de simulación** (las primeras 10 000 pruebas) y **Gráficos** (imágenes de los histogramas). |
| **Imprimir / Guardar como PDF** | Abre el diálogo de impresión del navegador con un informe formateado; elige *Guardar como PDF* como destino. |
| **Abrir informe en pestaña nueva** | El mismo informe en HTML, para revisarlo o copiar partes. Si no se abre, permite las ventanas emergentes para el sitio. |

El informe incluye la configuración, los supuestos con sus distribuciones, estadísticos, percentiles, gráficas y la sensibilidad (contribución a la varianza) de cada pronóstico. **Las gráficas usan los rangos de certeza que fijaste en cada ventana de pronóstico**: si quieres que el informe muestre P(VAN ≥ 0), configura antes **Cola derecha ≥ 0** en la ventana del VAN.

Además, cada gráfico de resultados tiene un botón **PNG** para descargar la imagen y pegarla en tu informe de Word o Google Docs.

## Autoguardado

Mientras trabajas, el libro y el modelo se guardan automáticamente en el almacenamiento del navegador (IndexedDB). Si cierras la pestaña o se reinicia la computadora, al volver a abrir OpenRiskSim verás *«Se restauró el trabajo anterior (…)»*.

- Se guarda **un solo libro** (el último). Abrir otro archivo, un ejemplo o un libro nuevo lo reemplaza.
- Los **resultados de la simulación no se guardan**: vuelve a pulsar **Ejecutar** (con semilla fija obtendrás los mismos números).
- En modo incógnito o si borras los datos del sitio, el autoguardado se pierde.

## Funciones de riesgo `ORS.*`

Además de definir supuestos con el diálogo, puedes escribirlos como **fórmulas**, al estilo de las funciones `RS*` de Risk Simulator o `Risk*` de @RISK:

| Función | En español | Distribución |
|---|---|---|
| `ORS.NORMAL(media; desv)` | `ORS.NORMAL` | Normal |
| `ORS.LOGNORMAL(media; desv)` | `ORS.LOGNORMAL` | Lognormal (media y desviación de la variable) |
| `ORS.UNIFORM(mín; máx)` | `ORS.UNIFORME` | Uniforme |
| `ORS.TRIANGULAR(mín; moda; máx)` | `ORS.TRIANGULAR` | Triangular |
| `ORS.PERT(mín; moda; máx)` | `ORS.PERT` | PERT |

En el recálculo normal estas funciones **devuelven la media** de la distribución, de modo que la hoja muestra un valor razonable.

Cuando abres un archivo que contiene celdas cuya fórmula es **exactamente** una de estas funciones con números literales (por ejemplo `=ORS.TRIANGULAR(220000;250000;310000)`), OpenRiskSim pregunta *«¿Convertirlas en supuestos del modelo?»*. Si pulsas **Convertir**, cada celda se convierte en un supuesto con esa distribución (nombrado `Hoja!Celda`). Las funciones con referencias a otras celdas (`=ORS.NORMAL(B2;B3)`) no se convierten automáticamente: defínelas con el diálogo.

También hay funciones financieras auxiliares:

| Función | En español | Qué calcula |
|---|---|---|
| `ORS.MIRR(flujos; tasa_fin; tasa_reinv)` | `ORS.TIRM` | Tasa interna de retorno modificada |
| `ORS.PAYBACK(flujos)` | `ORS.RECUPERACION` | Periodo de recuperación (fraccional, flujos desde el periodo 0) |
| `ORS.DPAYBACK(tasa; flujos)` | `ORS.RECUPERACIONDESC` | Periodo de recuperación descontado |
| `ORS.PI(tasa; flujos)` | `ORS.IR` | Índice de rentabilidad: VP de los flujos posteriores a t0 / \|inversión inicial\| |

::: warning Las funciones ORS.* solo existen en OpenRiskSim
Si abres el archivo en Excel, esas celdas mostrarán `#¿NOMBRE?`. Si tu archivo debe funcionar también en Excel, define los supuestos con el diálogo (el modelo viaja en la hoja oculta) y deja valores numéricos en las celdas.
:::

## Limitaciones conocidas

- No se leen `.xls` ni `.ods` (guárdalos como `.xlsx`).
- No se muestran gráficos, imágenes, bordes ni formato condicional, y no se conservan al guardar.
- Las celdas combinadas se muestran sin combinar.
- No se pueden renombrar ni eliminar hojas desde la app (sí agregar con **+**).
- Las fórmulas usan el motor HyperFormula: la gran mayoría de las funciones de Excel están disponibles, pero algunas muy específicas (funciones de cubo, `LAMBDA`, matrices dinámicas avanzadas, funciones web) pueden no estarlo y mostrarán un error.
- El autoguardado conserva un solo libro por navegador.
