# Quality scorecard

Greenfield repo. Concrete signals not yet present — populate as scaffolding lands.

| Criterion | Target | Signal | Status |
|---|---|---|---|
| Typecheck | `tsc --noEmit` clean | `tsconfig.json` | TBD |
| Unit tests | vitest green | `vitest.config.ts` | TBD |
| Lint | eslint + prettier clean | `.eslintrc` | TBD |
| Coverage | ≥70% core | vitest `--coverage` | TBD |
| Docs freshness | Adapter/CLI change touches matching `product-specs/*.md` | PR review | TBD |
| Eval coverage | ≥1 capability task per encoder mode | `docs/evals/tasks/` | TBD |
| Regression pass | 100% on graduated tasks | `docs/evals/results/baselines/` | TBD |
| Baseline freshness | Re-run on planner/prompt change | CI artifact | TBD |
| Terminal compat matrix | Manual run on 5 TTYs per release | `docs/product-specs/terminal-driver.md` | TBD |
