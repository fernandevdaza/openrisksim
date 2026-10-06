# Preguntas frecuentes

## ¿Mis datos se suben a algún servidor?

No. OpenRiskSim es una aplicación que se ejecuta **completamente en tu navegador**: el archivo se lee en tu computadora, los cálculos se hacen en tu computadora y lo que guardas se descarga a tu computadora. No hay cuentas, ni base de datos en la nube, ni envío de archivos. El trabajo en curso se autoguarda solo en el almacenamiento local del navegador. Ver [Instalación y privacidad](../guia/instalacion#privacidad-todo-se-queda-en-tu-computadora).

## ¿Necesito internet?

Solo la primera vez, para cargar la aplicación. Después funciona sin conexión, y si la [instalas como aplicación](../guia/instalacion#instalarla-como-aplicacion-pwa) se abre como cualquier programa.

## ¿Funciona en Mac? ¿En Linux? ¿En Chromebook?

Sí: funciona en cualquier sistema con un navegador moderno (Chrome, Edge, Firefox, Safari, Brave). No necesitas Excel.

## ¿Funciona dentro de Excel para Mac (como complemento)?

No. OpenRiskSim no es un complemento de Excel, es una aplicación independiente que **abre y guarda archivos .xlsx**. El flujo es: preparas o editas tu modelo en Excel (o directamente en OpenRiskSim), lo abres en OpenRiskSim, defines el modelo de riesgo, simulas y guardas. El `.xlsx` resultante se sigue abriendo normalmente en Excel.

## ¿Por qué mis resultados difieren un poco de los de Risk Simulator (o de los de mi compañero)?

Porque la simulación usa **números aleatorios**. Cada programa usa su propio generador, y cada semilla produce una secuencia distinta, así que los resultados son **estimaciones** que varían ligeramente. Con 5 000–10 000 pruebas la diferencia suele estar en el primer decimal de las probabilidades.

- Para obtener **exactamente** los mismos números que otra persona en OpenRiskSim, usen el mismo archivo con **semilla fija**, el mismo número de pruebas y el mismo método de muestreo. Si uno de los dos simuló en **GPU**, los últimos dígitos pueden diferir (ver [¿La GPU cambia mis resultados?](#la-gpu-cambia-mis-resultados)).
- Si las diferencias con Risk Simulator son grandes, revisa que las distribuciones sean idénticas (atención a la Lognormal y al truncamiento) y que las correlaciones estén aplicadas.

Ver [Equivalencias con Risk Simulator](./risk-simulator#por-que-los-numeros-no-son-identicos-a-los-de-risk-simulator).

## ¿Cuántas pruebas debo usar?

Para un trabajo de curso, **5 000 a 10 000** pruebas con Hipercubo latino es suficiente. Usa 1 000 mientras armas el modelo y más de 50 000 solo si necesitas probabilidades muy pequeñas. Puedes activar el **control de precisión** para que la simulación se detenga sola cuando la media sea suficientemente precisa. Ver [Ejecutar → ¿Cuántas pruebas?](../guia/ejecutar#cuantas-pruebas).

## ¿Monte Carlo o Hipercubo latino?

Hipercubo latino (el valor por defecto): converge más rápido con el mismo número de pruebas. Ambos son válidos.

## ¿Puedo simular cientos de miles o millones de pruebas? {#puedo-simular-millones-de-pruebas}

Sí, hasta 5 000 000. Con la [aceleración](../guia/aceleracion) en modo **Automático** (el valor por defecto), OpenRiskSim compila las fórmulas del modelo o usa la tarjeta gráfica: en el ejemplo «Evaluación de proyecto», 100 000 pruebas tardan unos 0,3 s y un millón, menos de 2 s. Si tu modelo usa funciones que no se pueden compilar, se usan todos los núcleos del procesador.

## ¿Puedo usar mi GPU NVIDIA (CUDA) o Apple (MPS)? {#puedo-usar-mi-gpu-nvidia-cuda-o-apple-mps}

Sí, pero a través de **WebGPU**, no de CUDA ni de MPS directamente: un navegador no puede acceder a esas bibliotecas nativas. WebGPU es el estándar web para cálculo en la GPU, y el navegador lo ejecuta sobre **Metal** en macOS (la misma GPU que usa MPS), **Direct3D 12** en Windows y **Vulkan** en Linux, Android y ChromeOS. Así se aprovechan las GPU de NVIDIA, AMD, Intel y Apple con sus controladores habituales, sin instalar nada. Necesitas una versión reciente de Chrome, Edge, Safari (26 o posterior) o Firefox (en Windows). Ver [GPU: WebGPU, CUDA y MPS](../guia/aceleracion#gpu-webgpu-cuda-y-mps).

## ¿La GPU cambia mis resultados? {#la-gpu-cambia-mis-resultados}

Solo en los últimos dígitos. La GPU calcula en precisión simple (unos 7 dígitos significativos) en lugar de doble. Antes de cada simulación, las primeras 200 pruebas se comparan automáticamente con el motor de hoja de cálculo (tolerancia relativa de 10⁻⁴); si no coinciden, OpenRiskSim usa otro modo y lo indica con el chip **Respaldo**. Esa diferencia es mucho menor que el error de muestreo de la propia simulación. Los modos **Estándar**, **CPU multinúcleo** y **Fórmulas compiladas** dan resultados idénticos entre sí con la misma semilla. Ver [Precisión](../guia/aceleracion#precision).

## El VAN medio de la simulación es distinto del VAN de mi flujo de caja. ¿Está mal?

No necesariamente. El VAN determinista usa el valor más probable de cada variable; la media simulada promedia todos los escenarios. Difieren cuando las distribuciones son **asimétricas** (la media de una Triangular 220–250–310 es 260, no 250), cuando el modelo es **no lineal** (impuestos que solo se pagan con utilidad, `MAX`, `SI`) o cuando hay **correlaciones**. Es justamente una de las conclusiones interesantes del análisis de riesgo. Ver el [tutorial](../tutorial/evaluacion-de-proyecto#lo-que-dicen-estos-numeros).

## Algunas pruebas dan error. ¿Qué hago?

Una prueba con error es aquella en que la fórmula del pronóstico no se pudo calcular (por ejemplo, una TIR que no existe o una división por cero). Se excluyen de los estadísticos y se informa cuántas hubo. Revisa si alguna distribución genera valores imposibles (trúncala) o si la fórmula necesita un `SI.ERROR`. Ver [Pruebas con error](../guia/pronosticos-y-decisiones#pruebas-con-error).

## ¿Puedo abrir archivos .xls u .ods?

No directamente. Ábrelos en Excel o LibreOffice y guárdalos como `.xlsx`. Ver [Archivos](../guia/archivos#abrir-un-archivo).

## Guardé el archivo y al abrirlo en Excel no veo los supuestos

Es normal: el modelo se guarda en una hoja oculta que solo lee OpenRiskSim. Excel no sabe qué es un «supuesto». Ábrelo de nuevo en OpenRiskSim para ver y modificar el modelo.

## ¿Perdí mi trabajo si cerré la pestaña?

Probablemente no: al volver a abrir OpenRiskSim en el mismo navegador se restaura el último libro (*«Se restauró el trabajo anterior»*). Pero no confíes solo en eso: **guarda el .xlsx** con <kbd>Ctrl</kbd>+<kbd>S</kbd>.

## ¿Puedo citar OpenRiskSim en mi informe? {#puedo-citar-openrisksim-en-mi-informe}

Sí. Una forma de citarlo:

> Daza, F. y colaboradores (2026). *OpenRiskSim: simulación de riesgo Monte Carlo para hojas de cálculo* (software libre, licencia GPL-3.0). https://github.com/fernandevdaza/openrisksim

En la sección de metodología indica además el **número de pruebas**, el **método de muestreo** (Monte Carlo o Hipercubo latino), la **semilla**, las **distribuciones** de cada supuesto con sus parámetros y las **correlaciones** usadas, para que el análisis sea reproducible. Consulta con tu docente si acepta el uso de este software en lugar de Risk Simulator: los conceptos y los resultados son equivalentes.

## ¿Es gratis? ¿Qué licencia tiene?

Es **software libre y gratuito** bajo la licencia **GPL-3.0 o posterior**: puedes usarlo para cualquier fin (estudio, trabajo, consultoría), estudiar y modificar su código, y redistribuirlo, siempre que las versiones modificadas que distribuyas también sean GPL. Usa [HyperFormula](https://hyperformula.handsontable.com/) bajo su licencia GPLv3, además de ExcelJS, ECharts, React, i18next y lucide.

## ¿Puedo usarlo en mi empresa o para consultoría?

Sí, la licencia GPL lo permite. Ten en cuenta que se distribuye **sin garantía**: valida tus modelos, como con cualquier herramienta.

## ¿Qué tan exactos son los cálculos?

El código numérico se prueba contra valores de referencia de Excel, R y SciPy (más de 460 pruebas automáticas). Las funciones financieras siguen las convenciones de Excel. Los detalles de los algoritmos están en [Motor numérico](../desarrolladores/motor-numerico).

## ¿Puedo usarlo en el celular?

Funciona, pero la interfaz está pensada para pantallas grandes. Para un trabajo serio usa una computadora.

## Encontré un error o quiero sugerir una mejora

¡Gracias! Abre un *issue* en [GitHub](https://github.com/fernandevdaza/openrisksim/issues), en español o en inglés. Si sabes programar, mira [Cómo contribuir](../desarrolladores/contribuir).
