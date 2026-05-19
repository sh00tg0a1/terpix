import type { CharFrame } from './types.js';

export interface CharBuffer {
  w: number;
  h: number;
  chars: Uint16Array;
  fg: Uint8Array;
  bg: Uint8Array;
}

export function createCharBuffer(w: number, h: number): CharBuffer {
  return {
    w,
    h,
    chars: new Uint16Array(w * h),
    fg: new Uint8Array(w * h * 3),
    bg: new Uint8Array(w * h * 3),
  };
}

export function charBufferToFrame(buf: CharBuffer, ptsMs: number): CharFrame {
  return { w: buf.w, h: buf.h, ptsMs, chars: buf.chars, fg: buf.fg, bg: buf.bg };
}

export function setCell(
  buf: CharBuffer,
  x: number,
  y: number,
  ch: number,
  fr: number,
  fg: number,
  fb: number,
): void {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const idx = y * buf.w + x;
  buf.chars[idx] = ch;
  const ci = idx * 3;
  buf.fg[ci] = fr;
  buf.fg[ci + 1] = fg;
  buf.fg[ci + 2] = fb;
}

export function setBg(
  buf: CharBuffer,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
): void {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return;
  const ci = (y * buf.w + x) * 3;
  buf.bg[ci] = r;
  buf.bg[ci + 1] = g;
  buf.bg[ci + 2] = b;
}

export function fillBg(buf: CharBuffer, r: number, g: number, b: number): void {
  for (let i = 0; i < buf.w * buf.h; i++) {
    buf.bg[i * 3] = r;
    buf.bg[i * 3 + 1] = g;
    buf.bg[i * 3 + 2] = b;
  }
}

export function drawString(
  buf: CharBuffer,
  text: string,
  x: number,
  y: number,
  fr: number,
  fg: number,
  fb: number,
): void {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x20) continue; // skip transparent space inside string
    setCell(buf, x + i, y, code, fr, fg, fb);
  }
}
