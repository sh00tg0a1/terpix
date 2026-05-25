import { fillCircle, fillRect, fillTriangle, setPixel } from '../../pixel.js';
import { shade, type RGB } from '../../color.js';
import type { DrawCtx } from '../registry.js';

function alpha(opacity: number | undefined): number {
  return Math.round(255 * (opacity ?? 1));
}

export function drawSpaceship(ctx: DrawCtx): void {
  const { buf, cx, cy, size } = ctx;
  const a = alpha(ctx.opacity);
  const base = ctx.color as RGB;
  const dark = shade(base, 0.62);
  const w = size;
  const h = size * 0.5;
  const nose = cx + w / 2;

  // hull (base) — pointed nose to the right
  fillTriangle(buf, nose, cy, cx - w / 2, cy - h / 2, cx - w / 2, cy + h / 2, base[0], base[1], base[2], a);
  // lower half in shadow (light from above)
  fillTriangle(buf, nose, cy, cx - w / 2, cy, cx - w / 2, cy + h / 2, dark[0], dark[1], dark[2], a);

  // tail fins (shadow tone)
  fillRect(buf, cx - w / 4, cy - h / 2 - 1, w / 4, 2, dark[0], dark[1], dark[2], a);
  fillRect(buf, cx - w / 4, cy + h / 2 - 1, w / 4, 2, dark[0], dark[1], dark[2], a);

  // cockpit highlight
  const light = shade(base, 1.5);
  fillCircle(buf, cx + w / 6, cy - h * 0.08, Math.max(1, size * 0.05), light[0], light[1], light[2], a);

  // thrust trail off the back
  for (let i = 0; i < Math.floor(size); i++) {
    const t = i / size;
    setPixel(
      buf,
      Math.floor(cx - w / 2 - i),
      Math.floor(cy),
      Math.floor(255 * (1 - t * 0.5)),
      Math.floor(180 * (1 - t)),
      40,
      Math.round(a * (1 - t)),
    );
  }
}
