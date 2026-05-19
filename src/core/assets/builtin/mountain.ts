import { fillTriangle } from '../../pixel.js';
import type { DrawCtx } from '../registry.js';

export function drawMountain(ctx: DrawCtx): void {
  const { buf, cx, cy, size, color } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));
  fillTriangle(
    buf,
    cx, cy - size / 2,
    cx - size / 2, cy + size / 2,
    cx + size / 2, cy + size / 2,
    color[0], color[1], color[2], a,
  );
  fillTriangle(
    buf,
    cx, cy - size / 2,
    cx - size / 6, cy - size / 6,
    cx + size / 6, cy - size / 6,
    255, 255, 255, a,
  );
}
