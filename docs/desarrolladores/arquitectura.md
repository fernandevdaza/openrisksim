# Arquitectura

::: info Página de referencia en inglés
El código, los comentarios y la documentación técnica del proyecto están en inglés. Esta página resume la arquitectura en español; el detalle de las **interfaces públicas de cada paquete** está en [Architecture & public API contracts](/en/developers/architecture) (en inglés).
:::

## Visión general

OpenRiskSim es una aplicación web **sin servidor**: todo — lectura del `.xlsx`, motor de fórmulas, simulación, ajuste, pronósticos y optimización — se ejecuta en el navegador del usuario. Está escrita en **TypeScript estricto** y organizada como un monorepo **pnpm** con paquetes que se consumen **desde el código fuente** (`exports` → `src/index.ts`), sin paso de compilación por paquete.

```
packages/
  core/           solo tipos compartidos (DistributionSpec, RiskModel, SimulationResult…)
  distributions/  generador aleatorio, funciones especiales, 33 distribuciones, ajuste
  engine/         muestreo (MC / LHS), correlaciones, estadísticos, simulación, sensibilidad
  finance/        VAN, TIR, TIRM, PRI, préstamos, depreciación, flujo del proyecto…
  forecast/       regresión, suavizamiento, ARIMA, tendencias, procesos estocásticos
  optimizer/      Nelder–Mead, algoritmo genético, recocido simulado; optimización estocástica
  accel/          compilador de fórmulas → JavaScript (f64) y WGSL para WebGPU (f32)
  workbook/       E/S xlsx/csv, motor HyperFormula, evaluador del modelo, worker, aceleración, informes, ejemplos
apps/
  web/            interfaz React 19 + Vite + Tailwind 4 + ECharts + zustand + i18next
docs/             este sitio (VitePress)
```

Grafo de dependencias: `core ← distributions ← engine ← optimizer`, `core ← finance`, `distributions ← forecast`, `core ← accel`, `workbook ← (core, distributions, engine, finance, accel)`, `web ← todos`. `workbook` carga `accel` con un `import()` dinámico (`accelDeps.ts`), de modo que los modos estándar y multinúcleo no lo descargan y un fallo al cargarlo solo desactiva la aceleración.

## Flujo de una simulación

1. **Lectura**: `workbook/readXlsx` (ExcelJS) convierte el `.xlsx` en un `WorkbookData` (hojas, celdas con valor/fórmula/formato) y lee el `RiskModel` de la hoja oculta `_openrisksim`.
2. **Motor de fórmulas**: `SpreadsheetEngine` envuelve **HyperFormula** (compatible con Excel) y registra las funciones `ORS.*`.
3. **Modelo**: el `RiskModel` (supuestos, pronósticos, decisiones, correlaciones, configuración) vive en un *store* zustand de la app y se guarda con el libro.
4. **Ejecución**: `runSimulationInWorker` envía el libro y el modelo a un **Web Worker**, que llama a `runAcceleratedSimulation` (`workbook/acceleration.ts`). Allí:
   - `engine/prepareSimulation` genera todas las muestras de antemano (uniformes MC o LHS → correlación Iman–Conover → cuantil de cada distribución, con truncamiento), **una sola vez para todos los modos**;
   - se elige el evaluador por lotes (`BatchEvaluator`) según el modo de aceleración (ver abajo); el de referencia es `createWorkbookEvaluator`, que escribe los valores de cada prueba en las celdas de los supuestos, recalcula con HyperFormula y lee los pronósticos;
   - `engine/runSimulationBatched` pide los pronósticos por lotes, informa el progreso, respeta la cancelación y el control de precisión (comprobado cada 250 pruebas, independientemente del tamaño del lote, para que todos los modos se detengan en la misma prueba) y calcula estadísticos y sensibilidad.
5. **Resultados**: la app muestra histogramas (ECharts), certeza, estadísticos y percentiles; `result.backend` (`SimulationBackendInfo`) indica el modo usado, la precisión, la velocidad, la validación y el motivo del respaldo, y alimenta la etiqueta de la barra de estado; `workbook/buildSimulationReport` genera las hojas del informe.

