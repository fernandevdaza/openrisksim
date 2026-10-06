# Finanzas

La pestaña **Finanzas** reúne las herramientas clásicas de la evaluación financiera de proyectos. Todas funcionan sin simulación y casi todas tienen **Exportar a hoja** para llevar los resultados al libro.

Convenciones: las tasas se escriben como porcentaje en los campos marcados con `%`; los flujos empiezan en el **período 0** (normalmente la inversión, con signo negativo), que **no se descuenta**.

## Evaluador de proyectos

![Evaluador de proyectos](/screenshots/es/project.png)

**Para qué sirve.** Arma el flujo de caja completo de un proyecto — ingresos, costos, depreciación, impuestos, inversión, capital de trabajo y valor de salvamento — y calcula los indicadores de rentabilidad. Si hay financiamiento, calcula también el **flujo de caja del inversionista**. Con **Exportar con fórmulas** el flujo se convierte en una hoja viva lista para el análisis de riesgo.

**Cómo se usa.**

1. **Datos generales**: **Horizonte (años)**, **Inversión inicial (activo fijo)**, **Capital de trabajo**, **Valor de salvamento** (valor de venta de los activos al final), **Método de depreciación** (línea recta, doble saldo decreciente o suma de dígitos), **Vida útil (años)**, **Tasa de impuesto** y **Tasa de descuento** (TMAR / WACC).
2. **Datos por año**: **Unidades vendidas**, **Precio unitario**, **Costo variable unitario** y **Costos fijos** para cada año. Escribe el valor del año 1, pon una tasa de **Crecimiento** y pulsa la flecha → para proyectar los demás años.
3. **Financiamiento** (opcional): marca *El proyecto se financia en parte con un préstamo* e indica **Monto del préstamo**, **Tasa del préstamo**, **Plazo (años)** y el sistema de amortización.

Los resultados se actualizan al instante.

### Cómo se construye el flujo

**Flujo de caja del proyecto (flujo libre):**

<div class="formula">  Ingresos                       = unidades × precio
− Costos variables               = unidades × costo variable unitario
− Costos fijos
− Depreciación
= Utilidad antes de impuestos
− Impuestos                      (con arrastre de pérdidas: las pérdidas se compensan con utilidades futuras)
= Utilidad neta
+ Depreciación                   (no es salida de efectivo)
− Inversión                      (año 0)
− Capital de trabajo             (año 0; se recupera en el último año)
+ Valor de salvamento            (último año)
− Impuesto sobre el valor de salvamento   = t × (salvamento − valor en libros)
= Flujo de caja libre</div>

**Flujo de caja del inversionista** (si hay préstamo):

<div class="formula">  Flujo de caja libre
+ Préstamo                       (año 0)
− Intereses
+ Escudo fiscal de intereses     = impuestos sin deuda − impuestos con deuda
− Amortización de la deuda       (si el plazo supera el horizonte, el saldo se paga en el último año)
= Flujo de caja del inversionista</div>

### Indicadores

| Indicador | Fórmula | Criterio |
|---|---|---|
| **VAN** | VAN = Σₜ FCₜ / (1 + i)ᵗ, t = 0…n | VAN > 0 ⇒ se acepta: es la riqueza adicional después de recuperar la inversión y ganar la tasa exigida *i*. |
| **TIR** | Tasa *r* tal que Σₜ FCₜ / (1 + r)ᵗ = 0 | TIR > *i* ⇒ se acepta. |
| **TIRM** | TIRM = (VF de los flujos positivos a la tasa de reinversión / \|VP de los flujos negativos a la tasa de financiamiento\|)^(1/n) − 1 | Corrige el supuesto de reinversión a la TIR y siempre es única. En el evaluador ambas tasas son la tasa de descuento. |
| **Índice de rentabilidad (B/C)** | IR = VP de los flujos de t = 1…n / \|FC₀\| = 1 + VAN / \|FC₀\| | IR > 1 ⇒ se acepta. |
| **PRI (años)** | Período en que el flujo acumulado se vuelve ≥ 0, interpolando dentro del año | Menor es mejor; indica liquidez, no rentabilidad. |
| **PRI descontado (años)** | Igual, con flujos descontados | Siempre ≥ PRI. |
| **VAE (valor anual equivalente)** | VAE = VAN × i / (1 − (1 + i)⁻ⁿ) | Para comparar proyectos de distinta duración. |
| **VAN / TIR del inversionista** | Los mismos cálculos sobre el flujo del inversionista | Compara la TIR del inversionista con el costo del capital propio (Ke). |

