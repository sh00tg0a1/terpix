import { listAssets } from '../../core/assets/registry.js';

// Names of assets that exist in the registry but only render in the ASCII
// renderer (drawAscii defined, draw throws). Excluded from the half-block
// planner unless the plan picks renderer=ascii. Currently a small list; we
// could probe `entry.draw` dynamically but the safer signal is the err
// thrown — we keep it static for now.
const ASCII_ONLY = new Set(['droid']);

export interface CatalogEntry {
  name: string;
  description: string;
  source: string;
  asciiOnly: boolean;
  aspect?: number;
  anchor?: 'center' | 'bottom';
}

export function spriteCatalog(opts: { renderer?: 'half' | 'ascii' } = {}): CatalogEntry[] {
  const renderer = opts.renderer ?? 'half';
  return listAssets()
    .filter((e) => (renderer === 'ascii' ? true : !ASCII_ONLY.has(e.name)))
    .map((e) => ({
      name: e.name,
      description: e.description,
      source: e.source,
      asciiOnly: ASCII_ONLY.has(e.name),
      aspect: e.metrics?.aspect,
      anchor: e.metrics?.anchor,
    }));
}

export function spriteEnumForSchema(opts: { renderer?: 'half' | 'ascii' } = {}): string[] {
  return spriteCatalog(opts).map((e) => e.name);
}

export function catalogMarkdown(opts: { renderer?: 'half' | 'ascii' } = {}): string {
  const entries = spriteCatalog(opts);
  if (entries.length === 0) return '(no sprites registered)';
  return entries
    .map((e) => {
      const flag = e.asciiOnly ? ' [ascii-only]' : '';
      const metric =
        e.aspect !== undefined && e.anchor !== undefined
          ? ` (aspect ${e.aspect.toFixed(2)} W:H, anchor ${e.anchor})`
          : '';
      return `- **${e.name}**${flag}${metric} — ${e.description}`;
    })
    .join('\n');
}
