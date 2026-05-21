import { fillCircle, fillRect } from '../../pixel.js';
import type { DrawCtx } from '../registry.js';

/**
 * A simple standing human figure for the half-block (pixel) renderer:
 * round head, rectangular torso, two arms, two legs. Drawn as a flat
 * silhouette in ctx.color so it reads cleanly at low resolution and works
 * for "two people", "a crowd", etc. Anchor is bottom (feet near cy+size/2).
 */
export function drawHuman(ctx: DrawCtx): void {
  const { buf, cx, cy, size, color } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));
  const [r, g, b] = color;

  // Vertical layout across the bounding box [cy - size/2, cy + size/2].
  const top = cy - size * 0.5;
  const headR = Math.max(2, size * 0.13);
  const headCenterY = top + headR;
  const neckY = headCenterY + headR;
  const torsoH = size * 0.34;
  const torsoBottomY = neckY + torsoH;
  const torsoHalfW = Math.max(1, size * 0.13);
  const legBottomY = cy + size * 0.5;

  // Head
  fillCircle(buf, cx, headCenterY, headR, r, g, b, a);

  // Torso
  fillRect(buf, cx - torsoHalfW, neckY, torsoHalfW * 2, torsoBottomY - neckY, r, g, b, a);

  // Arms (straight down at sides, slightly out)
  const armW = Math.max(1, size * 0.05);
  const armH = torsoH * 0.95;
  fillRect(buf, cx - torsoHalfW - armW, neckY + size * 0.02, armW, armH, r, g, b, a);
  fillRect(buf, cx + torsoHalfW, neckY + size * 0.02, armW, armH, r, g, b, a);

  // Legs
  const legW = Math.max(1, size * 0.07);
  const legH = legBottomY - torsoBottomY;
  fillRect(buf, cx - torsoHalfW * 0.7, torsoBottomY, legW, legH, r, g, b, a);
  fillRect(buf, cx + torsoHalfW * 0.7 - legW, torsoBottomY, legW, legH, r, g, b, a);
}
