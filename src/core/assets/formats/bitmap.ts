// Bitmap (PNG) sprite format. Companion to shape.ts — used when sprites are
// produced by an image-generation model (Qwen-Image etc.) instead of LLM-
// emitted vector primitives. The model output is white-keyed, cropped to its
// opaque bbox, and downsampled to ~96px on the long side so the rasterizer
// stays cheap. drawAscii falls back to a solid silhouette in the layer color
// (we don't have palette-aware ascii shading).
import { z } from 'zod';
import { PNG } from 'pngjs';
import { setPixel } from '../../pixel.js';
import { setCell } from '../../char-grid.js';
import type { AsciiDrawCtx, DrawCtx } from '../registry.js';

export const BitmapMeta = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i),
  description: z.string().min(3).max(300),
  anchor: z.enum(['center', 'bottom']).default('center'),
});
export type BitmapMetaT = z.infer<typeof BitmapMeta>;

export interface BitmapAsset {
  meta: BitmapMetaT;
  w: number;
  h: number;
  rgba: Uint8Array; // length w*h*4
}

export function decodePng(bytes: Buffer): { w: number; h: number; rgba: Uint8Array } {
  const png = PNG.sync.read(bytes);
  // PNG.sync emits a Node Buffer over RGBA; expose it as Uint8Array without copy.
  return {
    w: png.width,
    h: png.height,
    rgba: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
}

export function encodePng(w: number, h: number, rgba: Uint8Array): Buffer {
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  return PNG.sync.write(png);
}

interface Bbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function opaqueBbox(w: number, h: number, rgba: Uint8Array, minAlpha = 32): Bbox | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = rgba[(y * w + x) * 4 + 3]!;
      if (a < minAlpha) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * Alpha-key near-white pixels. Qwen-Image won't emit alpha, but the prompt
 * pins a "纯白色背景" so a simple threshold gets us 95% of the way; the bbox
 * crop hides leftover speckle around the silhouette.
 */
export function whiteKey(
  w: number,
  h: number,
  rgba: Uint8Array,
  tol = 16,
): Uint8Array {
  const out = new Uint8Array(rgba.length);
  out.set(rgba);
  const cutoff = 255 - tol;
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    if (out[j]! >= cutoff && out[j + 1]! >= cutoff && out[j + 2]! >= cutoff) {
      out[j + 3] = 0;
    }
  }
  return out;
}

/**
 * Background removal by flooding from the image edges. Catches non-white
 * backgrounds the simple whiteKey misses — Qwen sometimes paints a "lotus"
 * on a pale-blue water square because it can't separate subject from
 * context. Any pixel reachable from an edge whose color stays within
 * `tol` of the seed corner color becomes transparent. The subject, even
 * if it touches an edge, only loses the strip of edge pixels — the bbox
 * crop then trims that.
 *
 * Tolerance is in Manhattan RGB units (sum of |dr|+|dg|+|db|). 60 catches
 * a soft gradient sky / water without eating into a saturated sprite.
 */
export function cornerFloodKey(
  w: number,
  h: number,
  rgba: Uint8Array,
  tol = 60,
): Uint8Array {
  const out = new Uint8Array(rgba.length);
  out.set(rgba);
  const visited = new Uint8Array(w * h);
  // Seed color: average the 4 corners so we are robust to one corner
  // accidentally landing on the subject.
  const corners: Array<[number, number]> = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (const [cx, cy] of corners) {
    const j = (cy * w + cx) * 4;
    sr += out[j]!;
    sg += out[j + 1]!;
    sb += out[j + 2]!;
  }
  const seedR = sr / 4;
  const seedG = sg / 4;
  const seedB = sb / 4;
  // BFS from every edge pixel that matches the seed.
  const stack: number[] = [];
  function tryPush(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    const j = idx * 4;
    const d = Math.abs(out[j]! - seedR) + Math.abs(out[j + 1]! - seedG) + Math.abs(out[j + 2]! - seedB);
    if (d > tol) return;
    visited[idx] = 1;
    out[j + 3] = 0;
    stack.push(idx);
  }
  for (let x = 0; x < w; x++) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }
  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % w;
    const y = (idx - x) / w;
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }
  return out;
}

export function downsampleNN(
  srcW: number,
  srcH: number,
  src: Uint8Array,
  dstW: number,
  dstH: number,
): Uint8Array {
  const dst = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor(((y + 0.5) / dstH) * srcH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor(((x + 0.5) / dstW) * srcW));
      const s = (sy * srcW + sx) * 4;
      const d = (y * dstW + x) * 4;
      dst[d] = src[s]!;
      dst[d + 1] = src[s + 1]!;
      dst[d + 2] = src[s + 2]!;
      dst[d + 3] = src[s + 3]!;
    }
  }
  return dst;
}

export interface CookOpts {
  /** Max length of the longer side after downsample. Default 96. */
  maxSide?: number;
  /** Per-channel tolerance for white-keying. Default 16. */
  whiteTol?: number;
  /** Manhattan RGB tolerance for the corner flood-fill. Default 60. */
  floodTol?: number;
  /** Skip the corner flood-fill (only use white threshold). */
  noFlood?: boolean;
}

/**
 * Produce a small, transparent-background sprite from raw model RGBA.
 * Background removal is two-stage: flood-fill from the corners catches
 * non-white backgrounds (Qwen-Image often paints a "lotus" on pale water
 * because it can't isolate subject from context), then a plain white
 * threshold cleans up any residual near-white speckle in the interior.
 */
