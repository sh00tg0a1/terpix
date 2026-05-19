# Deterministic graders

## Conventions

- Tests live under `tests/evals/`. Same vitest runner as unit tests; tagged with `evals` suite.
- Name pattern: `<area>-<aspect>.test.ts` (e.g. `planner-schema.test.ts`).
- Each grader test reads task YAML from `docs/evals/tasks/` and asserts properties of the captured trial output.

## Categories

| Category | Example | Notes |
|---|---|---|
| Schema validation | scene plan parses zod | hard fail |
| State check | total duration within tolerance | hard fail |
| Snapshot | encoder bytes match fixture | regen via `--update-snapshots` after intentional change |
| Exit code | `terpix play` on dumb TTY exits 2 | hard fail |
| Tool-call hint | planner called LLM exactly once | sparingly — brittle |

## CI

`npm run test:evals` runs in CI on every PR. Capability suite informational; regression suite blocks merge on failure.

Prefer grading **outcomes** (final plan, final frame bytes) over **step order** — agent paths may vary while end state is correct.
