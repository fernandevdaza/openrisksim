# Optimización

La herramienta **Optimización** busca los valores de las **variables de decisión** (celdas <span class="swatch yellow"></span>amarillas) que **maximizan o minimizan** un pronóstico, respetando restricciones. Es el equivalente del *Optimizer* de Risk Simulator o de OptQuest en Crystal Ball.

![Herramienta de optimización con el ejemplo de inventario](/screenshots/es/optimization.png)

## Antes de empezar

1. Define las **variables de decisión** con **Simulación → Definir decisión**, indicando su tipo (Continua, Entera, Binaria o Discreta) y su rango. Ver [Variables de decisión](../guia/pronosticos-y-decisiones#variables-de-decision).
2. Define al menos un **pronóstico** (el objetivo).
3. Para optimización estocástica, define también los **supuestos**.

## Estática vs estocástica

En **Tipo de optimización** eliges:

| Tipo | Cómo evalúa cada candidato | Cuándo usarla |
|---|---|---|
| **Estática (determinística)** | Recalcula la hoja con los supuestos en su valor base. Muy rápida. | Problemas sin incertidumbre, o para una primera solución. |
| **Estocástica (con simulación)** | Para cada combinación candidata corre una **simulación corta** (**Pruebas por simulación**, 500 por defecto) y optimiza un **Estadístico** del pronóstico. | Cuando la incertidumbre cambia la decisión óptima: inventarios, carteras, capacidad. |

En modo estocástico el **Estadístico** puede ser: **Media**, **Mediana**, **Desviación estándar**, **Coef. de variación**, **Percentil 5/10/90/95**, **Prob. de superar umbral** o **Prob. de no superar umbral** (con un **Umbral**). Así puedes plantear objetivos como «maximizar la media de la utilidad», «minimizar la desviación estándar del retorno» o «maximizar la probabilidad de que el VAN supere 0».

::: warning Costo de la optimización estocástica
Cada evaluación corre una simulación completa: 200 evaluaciones × 500 pruebas = 100 000 recálculos del libro. Usa pocas pruebas (300–1 000) y pocas evaluaciones (50–200) para empezar; luego verifica la solución con una simulación normal de más pruebas.
:::

## Configurar el problema

| Campo | Descripción |
|---|---|
| **Variables de decisión** | Tabla de solo lectura con nombre, rango y tipo de cada decisión del modelo. |
| **Objetivo** | El pronóstico a optimizar. |
| **Sentido** | **Maximizar** o **Minimizar**. |
| **Restricciones** → **Agregar** | Cada restricción es una **Celda** (cualquier celda del libro, p. ej. `Cartera!E10`) o un **Pronóstico** (en modo estocástico, con su estadístico), un operador `<=`, `>=` o `=`, y un **Límite**. Ejemplo: `Cartera!E10 = 1` (los pesos suman 100 %). |
| **Algoritmo** | Ver abajo. |
| **Máx. evaluaciones** | Presupuesto de evaluaciones (1 000 por defecto). |
| **Semilla aleatoria** | Para que los algoritmos con azar den el mismo resultado. |
| **Frontera eficiente** | Opcional: re-optimiza variando el límite de una restricción (ver abajo). |

Pulsa **Optimizar**. La barra de progreso muestra las evaluaciones y el mejor valor; puedes **Detener** y quedarte con la mejor solución encontrada.

## Algoritmos

| Algoritmo | Descripción | Adecuado para |
|---|---|---|
| **Automático** | Elige según el problema: si hay variables enteras, binarias o discretas usa el **algoritmo genético**; si todas son continuas y hay restricciones con evaluaciones rápidas, **Genético + Nelder-Mead** (el genético explora y Nelder–Mead afina); si no, **Nelder–Mead** con reinicios. | Casi siempre. |
| **Nelder-Mead (simplex)** | Método de búsqueda directa sin derivadas que mueve un «simplex» de puntos; con reinicios para escapar de óptimos locales. Las restricciones se manejan con penalización (lagrangiano aumentado). | Variables continuas, funciones suaves. Rápido. |
| **Algoritmo genético** | Población de soluciones que se cruzan y mutan; selección por torneo con las reglas de factibilidad de Deb (una solución factible siempre gana a una infactible). | Variables enteras/binarias/discretas, funciones con muchos óptimos locales, ruido de simulación. |
| **Recocido simulado** | Acepta a veces soluciones peores con una probabilidad que disminuye («enfriamiento»), para escapar de óptimos locales. | Alternativa global, problemas pequeños. |

## Resultados

**Pestaña Solución.**
- Tarjetas con el **mejor valor** del objetivo, si es **Factible**, el número de **Evaluaciones** y el **Algoritmo** usado.
- Un mensaje con la conclusión (*«Solución encontrada: al maximizar "Utilidad" se obtiene…»*) y el motivo de término (convergió, se alcanzó el máximo de evaluaciones, detenido por el usuario).
- **Valores de las decisiones**: **Valor actual** y **Valor óptimo** de cada una.
- Estado de cada restricción (**Condición**, **Valor**, **¿Cumple?**).
- **Aplicar solución** escribe los valores óptimos en las celdas de decisión. **Exportar a hoja** guarda la tabla.

**Pestaña Convergencia.** Evolución del mejor valor según las evaluaciones. Si la curva sigue subiendo al final, aumenta **Máx. evaluaciones**.

**Pestaña Frontera eficiente.** Ver abajo.

::: tip Verifica siempre
Los algoritmos de optimización no garantizan el óptimo global en problemas difíciles. Prueba con otra semilla u otro algoritmo, y tras **Aplicar solución** corre una simulación normal con más pruebas para confirmar el resultado.
:::

## Frontera eficiente

Marca **Frontera eficiente (variar el límite de una restricción)**, elige la restricción y el rango de límites (desde, hasta, número de pasos). La herramienta re-optimiza para cada límite y dibuja los óptimos. Cada punto muestra cuánto objetivo se gana al relajar la restricción: por ejemplo, **más rentabilidad esperada a cambio de más riesgo**.

Ejemplo con **Cartera de inversión**: objetivo = maximizar la media del **Retorno de la cartera** (estocástica), restricciones `Cartera!E10 = 1` (pesos suman 1) y pronóstico **Retorno de la cartera** con estadístico **Desviación estándar** `<=` límite. Variando el límite de 4 % a 14 % obtienes la frontera riesgo–retorno de Markowitz.

## Ejemplo: inventario (vendedor de periódicos)

Abre **Archivo → Ejemplos → Inventario (vendedor de periódicos)**. La demanda sigue una **Poisson** con media 100; cada unidad cuesta $30, se vende a $50, la que sobra se rescata a $10 y cada faltante cuesta $5 de imagen. La decisión es la **Cantidad a pedir** (`B11`, entera entre 60 y 140).

1. **Optimización → Optimización**.
2. **Tipo de optimización**: **Estocástica (con simulación)**.
3. **Objetivo**: **Utilidad**; **Sentido**: **Maximizar**; **Estadístico**: **Media**.
4. **Pruebas por simulación**: 400; **Máx. evaluaciones**: 40 (son pocas combinaciones posibles); **Algoritmo**: **Automático** (elegirá el genético por ser entera).
5. **Optimizar**.

Resultado: la cantidad óptima es **≈ 101 unidades**, con una utilidad media cercana a $1 820. Coincide con la teoría del problema del vendedor de periódicos: la cantidad óptima es el cuantil de la demanda en la **razón crítica** (precio − costo + penalización) / (precio − rescate + penalización) = 25/45 ≈ 0,556 (la celda `B24` del ejemplo la calcula), que para una Poisson(100) es ≈ 101.

Prueba después a minimizar la **Prob. de no superar umbral** de la utilidad con umbral 1 500, o a agregar una restricción sobre el **Nivel de servicio** (pronóstico, estadístico Media, `>=` 0,95), y observa cómo cambia la decisión.
