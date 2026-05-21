import { fillTriangle } from '../../pixel.js';
import { shade, type RGB } from '../../color.js';
import type { DrawCtx } from '../registry.js';

export function drawMountain(ctx: DrawCtx): void {
  const { buf, cx, cy, size } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));
  const base = ctx.color as RGB;
  const apexX = cx;
  const apexY = cy - size / 2;
  const baseY = cy + size / 2;

  // lit left face (full triangle in base tone)
  fillTriangle(buf, apexX, apexY, cx - size / 2, baseY, cx + size / 2, baseY, base[0], base[1], base[2], a);
  // shadowed right face (light from upper-left)
  const dark = shade(base, 0.62);
  fillTriangle(buf, apexX, apexY, apexX, baseY, cx + size / 2, baseY, dark[0], dark[1], dark[2], a);

  // snow cap: white on the lit side, grey on the shadow side
  const capY = apexY + size / 3;
  fillTriangle(buf, apexX, apexY, cx - size / 6, capY, cx + size / 6, capY, 245, 247, 252, a);
  fillTriangle(buf, apexX, apexY, apexX, capY, cx + size / 6, capY, 200, 205, 215, a);
}
