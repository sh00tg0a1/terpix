import type { PixelBuffer } from '../pixel.js';

export interface DrawCtx {
  buf: PixelBuffer;
  cx: number;
  cy: number;
  size: number;
  color: [number, number, number];
  rotation?: number;
  opacity?: number;
}

export type AssetSource = 'builtin' | 'shape' | 'bitmap' | 'plugin';

export interface AssetEntry {
  name: string;
  description: string;
  source: AssetSource;
  origin?: string;
  draw(ctx: DrawCtx): void;
}

const REGISTRY = new Map<string, AssetEntry>();

export function registerAsset(entry: AssetEntry): void {
  const existing = REGISTRY.get(entry.name);
  if (existing && existing.source !== entry.source) {
    console.warn(
      `[terpix] asset '${entry.name}' from ${entry.source} overrides ${existing.source}` +
        (entry.origin ? ` (${entry.origin})` : ''),
    );
  }
  REGISTRY.set(entry.name, entry);
}

export function getAsset(name: string): AssetEntry | undefined {
  return REGISTRY.get(name);
}

export function listAssets(): AssetEntry[] {
  return [...REGISTRY.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function assetNames(): string[] {
  return [...REGISTRY.keys()].sort();
}

export function clearRegistry(): void {
  REGISTRY.clear();
}

export function findNearestName(name: string): string | undefined {
  const all = assetNames();
  if (all.length === 0) return undefined;
  let best: string | undefined;
  let bestScore = Infinity;
  for (const n of all) {
    const score = levenshtein(name, n);
    if (score < bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return bestScore <= Math.max(2, Math.floor(name.length / 3)) ? best : undefined;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const v0 = new Array<number>(b.length + 1);
  const v1 = new Array<number>(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j]! + 1, v0[j + 1]! + 1, v0[j]! + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j]!;
  }
  return v1[b.length]!;
}