El evaluador muestra un veredicto (*«Conviene realizar el proyecto (VAN > 0)»*), explica el significado de cada indicador y advierte cuando el flujo **cambia de signo varias veces y tiene más de una TIR**: en ese caso decide con el VAN o la TIRM.

Debajo se muestran la tabla **Flujo de caja** y el **Perfil del VAN** (VAN en función de la tasa de descuento: la TIR es la tasa donde la curva cruza el cero).

### Exportar

- **Exportar con fórmulas**: crea una hoja `Proyecto` con el modelo **vivo** (fórmulas que reproducen exactamente los cálculos del evaluador). El mensaje te indica la celda del VAN y las del precio y las unidades. Desde ahí: define un pronóstico en el VAN y supuestos en las celdas de datos, y ejecuta la simulación. Ver el [tutorial](../tutorial/evaluacion-de-proyecto).
- **Exportar valores**: crea una hoja `Proyecto (valores)` con los números, sin fórmulas (para anexos o informes).

## Calculadora VAN/TIR

**Para qué sirve.** Calcula todos los indicadores de **cualquier flujo de caja**: VAN, TIR (y **todas las TIR** si el flujo cambia de signo varias veces), TIRM, PRI, PRI descontado, índice de rentabilidad y VAE.

**Cómo se usa.** En **Flujos de caja (período 0, 1, 2…)** pega o selecciona los flujos (inversiones y egresos con signo negativo), e indica la **Tasa de descuento**, la **Tasa de financiamiento (TIRM)** y la **Tasa de reinversión (TIRM)**. Pulsa **Calcular**.

**Cómo interpretarlo.** Además de los indicadores, muestra el gráfico **Flujos y acumulados** (flujo, acumulado y acumulado descontado: el PRI es donde el acumulado cruza el cero) y una tabla con **Factor de descuento** y **Valor presente** de cada período. Si el flujo no cambia de signo, avisa que no existe TIR.

::: tip TIR múltiples
Un flujo como −100, +230, −132 (inversión, ingreso, costo de cierre) tiene dos TIR: 10 % y 20 %. La calculadora las muestra todas. Cuando hay más de una, la TIR no sirve como criterio: usa el VAN o la TIRM.
:::

## Amortización de préstamos

**Para qué sirve.** Genera la tabla de amortización y compara sistemas.

**Cómo se usa.** Indica **Monto del préstamo**, **Tasa por período** (mensual si los pagos son mensuales: 12 % nominal anual ⇒ 1 % mensual), **Número de cuotas** y **Sistema de amortización**:

| Sistema | Cuota | Comportamiento |
|---|---|---|
| **Francés (cuota constante)** | C = P × i / (1 − (1 + i)⁻ⁿ) | Todas las cuotas iguales; al inicio se paga sobre todo interés y al final, capital. |
| **Alemán (amortización constante)** | Amortización = P / n; cuota = P/n + interés sobre el saldo | Las cuotas bajan con el tiempo. |
| **Americano (bullet)** | Solo intereses (P × i); el capital completo en la última cuota | Menor carga inicial, mayor interés total. |

**Cómo interpretarlo.** Se muestran **Primera cuota**, **Última cuota**, **Total pagado**, **Total de intereses**, la comparación de intereses totales entre los tres sistemas, los gráficos **Composición de las cuotas** y **Saldo de la deuda**, y la **Tabla de amortización** (Cuota, Interés, Amortización, Saldo).

## Depreciación

**Para qué sirve.** Compara métodos de depreciación de un activo: **Línea recta**, **Saldo decreciente**, **Doble saldo decreciente**, **Suma de dígitos de los años** y **Unidades producidas** (para este último, indica las **Unidades producidas por año**).

**Cómo se usa.** Indica **Costo del activo**, **Valor residual** y **Vida útil (años)**.

**Cómo interpretarlo.** Todos los métodos deprecian el mismo total (costo − valor residual); cambia **el momento**. Los métodos acelerados deprecian más al inicio: como la depreciación reduce impuestos, adelantan ese ahorro tributario y **aumentan el VAN**. Se muestran la **Depreciación anual** y el **Valor en libros** de cada método en gráfico y tabla.

