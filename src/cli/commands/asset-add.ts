import { existsSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';
import { isProjectDir } from '../../core/project/loader.js';
import { resolveProvider } from '../../adapters/llm/provider.js';
import { generateAsset } from '../../adapters/llm/asset-gen.js';
import { saveAssetTo } from '../../adapters/llm/asset-cache.js';

export interface AssetAddOpts {
  dir: string;
  name: string;
  description: string;
  model?: string;
  visionModel?: string;
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

  process.stderr.write(`terpix asset add: generating '${name}' (${opts.description})...\n`);
  const res = await generateAsset(name, opts.description, {
    client,
    genModel: model,
    ...(opts.visionModel ? { visionModel: opts.visionModel } : {}),
    rounds: 3,
  });
  if ('error' in res) {
    console.error('terpix asset add: ' + res.error);
    process.exit(1);
  }
  saveAssetTo(res.spec, assetsDir);
  process.stderr.write(`terpix asset add: wrote ${assetsDir}/${name}.json\n`);
}
