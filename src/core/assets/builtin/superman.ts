import { fillCircle, fillRect, fillTriangle, setPixel } from '../../pixel.js';
import type { DrawCtx } from '../registry.js';

/**
 * Superman flying upward. Pose: arms forward (above head), body trailing
 * below, red cape billowing behind. Default orientation = facing up.
 *
 * Geometry (relative to size = bounding edge in px, anchor at body center):
 *   head:   top
 *   arms:   two parallel lines extending up past head
 *   torso:  blue rectangle below head
 *   legs:   tapering blue trapezoid below torso
 *   cape:   red triangle behind torso, flicking sideways
 *   chest:  yellow diamond logo
 */
export function drawSuperman(ctx: DrawCtx): void {
  const { buf, cx, cy, size } = ctx;
  const a = Math.round(255 * (ctx.opacity ?? 1));

  // Color palette — superhero classic. Ignore ctx.color (semantic identity).
  const SKIN: [number, number, number] = [240, 200, 165];
  const HAIR: [number, number, number] = [25, 20, 18];
  const SUIT: [number, number, number] = [25, 50, 180];
  const CAPE: [number, number, number] = [200, 30, 30];
  const LOGO: [number, number, number] = [255, 220, 40];
  const BOOT: [number, number, number] = [160, 20, 20];

  // Body extends from y = cy - size*0.55 (fingertips) to y = cy + size*0.55 (boots).
  // Head sits near the top.
  const fingertipY = cy - size * 0.55;
  const headTopY = cy - size * 0.30;
  const headCenterY = cy - size * 0.22;
  const headR = Math.max(2, size * 0.09);
  const shoulderY = cy - size * 0.10;
  const torsoTopY = cy - size * 0.10;
  const torsoBottomY = cy + size * 0.18;
  const legBottomY = cy + size * 0.48;
  const bootBottomY = cy + size * 0.55;

  const halfBody = size * 0.13;

  // --- Cape (drawn FIRST so body sits on top) ---
  // Triangular cape billowing to lower-right behind the torso.
  fillTriangle(
    buf,
    cx, torsoTopY,                              // anchor at shoulder
    cx + size * 0.32, cy + size * 0.05,         // far tip flicking right
    cx - size * 0.05, torsoBottomY + size * 0.05, // bottom edge
    CAPE[0], CAPE[1], CAPE[2], a,
  );
  // Secondary cape fold (lighter shade for depth)
  fillTriangle(
    buf,
    cx, torsoTopY,
    cx + size * 0.22, cy + size * 0.0,
    cx + size * 0.05, torsoBottomY,
    Math.min(255, CAPE[0] + 40), Math.max(0, CAPE[1]), Math.max(0, CAPE[2]),
    Math.round(a * 0.7),
  );

  // --- Arms extending straight up (Superman fly pose) ---
  const armW = Math.max(1, size * 0.04);
  fillRect(buf, cx - halfBody * 0.45 - armW / 2, fingertipY, armW, headCenterY - fingertipY, SUIT[0], SUIT[1], SUIT[2], a);
  fillRect(buf, cx + halfBody * 0.45 - armW / 2, fingertipY, armW, headCenterY - fingertipY, SUIT[0], SUIT[1], SUIT[2], a);
  // Fists (skin)
  fillCircle(buf, cx - halfBody * 0.45, fingertipY, Math.max(1, size * 0.035), SKIN[0], SKIN[1], SKIN[2], a);
  fillCircle(buf, cx + halfBody * 0.45, fingertipY, Math.max(1, size * 0.035), SKIN[0], SKIN[1], SKIN[2], a);

  // --- Head ---
  fillCircle(buf, cx, headCenterY, headR, SKIN[0], SKIN[1], SKIN[2], a);
  // Hair cap (top half)
  fillCircle(buf, cx, headCenterY - headR * 0.4, headR * 0.95, HAIR[0], HAIR[1], HAIR[2], a);
  // Iconic forehead curl
  fillCircle(buf, cx - headR * 0.35, headCenterY - headR * 0.05, headR * 0.18, HAIR[0], HAIR[1], HAIR[2], a);
  // Eyes
  setPixel(buf, Math.floor(cx - headR * 0.35), Math.floor(headCenterY + headR * 0.1), 0, 0, 0, a);
  setPixel(buf, Math.floor(cx + headR * 0.35), Math.floor(headCenterY + headR * 0.1), 0, 0, 0, a);

  // --- Torso (blue rectangle, slight taper at top via two triangles) ---
  fillRect(buf, cx - halfBody, torsoTopY, halfBody * 2, torsoBottomY - torsoTopY, SUIT[0], SUIT[1], SUIT[2], a);
  // Shoulder rounding (clip corners)
  fillTriangle(
    buf,
    cx - halfBody, shoulderY,
    cx - halfBody - size * 0.03, shoulderY + size * 0.05,
    cx - halfBody, shoulderY + size * 0.05,
    SUIT[0], SUIT[1], SUIT[2], a,
  );
  fillTriangle(
    buf,
    cx + halfBody, shoulderY,
    cx + halfBody + size * 0.03, shoulderY + size * 0.05,
    cx + halfBody, shoulderY + size * 0.05,
    SUIT[0], SUIT[1], SUIT[2], a,
  );

  // --- Chest logo: yellow diamond ---
  const logoCY = (torsoTopY + torsoBottomY) / 2 - size * 0.02;
  const logoR = size * 0.07;
  fillTriangle(buf, cx, logoCY - logoR, cx - logoR * 0.8, logoCY, cx + logoR * 0.8, logoCY, LOGO[0], LOGO[1], LOGO[2], a);
  fillTriangle(buf, cx, logoCY + logoR, cx - logoR * 0.8, logoCY, cx + logoR * 0.8, logoCY, LOGO[0], LOGO[1], LOGO[2], a);
  // Red "S" stylized as a small bar (too small to render the letter at low res)
  fillRect(buf, cx - logoR * 0.3, logoCY - logoR * 0.15, logoR * 0.6, logoR * 0.3, CAPE[0], CAPE[1], CAPE[2], a);

  // --- Legs: tapering trapezoid (two triangles) ---
  // Left leg
  fillTriangle(
    buf,
    cx - halfBody * 0.95, torsoBottomY,
    cx - halfBody * 0.55, legBottomY,
    cx - 1, legBottomY,
    SUIT[0], SUIT[1], SUIT[2], a,
  );
  fillTriangle(
    buf,
    cx - halfBody * 0.95, torsoBottomY,
    cx - 1, legBottomY,
    cx - 1, torsoBottomY,
    SUIT[0], SUIT[1], SUIT[2], a,
  );
  // Right leg
  fillTriangle(
    buf,
    cx + halfBody * 0.95, torsoBottomY,
    cx + halfBody * 0.55, legBottomY,
    cx + 1, legBottomY,
    SUIT[0], SUIT[1], SUIT[2], a,
  );
  fillTriangle(
    buf,
    cx + halfBody * 0.95, torsoBottomY,
    cx + 1, legBottomY,
    cx + 1, torsoBottomY,
    SUIT[0], SUIT[1], SUIT[2], a,
  );

  // --- Boots ---
  fillRect(buf, cx - halfBody * 0.7, legBottomY - 1, halfBody * 0.7, bootBottomY - legBottomY + 2, BOOT[0], BOOT[1], BOOT[2], a);
  fillRect(buf, cx + 0.01, legBottomY - 1, halfBody * 0.7, bootBottomY - legBottomY + 2, BOOT[0], BOOT[1], BOOT[2], a);

  // --- Motion lines below boots (speed trail) ---
  for (let i = 0; i < Math.floor(size * 0.5); i++) {
    const t = i / (size * 0.5);
    const py = Math.floor(bootBottomY + i);
    setPixel(
      buf,
      Math.floor(cx - halfBody * 0.5),
      py,
      255, 255, 255,
      Math.round(a * (1 - t) * 0.6),
    );
    setPixel(
      buf,
      Math.floor(cx + halfBody * 0.5),
      py,
      255, 255, 255,
      Math.round(a * (1 - t) * 0.6),
    );
    setPixel(
      buf,
      Math.floor(cx),
      py,
      255, 255, 255,
      Math.round(a * (1 - t) * 0.4),
    );
  }
}
