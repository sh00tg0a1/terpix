# Quality scorecard

Greenfield repo. Concrete signals not yet present — populate as scaffolding lands.

| Criterion | Target | Signal | Status |
|---|---|---|---|
| Typecheck | `tsc --noEmit` clean | `tsconfig.json` present, `npm run typecheck` passes | ✅ passing |
| Unit tests | vitest green | `vitest.config.ts`, 5 tests in `tests/half-block.test.ts` | ✅ 5/5 passing |
| Lint | eslint + prettier clean | `eslint.config.js`, `.prettierrc` | TBD (not yet run in CI) |
| Coverage | ≥70% core | vitest `--coverage` (v8 provider configured) | TBD |
| Docs freshness | Adapter/CLI change touches matching `product-specs/*.md` | PR review | TBD |
| Eval coverage | ≥1 capability task per encoder mode | `docs/evals/tasks/` | TBD |
| Regression pass | 100% on graduated tasks | `docs/evals/results/baselines/` | TBD |
| Baseline freshness | Re-run on planner/prompt change | CI artifact | TBD |
| Terminal compat matrix | Manual run on 5 TTYs per release | `docs/product-specs/terminal-driver.md` | TBD |
