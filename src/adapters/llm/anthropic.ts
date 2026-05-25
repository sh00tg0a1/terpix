import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Scene2 } from '../../core/scene2/schema.js';
import { compileScene, dropUnregisteredSprites } from '../../core/scene2/compile.js';
import { buildScenePrompt } from './scene-prompt.js';
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

// Any object schema with an `asset` property is an asset reference (the v2
// sprite node) — constrain it to the live registry names so the API rejects
// hallucinated assets.
function patchSpriteAssetEnum(node: unknown, names: string[]): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (obj['properties'] && typeof obj['properties'] === 'object') {
    const props = obj['properties'] as Record<string, unknown>;
    if (props['asset']) props['asset'] = { type: 'string', enum: names };
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

  const system = buildScenePrompt({ renderer });
  const schema = zodToJsonSchema(Scene2, { target: 'openApi3' }) as Record<string, unknown>;
  patchSpriteAssetEnum(schema, spriteEnumForSchema({ renderer }));

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
          `Re-emit a corrected scene. Use only listed asset names and field shapes; ` +
          `address each numbered issue above.`;
    let resp: Awaited<ReturnType<typeof client.messages.create>>;
    try {
      resp = await client.messages.create({
        model,
        max_tokens: 4096,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools: [
          {
            name: 'submit_plan',
            description:
              'Submit the final Scene v2 (relational scene) JSON. Call exactly once with the scene as the tool input.',
            input_schema: schema as Anthropic.Messages.Tool.InputSchema,
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
    const parsed = Scene2.safeParse(tool.input);
    if (!parsed.success) {
      lastErr = parsed.error.issues
        .slice(0, 8)
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ');
      continue;
    }
    // Compile the relational scene to a v1 plan; critics + render run on it.
    let plan;
    try {
      plan = compileScene(parsed.data);
    } catch (err) {
      lastErr = `scene failed to compile: ${(err as Error).message}`;
      continue;
    }
    const dropped = dropUnregisteredSprites(plan);
    if (dropped > 0) process.stderr.write(`terpix plan: dropped ${dropped} layer(s) referencing unknown assets\n`);
    // Blind heuristic and vision critics are COMPLEMENTARY and run together:
    // blind catches countable/structural misses, vision catches perceptual
    // ones. Vision is not gated behind a blind pass — we gather both and retry
    // once with the union of complaints.
    const critique = critiquePlan(req.prompt, plan);
    const complaints: string[] = [];
    if (!critique.ok) {
      complaints.push(`the plan parses but does not match the prompt:\n${formatIssuesForRetry(critique)}`);
    }
    if (req.vision && (req.vision.rounds ?? 1) > 0 && attempt < maxRetries) {
      const vc = await visionCritiquePlan(req.prompt, plan, {
        apiKey: req.vision.apiKey,
        ...(req.vision.baseURL ? { baseURL: req.vision.baseURL } : {}),
        model: req.vision.model,
      });
      if ('error' in vc) {
        process.stderr.write(`terpix plan: vision critic skipped: ${vc.error}\n`);
      } else {
        req.vision = { ...req.vision, rounds: (req.vision.rounds ?? 1) - 1 };
        if (!vc.ok) {
          complaints.push(
            `a vision review of the rendered preview frame flagged these ` +
              `issues:\n${formatVisionIssuesForRetry(vc)}`,
          );
        }
      }
    }
    if (complaints.length > 0 && attempt < maxRetries) {
      lastErr = complaints.join('\n\n');
      continue;
    }
    return {
      ok: true,
      plan,
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
