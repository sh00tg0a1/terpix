import { createBuffer, type PixelBuffer } from './pixel.js';
import { paintBackground } from './backgrounds.js';
import { findNearestName, getAsset } from './assets/registry.js';
import { ease, hexToRgb, lerp, mulberry32, type Ease } from './math.js';
import { applyStyle, resolveStyle } from './styles.js';
import type { CameraT, KeyframeT, LayerT, ScenePlanT, ShotT } from './dsl.js';
import type { RGBFrame } from './types.js';

const FLAT_CAMERA: CameraT = { projection: 'flat', tilt: 0.5 };

// Pseudo-isometric depth projection. `depth` 0→1 (near→far) pushes a sprite
// up the frame, shrinks it, and dims it, so a scene reads front-to-back.
// At depth 0 it is the identity, so flat scenes are untouched.
function projectIso(
  cy: number,
  size: number,
  opacity: number,
  depth: number,
  tilt: number,
  bufH: number,
): { cy: number; size: number; opacity: number } {
  if (depth <= 0 || tilt <= 0) return { cy, size, opacity };
  const recede = depth * tilt;
  return {
    cy: cy - recede * bufH * 0.45,
    size: size * (1 - recede * 0.45),
    opacity: opacity * (1 - recede * 0.25),
  };
}

export interface ComposeOpts {
  w: number;
  h: number;
  fps: number;
}

export async function* composite(plan: ScenePlanT, opts: ComposeOpts): AsyncGenerator<RGBFrame> {
  const { w, h, fps } = opts;
  const style = resolveStyle(plan.style);
  const camera = plan.camera ?? FLAT_CAMERA;
  let baseMs = 0;
  for (const shot of plan.shots) {
    const totalFrames = Math.ceil((shot.durationMs / 1000) * fps);
    const effectiveBackground = style.forceBackground
      ? ({ type: 'solid' as const, color: style.forceBackground })
      : shot.background;
    for (let f = 0; f < totalFrames; f++) {
      const shotTMs = Math.round((f * 1000) / fps);
      const buf = createBuffer(w, h);
      paintBackground(buf, effectiveBackground, shotTMs);
      const geoms = resolveSpriteGeoms(shot.layers, buf, camera, shotTMs);
      for (const layer of shot.layers) drawLayer(buf, layer, shotTMs, shot, camera, geoms);
      applyStyle(buf, style);
      yield { w, h, ptsMs: baseMs + shotTMs, rgba: buf.rgba };
    }
    baseMs += shot.durationMs;
  }
}

function drawLayer(
  buf: PixelBuffer,
  layer: LayerT,
  tMs: number,
  shot: ShotT,
  camera: CameraT,
  geoms: Map<LayerT, SpriteGeom>,
): void {
  switch (layer.type) {
    case 'sprite':
      drawSpriteLayer(buf, layer, geoms.get(layer));
      return;
    case 'text':
      drawTextLayer(buf, layer, tMs, shot.durationMs);
      return;
    case 'particles':
      drawParticlesLayer(buf, layer, tMs);
      return;
    case 'scatter':
      drawScatterLayer(buf, layer, camera);
      return;
  }
}

