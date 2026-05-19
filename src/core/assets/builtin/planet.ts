import { fillCircle } from '../../pixel.js';
import type { DrawCtx } from '../registry.js';

export function drawPlanet(ctx: DrawCtx): void {
  const { buf, cx, cy, size, color } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));
  const r = size / 2;
  fillCircle(buf, cx, cy, r, color[0], color[1], color[2], a);
  fillCircle(
    buf,
    cx + r * 0.3, cy + r * 0.3, r * 0.85,
    Math.floor(color[0] * 0.55),
    Math.floor(color[1] * 0.55),
    Math.floor(color[2] * 0.55),
    Math.round(a * 0.6),
  );
}
