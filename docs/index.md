---
layout: home
title: OpenRiskSim
titleTemplate: Simulación de riesgo Monte Carlo en tu navegador

hero:
  name: OpenRiskSim
  text: Análisis de riesgo para tus hojas de cálculo, en el navegador
  tagline: Simulación Monte Carlo, pronósticos, optimización y evaluación de proyectos sobre tus archivos .xlsx. Gratis, de código abierto y sin instalar nada — en Windows, macOS y Linux.
  image:
    src: /icon.svg
    alt: Logotipo de OpenRiskSim
  actions:
    - theme: brand
      text: Abrir la app
      link: https://fernandevdaza.github.io/openrisksim/
      target: _self
    - theme: alt
      text: Guía rápida
      link: /guia/inicio-rapido
    - theme: alt
      text: ¿Qué es el análisis de riesgo?
      link: /guia/introduccion

features:
  - icon: 🎲
    title: Simulación Monte Carlo
    details: 33 distribuciones, truncamiento, Monte Carlo o Hipercubo latino, correlaciones (Iman–Conover), semilla reproducible y control de precisión. Miles de escenarios en segundos.
    link: /guia/supuestos
    linkText: Definir supuestos
  - icon: ⚡
    title: Aceleración con GPU
    details: Hasta 5 millones de pruebas. Usa todos los núcleos del procesador, compila las fórmulas o las ejecuta en la tarjeta gráfica (WebGPU) — 100 000 pruebas en un tercio de segundo, con resultados validados contra la hoja.
    link: /guia/aceleracion
    linkText: Aceleración
  - icon: 📊
    title: Resultados que se entienden
    details: Histograma y curva acumulada con certeza de dos colas, cola izquierda o derecha; niveles de certeza y de confianza configurables; estadísticos completos, percentiles, gráfico superpuesto e informe .xlsx o PDF.
    link: /guia/resultados
    linkText: Interpretar resultados
  - icon: 🌪️
    title: Sensibilidad y ajuste
    details: Tornado, araña, sensibilidad por correlación de rangos, tabla de escenarios, ajuste de distribuciones a datos (KS, Anderson–Darling, χ², AIC/BIC), bootstrap y pruebas de hipótesis.
    link: /herramientas/analiticas
    linkText: Herramientas analíticas
  - icon: 📈
    title: Pronósticos
    details: Promedios móviles, suavizamiento exponencial, Holt, Holt–Winters, ARIMA y auto-ARIMA, tendencias, regresión múltiple y por pasos, y procesos estocásticos, con hasta tres niveles de confianza a elección (80, 90, 95, 99 % o p. ej. 97,5 %).
    link: /herramientas/pronostico
    linkText: Pronóstico
  - icon: 🎯
    title: Optimización
    details: Variables de decisión continuas, enteras, binarias o discretas; restricciones; optimización estática o estocástica; Nelder–Mead, algoritmo genético, recocido simulado y frontera eficiente.
    link: /herramientas/optimizacion
    linkText: Optimización
  - icon: 💼
    title: Evaluación de proyectos
    details: Flujo de caja del proyecto y del inversionista, VAN, TIR, TIRM, PRI, IR, VAE, préstamos, depreciación, WACC/CAPM con riesgo país y punto de equilibrio.
    link: /herramientas/finanzas
    linkText: Finanzas
  - icon: 📂
    title: Tus archivos de siempre
    details: Abre y guarda .xlsx de Excel, LibreOffice, WPS o Google Sheets. Acepta fórmulas en español (=SUMA, =VNA, =TIR) y guarda el modelo de riesgo dentro del propio archivo.
    link: /guia/archivos
    linkText: Archivos
  - icon: 🔒
    title: Privado y sin conexión
    details: Todo se calcula en tu computadora; ningún dato se sube a un servidor. Se puede instalar como aplicación y funciona sin internet.
    link: /guia/instalacion
    linkText: Instalación
  - icon: 🎓
    title: Pensado para estudiantes
    details: Interfaz en español, con nombres y flujo de trabajo parecidos a Risk Simulator, ejemplos listos para practicar y textos de ayuda que explican cómo interpretar cada resultado.
    link: /tutorial/evaluacion-de-proyecto
    linkText: Tutorial completo
---

## ¿Por qué OpenRiskSim?

En los cursos de **Preparación y Evaluación de Proyectos** es habitual usar **Risk Simulator**, un complemento de Excel que solo funciona en **Windows**. Si tienes una Mac, usas Linux, trabajas con LibreOffice o simplemente no tienes una licencia, te quedas sin herramienta para hacer el análisis de riesgo de tu proyecto.

OpenRiskSim resuelve eso: es una aplicación web libre que reproduce el flujo de trabajo de Risk Simulator — **supuestos**, **pronósticos**, **ejecutar**, **certeza**, **tornado** — sobre tus mismos archivos `.xlsx`, directamente en el navegador.

![OpenRiskSim con el ejemplo «Evaluación de proyecto»: hoja de cálculo, explorador del modelo y panel de resultados](/screenshots/es/overview.png)

## Cómo funciona, en cuatro pasos

1. **Abre tu modelo** (`Archivo → Abrir`) o un ejemplo (`Archivo → Ejemplos`).
2. **Marca las celdas inciertas** como supuestos (precio, demanda, inversión…) y elige su distribución de probabilidad.
3. **Marca los resultados** como pronósticos (VAN, TIR…).
4. **Ejecuta** miles de escenarios y lee el histograma: por ejemplo, la **probabilidad de que el VAN sea negativo**.

::: tip ¿Primera vez?
Sigue el [inicio rápido de 5 minutos](/guia/inicio-rapido) con el ejemplo incluido, y después el [tutorial completo de evaluación de un proyecto](/tutorial/evaluacion-de-proyecto), escrito como un trabajo práctico de la materia.
:::

<p style="font-size:0.85rem;color:var(--vp-c-text-2)">Risk Simulator, @RISK y Crystal Ball son marcas registradas de sus respectivos dueños; OpenRiskSim no está afiliado a ellos.</p>
