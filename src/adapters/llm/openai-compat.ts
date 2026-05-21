import OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ScenePlan, type ScenePlanT } from '../../core/dsl.js';
import { buildSystemPrompt } from './system-prompt.js';
import { spriteEnumForSchema } from './asset-catalog.js';
import { friendlyApiError } from './errors.js';
import { critiquePlan, formatIssuesForRetry } from './plan-critic.js';
import { visionCritiquePlan, formatVisionIssuesForRetry } from './vision-critic.js';
import { buildVisualFewShot, type ContentPart } from './visual-fewshot.js';
import type { PlanReq, PlanOk, PlanErr } from './types.js';

interface OpenAICompatOpts {
  apiKey: string;
  baseURL?: string;
  defaultModel: string;
}

// MiniMax / OpenAI / self-hosted OpenAI-compatible providers share enough of
// the chat-completions API + function-calling shape that one adapter covers
// all three. Provider-specific quirks are handled by the caller picking
// model + baseURL.
export async function planFromNLOpenAICompat(
  req: PlanReq,
  cfg: OpenAICompatOpts,
): Promise<PlanOk | PlanErr> {
  const model = req.model ?? cfg.defaultModel;
  const renderer = req.renderer ?? 'half';
  // Critics need room: each semantic/vision rejection consumes one attempt.
  // With vision enabled, default to a larger budget so the loop can actually
  // converge instead of shipping the last (possibly-rejected) candidate.
  const maxRetries = req.maxRetries ?? (req.vision ? 5 : 3);

  const client =
    (req.openaiClient as OpenAI | undefined) ??
    new OpenAI({
      apiKey: cfg.apiKey,
      ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
    });

  const system = buildSystemPrompt({ renderer, prompt: req.prompt });
  const schema = zodToJsonSchema(ScenePlan, { target: 'openApi3' }) as Record<string, unknown>;
  patchSpriteAssetEnum(schema, spriteEnumForSchema({ renderer }));

  const sizeHint = req.size ? ` Target canvas: ${req.size.w}x${req.size.h} cells.` : '';
  const styleHint = req.style ? ` Style preset: ${req.style}.` : '';
  const baseUserMsg =
    `Prompt: "${req.prompt}"\n` +
    `Total duration: ${req.durationMs} ms.\n` +
    `fps: ${req.fps ?? 24}.${sizeHint}${styleHint}`;

  const fewShotParts: ContentPart[] = req.visualFewShot ? await buildVisualFewShot() : [];

  let lastErr: string | undefined;
  let totalIn = 0;
  let totalOut = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const userText =
      attempt === 1
        ? baseUserMsg
        : baseUserMsg +
          `\n\nThe previous attempt was rejected. Reasons:\n${lastErr}\n\n` +
          `Re-emit a corrected plan. Use only listed asset names and field shapes; ` +
          `address each numbered issue above.`;
    const userContent =
      fewShotParts.length > 0
        ? [...fewShotParts, { type: 'text' as const, text: userText }]
        : userText;

    let resp: Awaited<ReturnType<typeof client.chat.completions.create>>;
    try {
      resp = await client.chat.completions.create({
        model,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: system },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { role: 'user', content: userContent as any },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'submit_plan',
              description:
                'Submit the final ScenePlan v1 JSON for rendering. Call exactly once with the plan as the tool input.',
              parameters: schema,
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'submit_plan' } },
      });
    } catch (err) {
      return { ok: false, error: friendlyApiError(err), attempts: attempt };
    }

    const usage = resp.usage;
    totalIn += usage?.prompt_tokens ?? 0;
    totalOut += usage?.completion_tokens ?? 0;

    const choice = resp.choices?.[0];
    const toolCall = choice?.message.tool_calls?.[0];
    if (!toolCall || toolCall.type !== 'function' || !toolCall.function?.arguments) {
      lastErr = 'LLM did not return a submit_plan tool call';
      continue;
    }

    let json: unknown;
    try {
      json = JSON.parse(toolCall.function.arguments);
    } catch (err) {
      lastErr = `tool arguments were not valid JSON: ${(err as Error).message}`;
      continue;
    }

    const parsed = ScenePlan.safeParse(json);
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
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
      attempts: attempt,
    };
  }

  return {
    ok: false,
    error: `planFromNL failed after ${maxRetries} attempts: ${lastErr ?? 'unknown'}`,
    attempts: maxRetries,
  };
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
    if (
      typeSchema &&
      (typeSchema['const'] === 'sprite' || typeSchema['enum']?.toString().includes('sprite'))
    ) {
      props['asset'] = { type: 'string', enum: names };
    }
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) v.forEach((x) => patchSpriteAssetEnum(x, names));
    else patchSpriteAssetEnum(v, names);
  }
}
