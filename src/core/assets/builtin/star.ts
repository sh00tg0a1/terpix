import { fillCircle, setPixel } from '../../pixel.js';
import type { DrawCtx } from '../registry.js';

export function drawStar(ctx: DrawCtx): void {
  const { buf, cx, cy, size, color } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));
  const r = Math.max(1, size / 4);
  fillCircle(buf, cx, cy, r, color[0], color[1], color[2], a);
  const arm = size / 2;
  for (let i = -arm; i <= arm; i++) {
    const fade = 1 - Math.abs(i) / arm;
    setPixel(buf, Math.floor(cx + i), Math.floor(cy), color[0], color[1], color[2], Math.round(a * fade));
    setPixel(buf, Math.floor(cx), Math.floor(cy + i), color[0], color[1], color[2], Math.round(a * fade));
  }
}
