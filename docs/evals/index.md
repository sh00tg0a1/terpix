# Evals

## Purpose

Measure NL-planner quality, encoder fidelity, and end-to-end pipeline robustness. Evals live in-repo; runner is a thin script (added Phase 3).

## Suites

| Suite | Type | Focus |
|---|---|---|
| `planner-capability` | capability | NL → scene plan: schema validity, prompt fidelity, duration math |
| `encoder-snapshot` | regression | Frame snapshots per backend on fixture RGB inputs |
| `cli-contract` | regression | CLI flag parsing, exit codes, error messages |
| `terminal-restore` | regression | After crash/SIGINT, terminal state is restored |

## Grader policy

- Deterministic first: JSON schema validation, snapshot diff, exit-code match.
- LLM rubric: for "does the plan match the prompt's vibe?" — see `graders/rubrics.md`.
- Human calibration: monthly spot check on planner outputs.

## Baselines

`results/baselines/` — store JSON summaries. CI uploads diff vs prior baseline.

## Related

- [docs/QUALITY_SCORE.md](../QUALITY_SCORE.md) — eval coverage / regression rows.
- [docs/exec-plans/](../exec-plans/) — debt for eval gaps.
- [docs/evals/tasks/](tasks/) — task definitions.
- [docs/evals/graders/](graders/) — grader specs.

## Tooling

MVP: vitest can host deterministic graders. LLM rubrics call Anthropic SDK directly. Consider Braintrust / Phoenix when suite >50 tasks.
