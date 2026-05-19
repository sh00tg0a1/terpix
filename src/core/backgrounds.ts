import { createNoise2D } from 'simplex-noise';
import { hexToRgb, lerp, lerpRgb, mulberry32 } from './math.js';
import type { PixelBuffer } from './pixel.js';
import type { BackgroundT } from './dsl.js';

export function paintBackground(buf: PixelBuffer, bg: BackgroundT, tMs: number): void {
  switch (bg.type) {
    case 'solid':
      paintSolid(buf, hexToRgb(bg.color));
      return;
    case 'gradient':
      paintGradient(buf, hexToRgb(bg.from), hexToRgb(bg.to), bg.direction);
      return;
    case 'starfield':
      paintStarfield(buf, bg.density, bg.seed, tMs);
      return;
    case 'nebula':
      paintNebula(buf, hexToRgb(bg.colorA), hexToRgb(bg.colorB), bg.scale, bg.seed, tMs);
      return;
  }
}

function paintSolid(buf: PixelBuffer, [r, g, b]: [number, number, number]): void {
  const rgba = buf.rgba;
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
  }
}

function paintGradient(
  buf: PixelBuffer,
  from: [number, number, number],
  to: [number, number, number],
  dir: 'vertical' | 'horizontal',
): void {
  const { w, h, rgba } = buf;
  if (dir === 'vertical') {
    // Compute one column then repeat across w.
    const denom = Math.max(1, h - 1);
    for (let y = 0; y < h; y++) {
      const t = y / denom;
      const r = Math.round(from[0] + (to[0] - from[0]) * t);
      const g = Math.round(from[1] + (to[1] - from[1]) * t);
      const b = Math.round(from[2] + (to[2] - from[2]) * t);
      const rowStart = y * w * 4;
      for (let x = 0; x < w; x++) {
        const idx = rowStart + x * 4;
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = 255;
      }
    }
  } else {
    // Precompute one row.
    const denom = Math.max(1, w - 1);
    const rowR = new Uint8Array(w);
    const rowG = new Uint8Array(w);
    const rowB = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      const t = x / denom;
      rowR[x] = Math.round(from[0] + (to[0] - from[0]) * t);
      rowG[x] = Math.round(from[1] + (to[1] - from[1]) * t);
      rowB[x] = Math.round(from[2] + (to[2] - from[2]) * t);
    }
    for (let y = 0; y < h; y++) {
      const rowStart = y * w * 4;
      for (let x = 0; x < w; x++) {
        const idx = rowStart + x * 4;
        rgba[idx] = rowR[x]!;
        rgba[idx + 1] = rowG[x]!;
        rgba[idx + 2] = rowB[x]!;
        rgba[idx + 3] = 255;
      }
    }
  }
  void lerpRgb; // keep import if unused elsewhere — preserved for API
  void lerp;
}

// Cached star positions per (seed, w, h, density). Per-frame work shrinks to a
// flat loop over a tightly-packed Float32Array of (x, y, base, freq, phase).
const starCache = new Map<
  string,
  {
    xs: Int32Array;
    ys: Int32Array;
    bases: Float32Array;
    freqs: Float32Array;
    phases: Float32Array;
  }
>();

function starsFor(
  w: number,
  h: number,
  density: number,
  seed: number,
): {
  xs: Int32Array;
  ys: Int32Array;
  bases: Float32Array;
  freqs: Float32Array;
  phases: Float32Array;
} {
  const key = `${seed}:${w}:${h}:${density}`;
  const cached = starCache.get(key);
  if (cached) return cached;
  const count = Math.floor(w * h * density);
  const rand = mulberry32(seed);
  const xs = new Int32Array(count);
  const ys = new Int32Array(count);
  const bases = new Float32Array(count);
  const freqs = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    xs[i] = Math.floor(rand() * w);
    ys[i] = Math.floor(rand() * h);
    bases[i] = 0.3 + rand() * 0.7;
    freqs[i] = 0.5 + rand() * 2;
    phases[i] = rand() * Math.PI * 2;
  }
  const entry = { xs, ys, bases, freqs, phases };
  // Cap cache size to avoid unbounded growth on resize.
  if (starCache.size > 8) starCache.clear();
  starCache.set(key, entry);
  return entry;
}

function paintStarfield(buf: PixelBuffer, density: number, seed: number, tMs: number): void {
  paintSolid(buf, [0, 0, 0]);
  const { w, rgba } = buf;
  const { xs, ys, bases, freqs, phases } = starsFor(w, buf.h, density, seed);
  const tSec = tMs / 1000;
  const n = xs.length;
  for (let i = 0; i < n; i++) {
    const tw = bases[i]! * (0.5 + 0.5 * Math.sin(tSec * freqs[i]! + phases[i]!));
    const v = tw < 0 ? 0 : tw > 1 ? 255 : Math.floor(255 * tw);
    const idx = (ys[i]! * w + xs[i]!) * 4;
    rgba[idx] = v;
    rgba[idx + 1] = v;
    rgba[idx + 2] = v;
    rgba[idx + 3] = 255;
  }
}

const noiseCache = new Map<number, ReturnType<typeof createNoise2D>>();

function getNoise(seed: number): ReturnType<typeof createNoise2D> {
  let n = noiseCache.get(seed);
  if (!n) {
    const rand = mulberry32(seed);
    n = createNoise2D(rand);
    noiseCache.set(seed, n);
  }
  return n;
}

// Nebula is expensive (simplex per pixel). Cache the most recent rendered
// frame for a given (seed, scale, w, h, color hash) at quantized t (100 ms
// buckets). 5-10× speedup when consecutive frames share the bucket.
const nebulaCache = new Map<string, Uint8Array>();
const NEBULA_T_BUCKET_MS = 100;

function paintNebula(
  buf: PixelBuffer,
  colorA: [number, number, number],
  colorB: [number, number, number],
  scale: number,
  seed: number,
  tMs: number,
): void {
  const tBucket = Math.floor(tMs / NEBULA_T_BUCKET_MS);
  const key = `${seed}:${buf.w}:${buf.h}:${scale}:${colorA[0]},${colorA[1]},${colorA[2]}:${colorB[0]},${colorB[1]},${colorB[2]}:${tBucket}`;
  const cached = nebulaCache.get(key);
  if (cached) {
    buf.rgba.set(cached);
    return;
  }
  const noise = getNoise(seed);
  const drift = (tBucket * NEBULA_T_BUCKET_MS) / 8000;
  const { w, h } = buf;
  const out = new Uint8Array(w * h * 4);
  const dr = colorB[0] - colorA[0];
  const dg = colorB[1] - colorA[1];
  const db = colorB[2] - colorA[2];
  for (let y = 0; y < h; y++) {
    const ny = y * scale;
    const rowStart = y * w * 4;
    for (let x = 0; x < w; x++) {
      const nx = x * scale;
      const n = (noise(nx + drift, ny) + noise(nx * 2, ny * 2 + drift) * 0.5) / 1.5;
      const t = (n + 1) / 2;
      const idx = rowStart + x * 4;
      out[idx] = Math.round(colorA[0] + dr * t);
      out[idx + 1] = Math.round(colorA[1] + dg * t);
      out[idx + 2] = Math.round(colorA[2] + db * t);
      out[idx + 3] = 255;
    }
  }
  if (nebulaCache.size > 30) nebulaCache.clear();
  nebulaCache.set(key, out);
  buf.rgba.set(out);
}
