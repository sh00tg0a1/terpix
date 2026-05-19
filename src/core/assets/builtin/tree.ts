import { fillRect, fillTriangle } from '../../pixel.js';
import type { DrawCtx } from '../registry.js';

export function drawTree(ctx: DrawCtx): void {
  const { buf, cx, cy, size, color } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));
  fillRect(buf, cx - size / 12, cy, size / 6, size / 2, 90, 50, 20, a);
  fillTriangle(
    buf,
    cx, cy - size / 2,
    cx - size / 2, cy,
    cx + size / 2, cy,
    color[0], color[1], color[2], a,
  );
}
