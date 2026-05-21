import { fillRect } from '../../pixel.js';
import type { DrawCtx } from '../registry.js';

/**
 * A simple side-on table: a horizontal top surface with two legs, drawn as
 * a flat silhouette in ctx.color. Wide and short (≈2:1). Anchor is bottom so
 * it rests on the floor line. Use for dining / interior scenes; place food
 * sprites just above its top edge.
 */
export function drawTable(ctx: DrawCtx): void {
  const { buf, cx, cy, size, color } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));
  const [r, g, b] = color;

  // Draw wide (full size width) and short (~0.5 size tall) within the box.
  const halfW = size * 0.5;
  const topY = cy - size * 0.12;
  const topH = Math.max(2, size * 0.1);
  const legW = Math.max(2, size * 0.08);
  const legTop = topY + topH;
  const legBottom = cy + size * 0.32;

  // Tabletop slab
  fillRect(buf, cx - halfW, topY, halfW * 2, topH, r, g, b, a);

  // Two legs, inset from the edges
  fillRect(buf, cx - halfW + legW, legTop, legW, legBottom - legTop, r, g, b, a);
  fillRect(buf, cx + halfW - legW * 2, legTop, legW, legBottom - legTop, r, g, b, a);
}