export function cookSprite(
  srcW: number,
  srcH: number,
  src: Uint8Array,
  opts: CookOpts = {},
): { w: number; h: number; rgba: Uint8Array } {
  const maxSide = opts.maxSide ?? 96;
  const flooded = opts.noFlood
    ? src
    : cornerFloodKey(srcW, srcH, src, opts.floodTol ?? 60);
  const keyed = whiteKey(srcW, srcH, flooded, opts.whiteTol ?? 16);
  const bbox = opaqueBbox(srcW, srcH, keyed);
  let cropW: number;
  let cropH: number;
  let crop: Uint8Array;
  if (bbox) {
    cropW = bbox.x1 - bbox.x0 + 1;
    cropH = bbox.y1 - bbox.y0 + 1;
    crop = new Uint8Array(cropW * cropH * 4);
    for (let y = 0; y < cropH; y++) {
      const srcOff = ((bbox.y0 + y) * srcW + bbox.x0) * 4;
      crop.set(keyed.subarray(srcOff, srcOff + cropW * 4), y * cropW * 4);
    }
  } else {
    cropW = srcW;
    cropH = srcH;
    crop = keyed;
  }
  const scale = Math.min(1, maxSide / Math.max(cropW, cropH));
  const dstW = Math.max(1, Math.round(cropW * scale));
  const dstH = Math.max(1, Math.round(cropH * scale));
  if (dstW === cropW && dstH === cropH) return { w: cropW, h: cropH, rgba: crop };
  return { w: dstW, h: dstH, rgba: downsampleNN(cropW, cropH, crop, dstW, dstH) };
}

// Bitmap sprites carry intrinsic colors, so DrawCtx.color (the layer "tint") is
// IGNORED. Rotation and flipX are honored via reverse-mapping: for every
// output pixel, undo the affine transform to find the source-image sample.
// This is the standard "destination → source" trick that keeps the output
// hole-free regardless of angle / mirror.
export function makeBitmapDrawer(asset: BitmapAsset): (ctx: DrawCtx) => void {
  return function drawBitmap(ctx: DrawCtx): void {
    const { w: bw, h: bh, rgba } = asset;
    const scale = ctx.size / Math.max(bw, bh);
    const drawW = Math.max(1, Math.round(bw * scale));
    const drawH = Math.max(1, Math.round(bh * scale));
    const alphaMul = Math.max(0, Math.min(1, ctx.opacity ?? 1));
    // Rotation is degrees clockwise about the sprite center, matching the
    // shape drawer convention so plans work identically across both sources.
    const rot = ((ctx.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const rotating = rot !== 0;
    const flip = ctx.flipX ?? false;
    // Bounding box in output space: rotating a `drawW × drawH` rect by `rot`
    // grows the AABB by |cos|+|sin| in each dimension. Without expanding the
    // iteration window, the rotated corners would be clipped.
    const halfW = drawW / 2;
    const halfH = drawH / 2;
    const bboxHalfW = rotating ? Math.ceil(Math.abs(cos) * halfW + Math.abs(sin) * halfH) : halfW;
    const bboxHalfH = rotating ? Math.ceil(Math.abs(sin) * halfW + Math.abs(cos) * halfH) : halfH;
    for (let oy = -bboxHalfH; oy < bboxHalfH; oy++) {
      for (let ox = -bboxHalfW; ox < bboxHalfW; ox++) {
        // Inverse rotation: bring the output pixel back into sprite-local space.
        const lx = rotating ? cos * ox + sin * oy : ox;
        const ly = rotating ? -sin * ox + cos * oy : oy;
        // lx,ly in [-halfW..halfW] × [-halfH..halfH] now; map to source uv.
        const u = lx + halfW;
        const v = ly + halfH;
        if (u < 0 || v < 0 || u >= drawW || v >= drawH) continue;
        let sxNorm = u / drawW;
        if (flip) sxNorm = 1 - sxNorm;
        const sx = Math.min(bw - 1, Math.floor(sxNorm * bw));
        const sy = Math.min(bh - 1, Math.floor((v / drawH) * bh));
        const i = (sy * bw + sx) * 4;
        const a = rgba[i + 3]!;
        if (a === 0) continue;
        setPixel(
          ctx.buf,
          Math.round(ctx.cx + ox),
          Math.round(ctx.cy + oy),
          rgba[i]!,
          rgba[i + 1]!,
          rgba[i + 2]!,
          Math.round(a * alphaMul),
        );
      }
    }
  };
}

export function makeBitmapAsciiDrawer(asset: BitmapAsset): (ctx: AsciiDrawCtx) => void {
  return function drawBitmapAscii(ctx: AsciiDrawCtx): void {
    const { w: bw, h: bh, rgba } = asset;
    const aspect = bw / bh;
    const rows = Math.min(8, Math.max(2, Math.round(ctx.size)));
    const cols = Math.max(2, Math.round(rows * aspect * 2));
    const x0 = Math.floor(ctx.cx - cols / 2);
    const y0 = Math.floor(ctx.cy - rows / 2);
    const [r, g, b] = ctx.color;
    for (let row = 0; row < rows; row++) {
      const sy = Math.min(bh - 1, Math.floor(((row + 0.5) / rows) * bh));
      for (let col = 0; col < cols; col++) {
        const sx = Math.min(bw - 1, Math.floor(((col + 0.5) / cols) * bw));
        const a = rgba[(sy * bw + sx) * 4 + 3]!;
        if (a >= 64) setCell(ctx.buf, x0 + col, y0 + row, 0x2588, r, g, b);
      }
    }
  };
}
