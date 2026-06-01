import { existsSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';
import { isProjectDir } from '../../core/project/loader.js';
import { resolveImageGen, resolveProvider } from '../../adapters/llm/provider.js';
import { generateAsset } from '../../adapters/llm/asset-gen.js';
import { generateImageAsset } from '../../adapters/llm/asset-gen-image.js';
import { saveAssetTo, saveBitmapTo } from '../../adapters/llm/asset-cache.js';

export interface AssetAddOpts {
  dir: string;
  name: string;
  description: string;
  model?: string;
  visionModel?: string;
  noVision?: boolean;
  assetMode?: 'shape' | 'image';
  imageModel?: string;
  imageSize?: string;
  imageMaxSide?: number;
}

// Vision-model defaults per provider. The recognizability gate uses the same
// OpenAI client / baseURL the gen model rides on, so the vision model must
// live behind the same provider.
function defaultVisionFor(kind: string): string | undefined {
  switch (kind) {
    case 'qwen':
      return 'qwen-vl-plus';
    case 'openai':
      return 'gpt-4o-mini';
    default:
      // minimax / openai-compat: no safe default — caller must pass
      // --vision-model if they want a gate.
      return undefined;
  }
}

function sanitizeId(raw: string): string {
  return (raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'asset').slice(0, 40);
}

// Explicitly generate one project-local sprite. Wraps generateAsset and writes
// the spec into <proj>/assets/<name>.json (NOT the global cache). Reuses the
// optional vision-recognizability gate from the planner pipeline.
export async function assetAdd(opts: AssetAddOpts): Promise<void> {
  if (!isProjectDir(opts.dir)) {
    console.error(
      `terpix asset add: '${opts.dir}' is not a terpix project (missing project.json). ` +
        `Run: terpix new ${opts.dir}`,
    );
    process.exit(1);
  }

  // Asset generation rides on the OpenAI-compatible chat-completions+function
  // shape used by qwen/minimax/openai/openai-compat. Anthropic isn't wired
  // here — fall back to an OpenAI-compatible provider if the active one is
  // anthropic.
  const resolved = resolveProvider();
  if ('error' in resolved) {
    console.error('terpix asset add: ' + resolved.error);
    process.exit(1);
  }
  if (resolved.kind === 'anthropic') {
    console.error(
      `terpix asset add: anthropic provider isn't supported for asset generation; ` +
        `set an openai-compat provider (qwen / minimax / openai / openai-compat) ` +
        `via 'terpix config set provider <name>'.`,
    );
    process.exit(1);
  }
  const client = new OpenAI({
    apiKey: resolved.apiKey,
    ...(resolved.baseURL ? { baseURL: resolved.baseURL } : {}),
  });
  const model = opts.model ?? resolved.defaultModel;

  const name = sanitizeId(opts.name);
  const assetsDir = join(opts.dir, 'assets');
  if (existsSync(join(assetsDir, `${name}.json`))) {
    process.stderr.write(`terpix asset add: ${name}.json already exists — overwriting\n`);
  }

  // Vision gate runs by default (qwen → qwen-vl-plus, openai → gpt-4o-mini),
  // so a fresh sprite has to actually look like its label or the model keeps
  // iterating. Pass --no-vision to skip (faster, cheaper, less reliable).
  const visionModel = opts.noVision
    ? undefined
    : opts.visionModel ?? defaultVisionFor(resolved.kind);
  if (!opts.noVision && !visionModel) {
    process.stderr.write(
      `terpix asset add: provider '${resolved.kind}' has no default vision model; ` +
        `running without recognizability gate. Pass --vision-model <id> to enable.\n`,
    );
  } else if (visionModel) {
    process.stderr.write(`terpix asset add: vision gate = ${visionModel}\n`);
  }
  process.stderr.write(`terpix asset add: generating '${name}' (${opts.description})...\n`);

  if (opts.assetMode === 'image') {
    const r = resolveImageGen({
      ...(opts.imageModel ? { model: opts.imageModel } : {}),
      ...(opts.imageSize ? { size: opts.imageSize } : {}),
      ...(opts.imageMaxSide !== undefined ? { maxSide: opts.imageMaxSide } : {}),
    });
    if ('error' in r) {
      console.error('terpix asset add: ' + r.error);
      process.exit(1);
    }
    process.stderr.write(`terpix asset add: image mode (model=${r.model}, size=${r.size})\n`);
    const out = await generateImageAsset(name, opts.description, {
      qwen: r,
      ...(visionModel ? { visionClient: client, visionModel } : {}),
      rounds: 2,
      ...(r.maxSide ? { maxSide: r.maxSide } : {}),
    });
    if ('error' in out) {
      console.error('terpix asset add: ' + out.error);
      process.exit(1);
    }
    saveBitmapTo(out.asset.meta, out.png, assetsDir);
    process.stderr.write(`terpix asset add: wrote ${assetsDir}/${name}.png (+ ${name}.bitmap.json)\n`);
    return;
  }

  const res = await generateAsset(name, opts.description, {
    client,
    genModel: model,
    ...(visionModel ? { visionModel } : {}),
    rounds: 3,
  });
  if ('error' in res) {
    console.error('terpix asset add: ' + res.error);
    process.exit(1);
  }
  saveAssetTo(res.spec, assetsDir);
  process.stderr.write(`terpix asset add: wrote ${assetsDir}/${name}.json\n`);
}
