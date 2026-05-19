# nl-planner

## Goal

Turn a natural-language prompt into a deterministic scene plan JSON that conforms to ScenePlan v1, consumable by the procedural compositor.

## User-visible behavior

```bash
terpix plan "宇宙飞船穿越星云" --duration 20s --out plan.json
terpix play "宇宙飞船穿越星云"                       # plan + render inline
terpix play "宇宙飞船穿越星云" --model claude-opus-4-7
```

## Inputs

- `prompt`: string, required.
- `--duration`: human-readable (`20s`, `1m30s`); default `15s`.
- `--model`: defaults to `claude-sonnet-4-6`.
- `--seed`: optional int for reproducibility; the planner asks the LLM to fix random seeds in the plan.
- `--out`: file path; `-` for stdout.
- Inherited from CLI: `--size`, `--fps`, `--debug`.

## Output

JSON conforming to [scene-plan-schema](../design-docs/scene-plan-schema.md), validated by zod before being returned.

## Implementation

See [docs/design-docs/llm-integration.md](../design-docs/llm-integration.md) for the full design rationale.

Summary:

- Anthropic Messages API with `tool_use`; `submit_plan` tool input_schema = zod ScenePlan → JSON Schema.
- System prompt built per-call from code:
  - Asset enum + descriptions from `ASSET_REGISTRY`.
  - DSL grammar from zod / JSON Schema.
  - Style guidelines + few-shot hand-written.
- `cache_control: ephemeral` on the system block — subsequent calls cheaper.
- Up to 3 retries on zod fail; failure surfaced with the last error.
- Plan output cached to `~/.cache/terpix/plans/<hash>.json`; key = `{prompt, size, fps, seed, model, planner-version}`.

## Edge cases

- Empty prompt → exit 1 with hint.
- No `ANTHROPIC_API_KEY` → exit 2 with hint to set it.
- LLM call exceeds retry budget → exit 1, dump the last zod error.
- Plan references an asset not in the registry → compositor exits 1 with the unknown name and a nearest-name suggestion.
- Non-Latin prompts → preserved as-is in `imagePrompt`-like fields; LLM may translate or keep verbatim.
- Total shot duration mismatches requested → planner is asked to rescale; if off by >5%, retry; if still off, accept and warn.

## Reference

- [docs/design-docs/llm-integration.md](../design-docs/llm-integration.md)
- [docs/design-docs/asset-system.md](../design-docs/asset-system.md)
- `src/adapters/llm/anthropic.ts` — client adapter (planned)
- `src/adapters/llm/system-prompt.ts` — prompt builder (planned)
- `src/adapters/llm/asset-catalog.ts` — registry → LLM markdown (planned)
- `src/core/dsl.ts` — zod schema (current)
