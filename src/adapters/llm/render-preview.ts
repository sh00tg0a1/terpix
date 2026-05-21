import { PNG } from 'pngjs';
import { composite } from '../../core/compositor.js';
import type { ScenePlanT } from '../../core/dsl.js';

export interface PreviewOpts {
  w?: number;
  h?: number;
  fps?: number;
  /** Which shot to sample (default 0 = first). */
  shotIndex?: number;
  /** Where in the shot, 0..1 (default 0.5 = middle). */
  shotFraction?: number;
}

/**
 * Render a single representative frame from the plan and return PNG bytes.
 *
 * Small canvas (640x360) is plenty for a VL model — they downsample anyway,
 * and the prompt cost scales with bytes.
 */
export async function renderPreviewPng(
  plan: ScenePlanT,
  opts: PreviewOpts = {},
): Promise<Buffer> {
  const w = opts.w ?? 640;
  const h = opts.h ?? 360;
  const fps = opts.fps ?? plan.fps ?? 12;
  const shotIndex = Math.max(0, Math.min(plan.shots.length - 1, opts.shotIndex ?? 0));
  const shotFraction = Math.max(0, Math.min(1, opts.shotFraction ?? 0.5));

  // Compute absolute pts (ms) of the sampled frame so we can stop the
  // generator at the right moment.
  let baseMs = 0;
  for (let i = 0; i < shotIndex; i++) baseMs += plan.shots[i]!.durationMs;
  const targetMs = baseMs + plan.shots[shotIndex]!.durationMs * shotFraction;

  let bestRgba: Uint8ClampedArray | undefined;
  let bestDelta = Infinity;
  for await (const frame of composite(plan, { w, h, fps })) {
    const delta = Math.abs(frame.ptsMs - targetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestRgba = frame.rgba.slice();
    }
    if (frame.ptsMs > targetMs && bestDelta < 1000 / fps) break;
  }
  if (!bestRgba) throw new Error('render-preview: composite produced no frames');

  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(bestRgba.buffer, bestRgba.byteOffset, bestRgba.byteLength);
  return PNG.sync.write(png);
}
