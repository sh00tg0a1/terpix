import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { homedir } from 'node:os';
import { makeShapeAsciiDrawer, makeShapeDrawer, parseShapeJson } from './formats/shape.js';
import {
  BitmapMeta,
  decodePng,
  makeBitmapAsciiDrawer,
  makeBitmapDrawer,
  type BitmapAsset,
} from './formats/bitmap.js';
import { registerAsset } from './registry.js';

export interface LoadReport {
  loaded: Array<{ name: string; source: 'shape' | 'bitmap' | 'plugin'; origin: string }>;
  errors: Array<{ path: string; messages: string[] }>;
  scanned: string[];
}

export interface LoadOpts {
  extraDirs?: string[];
  allowPlugins?: boolean;
  /**
   * Skip the global `~/.cache/terpix/assets/` dir. Project mode passes this
   * so a project's renders are reproducible — they only see project-local
   * assets plus the read-only built-in catalog, not whatever was generated
   * by some unrelated past run.
   */
  noGlobalCache?: boolean;
}

export function defaultAssetDirs(opts: { noGlobalCache?: boolean } = {}): string[] {
  const dirs: string[] = [];
  dirs.push('./terpix-assets');
  const envDirs = process.env['TERPIX_ASSET_DIRS'];
  if (envDirs) for (const d of envDirs.split(':').filter(Boolean)) dirs.push(d);
  const xdg = process.env['XDG_CONFIG_HOME'];
  if (xdg) dirs.push(join(xdg, 'terpix', 'assets'));
  dirs.push(join(homedir(), '.config', 'terpix', 'assets'));
  if (!opts.noGlobalCache) {
    // Generated sprites (from `plan --gen-assets`) cache here; load them so a
    // plan that references a generated asset renders standalone — unless the
    // caller opted out (project mode wants strict isolation).
    const cacheBase = process.env['XDG_CACHE_HOME'] || join(homedir(), '.cache');
    dirs.push(join(cacheBase, 'terpix', 'assets'));
  }
  return dirs;
}

export function loadUserAssets(opts: LoadOpts = {}): LoadReport {
  const report: LoadReport = { loaded: [], errors: [], scanned: [] };
  const dirs = [
    ...defaultAssetDirs(opts.noGlobalCache ? { noGlobalCache: true } : {}),
    ...(opts.extraDirs ?? []),
  ];
  const seen = new Set<string>();
  for (const dir of dirs) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    if (!existsSync(dir)) continue;
    const stat = statSync(dir);
    if (!stat.isDirectory()) continue;
    report.scanned.push(dir);
    const entries = readdirSync(dir);
    for (const name of entries) {
      const path = join(dir, name);
      const ext = extname(name).toLowerCase();
      // Bitmap sidecar files end in `.bitmap.json`; they're loaded together
      // with their .png pair (below), not as shape-json.
      if (ext === '.json' && !name.toLowerCase().endsWith('.bitmap.json')) {
        loadShapeFile(path, report);
      } else if (ext === '.png') {
        loadBitmapFile(dir, name, report);
      }
      // .ts deferred to later phases
    }
  }
  return report;
}

function loadBitmapFile(dir: string, pngName: string, report: LoadReport): void {
  const png = join(dir, pngName);
  const stem = basename(pngName, extname(pngName));
  const sidecar = join(dir, `${stem}.bitmap.json`);
  if (!existsSync(sidecar)) {
    // A bare .png without a sidecar isn't a registered asset (might be
    // a screenshot, render target, etc.). Skip silently.
    return;
  }
  let metaRaw: unknown;
  try {
    metaRaw = JSON.parse(readFileSync(sidecar, 'utf8'));
  } catch (err) {
    report.errors.push({ path: sidecar, messages: [`bad JSON: ${(err as Error).message}`] });
    return;
  }
  const parsed = BitmapMeta.safeParse(metaRaw);
  if (!parsed.success) {
    report.errors.push({
      path: sidecar,
      messages: parsed.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`),
    });
    return;
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(png);
  } catch (err) {
    report.errors.push({ path: png, messages: [`read failed: ${(err as Error).message}`] });
    return;
  }
  let decoded: { w: number; h: number; rgba: Uint8Array };
  try {
    decoded = decodePng(bytes);
  } catch (err) {
    report.errors.push({ path: png, messages: [`PNG decode: ${(err as Error).message}`] });
    return;
  }
  const asset: BitmapAsset = { meta: parsed.data, w: decoded.w, h: decoded.h, rgba: decoded.rgba };
  registerAsset({
    name: parsed.data.name,
    description: parsed.data.description,
    source: 'bitmap',
    origin: png,
    metrics: { aspect: asset.w / asset.h, anchor: parsed.data.anchor },
    draw: makeBitmapDrawer(asset),
    drawAscii: makeBitmapAsciiDrawer(asset),
  });
  report.loaded.push({ name: parsed.data.name, source: 'bitmap', origin: png });
}

function loadShapeFile(path: string, report: LoadReport): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    report.errors.push({ path, messages: [`read failed: ${(err as Error).message}`] });
    return;
  }
  const parsed = parseShapeJson(text, path);
  if (!parsed.ok) {
    report.errors.push({ path, messages: parsed.errors });
    return;
  }
  const spec = parsed.spec;
  registerAsset({
    name: spec.name,
    description: spec.description,
    source: 'shape',
    origin: path,
    metrics: { aspect: spec.viewBox.w / spec.viewBox.h, anchor: spec.anchor },
    draw: makeShapeDrawer(spec),
    drawAscii: makeShapeAsciiDrawer(spec),
  });
  report.loaded.push({ name: spec.name, source: 'shape', origin: path });
}
