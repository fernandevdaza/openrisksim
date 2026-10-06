<p align="right"><a href="CONTRIBUTING.md">English</a> · <b>Español</b></p>

# Cómo contribuir a OpenRiskSim

¡Gracias por querer ayudar! OpenRiskSim nació para que cualquier estudiante pueda hacer análisis de riesgo en su
computadora, sea cual sea. Se aceptan issues y pull requests en **español o inglés**. Respeta el
[Código de conducta](CODE_OF_CONDUCT.md).

## Formas de ayudar

- **Reportar errores**, sobre todo números incorrectos. Adjunta el `.xlsx` (sin datos confidenciales) y el valor
  esperado con su fuente (Excel, R, un libro…).
- **Mejorar la documentación**: tutoriales, ejemplos de clase, traducciones (`docs/`).
- **Agregar funciones**: distribuciones, herramientas, gráficos. Para cambios grandes, abre primero un issue.

## Preparar el entorno

Requisitos: Node.js 20 o superior y pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev            # app web en http://localhost:5173
pnpm docs:dev       # sitio de documentación
```

Antes de enviar cambios:

```bash
pnpm typecheck
pnpm test
pnpm --filter @openrisksim/web build
```

## Estructura

El monorepo está dividido en paquetes pequeños con contratos explícitos — ver la
[documentación de arquitectura](https://fernandevdaza.github.io/openrisksim/docs/desarrolladores/arquitectura).

| Carpeta | Responsabilidad |
|---|---|
| `packages/core` | Solo tipos compartidos (sin lógica) |
| `packages/distributions` | Generador aleatorio, funciones especiales, distribuciones, ajuste de distribuciones |
| `packages/engine` | Muestreo (Monte Carlo / Latin Hypercube), correlaciones, estadísticos, simulación, sensibilidad |
| `packages/finance` | Finanzas de proyectos (VAN, TIR, TIRM, PRI, flujo de caja, préstamos, depreciación…) |
| `packages/forecast` | Series de tiempo, regresión, procesos estocásticos |
| `packages/optimizer` | Algoritmos de optimización y optimización estocástica |
| `packages/workbook` | Lectura/escritura xlsx y csv, motor HyperFormula, evaluador del modelo, Web Worker, informes, ejemplos |
| `apps/web` | Interfaz en React (`src/tools/` contiene las herramientas de análisis, pronóstico, optimización y finanzas) |
| `docs` | Documentación en VitePress (español en la raíz, inglés en `en/`) |

## Pautas

- Código, identificadores, comentarios y mensajes de commit en **inglés**; todo texto de la interfaz pasa por i18n con
  traducción en **español e inglés**.
- El código numérico necesita pruebas contra valores de referencia (Excel, R, SciPy, un libro). Indica la fuente en la prueba.
- Evita agregar dependencias a los paquetes; si hace falta una, discútelo primero en un issue.
- Los paquetes se consumen desde el código fuente (`src/index.ts`); no hay compilación por paquete.
- Se agradecen los [commits convencionales](https://www.conventionalcommits.org/es/): `feat(engine): …`, `fix(web): …`, `docs: …`.

### Agregar una distribución

1. Agrega el id a `DistributionId` y `DISTRIBUTION_IDS` en `packages/core/src/distributions.ts`.
2. Impleméntala en `packages/distributions/src/families/` y regístrala con metadatos bilingües en `registry.ts`.
3. Agrega pruebas (valores de referencia de densidad, acumulada y cuantiles; ida y vuelta del cuantil; momentos).

### Agregar una herramienta

Crea un componente en `apps/web/src/tools/<grupo>/`, regístralo en `apps/web/src/tools/registry.ts` y agrega sus
textos en `apps/web/src/tools/i18n/{es,en}.json`. Documéntala en `docs/herramientas/` y `docs/en/tools/`.

### Capturas e imágenes

`pnpm screenshots` regenera los íconos, los banners del README y las capturas usadas en el README y la documentación
(necesita Google Chrome o Chromium; define `CHROME_PATH` si no lo encuentra).

## Versiones

1. Actualiza `CHANGELOG.md` y la versión en `package.json`.
2. Crea el tag `vX.Y.Z` y un release en GitHub. Cada push a `main` ya publica la app y la documentación en GitHub Pages.

## Licencia

Al contribuir aceptas que tus aportes se publiquen bajo la licencia del proyecto,
[GPL-3.0-or-later](LICENSE).
