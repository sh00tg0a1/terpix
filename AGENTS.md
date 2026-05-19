# terpix

Natural-language-driven terminal character-stream movie renderer. Take a prompt like `"宇宙飞船穿越星云"`, plan scenes, render frames, output to TTY (or `.mp4` / `.cast`).

## Priority order

1. Explicit user instructions (chat, PR comments)
2. This harness (`AGENTS.md` + `docs/`)
3. Model defaults

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (Node 20+) |
| Decode/encode | ffmpeg (via child_process or `fluent-ffmpeg`) |
| LLM | Anthropic / OpenAI SDK (adapter behind core) |
| Test | vitest |
| Lint | eslint + prettier |
| Build | tsup |

## Repo layout

| Path | Purpose |
|---|---|
| `src/core/` | Pure domain: scene plan, frame model, encoder strategy (no IO) |
| `src/adapters/` | LLM, ffmpeg, terminal backends, exporters |
| `src/cli/` | Command entry (play / render / record) |
| `docs/` | Harness — see [Quick nav](#quick-nav) |
| `tests/` | vitest specs |

## Quick nav

| Topic | File |
|---|---|
| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Design philosophy | [docs/DESIGN.md](docs/DESIGN.md) |
| Video vocabulary | [docs/design-docs/video-vocabulary.md](docs/design-docs/video-vocabulary.md) |
| Roadmap | [docs/PLANS.md](docs/PLANS.md) |
| Product sense | [docs/PRODUCT_SENSE.md](docs/PRODUCT_SENSE.md) |
| Quality scorecard | [docs/QUALITY_SCORE.md](docs/QUALITY_SCORE.md) |
| Reliability | [docs/RELIABILITY.md](docs/RELIABILITY.md) |
| Security | [docs/SECURITY.md](docs/SECURITY.md) |
| Product specs | [docs/product-specs/index.md](docs/product-specs/index.md) |
| Design docs | [docs/design-docs/index.md](docs/design-docs/index.md) |
| Exec plans | [docs/exec-plans/](docs/exec-plans/) |
| Evals | [docs/evals/index.md](docs/evals/index.md) |
| Superpowers workflow | [docs/superpowers/workflow.md](docs/superpowers/workflow.md) |

## How to use this harness

| Scenario | Start here | Then |
|---|---|---|
| New feature | `docs/product-specs/<domain>.md` | Create plan in `docs/exec-plans/active/` → implement → move to `completed/` |
| Bug fix | `docs/RELIABILITY.md` + `docs/SECURITY.md` | Fix → update `docs/QUALITY_SCORE.md` |
| Architecture change | `ARCHITECTURE.md` | Add `docs/design-docs/<name>.md` → link from index → implement |

For tech debt, doc maintenance, and other workflows see [docs/PLANS.md](docs/PLANS.md).

## Secrets & logging

- LLM API keys: env vars only (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`). Never commit `.env`.
- Never log full prompts containing user PII; redact at adapter boundary.
- ffmpeg stderr is verbose — gate behind `--debug`.

## Testing bar

- `vitest run` green before merge.
- New adapter → contract test against fake.
- New encoder mode → snapshot of rendered frame fixture.

## Evals

LLM scene planner quality measured via [docs/evals/index.md](docs/evals/index.md). Tasks under `docs/evals/tasks/`. Graders in `docs/evals/graders/`.

## Superpowers

Design → Plan → Execute workflow: [docs/superpowers/workflow.md](docs/superpowers/workflow.md). Dated specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`.
