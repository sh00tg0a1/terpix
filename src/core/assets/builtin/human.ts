import { fillCircle, fillRect, fillTriangle, type PixelBuffer } from '../../pixel.js';
import { shade, type RGB } from '../../color.js';
import type { DrawCtx } from '../registry.js';

// Fill a quad as two triangles (used for the tapered torso shoulders → waist).
function quad(
  buf: PixelBuffer,
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  dx: number, dy: number,
  [r, g, b]: RGB,
  a: number,
): void {
  fillTriangle(buf, ax, ay, bx, by, cx, cy, r, g, b, a);
  fillTriangle(buf, ax, ay, cx, cy, dx, dy, r, g, b, a);
}

/**
 * A standing human figure for the half-block (pixel) renderer, built from
 * named sub-parts (head, neck, torso, arms, legs, feet) rather than one flat
 * silhouette. Three tones are derived from the single `ctx.color`:
 *   - light  — highlight (upper-left of head, near hand)
 *   - base   — front-facing body
 *   - dark   — shadow side (right arm/leg, torso shadow, feet)
 * so the figure reads with volume even though the plan supplies one color.
 * Light is treated as coming from the upper-left.
 *
 * Proportions are ~6.5 heads tall (stylized, not chibi). Anchor is bottom
 * (feet land at cy + size/2); aspect ≈ 0.45.
 */
export function drawHuman(ctx: DrawCtx): void {
  const { buf, cx, cy, size } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));
  const base = ctx.color as RGB;
  const dark = shade(base, 0.58);
  const light = shade(base, 1.28);

  const top = cy - size * 0.5;
  const bottom = cy + size * 0.5;

  // --- head + neck (light from upper-left = highlight circle offset up-left) ---
  const headR = size * 0.082;
  const headCy = top + headR;
  fillCircle(buf, cx, headCy, headR, base[0], base[1], base[2], a);
  fillCircle(buf, cx - headR * 0.24, headCy - headR * 0.24, headR * 0.76, light[0], light[1], light[2], a);
  const neckH = size * 0.035;
  const neckY = headCy + headR;
  const neckW = headR * 0.72;
  fillRect(buf, cx - neckW / 2, neckY, neckW, neckH, dark[0], dark[1], dark[2], a);

  // --- torso (shoulders moderately wider than waist) ---
  const shoulderY = neckY + neckH;
  const torsoH = size * 0.3;
  const waistY = shoulderY + torsoH;
  const shoulderHalf = size * 0.15;
  const waistHalf = size * 0.108;
  quad(
    buf,
    cx - shoulderHalf, shoulderY,
    cx + shoulderHalf, shoulderY,
    cx + waistHalf, waistY,
    cx - waistHalf, waistY,
    base,
    a,
  );
  // shadow on the right portion of the torso (light from the left)
  quad(
    buf,
    cx + waistHalf * 0.12, shoulderY,
    cx + shoulderHalf, shoulderY,
    cx + waistHalf, waistY,
    cx + waistHalf * 0.08, waistY,
    dark,
    a,
  );

  // --- arms + hands (hang at the sides) ---
  const armW = size * 0.055;
  const armTopY = shoulderY + size * 0.005;
  const armLen = size * 0.32;
  const handR = armW * 0.85;
  // left arm (base) + lit hand
  fillRect(buf, cx - shoulderHalf + armW * 0.1, armTopY, armW, armLen, base[0], base[1], base[2], a);
  fillCircle(buf, cx - shoulderHalf + armW * 0.6, armTopY + armLen, handR, light[0], light[1], light[2], a);
  // right arm (shadow side) + hand
  fillRect(buf, cx + shoulderHalf - armW * 1.1, armTopY, armW, armLen, dark[0], dark[1], dark[2], a);
  fillCircle(buf, cx + shoulderHalf - armW * 0.6, armTopY + armLen, handR, base[0], base[1], base[2], a);

  // --- legs + feet ---
  const hipY = waistY;
  const legW = size * 0.092;
  const gap = size * 0.018;
  const footH = size * 0.038;
  const footW = legW + size * 0.05;
  const legLen = bottom - hipY - footH;
  const footY = hipY + legLen;
  // left leg (base) + foot
  fillRect(buf, cx - gap - legW, hipY, legW, legLen, base[0], base[1], base[2], a);
  fillRect(buf, cx - gap - legW - size * 0.022, footY, footW, footH, dark[0], dark[1], dark[2], a);
  // right leg (shadow) + foot
  fillRect(buf, cx + gap, hipY, legW, legLen, dark[0], dark[1], dark[2], a);
  const footDark = shade(dark, 0.82);
  fillRect(buf, cx + gap - size * 0.005, footY, footW, footH, footDark[0], footDark[1], footDark[2], a);
}
