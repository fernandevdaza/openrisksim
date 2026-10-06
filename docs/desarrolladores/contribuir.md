# Cómo contribuir

¡Gracias por tu interés! Los *issues* y *pull requests* son bienvenidos **en español o en inglés**. Puedes contribuir de muchas formas: reportando errores, traduciendo, mejorando esta documentación, agregando ejemplos o programando nuevas funciones.

::: tip Sin programar
- Reporta errores o resultados sospechosos en [GitHub Issues](https://github.com/fernandevdaza/openrisksim/issues), adjuntando (si puedes) el `.xlsx` y los pasos para reproducirlo.
- Mejora esta documentación con el enlace **«Editar esta página en GitHub»** al pie de cada página.
- Propón ejemplos de modelos para cursos de evaluación de proyectos.
:::

## Entorno de desarrollo

Requisitos: [Node.js](https://nodejs.org) ≥ 20 y pnpm (`corepack enable`).

```bash
git clone https://github.com/fernandevdaza/openrisksim.git
cd openrisksim
pnpm install
pnpm dev                                   # app web en http://localhost:5173
pnpm test                                  # pruebas unitarias (Vitest)
pnpm typecheck                             # TypeScript en todo el monorepo
pnpm --filter @openrisksim/web build       # compilación de producción de la app
pnpm --filter @openrisksim/docs dev        # este sitio de documentación
pnpm --filter @openrisksim/docs build      # compilación del sitio (falla si hay enlaces rotos)
```

## Pruebas

- Las pruebas viven junto al código: `packages/*/src/**/*.test.ts` y `apps/*/src/**/*.test.{ts,tsx}`.
- `pnpm test` las ejecuta todas; `pnpm test:watch` en modo observación.
- **Todo código numérico necesita pruebas contra valores de referencia** (Excel, R, SciPy). Indica en la prueba de dónde sale el valor de referencia (por ejemplo, `# scipy.stats.gamma(2, scale=10).ppf(0.95)`). Hay utilidades y datos de referencia en `packages/distributions/src/testdata/`.

## Convenciones

- Código, identificadores, comentarios y mensajes de commit en **inglés**; las cadenas de la interfaz pasan por i18n (**siempre en `es` y `en`**).
- No agregues dependencias a los paquetes sin discutirlo primero en un *issue*; se prefiere matemática en TypeScript puro.
- Los paquetes se consumen desde el código fuente (`src/index.ts`); no hay compilación por paquete.
- *Commits* convencionales: `feat(engine): …`, `fix(web): …`, `docs: …`, `test(finance): …`.

## Agregar una distribución

1. Agrega el id al tipo `DistributionId` y a `DISTRIBUTION_IDS` en `packages/core/src/distributions.ts`.
2. Implementa la familia (pdf, cdf, cuantil, media, varianza) en `packages/distributions/src/families/` y regístrala en `FAMILY_FACTORIES` (`families/index.ts`).
3. Agrega sus metadatos bilingües (nombre, descripción, uso típico y parámetros con claves, etiquetas, valores predeterminados y rangos) a `DISTRIBUTION_META` en `packages/distributions/src/registry.ts`, y las validaciones cruzadas que necesite.
4. Opcional: un estimador para el ajuste en `fitting.ts`, y valores sugeridos a partir del valor de la celda en `apps/web/src/dialogs/distributionThumbs.ts`.
5. Pruebas: valores de referencia de pdf/cdf/cuantil, ida y vuelta cuantil↔cdf y momentos.

La [referencia de distribuciones](../referencia/distribuciones) de este sitio se genera desde `DISTRIBUTION_META`, así que se actualizará sola.

## Agregar una herramienta a la cinta

1. Crea el componente en `apps/web/src/tools/<grupo>/MiHerramienta.tsx` (exportación por defecto, props `{ onClose(): void }`). Reutiliza las piezas de `apps/web/src/tools/common/` (`HelpBox`, `Section`, `ExportButton`, `DataSourceInput`, gráficos y formato).
2. Regístrala en `TOOLS` en `apps/web/src/tools/registry.ts` con su `id`, pestaña (`analysis`, `forecast`, `optimization` o `finance`), etiqueta bilingüe, ícono de lucide y tamaño.
3. Agrega sus textos a `apps/web/src/tools/i18n/es.json` y `en.json`.
4. Documenta la herramienta en `docs/herramientas/` y `docs/en/tools/`.

## Traducciones

- Textos de la interfaz principal: `apps/web/src/i18n/{es,en}.json`.
- Textos de las herramientas: `apps/web/src/tools/i18n/{es,en}.json` (espacio de nombres `tools`).
- Metadatos de distribuciones y ejemplos: objetos `{ es, en }` en el código (`registry.ts`, `examples.ts`).
- Documentación: español en `docs/` y inglés en `docs/en/`, con la misma estructura.

## Documentación

Este sitio usa [VitePress](https://vitepress.dev). Las páginas en español están en la raíz de `docs/` y las inglesas en `docs/en/`. La configuración (menús, barras laterales, idiomas) está en `docs/.vitepress/config.mts` y el tema en `docs/.vitepress/theme/`. Las capturas de pantalla van en `docs/public/screenshots/{es,en}/`.

## Publicación

La rama `main` se publica automáticamente en GitHub Pages mediante GitHub Actions: la app web en `/openrisksim/` y este sitio en `/openrisksim/docs/`. La integración continua ejecuta `pnpm typecheck`, `pnpm test` y la compilación en cada *pull request*.

## Licencia

Al contribuir aceptas que tu aporte se publique bajo la licencia **GPL-3.0-or-later** del proyecto.
