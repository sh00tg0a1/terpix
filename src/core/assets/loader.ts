import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { homedir } from 'node:os';
import { makeShapeDrawer, parseShapeJson } from './formats/shape.js';
import { registerAsset } from './registry.js';

export interface LoadReport {
  loaded: Array<{ name: string; source: 'shape' | 'bitmap' | 'plugin'; origin: string }>;
  errors: Array<{ path: string; messages: string[] }>;
  scanned: string[];
}

export interface LoadOpts {
  extraDirs?: string[];
  allowPlugins?: boolean;
}

export function defaultAssetDirs(): string[] {
  const dirs: string[] = [];
  dirs.push('./terpix-assets');
  const envDirs = process.env['TERPIX_ASSET_DIRS'];
  if (envDirs) for (const d of envDirs.split(':').filter(Boolean)) dirs.push(d);
  const xdg = process.env['XDG_CONFIG_HOME'];
  if (xdg) dirs.push(join(xdg, 'terpix', 'assets'));
  dirs.push(join(homedir(), '.config', 'terpix', 'assets'));
  return dirs;
}

export function loadUserAssets(opts: LoadOpts = {}): LoadReport {
  const report: LoadReport = { loaded: [], errors: [], scanned: [] };
  const dirs = [...defaultAssetDirs(), ...(opts.extraDirs ?? [])];
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
      if (ext === '.json') loadShapeFile(path, report);
      // .png and .ts deferred to later phases
    }
  }
  return report;
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
    draw: makeShapeDrawer(spec),
  });
  report.loaded.push({ name: spec.name, source: 'shape', origin: path });
}
