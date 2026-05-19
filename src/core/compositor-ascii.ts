import { createCharBuffer, charBufferToFrame, drawString, setCell, type CharBuffer } from './char-grid.js';
import { paintBackgroundAscii } from './backgrounds-ascii.js';
import { findNearestName, getAsset } from './assets/registry.js';
import { ease, hexToRgb, lerp, mulberry32, type Ease } from './math.js';
import type { KeyframeT, LayerT, ScenePlanT, ShotT } from './dsl.js';
import type { CharFrame } from './types.js';

export interface ComposeAsciiOpts {
  w: number; // cols
  h: number; // rows
  fps: number;
}

export async function* compositeAscii(
  plan: ScenePlanT,
  opts: ComposeAsciiOpts,
): AsyncGenerator<CharFrame> {
  const { w, h, fps } = opts;
  let baseMs = 0;
  for (const shot of plan.shots) {
    const totalFrames = Math.ceil((shot.durationMs / 1000) * fps);
    for (let f = 0; f < totalFrames; f++) {
      const shotTMs = Math.round((f * 1000) / fps);
      const buf = createCharBuffer(w, h);
      paintBackgroundAscii(buf, shot.background, shotTMs);
      for (const layer of shot.layers) drawLayer(buf, layer, shotTMs, shot);
      yield charBufferToFrame(buf, baseMs + shotTMs);
    }
    baseMs += shot.durationMs;
  }
}

function drawLayer(buf: CharBuffer, layer: LayerT, tMs: number, shot: ShotT): void {
  switch (layer.type) {
    case 'sprite':
      drawSpriteLayer(buf, layer, tMs);
      return;
    case 'text':
      drawTextLayer(buf, layer, tMs, shot.durationMs);
      return;
    case 'particles':
      drawParticlesLayer(buf, layer, tMs);
      return;
  }
}

interface SpriteState {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
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
  };
}

function drawSpriteLayer(
  buf: CharBuffer,
  layer: Extract<LayerT, { type: 'sprite' }>,
  tMs: number,
): void {
  const state = interpolate(layer.keyframes, tMs, layer.ease);
  const cx = state.x * buf.w;
  const cy = state.y * buf.h;
  // size for ascii: target sprite height in rows = scale * 0.25 * min(buf.w/2, buf.h)
  const size = state.scale * Math.min(buf.w * 0.5, buf.h) * 0.25;
  const color = hexToRgb(layer.color ?? '#cccccc');
  const entry = getAsset(layer.asset);
  if (!entry) {
    const hint = findNearestName(layer.asset);
    throw new Error(
      `unknown sprite asset '${layer.asset}'` +
        (hint ? ` (did you mean '${hint}'?)` : '') +
        '. Run `terpix asset list` to see registered names.',
    );
  }
  if (!entry.drawAscii) {
    throw new Error(
      `asset '${layer.asset}' has no ASCII representation (drawAscii missing). ` +
        `Add a drawAscii() to its registry entry or render with --renderer half.`,
    );
  }
  entry.drawAscii({ buf, cx, cy, size, color, opacity: state.opacity });
}

function drawTextLayer(
  buf: CharBuffer,
  layer: Extract<LayerT, { type: 'text' }>,
  tMs: number,
  shotDurationMs: number,
): void {
  const color = hexToRgb(layer.color);
  const t = tMs / Math.max(1, shotDurationMs);
  let visibleChars = layer.content.length;
  if (layer.style === 'typewriter') visibleChars = Math.floor(layer.content.length * t);
  // ASCII has no anti-alias; treat fade-in as binary threshold past 30% time
  if (layer.style === 'fade-in' && t < 0.3) return;
  const shown = layer.content.slice(0, visibleChars);
  if (layer.style === 'crawl') {
    const lines = shown.split('\n');
    const totalRows = buf.h + lines.length;
    const baseY = Math.floor(buf.h - t * totalRows);
    lines.forEach((line, i) => {
      const x = Math.floor(layer.position.x * buf.w - line.length / 2);
      drawString(buf, line, x, baseY + i, color[0], color[1], color[2]);
    });
    return;
  }
  const lines = shown.split('\n');
  lines.forEach((line, i) => {
    const x = Math.floor(layer.position.x * buf.w - line.length / 2);
    const y = Math.floor(layer.position.y * buf.h) + i;
    drawString(buf, line, x, y, color[0], color[1], color[2]);
  });
}

interface ParticleSpec {
  x: number;
  y: number;
  ch: number;
  color: [number, number, number];
}

function drawParticlesLayer(
  buf: CharBuffer,
  layer: Extract<LayerT, { type: 'particles' }>,
  tMs: number,
): void {
  const rand = mulberry32(layer.seed);
  const particles: ParticleSpec[] = [];
  for (let i = 0; i < layer.count; i++) {
    let vx = 0;
    let vy = 0;
    let color: [number, number, number] = [255, 255, 255];
    let ch = 0x2a; // '*'
    if (layer.kind === 'snow') {
      vx = (rand() - 0.5) * 2;
      vy = 8 + rand() * 12;
      color = [240, 240, 255];
      ch = 0x2a;
    } else if (layer.kind === 'rain') {
      vx = -4;
      vy = 80;
      color = [120, 160, 220];
      ch = 0x7c; // |
    } else if (layer.kind === 'sparks') {
      const ang = rand() * Math.PI * 2;
      const sp = 12 + rand() * 24;
      vx = Math.cos(ang) * sp;
      vy = Math.sin(ang) * sp;
      color = [255, 180, 60];
      ch = 0x2e; // .
    } else if (layer.kind === 'thrust') {
      vx = -16 - rand() * 16;
      vy = (rand() - 0.5) * 2;
      color = [255, 200, 80];
      ch = 0x2d; // -
    }
    const t = tMs / 1000;
    const x0 = (layer.origin?.x ?? rand()) * buf.w;
    const y0 = (layer.origin?.y ?? rand()) * buf.h;
    particles.push({
      x: x0 + vx * t,
      y: y0 + vy * t,
      ch,
      color,
    });
  }
  for (const p of particles) {
    const x = Math.floor(((p.x % buf.w) + buf.w) % buf.w);
    const y = Math.floor(((p.y % buf.h) + buf.h) % buf.h);
    setCell(buf, x, y, p.ch, p.color[0], p.color[1], p.color[2]);
  }
}
