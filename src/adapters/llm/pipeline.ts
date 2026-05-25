import OpenAI from 'openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getAsset, listAssets } from '../../core/assets/registry.js';
import { generateAsset, registerShape } from './asset-gen.js';
import { loadCachedAsset, saveCachedAsset } from './asset-cache.js';
import { planFromNLOpenAICompat } from './openai-compat.js';
import { friendlyApiError } from './errors.js';
import type { PlanReq, PlanOk, PlanErr } from './types.js';

interface PipelineCfg {
  apiKey: string;
  baseURL?: string;
  defaultModel: string;
}

const ElementList = z.object({
  elements: z.array(z.object({ name: z.string(), description: z.string() })).max(10),
});

function elementSystem(): string {
  const existing = listAssets()
    .map((a) => `- ${a.name}: ${a.description}`)
    .join('\n');
  return `List the NEW visual objects a scene for the user's prompt needs that
are NOT already covered by the existing assets below. Each new element:
- "name": a short lowercase asset id (a-z, 0-9, -), e.g. "lantern", "koi-fish".
- "description": one concrete line of what it looks like.

EXISTING ASSETS (reuse these — do NOT relist them as new; the scene composer
will use them directly, including a person as \`human\` and repeating it for a
crowd):
${existing}

Rules: only objects the existing assets can't represent. Merge plurals into one
element (five dumplings -> one "dumpling"). Concrete drawable objects only — no
backgrounds, sky, ground, lighting, mood, or people (use \`human\`). 0-6 items.
If everything is covered, return an empty list. Call submit_elements once.`;
}

function sanitizeId(raw: string): string {
  return (raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item').slice(0, 40);
}

async function planElements(
  prompt: string,
  client: OpenAI,
  model: string,
): Promise<Array<{ name: string; description: string }>> {
  const schema = zodToJsonSchema(ElementList, { target: 'openApi3' }) as Record<string, unknown>;
  const resp = await client.chat.completions.create({
    model,
    max_tokens: 800,
    messages: [
      { role: 'system', content: elementSystem() },
      { role: 'user', content: prompt },
    ],
    tools: [{ type: 'function', function: { name: 'submit_elements', description: 'Submit the element list.', parameters: schema } }],
    tool_choice: { type: 'function', function: { name: 'submit_elements' } },
  });
  const tc = resp.choices?.[0]?.message.tool_calls?.[0];
  const args = tc && tc.type === 'function' ? tc.function.arguments : undefined;
  if (!args) return [];
  try {
    const parsed = ElementList.safeParse(JSON.parse(args));
    if (!parsed.success) return [];
    return parsed.data.elements.map((e) => ({ name: sanitizeId(e.name), description: e.description }));
  } catch {
    return [];
  }
}

/**
 * Asset-generation pipeline: plan elements -> generate/cache the ones missing
 * from the registry as procedural shape sprites -> compose the scene (reusing
 * the v2 planner, which now sees the generated assets in its catalog).
 */
export async function planScenePipeline(req: PlanReq, cfg: PipelineCfg): Promise<PlanOk | PlanErr> {
  const client =
    (req.openaiClient as OpenAI | undefined) ??
    new OpenAI({ apiKey: cfg.apiKey, ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}) });
  const model = req.model ?? cfg.defaultModel;

  let elements: Array<{ name: string; description: string }>;
  try {
    elements = await planElements(req.prompt, client, model);
  } catch (err) {
    return { ok: false, error: friendlyApiError(err), attempts: 0 };
  }
  process.stderr.write(`terpix plan: elements → ${elements.map((e) => e.name).join(', ') || '(none)'}\n`);

  for (const el of elements) {
    if (getAsset(el.name)) continue; // builtin or already generated
    const cached = loadCachedAsset(el.name);
    if (cached) {
      registerShape(cached, '<cache>');
      process.stderr.write(`terpix plan: asset '${el.name}' from cache\n`);
      continue;
    }
    const res = await generateAsset(el.name, el.description, {
      client,
      genModel: model,
      ...(req.vision ? { visionModel: req.vision.model } : {}),
      rounds: 3,
    });
    if ('spec' in res) {
      saveCachedAsset(res.spec);
      process.stderr.write(`terpix plan: generated asset '${el.name}'\n`);
    } else {
      process.stderr.write(`terpix plan: asset '${el.name}' skipped: ${res.error}\n`);
    }
  }

  // Compose: the v2 planner now sees generated assets in its catalog. The
  // adapter already drops layers referencing unknown assets (shared safety
  // net), covering elements that failed their recognizability gate.
  return await planFromNLOpenAICompat(req, cfg);
}
