# Correlaciones

Por defecto, cada supuesto se sortea **independientemente** de los demás. En la realidad muchas variables se mueven juntas:

- Si **sube el precio**, la **cantidad demandada** tiende a **bajar** (correlación negativa).
- Si sube la **inflación**, suben a la vez los **costos** y los **precios** (correlación positiva).
- Las **acciones locales e internacionales** suelen subir y bajar juntas.

Ignorar estas relaciones puede **subestimar o sobreestimar el riesgo**. Por ejemplo, si precio y cantidad tienen correlación negativa, los escenarios «precio alto y cantidad alta» son menos frecuentes de lo que supondría la independencia, y la dispersión de los ingresos es menor.

## Definir correlaciones

1. Define al menos **dos supuestos activos**.
2. Pulsa **Simulación → Correlaciones** (<kbd>Alt</kbd>+<kbd>C</kbd>).
3. Aparece una **matriz** con todos los supuestos. Escribe los coeficientes en el **triángulo superior**; la matriz es simétrica, así que el triángulo inferior se completa solo. La diagonal es siempre 1.
4. Pulsa **Aceptar**.

Botones del diálogo:

- **Poner todo en 0**: elimina todas las correlaciones.
- **Ajustar a la más cercana**: aparece cuando la matriz no es válida (ver abajo).

El Explorador del modelo muestra al pie cuántas correlaciones hay definidas.

## Qué significa el coeficiente

Los coeficientes son **correlaciones de rangos (Spearman)** entre −1 y 1:

| Valor | Interpretación |
|---|---|
| +1 | Relación creciente perfecta: cuando uno está en su valor más alto, el otro también. |
| +0,5 | Tienden a moverse en la misma dirección (relación moderada). |
| 0 | Sin relación (independientes). |
| −0,5 | Tienden a moverse en direcciones opuestas. |
| −1 | Relación decreciente perfecta. |

Se usa la correlación de **rangos** (no la de Pearson) porque funciona con cualquier par de distribuciones — una Normal con una Triangular, una Poisson con una Lognormal — sin alterar la forma de cada una.

::: tip ¿De dónde saco el coeficiente?
- De **datos históricos**: calcula la correlación entre las dos series (por ejemplo con `=COEF.DE.CORREL(…)` o con la herramienta de [regresión](../herramientas/pronostico#regresion-multiple)).
- De la **literatura** o de estudios de mercado (elasticidad precio–demanda).
- Del **juicio experto**: −0,3 débil, −0,5 moderada, −0,8 fuerte. Justifícalo en el informe y prueba la sensibilidad del resultado a ese valor.
:::

## Cómo se aplican: el método de Iman–Conover

OpenRiskSim induce las correlaciones con el método de **Iman y Conover (1982)**, el mismo enfoque que usan Risk Simulator, @RISK y Crystal Ball:

1. Se generan las muestras de cada supuesto de forma independiente (respetando exactamente su distribución).
2. Se **reordenan** las muestras para que sus rangos tengan la correlación pedida.

Como solo se reordenan, **cada supuesto conserva exactamente su distribución** (misma media, mismos percentiles). La correlación obtenida es muy cercana a la pedida, pero no idéntica: con 5 000 pruebas la diferencia suele ser de centésimas.

## Matriz no definida positiva

No cualquier combinación de coeficientes es posible. Por ejemplo, si A y B tienen correlación +0,9, B y C +0,9, pero A y C −0,9, la matriz es **inconsistente** (si A y C se mueven con B, no pueden moverse en sentidos opuestos entre sí). Matemáticamente, la matriz debe ser **definida positiva**.

El diálogo te avisa:

- ✅ *«Matriz válida (definida positiva).»*
- ⚠️ *«La matriz no es definida positiva: el motor usará la matriz válida más cercana.»*

En el segundo caso puedes pulsar **Ajustar a la más cercana** para ver y guardar esa matriz corregida (se calcula con el algoritmo de matriz de correlación más cercana de Higham). Si no lo haces, el motor la corrige igualmente al simular.

## Activar o desactivar

En **Simulación → Configuración**, la casilla **Aplicar correlaciones** permite ejecutar con o sin ellas sin borrar la matriz. Es útil para mostrar en tu informe cómo cambia el riesgo al considerar la correlación.

## Ejemplo: precio y demanda

El ejemplo «Evaluación de proyecto» define una correlación de **−0,5** entre **Precio unitario** y **Unidades vendidas año 1**. Para ver su efecto:

1. Ejecuta con la configuración original y anota la desviación estándar del VAN y la probabilidad de VAN ≥ 0.
2. En **Configuración**, desmarca **Aplicar correlaciones** y vuelve a ejecutar.
3. Compara: sin la correlación negativa, los escenarios extremos (precio alto *y* muchas unidades, o precio bajo *y* pocas unidades) son más frecuentes, por lo que la **dispersión del VAN aumenta** (con 10 000 pruebas, la desviación estándar pasa de unos $70 400 a $97 200).

::: warning
La correlación solo tiene efecto entre supuestos **activos**. Si desactivas un supuesto, sus correlaciones se ignoran.
:::
