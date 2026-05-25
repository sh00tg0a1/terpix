import { fillRect, fillTriangle } from '../../pixel.js';
import { shade, type RGB } from '../../color.js';
import type { DrawCtx } from '../registry.js';

export function drawTree(ctx: DrawCtx): void {
  const { buf, cx, cy, size } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));
  const base = ctx.color as RGB;
  const dark = shade(base, 0.68);
  const light = shade(base, 1.18);

  // trunk (brown) with a shadow on the right
  const trunkW = size / 6;
  fillRect(buf, cx - trunkW / 2, cy, trunkW, size / 2, 96, 56, 26, a);
  fillRect(buf, cx, cy, trunkW / 2, size / 2, 68, 38, 16, a);

  // foliage as three stacked tiers: widest+darkest at the bottom, narrowest
  // +lightest at the top (light from above). Draw bottom-up so upper tiers
  // overlap the lower ones.
  const tier = (apexY: number, baseY: number, halfW: number, c: RGB) =>
    fillTriangle(buf, cx, apexY, cx - halfW, baseY, cx + halfW, baseY, c[0], c[1], c[2], a);
  tier(cy - size * 0.28, cy + size * 0.02, size * 0.5, dark);
  tier(cy - size * 0.4, cy - size * 0.16, size * 0.36, base);
  tier(cy - size * 0.5, cy - size * 0.3, size * 0.22, light);
}