function drawScatterLayer(
  buf: PixelBuffer,
  layer: Extract<LayerT, { type: 'scatter' }>,
  camera: CameraT,
): void {
  const entry = getAsset(layer.asset);
  if (!entry) {
    const hint = findNearestName(layer.asset);
    throw new Error(
      `unknown sprite asset '${layer.asset}'` +
        (hint ? ` (did you mean '${hint}'?)` : '') +
        '. Run `terpix asset list` to see registered names.',
    );
  }
  const color = hexToRgb(layer.color ?? '#cccccc');
  const rand = mulberry32(layer.seed);
  const n = layer.count;
  const minWH = Math.min(buf.w, buf.h);
  const iso = camera.projection === 'iso';
  // Compute every instance, then paint back-to-front (lower y = nearer = on
  // top) so overlapping copies layer naturally.
  const instances: Array<{ cx: number; cy: number; size: number; opacity: number }> = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const baseX = lerp(layer.area.x0, layer.area.x1, t);
    const baseY = lerp(layer.area.y0, layer.area.y1, t);
    const jx = (rand() - 0.5) * 0.04;
    const jy = (rand() - 0.5) * 0.06;
    const js = 1 + (rand() - 0.5) * 2 * layer.scaleJitter;
    const cx = (baseX + jx) * buf.w;
    const baseSize = layer.scale * js * minWH * 0.2;
    if (iso) {
      const depth = lerp(layer.depth0, layer.depth1, t);
      const p = projectIso((baseY + jy) * buf.h, baseSize, 1, depth, camera.tilt, buf.h);
      instances.push({ cx, cy: p.cy, size: p.size, opacity: p.opacity });
    } else {
      instances.push({ cx, cy: (baseY + jy) * buf.h, size: baseSize, opacity: 1 });
    }
  }
  instances.sort((a, b) => a.cy - b.cy);
  for (const inst of instances) {
    entry.draw({ buf, cx: inst.cx, cy: inst.cy, size: inst.size, color, rotation: 0, opacity: inst.opacity });
  }
}

interface SpriteState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  depth: number;
}

function interpolate(keyframes: KeyframeT[], tMs: number, easing: Ease): SpriteState {
  const sorted = [...keyframes].sort((a, b) => a.tMs - b.tMs);
  let prev = sorted[0]!;
  let next = sorted[sorted.length - 1]!;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i]!.tMs <= tMs && sorted[i + 1]!.tMs >= tMs) {
      prev = sorted[i]!;
      next = sorted[i + 1]!;
      break;
    }
  }
  const span = next.tMs - prev.tMs;
  const raw = span === 0 ? 0 : (tMs - prev.tMs) / span;
  const t = ease(raw, easing);
  return {
    x: lerp(prev.x ?? 0.5, next.x ?? prev.x ?? 0.5, t),
    y: lerp(prev.y ?? 0.5, next.y ?? prev.y ?? 0.5, t),
    scale: lerp(prev.scale ?? 1, next.scale ?? prev.scale ?? 1, t),
    rotation: lerp(prev.rotation ?? 0, next.rotation ?? prev.rotation ?? 0, t),
    opacity: lerp(prev.opacity ?? 1, next.opacity ?? prev.opacity ?? 1, t),
    depth: lerp(prev.depth ?? 0, next.depth ?? prev.depth ?? 0, t),
  };
}

type SpriteLayer = Extract<LayerT, { type: 'sprite' }>;

interface SpriteGeom {
  cx: number;
  cy: number;
  size: number;
  opacity: number;
  rotation: number;
}

function requireAsset(name: string) {
  const entry = getAsset(name);
  if (!entry) {
    const hint = findNearestName(name);
    throw new Error(
      `unknown sprite asset '${name}'` +
        (hint ? ` (did you mean '${hint}'?)` : '') +
        '. Run `terpix asset list` to see registered names.',
    );
  }
  return entry;
}

// A sprite's own geometry from its keyframes (before any relational placement).
function baseSpriteGeom(layer: SpriteLayer, buf: PixelBuffer, camera: CameraT, tMs: number): SpriteGeom {
  const state = interpolate(layer.keyframes, tMs, layer.ease);
  const cx = state.x * buf.w;
  const baseSize = state.scale * Math.min(buf.w, buf.h) * 0.2;
  if (camera.projection === 'iso') {
    const p = projectIso(state.y * buf.h, baseSize, state.opacity, state.depth, camera.tilt, buf.h);
    return { cx, cy: p.cy, size: p.size, opacity: p.opacity, rotation: state.rotation };
  }
  return { cx, cy: state.y * buf.h, size: baseSize, opacity: state.opacity, rotation: state.rotation };
}