## Aceleración

La guía de usuario está en [Aceleración](../guia/aceleracion). Piezas principales:

| Pieza | Responsabilidad |
|---|---|
| `core/model.ts` | `AccelerationMode = "auto" \| "standard" \| "multicore" \| "compiled" \| "gpu"`; `SimulationSettings.acceleration` (por defecto `"auto"`) y `workers` (`null` = hilos − 1, entre 1 y 16). |
| `engine/runner.ts` | `prepareSimulation(model, n?)` sortea las muestras y expone las filas de entrada (`fillRows`); `runSimulationBatched(model, batchEvaluator, opts)` es el bucle común a todos los modos; `batchEvaluatorFromModelEvaluator` adapta un `ModelEvaluator` de una prueba a la interfaz por lotes. |
| `workbook/acceleration.ts` | `chooseAccelerationMode` (tabla de decisión pura: GPU si está disponible, el modelo es compatible y hay ≥ 20 000 pruebas; si no, compilado si compila; si no, multinúcleo con ≥ 2 000 pruebas y más de un hilo; si no, estándar), `detectAccelerationCapabilities` (panel del diálogo), validación de las primeras 200 pruebas contra la hoja (`validateOutputs`; tolerancia 10⁻⁹ compilado, 10⁻⁴ GPU), redondeo de los resultados compilados igual que HyperFormula (`roundLikeSpreadsheet`) y la cadena de respaldo GPU → compilado → estándar, también ante errores durante la ejecución. |
| `workbook/pool.ts` | Modo multinúcleo: un grupo de *workers* (`evaluation.worker.ts`), cada uno con su propio `SpreadsheetEngine`; reparte bloques de filas como cola de trabajo y escribe cada resultado en su índice de prueba, así que el resultado es idéntico bit a bit al estándar. |
| `@openrisksim/accel` | El compilador: `compileModel(source, model, { extraInputs })` → `CompiledProgram` (`evaluateBatchJs`, `createJsEvaluator`, `gpuSupport`, `toWGSL`); `detectGpu()` y `createGpuRunner(program)` (WebGPU); `compareOutputs(ref, cand, opts)` para validar. |

El compilador funciona en etapas: **análisis de dependencias** desde cada pronóstico hacia atrás (las celdas que no dependen de supuestos ni de variables de decisión se toman como constantes con su valor actual) → **parser** de fórmulas (`parser.ts`) → **IR** tipada con plegado de constantes y reglas de coerción compatibles con HyperFormula (`lower.ts`, `ir.ts`) → dos *back-ends*: **JavaScript** f64 generado con `new Function` (`jsgen.ts`, con un intérprete de la IR como alternativa si la política de seguridad del sitio lo impide) y **WGSL** f32 para un *compute shader* con una invocación por prueba (`wgsl.ts`, `gpu.ts`). Tras compilar, una autocomprobación ejecuta el programa con los valores actuales del libro y lo compara celda a celda con la hoja. Detalles numéricos en [Motor numérico](./motor-numerico#compilador-de-formulas-y-gpu).

## Principios

- **Matemática en TypeScript puro**, sin dependencias numéricas externas. El código numérico se prueba contra valores de referencia de Excel, R y SciPy (`pnpm test`, más de 460 pruebas).
- **Interfaz bilingüe** (es/en) con i18next; toda cadena visible pasa por los archivos de traducción.
- **Herramientas como módulos**: cada herramienta de la cinta es un componente cargado de forma diferida y registrado en `apps/web/src/tools/registry.ts`.
- **Privacidad por diseño**: no hay backend; el autoguardado usa IndexedDB.
- **Licencia GPL-3.0-or-later** (HyperFormula se usa bajo GPLv3).

## Más información

- [Architecture & public API contracts](/en/developers/architecture) — contratos de cada paquete (en inglés).
- [Motor numérico](./motor-numerico) — algoritmos y referencias.
- [Cómo contribuir](./contribuir) — entorno de desarrollo, pruebas y convenciones.
