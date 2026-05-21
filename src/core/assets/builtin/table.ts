import { fillRect, fillTriangle, type PixelBuffer } from '../../pixel.js';
import { shade, type RGB } from '../../color.js';
import type { DrawCtx } from '../registry.js';

function quad(
  buf: PixelBuffer,
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
  [r, g, b]: RGB, a: number,
): void {
  fillTriangle(buf, ax, ay, bx, by, cx, cy, r, g, b, a);
  fillTriangle(buf, ax, ay, cx, cy, dx, dy, r, g, b, a);
}

/**
 * A table seen in 3/4 perspective: the top is a parallelogram (back edge
 * narrower + higher than the front) so it reads as a receding surface you can
 * set things ON, not a flat side-on slab. Lit top, shadowed front edge, four
 * legs (back pair darker). Three tones from ctx.color. Anchor is bottom.
 *
 * Named surface points (see registry metrics) let sprites sit on the top:
 * `surfaceBack` (far) and `surfaceFront` (near) bracket the usable area.
 */
export function drawTable(ctx: DrawCtx): void {
  const { buf, cx, cy, size } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));
  const base = ctx.color as RGB;
  const light = shade(base, 1.22);
  const dark = shade(base, 0.58);
  const legDark = shade(base, 0.45);

  const halfFront = size * 0.5;
  const halfBack = size * 0.34;
  const backY = cy - size * 0.18;
  const frontY = cy + size * 0.04;
  const edgeH = size * 0.075;
  const legBottom = cy + size * 0.46;
  const legW = Math.max(2, size * 0.07);

  // back legs (drawn first, darker, sit farther/higher)
  const backLegBottom = cy + size * 0.36;
  fillRect(buf, cx - halfBack * 0.9, backY, legW, backLegBottom - backY, legDark[0], legDark[1], legDark[2], a);
  fillRect(buf, cx + halfBack * 0.9 - legW, backY, legW, backLegBottom - backY, legDark[0], legDark[1], legDark[2], a);

  // top surface parallelogram (lit)
  quad(
    buf,
    cx - halfBack, backY,
    cx + halfBack, backY,
    cx + halfFront, frontY,
    cx - halfFront, frontY,
    light, a,
  );

  // front edge band gives the top thickness (base tone)
  quad(
    buf,
    cx - halfFront, frontY,
    cx + halfFront, frontY,
    cx + halfFront, frontY + edgeH,
    cx - halfFront, frontY + edgeH,
    base, a,
  );

  // front legs (base + a shadow strip on the right)
  const frontLeg = (x: number) => {
    fillRect(buf, x, frontY + edgeH, legW, legBottom - (frontY + edgeH), base[0], base[1], base[2], a);
    fillRect(buf, x + legW * 0.6, frontY + edgeH, legW * 0.4, legBottom - (frontY + edgeH), dark[0], dark[1], dark[2], a);
  };
  frontLeg(cx - halfFront * 0.92);
  frontLeg(cx + halfFront * 0.92 - legW);
}