// Where a sprite "sits" within its own bbox, used as the contact point when it
// is placed ON something. Falls back to the bottom (for ground-resting assets)
// or the center.
function attachPoint(asset: string): [number, number] {
  const m = getAsset(asset)?.metrics;
  return m?.points?.base ?? (m?.anchor === 'bottom' ? [0.5, 0.9] : [0.5, 0.5]);
}

// Resolve a sprite that declares `on`: land its attach point on the target's
// named point. Pure 2D placement — the target's geometry and named point
// decide where the child sits; the child keeps its own size.
function placeOnGeom(layer: SpriteLayer, target: { geom: SpriteGeom; layer: SpriteLayer }, buf: PixelBuffer, camera: CameraT, tMs: number): SpriteGeom {
  const childBase = baseSpriteGeom(layer, buf, camera, tMs);
  const on = layer.on!;
  const tGeom = target.geom;
  const point = getAsset(target.layer.asset)?.metrics?.points?.[on.at] ?? [0.5, 0.5];

  const fx = tGeom.cx + (point[0] - 0.5) * tGeom.size + on.dx * tGeom.size * 0.5;
  const fy = tGeom.cy + (point[1] - 0.5) * tGeom.size + on.dy * tGeom.size;
  const [ax, ay] = attachPoint(layer.asset);
  const size = childBase.size;
  return {
    cx: fx - (ax - 0.5) * size,
    cy: fy - (ay - 0.5) * size,
    size,
    opacity: childBase.opacity,
    rotation: childBase.rotation,
  };
}

// Resolve geometry for every sprite layer, honoring relational placement.
// Non-`on` sprites resolve directly; `on` sprites resolve from their target
// (iteratively, so chains like steam→bowl→table settle).
export function resolveSpriteGeoms(
  layers: LayerT[],
  buf: PixelBuffer,
  camera: CameraT,
  tMs: number,
): Map<LayerT, SpriteGeom> {
  const out = new Map<LayerT, SpriteGeom>();
  const byId = new Map<string, { geom: SpriteGeom; layer: SpriteLayer }>();
  let pending: SpriteLayer[] = [];
  for (const layer of layers) {
    if (layer.type !== 'sprite') continue;
    if (layer.on) {
      pending.push(layer);
      continue;
    }
    const g = baseSpriteGeom(layer, buf, camera, tMs);
    out.set(layer, g);
    if (layer.id) byId.set(layer.id, { geom: g, layer });
  }
  for (let pass = 0; pass < 4 && pending.length > 0; pass++) {
    const next: SpriteLayer[] = [];
    for (const layer of pending) {
      const target = byId.get(layer.on!.layer);
      if (!target) {
        next.push(layer);
        continue;
      }
      const g = placeOnGeom(layer, target, buf, camera, tMs);
      out.set(layer, g);
      if (layer.id) byId.set(layer.id, { geom: g, layer });
    }
    if (next.length === pending.length) break; // no progress (missing/cyclic target)
    pending = next;
  }
  // Unresolved `on` layers (bad/cyclic ref): fall back to their own keyframes.
  for (const layer of pending) out.set(layer, baseSpriteGeom(layer, buf, camera, tMs));
  return out;
}

function drawSpriteLayer(buf: PixelBuffer, layer: SpriteLayer, geom: SpriteGeom | undefined): void {
  const entry = requireAsset(layer.asset);
  const g = geom ?? { cx: buf.w / 2, cy: buf.h / 2, size: Math.min(buf.w, buf.h) * 0.2, opacity: 1, rotation: 0 };
  const color = hexToRgb(layer.color ?? '#cccccc');
  entry.draw({ buf, cx: g.cx, cy: g.cy, size: g.size, color, rotation: g.rotation, opacity: g.opacity });
}

