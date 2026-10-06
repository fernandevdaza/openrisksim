<p align="right"><b>English</b> · <a href="CONTRIBUTING.es.md">Español</a></p>

# Contributing to OpenRiskSim

Thanks for helping! OpenRiskSim was born so students can do risk analysis on any computer. Issues and pull requests are
welcome in **Spanish or English**. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Report bugs** — especially wrong numbers. Attach the `.xlsx` (without confidential data) and the expected value with
  its source (Excel, R, a textbook…).
- **Improve the docs** — tutorials, course examples, translations (`docs/`).
- **Add features** — distributions, tools, chart types. Open an issue first for anything big.

## Development setup

Requirements: Node.js ≥ 20 and pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev            # web app at http://localhost:5173
pnpm docs:dev       # documentation site
```

Before sending changes:

```bash
pnpm typecheck
pnpm test
pnpm --filter @openrisksim/web build
```

## Project layout

The monorepo is split into small packages with explicit contracts — see the
[architecture docs](https://fernandevdaza.github.io/openrisksim/docs/en/developers/architecture).

| Folder | Responsibility |
|---|---|
| `packages/core` | Shared types only (no logic) |
| `packages/distributions` | RNG, special functions, probability distributions, distribution fitting |
| `packages/engine` | Sampling (Monte Carlo / Latin Hypercube), correlations, statistics, simulation runner, sensitivity |
| `packages/finance` | Project finance (NPV, IRR, MIRR, payback, cash-flow builder, loans, depreciation…) |
| `packages/forecast` | Time-series forecasting, regression, stochastic processes |
| `packages/optimizer` | Optimization algorithms and stochastic optimization |
| `packages/workbook` | xlsx/csv I/O, HyperFormula engine, model evaluator, Web Worker, reports, examples |
| `apps/web` | React UI (`src/tools/` holds the analysis/forecast/optimization/finance tools) |
| `docs` | VitePress documentation (Spanish at the root, English under `en/`) |

## Guidelines

- Code, identifiers, comments and commit messages in **English**; every UI string goes through i18n with **both**
  `es` and `en` translations.
- Numerical code needs tests against reference values (Excel, R, SciPy, a textbook). Name the source in the test.
- Keep packages dependency-free unless there is a strong reason; discuss new dependencies in an issue first.
- Packages are consumed from source (`src/index.ts`); there is no per-package build step.
- [Conventional commits](https://www.conventionalcommits.org) are appreciated: `feat(engine): …`, `fix(web): …`, `docs: …`.

### Adding a distribution

1. Add the id to `DistributionId` and `DISTRIBUTION_IDS` in `packages/core/src/distributions.ts`.
2. Implement it in `packages/distributions/src/families/` and register it with bilingual metadata in `registry.ts`.
3. Add tests (pdf/cdf/quantile reference values, quantile round-trip, sample moments).

### Adding a tool

Create a component in `apps/web/src/tools/<group>/`, register it in `apps/web/src/tools/registry.ts` and add its
strings to `apps/web/src/tools/i18n/{es,en}.json`. Document it in `docs/herramientas/` and `docs/en/tools/`.

### Screenshots and images

`pnpm screenshots` rebuilds the icons, the README banners and the screenshots used by the README and the docs
(requires Google Chrome or Chromium; set `CHROME_PATH` if it is not found).

## Releases

1. Update `CHANGELOG.md` and the version in `package.json`.
2. Tag `vX.Y.Z` and create a GitHub release. Every push to `main` already deploys the app and docs to GitHub Pages.

## License

By contributing you agree that your contributions are licensed under the project's
[GPL-3.0-or-later](LICENSE) license.
