import type { RGBFrame } from '../types.js';

interface Star {
  x: number;
  y: number;
  base: number;
  phase: number;
  freq: number;
}

export interface StarfieldOpts {
  w: number;
  h: number;
  fps: number;
  durationMs: number;
  starCount?: number;
  seed?: number;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function* generateStarfield(opts: StarfieldOpts): AsyncGenerator<RGBFrame> {
  const { w, h, fps, durationMs, starCount = Math.floor((w * h) / 80), seed = 1 } = opts;
  const rand = mulberry32(seed);
  const stars: Star[] = [];
  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: Math.floor(rand() * w),
      y: Math.floor(rand() * h),
      base: 0.3 + rand() * 0.7,
      phase: rand() * Math.PI * 2,
      freq: 0.5 + rand() * 2,
    });
  }

  const totalFrames = Math.ceil((durationMs / 1000) * fps);
  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    const rgba = new Uint8Array(w * h * 4);
    for (let p = 3; p < rgba.length; p += 4) rgba[p] = 255;

    for (const s of stars) {
      const tw = s.base * (0.5 + 0.5 * Math.sin(t * s.freq + s.phase));
      const v = Math.floor(255 * Math.min(1, Math.max(0, tw)));
      const idx = (s.y * w + s.x) * 4;
      rgba[idx] = v;
      rgba[idx + 1] = v;
      rgba[idx + 2] = v;
    }

    yield { w, h, ptsMs: Math.round((i * 1000) / fps), rgba };
  }
}
