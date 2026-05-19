import { fillCircle, fillRect, fillTriangle, setPixel } from '../../pixel.js';
import type { DrawCtx } from '../registry.js';

function alpha(opacity: number | undefined): number {
  return Math.round(255 * (opacity ?? 1));
}

export function drawSpaceship(ctx: DrawCtx): void {
  const { buf, cx, cy, size, color } = ctx;
  const a = alpha(ctx.opacity);
  const w = size;
  const h = size * 0.5;
  fillTriangle(
    buf,
    cx + w / 2, cy,
    cx - w / 2, cy - h / 2,
    cx - w / 2, cy + h / 2,
    color[0], color[1], color[2], a,
  );
  fillRect(buf, cx - w / 4, cy - h / 2 - 1, w / 4, 2, color[0], color[1], color[2], a);
  fillRect(buf, cx - w / 4, cy + h / 2 - 1, w / 4, 2, color[0], color[1], color[2], a);
  fillCircle(
    buf,
    cx + w / 6, cy,
    Math.max(1, size * 0.04),
    Math.min(255, color[0] + 80),
    Math.min(255, color[1] + 80),
    Math.min(255, color[2] + 80),
    a,
  );
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
