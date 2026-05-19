import { fillCircle, fillRect, fillTriangle, setPixel, type PixelBuffer } from '../pixel.js';
import { mulberry32 } from '../math.js';

export interface DrawCtx {
  buf: PixelBuffer;
  cx: number;
  cy: number;
  size: number; // bounding box edge in px
  color: [number, number, number];
  rotation?: number;
  opacity?: number;
}

function alpha(opacity: number | undefined): number {
  return Math.round(255 * (opacity ?? 1));
}

export function drawSpaceship(ctx: DrawCtx): void {
  const { buf, cx, cy, size, color } = ctx;
  const a = alpha(ctx.opacity);
  const w = size;
  const h = size * 0.5;
  // Body triangle pointing right
  fillTriangle(
    buf,
    cx + w / 2,
    cy,
    cx - w / 2,
    cy - h / 2,
    cx - w / 2,
    cy + h / 2,
    color[0],
    color[1],
    color[2],
    a,
  );
  // Wing
  fillRect(buf, cx - w / 4, cy - h / 2 - 1, w / 4, 2, color[0], color[1], color[2], a);
  fillRect(buf, cx - w / 4, cy + h / 2 - 1, w / 4, 2, color[0], color[1], color[2], a);
  // Cockpit dot (lighter)
  fillCircle(
    buf,
    cx + w / 6,
    cy,
    Math.max(1, size * 0.04),
    Math.min(255, color[0] + 80),
    Math.min(255, color[1] + 80),
    Math.min(255, color[2] + 80),
    a,
  );
  // Thrust trail
  for (let i = 0; i < Math.floor(size); i++) {
    const t = i / size;
    const px = Math.floor(cx - w / 2 - i);
    setPixel(
      buf,
      px,
      Math.floor(cy),
      Math.floor(255 * (1 - t * 0.5)),
      Math.floor(180 * (1 - t)),
      40,
      Math.round(a * (1 - t)),
    );
  }
}

export function drawPlanet(ctx: DrawCtx): void {
  const { buf, cx, cy, size, color } = ctx;
  const a = alpha(ctx.opacity);
  const r = size / 2;
  fillCircle(buf, cx, cy, r, color[0], color[1], color[2], a);
  // Shading: darker right-bottom crescent
  fillCircle(
    buf,
    cx + r * 0.3,
    cy + r * 0.3,
    r * 0.85,
    Math.floor(color[0] * 0.55),
    Math.floor(color[1] * 0.55),
    Math.floor(color[2] * 0.55),
    Math.round(a * 0.6),
  );
}

export function drawMoon(ctx: DrawCtx): void {
  const base: [number, number, number] = [200, 200, 210];
  drawPlanet({ ...ctx, color: ctx.color ?? base });
  // Craters
  const rand = mulberry32(7);
  const r = ctx.size / 2;
  for (let i = 0; i < 5; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = rand() * r * 0.6;
    const cx2 = ctx.cx + Math.cos(ang) * rad;
    const cy2 = ctx.cy + Math.sin(ang) * rad;
    fillCircle(ctx.buf, cx2, cy2, Math.max(1, r * 0.1), 120, 120, 130, alpha(ctx.opacity));
  }
}

export function drawStar(ctx: DrawCtx): void {
  const { buf, cx, cy, size, color } = ctx;
  const a = alpha(ctx.opacity);
  const r = Math.max(1, size / 4);
  fillCircle(buf, cx, cy, r, color[0], color[1], color[2], a);
  // Cross rays
  const arm = size / 2;
  for (let i = -arm; i <= arm; i++) {
    setPixel(
      buf,
      Math.floor(cx + i),
      Math.floor(cy),
      color[0],
      color[1],
      color[2],
      Math.round(a * (1 - Math.abs(i) / arm)),
    );
    setPixel(
      buf,
      Math.floor(cx),
      Math.floor(cy + i),
      color[0],
      color[1],
      color[2],
      Math.round(a * (1 - Math.abs(i) / arm)),
    );
  }
}

export function drawMountain(ctx: DrawCtx): void {
  const { buf, cx, cy, size, color } = ctx;
  const a = alpha(ctx.opacity);
  fillTriangle(
    buf,
    cx,
    cy - size / 2,
    cx - size / 2,
    cy + size / 2,
    cx + size / 2,
    cy + size / 2,
    color[0],
    color[1],
    color[2],
    a,
  );
  // Snow cap
  fillTriangle(
    buf,
    cx,
    cy - size / 2,
    cx - size / 6,
    cy - size / 6,
    cx + size / 6,
    cy - size / 6,
    255,
    255,
    255,
    a,
  );
}

export function drawTree(ctx: DrawCtx): void {
  const { buf, cx, cy, size, color } = ctx;
  const a = alpha(ctx.opacity);
  // Trunk
  fillRect(buf, cx - size / 12, cy, size / 6, size / 2, 90, 50, 20, a);
  // Foliage triangle
  fillTriangle(
    buf,
    cx,
    cy - size / 2,
    cx - size / 2,
    cy,
    cx + size / 2,
    cy,
    color[0],
    color[1],
    color[2],
    a,
  );
}

export type SpriteName = 'spaceship' | 'planet' | 'moon' | 'star' | 'mountain' | 'tree';

export const SPRITE_DRAWERS: Record<SpriteName, (ctx: DrawCtx) => void> = {
  spaceship: drawSpaceship,
  planet: drawPlanet,
  moon: drawMoon,
  star: drawStar,
  mountain: drawMountain,
  tree: drawTree,
};
