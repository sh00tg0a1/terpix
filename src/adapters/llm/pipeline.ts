import OpenAI from 'openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getAsset, listAssets } from '../../core/assets/registry.js';
import { generateAsset, registerShape } from './asset-gen.js';
import {
  generateImageAsset,
  registerBitmap,
} from './asset-gen-image.js';
import {
  loadCachedAsset,
  loadCachedBitmap,
  loadBitmapFromDir,
  saveAssetTo,
  saveBitmapTo,
  saveCachedAsset,
  saveCachedBitmap,
} from './asset-cache.js';
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

/** SHAPE-mode element generation: LLM emits primitives, vision-critic gates. */
async function fulfillElementShape(
  el: { name: string; description: string },
  client: OpenAI,
  model: string,
  req: PlanReq,
): Promise<void> {
  const cached = loadCachedAsset(el.name);
  if (cached) {
    registerShape(cached, '<cache>');
    process.stderr.write(`terpix plan: asset '${el.name}' from cache\n`);
    return;
  }
  const res = await generateAsset(el.name, el.description, {
    client,
    genModel: model,
    ...(req.vision ? { visionModel: req.vision.model } : {}),
    rounds: 3,
  });
  if ('spec' in res) {
    if (req.assetWriteDir) saveAssetTo(res.spec, req.assetWriteDir);
    else saveCachedAsset(res.spec);
    process.stderr.write(`terpix plan: generated asset '${el.name}' (shape)\n`);
  } else {
    process.stderr.write(`terpix plan: asset '${el.name}' skipped: ${res.error}\n`);
  }
}

/** IMAGE-mode element generation: Qwen-Image PNG → cooked bitmap, vision-critic gates. */
async function fulfillElementImage(
  el: { name: string; description: string },
  client: OpenAI,
  req: PlanReq,
): Promise<void> {
  if (!req.imageGen) {
    process.stderr.write(`terpix plan: asset '${el.name}' skipped: image mode needs imageGen config\n`);
    return;
  }
  const cached = req.assetWriteDir
    ? loadBitmapFromDir(req.assetWriteDir, el.name) ?? loadCachedBitmap(el.name)
    : loadCachedBitmap(el.name);
  if (cached) {
    registerBitmap(cached, '<cache>');
    process.stderr.write(`terpix plan: asset '${el.name}' from cache (bitmap)\n`);
    return;
  }
  const qwen = {
    apiKey: req.imageGen.apiKey,
    ...(req.imageGen.model ? { model: req.imageGen.model } : {}),
    ...(req.imageGen.baseURL ? { baseURL: req.imageGen.baseURL } : {}),
    ...(req.imageGen.size ? { size: req.imageGen.size } : {}),
  };
  const res = await generateImageAsset(el.name, el.description, {
    qwen,
    ...(req.vision ? { visionClient: client, visionModel: req.vision.model } : {}),
    rounds: 2,
    ...(req.imageGen.maxSide ? { maxSide: req.imageGen.maxSide } : {}),
  });
  if ('asset' in res) {
    if (req.assetWriteDir) saveBitmapTo(res.asset.meta, res.png, req.assetWriteDir);
    else saveCachedBitmap(res.asset.meta, res.png);
    process.stderr.write(`terpix plan: generated asset '${el.name}' (bitmap)\n`);
  } else {
    process.stderr.write(`terpix plan: asset '${el.name}' skipped: ${res.error}\n`);
  }
}

/**
 * Asset-generation pipeline: plan elements -> generate/cache the missing ones
 * (shape-json OR Qwen-Image bitmap, per req.assetMode) -> compose the scene.
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

  const mode = req.assetMode ?? 'shape';
  for (const el of elements) {
    if (getAsset(el.name)) continue; // builtin or already generated
    if (mode === 'image') await fulfillElementImage(el, client, req);
    else await fulfillElementShape(el, client, model, req);
  }

  // Compose: the v2 planner now sees generated assets in its catalog. The
  // adapter already drops layers referencing unknown assets (shared safety
  // net), covering elements that failed their recognizability gate.
  return await planFromNLOpenAICompat(req, cfg);
}
