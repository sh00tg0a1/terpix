# LLM integration

## Decision

Use the Anthropic Messages API with **`tool_use`** as the structured-output mechanism. The LLM is forced to call exactly one tool (`submit_plan`) whose `input_schema` is the project's zod ScenePlan schema converted to JSON Schema.

The **system prompt is partly generated from code** — anything that can drift away from the actual capability surface (asset list, layer types, particle kinds) is derived programmatically; only narrative guidance and few-shot examples are hand-written.

## Why tool_use, not JSON-in-prose

- LLM output is type-checked by the API against `input_schema` — fewer parse failures.
- No fragile JSON extraction from prose.
- Anthropic's `tool_choice: { type: 'tool', name: 'submit_plan' }` makes the call mandatory.
- Prefill (`{` + stop sequence) is the fallback if tool_use is unavailable for some model — not the default.

## Why derived context

Hand-writing "Available sprites: spaceship, planet, ..." inside a system prompt creates a **dual source of truth**. Code changes; prompt rots; LLM proposes nonexistent assets → zod fails. Instead:

| LLM context piece | Source |
|---|---|
| ScenePlan structure (fields, types, ranges) | `ScenePlan` zod schema → `zod-to-json-schema` → `input_schema` |
| Asset list + descriptions | `ASSET_REGISTRY` → `assetCatalogMarkdown()` |
| Background types, layer types, particle kinds | enums in `dsl.ts` → JSON Schema |
| Style guidelines, "max 3 layers", contrast advice | Hand-written |
| Few-shot examples | Hand-written, validated by zod at build time |

A registry change automatically reaches the next LLM call.

## Anthropic call shape

```ts
import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ScenePlan } from '../../core/dsl.js';
import { buildSystemPrompt } from './system-prompt.js';
import { assetEnum } from './asset-catalog.js';

const client = new Anthropic();

// JSON Schema with the current asset enum injected
const schema = zodToJsonSchema(ScenePlan);
injectAssetEnum(schema, assetEnum());  // patches sprite.asset.enum

const resp = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,
  system: [
    { type: 'text', text: buildSystemPrompt(), cache_control: { type: 'ephemeral' } },
  ],
  tools: [
    {
      name: 'submit_plan',
      description: 'Submit the validated ScenePlan v1 to render.',
      input_schema: schema,
    },
  ],
  tool_choice: { type: 'tool', name: 'submit_plan' },
  messages: [{ role: 'user', content: userPrompt }],
});
```

## Prompt caching

The system prompt (≥4 KB after asset catalog + few-shot examples) is tagged `cache_control: { type: 'ephemeral' }`. After the first call, subsequent calls share the cache (5-minute TTL).

- Cache size: target 4–10 KB system prompt; cap at 20 KB.
- User message stays out of the cache (varies per request).
- Effect: ~10× cheaper system tokens after first hit; lower latency.

## Retry policy

- Up to **3 attempts** per `terpix plan` call.
- On `submit_plan` not called OR zod parse fail → append the validation error to the next user message and retry with stricter wording.
- After 3 fails → exit 1 with the last error JSON. Do not invent a plan.

## Failure surface

| Failure | Detection | UX |
|---|---|---|
| No `ANTHROPIC_API_KEY` | Anthropic client constructor | exit 2 + hint to set env var |
| Rate limit | SDK throws 429 | retry w/ jittered backoff (max 3) |
| Bad JSON shape | zod safeParse | retry up to 3, then surface zod error |
| Plan asset not in registry | Runtime check in compositor | exit 1 with the unknown name |
| Network outage | SDK throws | exit 2 with hint |

## Caching the plan output (separate from prompt cache)

Once a plan is produced, cache `{prompt, size, fps, seed, model, planner-version} → plan.json` on disk under `~/.cache/terpix/plans/`. Re-rendering the same prompt is fully offline and instant.

`terpix cache clear` flushes.

## CLI integration

```bash
terpix plan "宇宙飞船穿越星云" --duration 15s -o plan.json
terpix play "宇宙飞船穿越星云"                      # NL → plan inline → render
terpix play sample.mp4                              # file → ffmpeg → render
terpix render-plan plan.json                        # render a saved plan
```

Dispatch in `play`: if `fs.existsSync(input) && isVideoFile(input)` → ffmpeg path; else → NL planner path.

## Eval coupling

- Capability tasks live in `docs/evals/tasks/`.
- Each task captures (prompt, expected properties) — schema validity, duration bounds, presence of required assets, optional LLM rubric.
- Run with `npm run test:evals` (planned). Capability suite informational; regression suite blocks merges.

## Model policy

- Default: `claude-sonnet-4-6` — cheap, fast, capable.
- `--model` flag overrides.
- Opus reserved for "creative" mode or for hard prompts after retries.

## Cost ballpark (sonnet-4-6, May 2026 prices indicative)

| Item | Tokens | Cost |
|---|---|---|
| System prompt first call | ~5 K | ~$0.015 |
| System prompt cached call | ~5 K | ~$0.0015 |
| User prompt | ~50 | negligible |
| Plan output | ~800–1500 | ~$0.012–0.022 |
| **Per video (first call)** | | **~$0.03** |
| **Per video (cache hit)** | | **~$0.02** |

One LLM call per video — not per shot, never per frame.

## Anti-patterns

- **Hand-syncing asset list into prompt** — drift waiting to happen.
- **Storing API keys in plan files** — secrets stay in env only.
- **Logging full system prompt at INFO** — pollutes logs; `--debug` only.
- **Calling LLM during rendering** — planner is pre-render; never mid-stream.
- **Trusting LLM JSON without zod** — even with tool_use, validate at the boundary.

## Related

- [asset-system.md](asset-system.md) — registry feeds the prompt
- [scene-plan-schema.md](scene-plan-schema.md) — the schema being enforced
- [/docs/product-specs/nl-planner.md](../product-specs/nl-planner.md) — product surface
- [/docs/evals/index.md](../evals/index.md) — evaluation strategy
