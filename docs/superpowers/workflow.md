# Superpowers workflow

## Priority

User instructions (chat, `AGENTS.md`) > Superpowers workflow > model defaults.

## Phases

1. **Gate** — clarify scope, confirm domain affected.
2. **Design** — write `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`. Reviewable before code.
3. **Plan** — write `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` with task list.
4. **Execute** — implement against plan. Update plan checkboxes.
5. **Debug** — surface failures; capture root cause in tech-debt-tracker if shortcut taken.
6. **Verify** — `vitest run`, lint, manual TTY test on at least 2 terminals.
7. **Ship** — move exec plan → `docs/exec-plans/completed/` if applicable.

## Artifacts

- Designs: `docs/superpowers/specs/`
- Plans: `docs/superpowers/plans/`
- Task-level exec plans: `docs/exec-plans/active/` → `completed/`
- Debt: `docs/exec-plans/tech-debt-tracker.md`

## Anti-patterns

- Starting code before accepted design for non-trivial work (new encoder, new adapter).
- Skipping verification before claiming "done".
- Squashing multiple unrelated changes into one design doc.

## Naming convention

- Design: `2026-05-19-half-block-encoder-design.md`
- Plan: `2026-05-19-mvp-half-block.md`
