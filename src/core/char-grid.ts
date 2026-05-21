import type { CharFrame } from './types.js';

// Sentinel stored in the cell *after* a double-width (CJK) glyph. The encoder
// emits nothing for it: the wide glyph to its left already occupies this
// terminal column, so emitting a space here would shove the row right by one.
export const WIDE_TRAIL = 0x0001;

// East Asian Wide / Fullwidth code points occupy two terminal columns. We only
// handle the BMP because cells store a single UTF-16 unit. Covers CJK ideo-
// graphs, kana, Hangul, and fullwidth forms — enough for Chinese text.
export function isWideChar(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK radicals, Kangxi, punctuation
    (code >= 0x3041 && code <= 0x33ff) || // kana, CJK symbols
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Ext A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0xa000 && code <= 0xa4cf) || // Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK compatibility ideographs
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK compatibility forms
    (code >= 0xff00 && code <= 0xff60) || // Fullwidth forms
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

// Display width of a string in terminal columns (wide chars count as 2).
export function displayWidth(text: string): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) w += isWideChar(text.charCodeAt(i)) ? 2 : 1;
  return w;
}

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
  let col = x;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x20) {
      col += 1; // transparent space still advances the cursor
      continue;
    }
    setCell(buf, col, y, code, fr, fg, fb);
    if (isWideChar(code)) {
      // Reserve the next column so following glyphs don't render under the
      // wide one; the encoder skips this sentinel.
      setCell(buf, col + 1, y, WIDE_TRAIL, fr, fg, fb);
      col += 2;
    } else {
      col += 1;
    }
  }
}
