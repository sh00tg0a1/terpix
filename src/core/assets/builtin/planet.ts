import { fillCircle } from '../../pixel.js';
import { shade, type RGB } from '../../color.js';
import type { DrawCtx } from '../registry.js';

export function drawPlanet(ctx: DrawCtx): void {
  const { buf, cx, cy, size } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));
  const base = ctx.color as RGB;
  const r = size / 2;

  // sphere body
  fillCircle(buf, cx, cy, r, base[0], base[1], base[2], a);
  // terminator shadow on the lower-right (light from upper-left)
  const dark = shade(base, 0.5);
  fillCircle(buf, cx + r * 0.32, cy + r * 0.32, r * 0.86, dark[0], dark[1], dark[2], Math.round(a * 0.6));
  // highlight on the upper-left
  const light = shade(base, 1.45);
  fillCircle(buf, cx - r * 0.34, cy - r * 0.34, r * 0.34, light[0], light[1], light[2], Math.round(a * 0.7));
}
