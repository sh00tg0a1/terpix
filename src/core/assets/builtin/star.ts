import { fillCircle, setPixel } from '../../pixel.js';
import { shade, type RGB } from '../../color.js';
import type { DrawCtx } from '../registry.js';

export function drawStar(ctx: DrawCtx): void {
  const { buf, cx, cy, size } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));
  const base = ctx.color as RGB;
  const r = Math.max(1, size / 4);

  // colored glow body + a white-hot core for a brighter read
  fillCircle(buf, cx, cy, r, base[0], base[1], base[2], a);
  const core = shade(base, 1.7);
  fillCircle(buf, cx, cy, r * 0.5, core[0], core[1], core[2], a);

  // radiating cross arms, fading out
  const arm = size / 2;
  for (let i = -arm; i <= arm; i++) {
    const fade = 1 - Math.abs(i) / arm;
    setPixel(buf, Math.floor(cx + i), Math.floor(cy), base[0], base[1], base[2], Math.round(a * fade));
    setPixel(buf, Math.floor(cx), Math.floor(cy + i), base[0], base[1], base[2], Math.round(a * fade));
  }
}
