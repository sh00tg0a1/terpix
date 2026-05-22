import { fillRect } from '../../pixel.js';
import { shade, type RGB } from '../../color.js';
import type { DrawCtx } from '../registry.js';

/**
 * A flat side-on table: a lit top surface over a shadowed front edge, on two
 * legs. Three tones from ctx.color give the slab thickness. The top edge is a
 * clear horizontal line so food sprites placed with `on` rest on it. Wide and
 * short (≈2:1). Anchor is bottom; exposes a `surface` point at the top edge.
 */
export function drawTable(ctx: DrawCtx): void {
  const { buf, cx, cy, size } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));
  const base = ctx.color as RGB;
  const light = shade(base, 1.22);
  const dark = shade(base, 0.6);

  const halfW = size * 0.5;
  const topY = cy - size * 0.12;
  const topH = Math.max(2, size * 0.1);
  const surfaceH = Math.max(1, topH * 0.42);

  // slab: lit top surface + shadowed front face (gives thickness)
  fillRect(buf, cx - halfW, topY, halfW * 2, surfaceH, light[0], light[1], light[2], a);
  fillRect(buf, cx - halfW, topY + surfaceH, halfW * 2, topH - surfaceH, base[0], base[1], base[2], a);

  // two legs, inset; each with a shadow strip on its right edge
  const legW = Math.max(2, size * 0.08);
  const legTop = topY + topH;
  const legBottom = cy + size * 0.36;
  const leg = (x: number) => {
    fillRect(buf, x, legTop, legW, legBottom - legTop, base[0], base[1], base[2], a);
    fillRect(buf, x + legW * 0.6, legTop, legW * 0.4, legBottom - legTop, dark[0], dark[1], dark[2], a);
  };
  leg(cx - halfW + legW);
  leg(cx + halfW - legW * 2);
}
