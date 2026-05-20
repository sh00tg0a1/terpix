import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ScenePlan, type ScenePlanT } from '../../core/dsl.js';
import { buildSystemPrompt } from './system-prompt.js';
import { spriteEnumForSchema } from './asset-catalog.js';

export interface PlanReq {
  prompt: string;
  durationMs: number;
  size?: { w: number; h: number };
  fps?: number;
  renderer?: 'half' | 'ascii';
  style?: string;
  model?: string;
  maxRetries?: number;
  client?: Anthropic; // injectable for tests
}

export interface PlanOk {
  ok: true;
  plan: ScenePlanT;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  attempts: number;
}

export interface PlanErr {
  ok: false;
  error: string;
  attempts: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Inject the current asset registry into the JSON Schema so the tool input
// is constrained at the API level. We patch the sprite layer's `asset`
// field to be an enum of the live registry names.
function buildInputSchema(renderer: 'half' | 'ascii'): Record<string, unknown> {
  const base = zodToJsonSchema(ScenePlan, { target: 'openApi3' }) as Record<string, unknown>;
  const enumNames = spriteEnumForSchema({ renderer });
  // The discriminated union may live under various paths depending on
  // zod-to-json-schema's output shape. Walk and patch all `asset` props
  // sitting inside an object that also has `type: 'sprite'`.
  patchSpriteAssetEnum(base, enumNames);
  return base;
}

function patchSpriteAssetEnum(node: unknown, names: string[]): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  // Heuristic: detect sprite-layer object schemas.
  if (
    obj['properties'] &&
    typeof obj['properties'] === 'object' &&
    (obj['properties'] as Record<string, unknown>)['type'] &&
    (obj['properties'] as Record<string, unknown>)['asset']
  ) {
    const props = obj['properties'] as Record<string, unknown>;
    const typeSchema = props['type'] as Record<string, unknown>;
    if (typeSchema && (typeSchema['const'] === 'sprite' || typeSchema['enum']?.toString().includes('sprite'))) {
      props['asset'] = { type: 'string', enum: names };
    }
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) v.forEach((x) => patchSpriteAssetEnum(x, names));
    else patchSpriteAssetEnum(v, names);
  }
}

export async function planFromNL(req: PlanReq): Promise<PlanOk | PlanErr> {
  const model = req.model ?? DEFAULT_MODEL;
  const renderer = req.renderer ?? 'half';
  const maxRetries = req.maxRetries ?? 3;
  const client = req.client ?? new Anthropic();

  const system = buildSystemPrompt({ renderer });
  const inputSchema = buildInputSchema(renderer);

  const sizeHint = req.size ? ` Target canvas: ${req.size.w}x${req.size.h} cells.` : '';
  const styleHint = req.style ? ` Style preset: ${req.style}.` : '';
  const baseUserMsg =
    `Prompt: "${req.prompt}"\n` +
    `Total duration: ${req.durationMs} ms.\n` +
    `fps: ${req.fps ?? 24}.${sizeHint}${styleHint}`;

  let lastErr: string | undefined;
  let totalIn = 0;
  let totalOut = 0;
  let totalCacheRead = 0;
  let totalCacheCreate = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const userMsg =
      attempt === 1
        ? baseUserMsg
        : baseUserMsg +
          `\n\nThe previous attempt failed schema validation:\n${lastErr}\n` +
          `Re-emit a corrected plan; use only listed asset names and the exact field shapes.`;
    const resp = await client.messages.create({
      model,
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [
        {
          name: 'submit_plan',
          description:
            'Submit the final ScenePlan v1 JSON for rendering. Call exactly once with the plan as the tool input.',
          input_schema: inputSchema as Anthropic.Messages.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_plan' },
      messages: [{ role: 'user', content: userMsg }],
    });

    const usage = resp.usage as unknown as {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    totalIn += usage?.input_tokens ?? 0;
    totalOut += usage?.output_tokens ?? 0;
    totalCacheRead += usage?.cache_read_input_tokens ?? 0;
    totalCacheCreate += usage?.cache_creation_input_tokens ?? 0;

    const tool = resp.content.find((b) => b.type === 'tool_use');
    if (!tool || tool.type !== 'tool_use') {
      lastErr = 'LLM did not call submit_plan';
      continue;
    }
    const parsed = ScenePlan.safeParse(tool.input);
    if (parsed.success) {
      return {
        ok: true,
        plan: parsed.data,
        inputTokens: totalIn,
        outputTokens: totalOut,
        cacheReadTokens: totalCacheRead,
        cacheCreateTokens: totalCacheCreate,
        attempts: attempt,
      };
    }
    lastErr = parsed.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
  }

  return {
    ok: false,
    error: `planFromNL failed after ${maxRetries} attempts: ${lastErr ?? 'unknown'}`,
    attempts: maxRetries,
  };
}
