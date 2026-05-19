import type { RGBFrame } from './types.js';

export interface SyntheticOpts {
  w: number;
  h: number;
  fps: number;
  durationMs: number;
}

export async function* generateGradient(opts: SyntheticOpts): AsyncGenerator<RGBFrame> {
  const { w, h, fps, durationMs } = opts;
  const totalFrames = Math.ceil((durationMs / 1000) * fps);
  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    const rgba = new Uint8Array(w * h * 4);
    const phase = (t * 0.5) % 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const r = Math.floor(255 * Math.abs(Math.sin((u + phase) * Math.PI * 2)));
        const g = Math.floor(255 * Math.abs(Math.sin((v + phase) * Math.PI * 2)));
        const b = Math.floor(255 * Math.abs(Math.sin((u + v + phase) * Math.PI)));
        const idx = (y * w + x) * 4;
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = 255;
      }
    }
    yield { w, h, ptsMs: Math.round((i * 1000) / fps), rgba };
  }
}
