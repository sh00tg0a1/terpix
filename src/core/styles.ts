import { z } from 'zod';
import { hexToRgb } from './math.js';
import type { PixelBuffer } from './pixel.js';

export const StylePreset = z.enum([
  'default',
  'starwars',
  'minimalist',
  'silhouette',
  'noir',
]);

export type StylePresetT = z.infer<typeof StylePreset>;

export interface StyleConfig {
  palette: 'full' | 'duotone';
  paletteColors?: [string, string]; // [bg, fg]
  edgeOnly: boolean;
  forceBackground?: string;
  edgeThreshold: number;
}

const PRESETS: Record<StylePresetT, StyleConfig> = {
  default: {
    palette: 'full',
    edgeOnly: false,
    edgeThreshold: 40,
  },
  starwars: {
    palette: 'duotone',
    paletteColors: ['#000000', '#ffd633'],
    edgeOnly: true,
    forceBackground: '#000000',
    edgeThreshold: 25,
  },
  minimalist: {
    palette: 'duotone',
    paletteColors: ['#f6f3ec', '#1f2933'],
    edgeOnly: true,
    forceBackground: '#f6f3ec',
    edgeThreshold: 18,
  },
  silhouette: {
    palette: 'duotone',
    paletteColors: ['#fde7c1', '#101015'],
    edgeOnly: false,
    forceBackground: '#fde7c1',
    edgeThreshold: 30,
  },
  noir: {
    palette: 'full',
    edgeOnly: false,
    forceBackground: '#0c0c12',
    edgeThreshold: 45,
  },
};

export function resolveStyle(preset: StylePresetT | undefined): StyleConfig {
  return PRESETS[preset ?? 'default'];
}

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function getLuma(rgba: Uint8Array, idx: number): number {
  return luma(rgba[idx]!, rgba[idx + 1]!, rgba[idx + 2]!);
}

export function applyStyle(buf: PixelBuffer, cfg: StyleConfig): void {
  if (cfg.edgeOnly && cfg.paletteColors) {
    applyEdgeDuotone(buf, cfg.paletteColors, cfg.edgeThreshold);
    return;
  }
  if (cfg.palette === 'duotone' && cfg.paletteColors) {
    applyDuotone(buf, cfg.paletteColors);
    return;
  }
  if (cfg.palette === 'full' && cfg.forceBackground) {
    // noir-style: keep colors but darken background-likes
    // No-op for now; forceBackground only affects bg paint upstream.
  }
}

function applyDuotone(buf: PixelBuffer, [bgHex, fgHex]: [string, string]): void {
  const bg = hexToRgb(bgHex);
  const fg = hexToRgb(fgHex);
  const bgL = luma(bg[0], bg[1], bg[2]);
  const fgL = luma(fg[0], fg[1], fg[2]);
  const mid = (bgL + fgL) / 2;
  for (let i = 0; i < buf.rgba.length; i += 4) {
    const l = getLuma(buf.rgba, i);
    // If foreground is darker than background, the comparison flips.
    const isFg = fgL < bgL ? l < mid : l > mid;
    const c = isFg ? fg : bg;
    buf.rgba[i] = c[0];
    buf.rgba[i + 1] = c[1];
    buf.rgba[i + 2] = c[2];
  }
}

function applyEdgeDuotone(
  buf: PixelBuffer,
  [bgHex, fgHex]: [string, string],
  threshold: number,
): void {
  const bg = hexToRgb(bgHex);
  const fg = hexToRgb(fgHex);
  const { w, h, rgba } = buf;
  // Pre-compute luma into a flat array.
  const L = new Float32Array(w * h);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) L[p] = getLuma(rgba, i);
  // 4-neighbor max-abs-diff edge detect.
  const out = new Uint8Array(rgba.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const c = L[p]!;
      let g = 0;
      if (x > 0) g = Math.max(g, Math.abs(c - L[p - 1]!));
      if (x + 1 < w) g = Math.max(g, Math.abs(c - L[p + 1]!));
      if (y > 0) g = Math.max(g, Math.abs(c - L[p - w]!));
      if (y + 1 < h) g = Math.max(g, Math.abs(c - L[p + w]!));
      const isEdge = g >= threshold;
      const col = isEdge ? fg : bg;
      const idx = p * 4;
      out[idx] = col[0];
      out[idx + 1] = col[1];
      out[idx + 2] = col[2];
      out[idx + 3] = 255;
    }
  }
  buf.rgba.set(out);
}
