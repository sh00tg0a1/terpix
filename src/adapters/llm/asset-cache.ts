import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ShapeAssetFile, type ShapeAssetFileT } from '../../core/assets/formats/shape.js';

// Generated shape assets persist here so re-rendering a prompt (or reusing a
// "lantern" across scenes) is free and offline after the first generation.
function cacheDir(): string {
  const base = process.env['XDG_CACHE_HOME'] || join(homedir(), '.cache');
  return join(base, 'terpix', 'assets');
}

function keyFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

export function loadCachedAsset(name: string): ShapeAssetFileT | undefined {
  const file = join(cacheDir(), `${keyFor(name)}.json`);
  if (!existsSync(file)) return undefined;
  try {
    const parsed = ShapeAssetFile.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function saveCachedAsset(spec: ShapeAssetFileT): void {
  saveAssetTo(spec, cacheDir());
}

// Write a generated shape asset to an arbitrary directory. Used by project
// mode (`<proj>/assets/`) so a project's sprites travel with it instead of
// living in the shared user cache.
export function saveAssetTo(spec: ShapeAssetFileT, dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${keyFor(spec.name)}.json`), JSON.stringify(spec, null, 2));
}
