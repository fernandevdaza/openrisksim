# Introducción al análisis de riesgo

Esta página explica, sin fórmulas complicadas, **qué es una simulación Monte Carlo** y por qué se usa en la evaluación de proyectos. Si ya lo sabes, salta al [inicio rápido](./inicio-rapido).

## El problema: un solo VAN no cuenta toda la historia

En la evaluación tradicional (determinista) armas el flujo de caja con **un valor para cada variable** — por ejemplo, 10 000 unidades vendidas al año a $26 cada una — y obtienes **un único VAN**:

> VAN = $58 250 ⇒ «el proyecto conviene».

Pero ninguna de esas cifras es segura. El precio puede ser $23 o $29, la demanda puede quedarse corta, la inversión puede costar más de lo presupuestado. El VAN determinista responde a la pregunta *«¿qué pasa si todo sale exactamente como lo estimé?»*, que casi nunca es la pregunta importante.

Las preguntas que realmente interesan a quien decide son otras:

- ¿Cuál es la **probabilidad de que el VAN sea negativo** (de perder dinero)?
- ¿Entre qué valores estará el VAN con un 90 % de confianza?
- ¿Qué variables **explican la mayor parte del riesgo** y conviene estudiar mejor?

## La idea de la simulación Monte Carlo

En lugar de un valor fijo, a cada variable incierta le asignas una **distribución de probabilidad** que describe qué valores puede tomar y con qué frecuencia. Luego la computadora:

1. Sortea un valor para cada variable incierta (respetando sus distribuciones y correlaciones).
2. Recalcula toda la hoja de cálculo con esos valores y anota el resultado (por ejemplo, el VAN).
3. Repite los pasos 1 y 2 miles de veces (cada repetición es una **prueba**).

Al final no tienes un VAN, sino **miles de VAN posibles**. Con ellos se dibuja un histograma y se calculan probabilidades, percentiles y estadísticos.

<div class="formula">VAN determinista:   un número           →  $58 250
VAN simulado:       una distribución    →  media $37 300, P(VAN &lt; 0) ≈ 30 %</div>

En el ejemplo «Evaluación de proyecto» que trae OpenRiskSim, el VAN del escenario base es positivo, pero la simulación muestra que hay **alrededor de un 30 % de probabilidad de que el proyecto destruya valor**. Esa es información que el VAN determinista esconde. (Fíjate también en que la *media* del VAN simulado es menor que el VAN base: lo verás en el [tutorial](../tutorial/evaluacion-de-proyecto).)

## Conceptos clave

Estos términos se usan en toda la aplicación y en esta documentación. Son los mismos que usa Risk Simulator.

| Concepto | Qué es | En OpenRiskSim |
|---|---|---|
| **Supuesto** (*input assumption*) | Celda de entrada incierta a la que asignas una distribución de probabilidad: precio, cantidad, costo, inversión, tasa… | Celda <span class="swatch green"></span>verde. `Simulación → Definir supuesto` |
| **Pronóstico** (*output forecast*) | Celda de resultado cuyo comportamiento quieres estudiar. Normalmente una fórmula: VAN, TIR, utilidad. | Celda <span class="swatch blue"></span>azul. `Simulación → Definir pronóstico` |
| **Variable de decisión** | Celda que **tú controlas** (cantidad a producir, porcentaje invertido) y que el optimizador puede mover dentro de un rango. | Celda <span class="swatch yellow"></span>amarilla. `Simulación → Definir decisión` |
| **Prueba** (iteración, *trial*) | Un escenario: un sorteo de todos los supuestos y el recálculo de la hoja. | `Configuración → Pruebas` (5 000 por defecto) |
| **Certeza** | Probabilidad (en %) de que el pronóstico caiga dentro de un intervalo. «Certeza del 70 % de que el VAN sea ≥ 0». | Ventana de resultados |
| **Correlación** | Grado en que dos supuestos se mueven juntos (p. ej., si sube el precio, baja la demanda). | `Simulación → Correlaciones` |
| **Semilla** | Número que fija la secuencia aleatoria: con la misma semilla obtienes exactamente los mismos resultados. | `Configuración → Semilla` |

## ¿Cuándo vale la pena simular?

- Cuando el resultado depende de **varias variables inciertas a la vez** y quieres ver su efecto combinado (algo que el análisis de sensibilidad «una variable a la vez» no muestra).
- Cuando la decisión depende de un **riesgo** (probabilidad de pérdida, de no cubrir la deuda, de no alcanzar una meta).
- Cuando tu cátedra lo pide 🙂 — es parte estándar del análisis de riesgo en la evaluación de proyectos, junto con el análisis de sensibilidad y de escenarios.

::: warning La simulación no corrige un mal modelo
Los resultados son tan buenos como las distribuciones que elijas. Justifica cada supuesto (datos históricos, cotizaciones, opinión de expertos) y revisa que el flujo de caja esté bien armado antes de simular. Ver [cómo elegir una distribución](./supuestos#como-elegir-una-distribucion).
:::

## Siguiente paso

- [Instalación y privacidad](./instalacion): cómo abrir o instalar la app.
- [Inicio rápido](./inicio-rapido): tu primera simulación en 5 minutos.
