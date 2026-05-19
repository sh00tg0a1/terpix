import { fillCircle } from '../../pixel.js';
import { mulberry32 } from '../../math.js';
import type { DrawCtx } from '../registry.js';
import { drawPlanet } from './planet.js';

export function drawMoon(ctx: DrawCtx): void {
  const base: [number, number, number] = [200, 200, 210];
  drawPlanet({ ...ctx, color: ctx.color ?? base });
  const rand = mulberry32(7);
  const r = ctx.size / 2;
  for (let i = 0; i < 5; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = rand() * r * 0.6;
    fillCircle(
      ctx.buf,
      ctx.cx + Math.cos(ang) * rad,
      ctx.cy + Math.sin(ang) * rad,
      Math.max(1, r * 0.1),
      120, 120, 130,
      Math.round(255 * (ctx.opacity ?? 1)),
    );
  }
}
