import { createNoise2D } from 'simplex-noise';
import { hexToRgb, lerp, lerpRgb, mulberry32 } from './math.js';
import { fillBg, setCell, type CharBuffer } from './char-grid.js';
import type { BackgroundT } from './dsl.js';

const SHADE: number[] = [0x20, 0x2e, 0x3a, 0x2b, 0x2a, 0x23]; // ' .  :  +  *  #'
//                       0     1     2     3     4     5

export function paintBackgroundAscii(buf: CharBuffer, bg: BackgroundT, tMs: number): void {
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

function paintSolid(buf: CharBuffer, [r, g, b]: [number, number, number]): void {
  fillBg(buf, r, g, b);
  // clear chars so encoder writes spaces
  for (let i = 0; i < buf.w * buf.h; i++) buf.chars[i] = 0;
}

function paintGradient(
  buf: CharBuffer,
  from: [number, number, number],
  to: [number, number, number],
  dir: 'vertical' | 'horizontal',
): void {
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const t = dir === 'vertical' ? y / Math.max(1, buf.h - 1) : x / Math.max(1, buf.w - 1);
      const [r, g, bl] = lerpRgb(from, to, t);
      const idx = y * buf.w + x;
      buf.bg[idx * 3] = Math.round(r);
      buf.bg[idx * 3 + 1] = Math.round(g);
      buf.bg[idx * 3 + 2] = Math.round(bl);
      buf.chars[idx] = 0;
    }
  }
}

function paintStarfield(buf: CharBuffer, density: number, seed: number, tMs: number): void {
  fillBg(buf, 0, 0, 0);
  for (let i = 0; i < buf.w * buf.h; i++) buf.chars[i] = 0;
  const rand = mulberry32(seed);
  const count = Math.floor(buf.w * buf.h * density * 4); // density tuned for pixel; bump for char-grid sparsity
  const glyphs = [0x2e, 0x27, 0x2a, 0x2b]; // . ' * +
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * buf.w);
    const y = Math.floor(rand() * buf.h);
    const base = 0.4 + rand() * 0.6;
    const freq = 0.5 + rand() * 2;
    const phase = rand() * Math.PI * 2;
    const tw = base * (0.5 + 0.5 * Math.sin((tMs / 1000) * freq + phase));
    const v = Math.floor(255 * Math.min(1, Math.max(0, tw)));
    const g = glyphs[Math.floor(rand() * glyphs.length)]!;
    setCell(buf, x, y, g, v, v, v);
  }
}

const noiseCache = new Map<number, ReturnType<typeof createNoise2D>>();

function getNoise(seed: number): ReturnType<typeof createNoise2D> {
  let n = noiseCache.get(seed);
  if (!n) {
    n = createNoise2D(mulberry32(seed));
    noiseCache.set(seed, n);
  }
  return n;
}

function paintNebula(
  buf: CharBuffer,
  colorA: [number, number, number],
  colorB: [number, number, number],
  scale: number,
  seed: number,
  tMs: number,
): void {
  const noise = getNoise(seed);
  const drift = tMs / 8000;
  // amplify scale for char-grid (cells coarser than pixels)
  const s = scale * 4;
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const nx = x * s;
      const ny = y * s;
      const n = (noise(nx + drift, ny) + noise(nx * 2, ny * 2 + drift) * 0.5) / 1.5;
      const t = (n + 1) / 2;
      const [r, g, bl] = lerpRgb(colorA, colorB, lerp(0, 1, t));
      const idx = y * buf.w + x;
      buf.bg[idx * 3] = Math.round(r);
      buf.bg[idx * 3 + 1] = Math.round(g);
      buf.bg[idx * 3 + 2] = Math.round(bl);
      // sprinkle shade chars on bright cells for texture
      if (t > 0.7) {
        const s2 = Math.min(SHADE.length - 1, Math.floor((t - 0.7) / 0.3 * (SHADE.length - 1)));
        if (s2 > 0) setCell(buf, x, y, SHADE[s2]!, 255, 255, 255);
        else buf.chars[idx] = 0;
      } else {
        buf.chars[idx] = 0;
      }
    }
  }
}
