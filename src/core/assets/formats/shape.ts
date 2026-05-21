import { z } from 'zod';
import { fillCircle, fillRect, fillTriangle, setPixel } from '../../pixel.js';
import type { DrawCtx } from '../registry.js';

const HexOrPlaceholder = z.string().regex(/^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})|@main)$/);
const Point = z.tuple([z.number(), z.number()]);

const Rect = z.object({
  kind: z.literal('rect'),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  color: HexOrPlaceholder,
});

const Circle = z.object({
  kind: z.literal('circle'),
  cx: z.number(),
  cy: z.number(),
  r: z.number().positive(),
  color: HexOrPlaceholder,
});

const Ellipse = z.object({
  kind: z.literal('ellipse'),
  cx: z.number(),
  cy: z.number(),
  rx: z.number().positive(),
  ry: z.number().positive(),
  color: HexOrPlaceholder,
});

const Triangle = z.object({
  kind: z.literal('triangle'),
  points: z.tuple([Point, Point, Point]),
  color: HexOrPlaceholder,
});

const Line = z.object({
  kind: z.literal('line'),
  from: Point,
  to: Point,
  color: HexOrPlaceholder,
  thickness: z.number().int().positive().default(1),
});

const Polygon = z.object({
  kind: z.literal('polygon'),
  points: z.array(Point).min(3),
  color: HexOrPlaceholder,
});

const Primitive = z.discriminatedUnion('kind', [Rect, Circle, Ellipse, Triangle, Line, Polygon]);

export const ShapeAssetFile = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/i),
  description: z.string().min(3).max(300),
  viewBox: z.object({ w: z.number().positive(), h: z.number().positive() }),
  // Where the visual weight sits in the bbox. 'bottom' for ground-resting
  // objects (bowls, plates, furniture); 'center' for floating/round things.
  anchor: z.enum(['center', 'bottom']).default('center'),
  primitives: z.array(Primitive).min(1).max(64),
});

export type ShapeAssetFileT = z.infer<typeof ShapeAssetFile>;
type PrimitiveT = z.infer<typeof Primitive>;

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  const s = hex.startsWith('#') ? hex.slice(1) : hex;
  const n = parseInt(s, 16);
  if (s.length === 6) return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  const r = (n >> 8) & 0xf;
  const g = (n >> 4) & 0xf;
  const b = n & 0xf;
  return { r: r * 17, g: g * 17, b: b * 17 };
}

function resolveColor(token: string, main: [number, number, number]): RGB {
  if (token === '@main') return { r: main[0], g: main[1], b: main[2] };
  return hexToRgb(token);
}

function drawPolygonScanline(
  ctx: DrawCtx,
  pts: Array<[number, number]>,
  color: RGB,
  alpha: number,
): void {
  if (pts.length < 3) return;
  const ys = pts.map((p) => p[1]);
  const minY = Math.floor(Math.max(0, Math.min(...ys)));
  const maxY = Math.ceil(Math.min(ctx.buf.h - 1, Math.max(...ys)));
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
    }
    xs.sort((u, v) => u - v);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.floor(xs[i]!));
      const x1 = Math.min(ctx.buf.w - 1, Math.ceil(xs[i + 1]!));
      for (let x = x0; x <= x1; x++) setPixel(ctx.buf, x, y, color.r, color.g, color.b, alpha);
    }
  }
}

function drawEllipseScanline(
  ctx: DrawCtx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: RGB,
  alpha: number,
): void {
  const x0 = Math.max(0, Math.floor(cx - rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const x1 = Math.min(ctx.buf.w - 1, Math.ceil(cx + rx));
  const y1 = Math.min(ctx.buf.h - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPixel(ctx.buf, x, y, color.r, color.g, color.b, alpha);
    }
  }
}

function drawBresenhamLine(
  ctx: DrawCtx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  color: RGB,
  alpha: number,
): void {
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  const r = Math.max(0, Math.floor(thickness / 2));
  for (;;) {
    for (let ty = -r; ty <= r; ty++)
      for (let tx = -r; tx <= r; tx++) setPixel(ctx.buf, ax + tx, ay + ty, color.r, color.g, color.b, alpha);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      ax += sx;
    }
    if (e2 <= dx) {
      err += dx;
      ay += sy;
    }
  }
}

export function makeShapeDrawer(spec: ShapeAssetFileT): (ctx: DrawCtx) => void {
  const { viewBox, primitives } = spec;
  return function drawShape(ctx: DrawCtx): void {
    const scale = ctx.size / Math.max(viewBox.w, viewBox.h);
    const offX = ctx.cx - (viewBox.w * scale) / 2;
    const offY = ctx.cy - (viewBox.h * scale) / 2;
    const alpha = Math.round(255 * (ctx.opacity ?? 1));
    const project = (px: number, py: number): [number, number] => [offX + px * scale, offY + py * scale];
    for (const prim of primitives) drawPrimitive(ctx, prim, project, scale, ctx.color, alpha);
  };
}

function drawPrimitive(
  ctx: DrawCtx,
  prim: PrimitiveT,
  project: (x: number, y: number) => [number, number],
  scale: number,
  main: [number, number, number],
  alpha: number,
): void {
  const color = resolveColor(prim.color, main);
  switch (prim.kind) {
    case 'rect': {
      const [x, y] = project(prim.x, prim.y);
      fillRect(ctx.buf, x, y, prim.w * scale, prim.h * scale, color.r, color.g, color.b, alpha);
      return;
    }
    case 'circle': {
      const [cx, cy] = project(prim.cx, prim.cy);
      fillCircle(ctx.buf, cx, cy, prim.r * scale, color.r, color.g, color.b, alpha);
      return;
    }
    case 'ellipse': {
      const [cx, cy] = project(prim.cx, prim.cy);
      drawEllipseScanline(ctx, cx, cy, prim.rx * scale, prim.ry * scale, color, alpha);
      return;
    }
    case 'triangle': {
      const [p0, p1, p2] = prim.points.map(([x, y]) => project(x, y)) as [
        [number, number],
        [number, number],
        [number, number],
      ];
      fillTriangle(
        ctx.buf,
        p0[0], p0[1], p1[0], p1[1], p2[0], p2[1],
        color.r, color.g, color.b, alpha,
      );
      return;
    }
    case 'line': {
      const [fx, fy] = project(prim.from[0], prim.from[1]);
      const [tx, ty] = project(prim.to[0], prim.to[1]);
      drawBresenhamLine(ctx, fx, fy, tx, ty, prim.thickness, color, alpha);
      return;
    }
    case 'polygon': {
      const pts = prim.points.map(([x, y]) => project(x, y)) as Array<[number, number]>;
      drawPolygonScanline(ctx, pts, color, alpha);
      return;
    }
  }
}

export function parseShapeJson(text: string, source = '<shape>'):
  | { ok: true; spec: ShapeAssetFileT }
  | { ok: false; errors: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`${source}: invalid JSON: ${(err as Error).message}`] };
  }
  const parsed = ShapeAssetFile.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => {
        const path = i.path.length ? i.path.join('.') : '<root>';
        return `${source}: ${path}: ${i.message}`;
      }),
    };
  }
  return { ok: true, spec: parsed.data };
}
