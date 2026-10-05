# Contributing to OpenRiskSim

¡Gracias por tu interés! / Thanks for your interest! Issues and pull requests are welcome in Spanish or English.

## Development setup

Requirements: Node.js ≥ 20 and pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev          # web app at http://localhost:5173
pnpm test         # all unit tests (Vitest)
pnpm typecheck    # TypeScript across the monorepo
pnpm --filter @openrisksim/web build
```

## Project layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In short:

| Package | Responsibility |
|---|---|
| `packages/core` | Shared types only (no logic) |
| `packages/distributions` | RNG, special functions, probability distributions, distribution fitting |
| `packages/engine` | Sampling (Monte Carlo / Latin Hypercube), correlations, statistics, simulation runner, sensitivity |
| `packages/finance` | Project-evaluation finance (NPV, IRR, MIRR, payback, cash-flow builder, loans, depreciation…) |
| `packages/forecast` | Time-series forecasting, regression, stochastic processes |
| `packages/optimizer` | Optimization (Nelder–Mead, genetic algorithm, simulated annealing), stochastic optimization |
| `packages/workbook` | xlsx/csv I/O, HyperFormula spreadsheet engine, model evaluator, Web Worker, reports, examples |
| `apps/web` | React UI |

## Guidelines

- Code, identifiers, comments and commit messages in **English**; UI strings go through i18n (`es` + `en` — please add both).
- Numerical code needs tests against reference values (Excel, R, SciPy). State the source of the reference in the test.
- Keep packages dependency-free unless there is a strong reason; discuss new dependencies in an issue first.
- Packages are consumed from source (`src/index.ts`); there is no per-package build.
- Conventional commits are appreciated (`feat(engine): …`, `fix(web): …`).

## Adding a distribution

1. Add the id to `DistributionId` and `DISTRIBUTION_IDS` in `packages/core/src/distributions.ts`.
2. Implement the family in `packages/distributions/src/families/` and register it with bilingual metadata.
3. Add tests (pdf/cdf/quantile reference values, round-trip, moments).

## Adding a tool to the UI

Create a component in `apps/web/src/tools/<your-tool>/`, register it in `apps/web/src/tools/registry.ts`, and add translations to `apps/web/src/tools/i18n/{es,en}.json`.

## License

By contributing you agree that your contributions are licensed under the GPL-3.0-or-later license of the project.
