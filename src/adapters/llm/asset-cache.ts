import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ShapeAssetFile, type ShapeAssetFileT } from '../../core/assets/formats/shape.js';
import {
  BitmapMeta,
  type BitmapAsset,
  type BitmapMetaT,
} from '../../core/assets/formats/bitmap.js';
import { bitmapFromCookedPng } from './asset-gen-image.js';

// Generated assets persist here so re-rendering a prompt (or reusing a
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

// --- Bitmap (image-mode) cache ---
//
// Layout: <name>.png next to a <name>.bitmap.json sidecar with meta. The .json
// suffix is namespaced so a shape-json and a bitmap sidecar can coexist for
// the same name without the shape loader trying to parse the sidecar.

function bitmapSidecarPath(dir: string, name: string): string {
  return join(dir, `${keyFor(name)}.bitmap.json`);
}

function bitmapPngPath(dir: string, name: string): string {
  return join(dir, `${keyFor(name)}.png`);
}

export function loadCachedBitmap(name: string): BitmapAsset | undefined {
  return loadBitmapFromDir(cacheDir(), name);
}

export function loadBitmapFromDir(dir: string, name: string): BitmapAsset | undefined {
  const sidecar = bitmapSidecarPath(dir, name);
  const png = bitmapPngPath(dir, name);
  if (!existsSync(sidecar) || !existsSync(png)) return undefined;
  try {
    const meta = BitmapMeta.safeParse(JSON.parse(readFileSync(sidecar, 'utf8')));
    if (!meta.success) return undefined;
    return bitmapFromCookedPng(meta.data, readFileSync(png));
  } catch {
    return undefined;
  }
}

export function saveCachedBitmap(meta: BitmapMetaT, png: Buffer): void {
  saveBitmapTo(meta, png, cacheDir());
}

export function saveBitmapTo(meta: BitmapMetaT, png: Buffer, dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(bitmapSidecarPath(dir, meta.name), JSON.stringify(meta, null, 2));
  writeFileSync(bitmapPngPath(dir, meta.name), png);
}
