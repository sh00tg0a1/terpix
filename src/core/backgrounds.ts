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
  for (let i = 0; i < buf.w * buf.h; i++) {
    buf.rgba[i * 4] = r;
    buf.rgba[i * 4 + 1] = g;
    buf.rgba[i * 4 + 2] = b;
    buf.rgba[i * 4 + 3] = 255;
  }
}

function paintGradient(
  buf: PixelBuffer,
  from: [number, number, number],
  to: [number, number, number],
  dir: 'vertical' | 'horizontal',
): void {
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const t = dir === 'vertical' ? y / Math.max(1, buf.h - 1) : x / Math.max(1, buf.w - 1);
      const [r, g, b] = lerpRgb(from, to, t);
      const idx = (y * buf.w + x) * 4;
      buf.rgba[idx] = Math.round(r);
      buf.rgba[idx + 1] = Math.round(g);
      buf.rgba[idx + 2] = Math.round(b);
      buf.rgba[idx + 3] = 255;
    }
  }
}

function paintStarfield(buf: PixelBuffer, density: number, seed: number, tMs: number): void {
  // Start from black
  paintSolid(buf, [0, 0, 0]);
  const rand = mulberry32(seed);
  const count = Math.floor(buf.w * buf.h * density);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * buf.w);
    const y = Math.floor(rand() * buf.h);
    const base = 0.3 + rand() * 0.7;
    const freq = 0.5 + rand() * 2;
    const phase = rand() * Math.PI * 2;
    const tw = base * (0.5 + 0.5 * Math.sin((tMs / 1000) * freq + phase));
    const v = Math.floor(255 * Math.min(1, Math.max(0, tw)));
    const idx = (y * buf.w + x) * 4;
    buf.rgba[idx] = v;
    buf.rgba[idx + 1] = v;
    buf.rgba[idx + 2] = v;
    buf.rgba[idx + 3] = 255;
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

function paintNebula(
  buf: PixelBuffer,
  colorA: [number, number, number],
  colorB: [number, number, number],
  scale: number,
  seed: number,
  tMs: number,
): void {
  const noise = getNoise(seed);
  const drift = tMs / 8000;
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const nx = x * scale;
      const ny = y * scale;
      const n = (noise(nx + drift, ny) + noise(nx * 2, ny * 2 + drift) * 0.5) / 1.5;
      const t = (n + 1) / 2;
      const [r, g, b] = lerpRgb(colorA, colorB, lerp(0, 1, t));
      const idx = (y * buf.w + x) * 4;
      buf.rgba[idx] = Math.round(r);
      buf.rgba[idx + 1] = Math.round(g);
      buf.rgba[idx + 2] = Math.round(b);
      buf.rgba[idx + 3] = 255;
    }
  }
}