| Método | Depreciación del año t |
|---|---|
| Línea recta | (C − VR) / n |
| Suma de dígitos | (C − VR) × (n − t + 1) / [n(n + 1)/2] |
| Saldo decreciente | tasa fija 1 − (VR/C)^(1/n) × valor en libros (como `DB` de Excel) |
| Doble saldo decreciente | 2/n × valor en libros al inicio del año, cambiando a línea recta cuando esta es mayor y sin bajar del valor residual (como `DDB`/`VDB` de Excel) |
| Unidades producidas | (C − VR) × unidades del año / unidades totales |

## Costo de capital

**Para qué sirve.** Calcula la tasa de descuento del proyecto. Tiene tres pestañas:

**CAPM.** Costo del capital propio con riesgo país:

<div class="formula">Ke = Rf + β × (Rm − Rf) + riesgo país</div>

Campos: **Tasa libre de riesgo**, **Rentabilidad del mercado**, **Riesgo país** (prima EMBI) y **Beta**. Opcionalmente, *Calcular beta apalancada desde la beta desapalancada del sector (Hamada)*:

<div class="formula">βL = βU × [1 + (1 − t) × D/E]</div>

con **Beta desapalancada**, **Deuda / Patrimonio** y **Tasa de impuesto**. Útil en Latinoamérica: tomas la beta del sector de mercados desarrollados (por ejemplo, de las tablas de Damodaran), la reapalancas con tu estructura de capital y sumas el riesgo país.

**WACC.** Costo promedio ponderado de capital:

<div class="formula">WACC = E/(D+E) × Ke + D/(D+E) × Kd × (1 − t)</div>

Campos: **Patrimonio (E)**, **Deuda (D)**, **Tasa de impuesto**, **Costo del capital propio (Ke)** (o *Usar el Ke calculado con CAPM*) y **Costo de la deuda (Kd)**. El WACC es la tasa de descuento del **flujo del proyecto**; el Ke, la del **flujo del inversionista**.

**Conversión de tasas.**
- **Nominal → efectiva**: TEA = (1 + j/m)ᵐ − 1, con *m* = **Capitalizaciones por año** (12 mensual, 4 trimestral, 2 semestral).
- **Efectiva → nominal / periódica**: tasa periódica = (1 + TEA)^(1/m) − 1; nominal = tasa periódica × m.
- **Tasa real (Fisher)**: (1 + nominal) = (1 + real) × (1 + inflación). Usa la tasa real para flujos en moneda constante y la nominal para flujos con inflación.

## Punto de equilibrio

Dos pestañas:

**Contable.** Cantidad que hay que vender para que la utilidad sea cero:

<div class="formula">Q* = Costos fijos / (Precio − Costo variable unitario)</div>

Con **Ventas esperadas (unidades)** calcula también el **Margen de seguridad** (cuánto pueden caer las ventas antes de generar pérdidas). Muestra el gráfico de **Ingresos** vs **Costo total**. Si el precio no supera el costo variable, no existe punto de equilibrio.

**VAN = 0 (modelo).** Busca el valor de una **celda de entrada** del libro (precio, unidades, costo…) que hace que un **pronóstico** (como el VAN) sea igual a un **Valor objetivo** (0 por defecto), buscando entre **Buscar desde** y **Buscar hasta**. Responde a la pregunta: *¿cuánto puede empeorar esta variable antes de que el proyecto deje de convenir?* Se muestran el **Valor crítico**, el **Valor actual**, el **Cambio necesario** (%) y la curva del pronóstico según la celda.

::: tip Úsalo junto con la simulación
Si el precio crítico es $22,30 y el precio actual $26, el precio puede caer ≈ 14 % antes de que el VAN sea negativo. Compara ese valor con la distribución que asignaste al precio: ¿qué probabilidad tiene de estar por debajo?
:::

## Análisis de escenarios

**Para qué sirve.** La versión simplificada del análisis de riesgo: combina escenarios (**Pesimista**, **Base**, **Optimista** y los que agregues con **Agregar escenario**) con sus **Probabilidades** y un **Valor** (p. ej. el VAN de cada escenario).

**Cómo interpretarlo.** Calcula el **Valor esperado** E = Σ pᵢ·VANᵢ, la **Desviación estándar** σ = √Σ pᵢ·(VANᵢ − E)², el **Coeficiente de variación** σ/\|E\| (CV > 1 ⇒ riesgo alto en relación con el valor esperado) y la **Probabilidad de valor negativo** (suma de probabilidades de los escenarios con valor < 0). Si las probabilidades no suman 100 %, se normalizan.

La simulación de Monte Carlo generaliza esta idea a miles de escenarios: para un análisis completo, define supuestos en las variables clave y [ejecuta una simulación](../guia/ejecutar).