// Target char-cell height as fraction of buffer height (glyph = 7 rows tall).
const SIZE_FRAC: Record<'sm' | 'md' | 'lg', number> = { sm: 0.10, md: 0.20, lg: 0.32 };

function textPx(buf: PixelBuffer, size: 'sm' | 'md' | 'lg', textLen: number): number {
  const byHeight = Math.max(1, Math.ceil((buf.h * SIZE_FRAC[size]) / 7));
  // 6 buffer-pixels per char (5 glyph + 1 spacing). Keep total under 92% of width.
  const maxByWidth = textLen > 0 ? Math.max(1, Math.floor((buf.w * 0.92) / (textLen * 6))) : byHeight;
  return Math.min(byHeight, maxByWidth);
}

function drawTextLayer(
  buf: PixelBuffer,
  layer: Extract<LayerT, { type: 'text' }>,
  tMs: number,
  shotDurationMs: number,
): void {
  const longestLine = layer.content
    .split('\n')
    .reduce((m, l) => Math.max(m, l.length), 0);
  const px = textPx(buf, layer.size, longestLine);
  const color = hexToRgb(layer.color);
  const t = tMs / Math.max(1, shotDurationMs);
  let visibleChars = layer.content.length;
  let alpha = 255;
  if (layer.style === 'typewriter') visibleChars = Math.floor(layer.content.length * t);
  if (layer.style === 'fade-in') alpha = Math.round(255 * Math.min(1, t * 2));
  const shown = layer.content.slice(0, visibleChars);
  if (layer.style === 'crawl') {
    // Readable Star-Wars crawl: text only travels ~70% of the full path
    // over the shot (it never fully exits the top), and the eased curve
    // (smoothstep) lingers in the middle where it's most visible. Net
    // effect: ≈40% slower perceived speed in the readable zone.
    const eased = t * t * (3 - 2 * t);
    const speedFactor = 0.7;
    const baseY = buf.h - eased * (buf.h + shown.length * px) * speedFactor;
    drawTextBlock(buf, shown, layer.position.x * buf.w, baseY, px, color, alpha, true);
  } else {
    // position.y is the VERTICAL CENTER of the whole text block. Multi-line
    // strings stay symmetric around the anchor instead of overflowing
    // downward off-screen when the block is tall.
    const lineCount = shown.split('\n').length;
    const blockH = (lineCount - 1) * 8 * px + 7 * px;
    const topY = layer.position.y * buf.h - blockH / 2;
    drawTextBlock(buf, shown, layer.position.x * buf.w, topY, px, color, alpha, true);
  }
}

// 5x7 minimal uppercase + digit + space bitmap font.
const FONT5x7: Record<string, string[]> = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10001', '10001', '10001', '10001'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10001', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '10001', '01010', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00000', '00100'],
  ',': ['00000', '00000', '00000', '00000', '00000', '00100', '01000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
};

