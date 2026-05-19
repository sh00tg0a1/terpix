# nl-planner

## Goal

Turn natural-language prompt into deterministic scene plan JSON consumable by `scene-renderer`.

## User-visible behavior

```bash
terpix plan "宇宙飞船穿越星云" --duration 20s --out plan.json
terpix play "宇宙飞船穿越星云"     # plan inline, render, play
```

## Inputs

- prompt: string (required)
- duration: human-readable (`20s`, `1m30s`) — default 15s
- model: `--model claude-sonnet-4-6` (default) | other
- seed: optional int for reproducibility

## Output

JSON conforming to [scene-plan schema](../design-docs/scene-plan-schema.md).

## Edge cases

- Empty prompt → exit 1 with hint.
- LLM returns prose around JSON → planner extracts via regex + retries with stricter system prompt.
- Total shot duration mismatches requested duration → planner rescales proportionally.
- Non-Latin prompts → preserve as-is in `imagePrompt`; image-gen adapter handles tokenization.

## Reference

- LLM adapter: `src/adapters/llm/`
- Schema: `src/core/scene-plan.ts`
