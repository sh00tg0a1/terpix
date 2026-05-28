import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isProjectDir, loadProject } from '../../core/project/loader.js';
import { planFromNL } from '../../adapters/llm/provider.js';
import { parseDurationMs } from './plan.js';

export interface SceneAddOpts {
  dir: string;
  prompt: string;
  duration?: string;
  model?: string;
  style?: string;
  name?: string;
  genAssets?: boolean;
}

// kebab-case slug, keeping CJK so a "晚餐场景" filename stays meaningful.
function slug(s: string, max = 32): string {
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (cleaned || 'scene').slice(0, max);
}

// Next NN prefix by scanning existing `NN-*.json` files in scenes/.
function nextSceneNumber(scenesDir: string): number {
  if (!existsSync(scenesDir)) return 1;
  let max = 0;
  for (const f of readdirSync(scenesDir)) {
    const m = /^(\d+)-.*\.json$/i.exec(f);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return max + 1;
}

export type SceneAddResult =
  | { ok: true; file: string; attempts: number }
  | { ok: false; error: string };

// Plan one scene via the LLM, write it to <proj>/scenes/NN-<name>.json, and
// append the entry to project.json. Generated shape assets land in the
// project's own assets/ dir (not the global cache) so the project stays
// self-contained. Returns a Result so callers (`film`) can continue on
// per-scene failures instead of aborting the whole run.
export async function sceneAdd(opts: SceneAddOpts): Promise<SceneAddResult> {
  if (!isProjectDir(opts.dir)) {
    return {
      ok: false,
      error: `'${opts.dir}' is not a terpix project (missing project.json). Run: terpix new ${opts.dir}`,
    };
  }
  // Load the project — registers its local assets/ so the planner sees them
  // in the catalog and won't try to re-generate something the project already has.
  const loaded = loadProject(opts.dir);
  if (!loaded.ok) return { ok: false, error: 'invalid project: ' + loaded.errors.join('; ') };

  const durationMs = opts.duration ? parseDurationMs(opts.duration) : 6000;
  const assetWriteDir = join(opts.dir, 'assets');
  process.stderr.write(`terpix scene add: planning "${opts.prompt}" (${durationMs}ms)...\n`);
  const res = await planFromNL({
    prompt: opts.prompt,
    durationMs,
    assetWriteDir,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.style ? { style: opts.style } : {}),
    ...(opts.genAssets !== undefined ? { genAssets: opts.genAssets } : {}),
  });
  if (!res.ok) return { ok: false, error: res.error };

  const scenesDir = join(opts.dir, 'scenes');
  mkdirSync(scenesDir, { recursive: true });
  const n = nextSceneNumber(scenesDir);
  const name = opts.name ? slug(opts.name) : slug(res.plan.title || opts.prompt);
  const fname = `${String(n).padStart(2, '0')}-${name}.json`;
  writeFileSync(join(scenesDir, fname), JSON.stringify(res.plan, null, 2) + '\n');

  // Append the new scene to project.json (preserve existing JSON shape).
  const projPath = join(opts.dir, 'project.json');
  const projJson = JSON.parse(readFileSync(projPath, 'utf8')) as { scenes?: Array<{ file: string }> };
  const scenes = projJson.scenes ?? [];
  scenes.push({ file: `scenes/${fname}` });
  projJson.scenes = scenes;
  writeFileSync(projPath, JSON.stringify(projJson, null, 2) + '\n');

  process.stderr.write(
    `terpix scene add: wrote scenes/${fname} (${res.attempts} attempt(s), in=${res.inputTokens} out=${res.outputTokens})\n` +
      `  project.json now has ${scenes.length} scene(s)\n`,
  );
  return { ok: true, file: `scenes/${fname}`, attempts: res.attempts };
}