function drawTextBlock(
  buf: PixelBuffer,
  text: string,
  baseX: number,
  baseY: number,
  px: number,
  color: [number, number, number],
  alpha: number,
  centerX: boolean,
): void {
  const lines = text.split('\n');
  const bw = buf.w;
  const bh = buf.h;
  const rgba = buf.rgba;
  const r = color[0], g = color[1], b = color[2];
  const opaque = alpha >= 255;
  const ta = alpha / 255;
  const tInv = 1 - ta;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!.toUpperCase();
    const lineWidth = line.length * 6 * px;
    const startX = centerX ? baseX - lineWidth / 2 : baseX;
    const lineY = baseY + li * 8 * px;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci]!;
      const glyph = FONT5x7[ch] ?? FONT5x7[' ']!;
      const charX = startX + ci * 6 * px;
      for (let gy = 0; gy < 7; gy++) {
        const row = glyph[gy]!;
        const glyphY0 = (lineY + gy * px) | 0;
        for (let gx = 0; gx < 5; gx++) {
          if (row.charCodeAt(gx) !== 0x31) continue; // '1'
          const glyphX0 = (charX + gx * px) | 0;
          // Inline fill of the px*px sub-block; bounds-clip per row/col.
          const x0 = glyphX0 < 0 ? 0 : glyphX0;
          const x1 = glyphX0 + px > bw ? bw : glyphX0 + px;
          const y0 = glyphY0 < 0 ? 0 : glyphY0;
          const y1 = glyphY0 + px > bh ? bh : glyphY0 + px;
          if (opaque) {
            for (let py = y0; py < y1; py++) {
              const rowStart = py * bw * 4;
              for (let pxn = x0; pxn < x1; pxn++) {
                const idx = rowStart + pxn * 4;
                rgba[idx] = r;
                rgba[idx + 1] = g;
                rgba[idx + 2] = b;
                rgba[idx + 3] = 255;
              }
            }
          } else {
            for (let py = y0; py < y1; py++) {
              const rowStart = py * bw * 4;
              for (let pxn = x0; pxn < x1; pxn++) {
                const idx = rowStart + pxn * 4;
                rgba[idx] = (rgba[idx]! * tInv + r * ta) | 0;
                rgba[idx + 1] = (rgba[idx + 1]! * tInv + g * ta) | 0;
                rgba[idx + 2] = (rgba[idx + 2]! * tInv + b * ta) | 0;
                rgba[idx + 3] = 255;
              }
            }
          }
        }
      }
    }
  }
}

function setPixelDirect(
  buf: PixelBuffer,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const idx = (y * buf.w + x) * 4;
  if (a >= 255) {
    buf.rgba[idx] = r;
    buf.rgba[idx + 1] = g;
    buf.rgba[idx + 2] = b;
    buf.rgba[idx + 3] = 255;
    return;
  }
  const t = a / 255;
  buf.rgba[idx] = Math.round(buf.rgba[idx]! * (1 - t) + r * t);
  buf.rgba[idx + 1] = Math.round(buf.rgba[idx + 1]! * (1 - t) + g * t);
  buf.rgba[idx + 2] = Math.round(buf.rgba[idx + 2]! * (1 - t) + b * t);
  buf.rgba[idx + 3] = 255;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: [number, number, number];
}

function drawParticlesLayer(
  buf: PixelBuffer,
  layer: Extract<LayerT, { type: 'particles' }>,
  tMs: number,
): void {
  const rand = mulberry32(layer.seed);
  const particles: Particle[] = [];
  for (let i = 0; i < layer.count; i++) {
    let vx = 0;
    let vy = 0;
    let color: [number, number, number] = [255, 255, 255];
    if (layer.kind === 'snow') {
      vx = (rand() - 0.5) * 5;
      vy = 20 + rand() * 30;
      color = [240, 240, 255];
    } else if (layer.kind === 'rain') {
      vx = -10;
      vy = 200;
      color = [120, 160, 220];
    } else if (layer.kind === 'sparks') {
      const ang = rand() * Math.PI * 2;
      const sp = 30 + rand() * 60;
      vx = Math.cos(ang) * sp;
      vy = Math.sin(ang) * sp;
      color = [255, 180, 60];
    } else if (layer.kind === 'thrust') {
      vx = -40 - rand() * 40;
      vy = (rand() - 0.5) * 5;
      color = [255, 200, 80];
    }
    const t = tMs / 1000;
    const x0 = (layer.origin?.x ?? rand()) * buf.w;
    const y0 = (layer.origin?.y ?? rand()) * buf.h;
    particles.push({
      x: x0 + vx * t,
      y: y0 + vy * t,
      vx,
      vy,
      life: 1,
      color,
    });
  }
  for (const p of particles) {
    setPixelDirect(buf, Math.floor(p.x % buf.w), Math.floor(p.y % buf.h), p.color[0], p.color[1], p.color[2], 200);
  }
}
