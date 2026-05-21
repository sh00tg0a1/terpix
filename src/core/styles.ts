import { z } from 'zod';
import { hexToRgb } from './math.js';
import type { PixelBuffer } from './pixel.js';

export const StylePreset = z.enum([
  'default',
  'starwars',
  'minimalist',
  'silhouette',
  'noir',
  'lineart',
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
    edgeOnly: false,
    forceBackground: '#000000',
    edgeThreshold: 25,
  },
  minimalist: {
    palette: 'duotone',
    paletteColors: ['#f6f3ec', '#1f2933'],
    edgeOnly: false,
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
  // Ink-on-paper outline mode: edge-detect the rendered frame so only the
  // contours of shapes survive, drawn as dark ink on a paper background.
  // This is the "simple line art / 简单线条" look.
  lineart: {
    palette: 'duotone',
    paletteColors: ['#f7f4ec', '#14181f'],
    edgeOnly: true,
    forceBackground: '#f7f4ec',
    edgeThreshold: 22,
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
  const rgba = buf.rgba;
  const fgDarker = fgL < bgL;
  const fgR = fg[0], fgG = fg[1], fgB = fg[2];
  const bgR = bg[0], bgG = bg[1], bgB = bg[2];
  // Hot loop: inlined luma; avoid function call + array allocation per pixel.
  for (let i = 0; i < rgba.length; i += 4) {
    const l = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
    const isFg = fgDarker ? l < mid : l > mid;
    if (isFg) {
      rgba[i] = fgR;
      rgba[i + 1] = fgG;
      rgba[i + 2] = fgB;
    } else {
      rgba[i] = bgR;
      rgba[i + 1] = bgG;
      rgba[i + 2] = bgB;
    }
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
