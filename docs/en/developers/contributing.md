# Contributing

Thanks for your interest! Issues and pull requests are welcome **in English or Spanish**. You can contribute in many ways: reporting bugs, translating, improving these docs, adding example models or writing code.

::: tip No coding required
- Report bugs or suspicious results on [GitHub Issues](https://github.com/fernandevdaza/openrisksim/issues), attaching (if possible) the `.xlsx` and steps to reproduce.
- Improve these docs with the **“Edit this page on GitHub”** link at the bottom of every page.
- Propose example models for project-evaluation courses.
:::

## Development setup

Requirements: [Node.js](https://nodejs.org) ≥ 20 and pnpm (`corepack enable`).

```bash
git clone https://github.com/fernandevdaza/openrisksim.git
cd openrisksim
pnpm install
pnpm dev                                   # web app at http://localhost:5173
pnpm test                                  # unit tests (Vitest)
pnpm typecheck                             # TypeScript across the monorepo
pnpm --filter @openrisksim/web build       # production build of the app
pnpm --filter @openrisksim/docs dev        # this documentation site
pnpm --filter @openrisksim/docs build      # docs build (fails on dead links)
```

## Tests

- Tests live next to the code: `packages/*/src/**/*.test.ts` and `apps/*/src/**/*.test.{ts,tsx}`.
- `pnpm test` runs them all; `pnpm test:watch` in watch mode.
- **Numerical code needs tests against reference values** (Excel, R, SciPy). State the source of the reference in the test (e.g. `# scipy.stats.gamma(2, scale=10).ppf(0.95)`). Helpers and reference data live in `packages/distributions/src/testdata/`.

## Guidelines

- Code, identifiers, comments and commit messages in **English**; UI strings go through i18n (**always `es` and `en`**).
- Don't add dependencies to packages without discussing it in an issue first; pure TypeScript math is preferred.
- Packages are consumed from source (`src/index.ts`); there is no per-package build.
- Conventional commits: `feat(engine): …`, `fix(web): …`, `docs: …`, `test(finance): …`.

## Adding a distribution

1. Add the id to the `DistributionId` type and to `DISTRIBUTION_IDS` in `packages/core/src/distributions.ts`.
2. Implement the family (pdf, cdf, quantile, mean, variance) in `packages/distributions/src/families/` and register it in `FAMILY_FACTORIES` (`families/index.ts`).
3. Add its bilingual metadata (name, description, typical use and parameters with keys, labels, defaults and ranges) to `DISTRIBUTION_META` in `packages/distributions/src/registry.ts`, plus any cross-parameter validation.
4. Optional: a fitting estimator in `fitting.ts`, and suggested values from the cell value in `apps/web/src/dialogs/distributionThumbs.ts`.
5. Tests: pdf/cdf/quantile reference values, quantile↔cdf round-trip and moments.

This site's [distribution reference](../reference/distributions) is generated from `DISTRIBUTION_META`, so it updates itself.

## Adding a ribbon tool

1. Create the component in `apps/web/src/tools/<group>/MyTool.tsx` (default export, props `{ onClose(): void }`). Reuse the building blocks in `apps/web/src/tools/common/` (`HelpBox`, `Section`, `ExportButton`, `DataSourceInput`, charts and formatting).
2. Register it in `TOOLS` in `apps/web/src/tools/registry.ts` with its `id`, tab (`analysis`, `forecast`, `optimization` or `finance`), bilingual label, lucide icon and size.
3. Add its strings to `apps/web/src/tools/i18n/es.json` and `en.json`.
4. Document it in `docs/herramientas/` and `docs/en/tools/`.

## Translations

- Main interface strings: `apps/web/src/i18n/{es,en}.json`.
- Tool strings: `apps/web/src/tools/i18n/{es,en}.json` (`tools` namespace).
- Distribution and example metadata: `{ es, en }` objects in code (`registry.ts`, `examples.ts`).
- Documentation: Spanish at the root of `docs/`, English under `docs/en/`, same structure.

## Documentation

This site uses [VitePress](https://vitepress.dev). Spanish pages are at the root of `docs/` and English ones under `docs/en/`. Configuration (menus, sidebars, locales) is in `docs/.vitepress/config.mts` and the theme in `docs/.vitepress/theme/`. Screenshots go in `docs/public/screenshots/{es,en}/`.

## Releasing

`main` is deployed automatically to GitHub Pages by GitHub Actions: the web app at `/openrisksim/` and this site at `/openrisksim/docs/`. CI runs `pnpm typecheck`, `pnpm test` and the build on every pull request.

## Licence

By contributing you agree that your contributions are licensed under the project's **GPL-3.0-or-later** licence.
