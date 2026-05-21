import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ScenePlan } from '../../core/dsl.js';
import { buildSystemPrompt } from './system-prompt.js';
import { spriteEnumForSchema } from './asset-catalog.js';
import { friendlyApiError } from './errors.js';
import { critiquePlan, formatIssuesForRetry } from './plan-critic.js';
import { visionCritiquePlan, formatVisionIssuesForRetry } from './vision-critic.js';
import { getAnthropicApiKey } from '../../core/config.js';
import type { PlanReq, PlanOk, PlanErr } from './types.js';

export function hasAnthropicApiKey(): boolean {
  return !!getAnthropicApiKey();
}

interface AnthropicCfg {
  apiKey: string;
  defaultModel: string;
}

// Inject the current asset registry into the JSON Schema so the tool input
// is constrained at the API level. We patch the sprite layer's `asset`
// field to be an enum of the live registry names.
function buildInputSchema(renderer: 'half' | 'ascii'): Record<string, unknown> {
  const base = zodToJsonSchema(ScenePlan, { target: 'openApi3' }) as Record<string, unknown>;
  const enumNames = spriteEnumForSchema({ renderer });
  patchSpriteAssetEnum(base, enumNames);
  return base;
}

function patchSpriteAssetEnum(node: unknown, names: string[]): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
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

export async function planFromNLAnthropic(req: PlanReq, cfg: AnthropicCfg): Promise<PlanOk | PlanErr> {
  const model = req.model ?? cfg.defaultModel;
  const renderer = req.renderer ?? 'half';
  const maxRetries = req.maxRetries ?? (req.vision ? 5 : 3);
  const client = req.client ?? new Anthropic({ apiKey: cfg.apiKey });

  const system = buildSystemPrompt({ renderer, prompt: req.prompt });
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
          `\n\nThe previous attempt was rejected. Reasons:\n${lastErr}\n\n` +
          `Re-emit a corrected plan. Use only listed asset names and field shapes; ` +
          `address each numbered issue above.`;
    let resp: Awaited<ReturnType<typeof client.messages.create>>;
    try {
      resp = await client.messages.create({
        model,
        max_tokens: 4096,
        system: [
          { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
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
    } catch (err) {
      return { ok: false, error: friendlyApiError(err), attempts: attempt };
    }

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
    if (!parsed.success) {
      lastErr = parsed.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      continue;
    }
    const critique = critiquePlan(req.prompt, parsed.data);
    if (!critique.ok && attempt < maxRetries) {
      lastErr =
        `the plan parses but does not match the prompt:\n${formatIssuesForRetry(critique)}`;
      continue;
    }
    if (req.vision && (req.vision.rounds ?? 1) > 0 && attempt < maxRetries) {
      const vc = await visionCritiquePlan(req.prompt, parsed.data, {
        apiKey: req.vision.apiKey,
        ...(req.vision.baseURL ? { baseURL: req.vision.baseURL } : {}),
        model: req.vision.model,
      });
      if ('error' in vc) {
        process.stderr.write(`terpix plan: vision critic skipped: ${vc.error}\n`);
      } else if (!vc.ok) {
        lastErr =
          `a vision review of the rendered preview frame flagged these ` +
          `issues:\n${formatVisionIssuesForRetry(vc)}`;
        req.vision = { ...req.vision, rounds: (req.vision.rounds ?? 1) - 1 };
        continue;
      }
    }
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

  return {
    ok: false,
    error: `planFromNL failed after ${maxRetries} attempts: ${lastErr ?? 'unknown'}`,
    attempts: maxRetries,
  };
}
