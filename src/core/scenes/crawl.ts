import type { RGBFrame } from '../types.js';

export interface CrawlOpts {
  w: number;
  h: number;
  fps: number;
  durationMs: number;
  seed?: number;
}

interface Star {
  x: number;
  y: number;
  base: number;
  phase: number;
  freq: number;
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

// Placeholder text block (Phase 3 will replace with real bitmap font rendering).
// 12 "lines" of varying widths simulating a Star Wars opening crawl.
const LINE_FILL_RATIOS = [
  0.9, 0.7, 0.85, 0.6, 0.95, 0.5, 0.8, 0.65, 0.9, 0.7, 0.4, 0.85,
];

export async function* generateCrawl(opts: CrawlOpts): AsyncGenerator<RGBFrame> {
  const { w, h, fps, durationMs, seed = 42 } = opts;
  const rand = mulberry32(seed);
  const stars: Star[] = [];
  const starCount = Math.floor((w * h) / 100);
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
  const scrollPxPerSec = h * 0.25;
  const lineH = Math.max(2, Math.floor(h / 30));
  const lineGap = lineH;
  const blockH = LINE_FILL_RATIOS.length * (lineH + lineGap);

  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps;
    const rgba = new Uint8Array(w * h * 4);
    for (let p = 3; p < rgba.length; p += 4) rgba[p] = 255;

    // Starfield
    for (const s of stars) {
      const tw = s.base * (0.5 + 0.5 * Math.sin(t * s.freq + s.phase));
      const v = Math.floor(255 * Math.min(1, Math.max(0, tw)));
      const idx = (s.y * w + s.x) * 4;
      rgba[idx] = v;
      rgba[idx + 1] = v;
      rgba[idx + 2] = v;
    }

    // Crawl: yellow lines, perspective-scaled, scrolling up.
    // baselineY is where bottom of the crawl block sits in screen coords.
    const baselineY = h - scrollPxPerSec * t;
    const horizonY = Math.floor(h * 0.15); // text vanishes here
    const groundY = h; // text emerges here
    const ground = groundY - 1;

    for (let li = 0; li < LINE_FILL_RATIOS.length; li++) {
      const lineYWorld = baselineY - li * (lineH + lineGap);
      for (let dy = 0; dy < lineH; dy++) {
        const yScreen = Math.floor(lineYWorld + dy);
        if (yScreen < horizonY || yScreen > ground) continue;
        // Perspective: width shrinks toward horizon. 0 at horizon, 1 at ground.
        const depth = (yScreen - horizonY) / (ground - horizonY);
        const widthRatio = LINE_FILL_RATIOS[li]! * depth;
        const lineW = Math.floor(w * widthRatio);
        const xStart = Math.floor((w - lineW) / 2);
        // Brightness fades toward horizon
        const fade = 0.4 + 0.6 * depth;
        const r = Math.floor(255 * fade);
        const g = Math.floor(220 * fade);
        const b = Math.floor(60 * fade);
        for (let x = 0; x < lineW; x++) {
          const idx = (yScreen * w + (xStart + x)) * 4;
          rgba[idx] = r;
          rgba[idx + 1] = g;
          rgba[idx + 2] = b;
        }
      }
    }

    // Loop the crawl: when entire block has scrolled past horizon, reset
    if (baselineY + blockH < horizonY) {
      // visual loop point — generator naturally ends when durationMs hit
    }

    yield { w, h, ptsMs: Math.round((f * 1000) / fps), rgba };
  }
}
