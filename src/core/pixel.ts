export interface PixelBuffer {
  w: number;
  h: number;
  rgba: Uint8Array;
}

export function createBuffer(w: number, h: number, fill?: [number, number, number]): PixelBuffer {
  const rgba = new Uint8Array(w * h * 4);
  if (fill) {
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = fill[0];
      rgba[i * 4 + 1] = fill[1];
      rgba[i * 4 + 2] = fill[2];
      rgba[i * 4 + 3] = 255;
    }
  } else {
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  }
  return { w, h, rgba };
}

export function setPixel(
  buf: PixelBuffer,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const idx = (y * buf.w + x) * 4;
  if (a === 255) {
    buf.rgba[idx] = r;
    buf.rgba[idx + 1] = g;
    buf.rgba[idx + 2] = b;
    buf.rgba[idx + 3] = 255;
    return;
  }
  // Alpha blend onto existing
  const t = a / 255;
  const dr = buf.rgba[idx]!;
  const dg = buf.rgba[idx + 1]!;
  const db = buf.rgba[idx + 2]!;
  buf.rgba[idx] = Math.round(dr * (1 - t) + r * t);
  buf.rgba[idx + 1] = Math.round(dg * (1 - t) + g * t);
  buf.rgba[idx + 2] = Math.round(db * (1 - t) + b * t);
  buf.rgba[idx + 3] = 255;
}

export function fillRect(
  buf: PixelBuffer,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(buf.w, Math.floor(x + w));
  const y1 = Math.min(buf.h, Math.floor(y + h));
  for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) setPixel(buf, px, py, r, g, b, a);
}

export function fillCircle(
  buf: PixelBuffer,
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(buf.w, Math.ceil(cx + radius));
  const y1 = Math.min(buf.h, Math.ceil(cy + radius));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= r2) setPixel(buf, px, py, r, g, b, a);
    }
  }
}

export function fillTriangle(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxX = Math.min(buf.w - 1, Math.ceil(Math.max(x0, x1, x2)));
  const maxY = Math.min(buf.h - 1, Math.ceil(Math.max(y0, y1, y2)));
  const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  if (area === 0) return;
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const w0 = ((x1 - px) * (y2 - py) - (y1 - py) * (x2 - px)) / area;
      const w1 = ((x2 - px) * (y0 - py) - (y2 - py) * (x0 - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) setPixel(buf, px, py, r, g, b, a);
    }
  }
}

export function blit(dst: PixelBuffer, src: PixelBuffer, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const sIdx = (y * src.w + x) * 4;
      const a = src.rgba[sIdx + 3]!;
      if (a === 0) continue;
      setPixel(dst, dx + x, dy + y, src.rgba[sIdx]!, src.rgba[sIdx + 1]!, src.rgba[sIdx + 2]!, a);
    }
  }
}

