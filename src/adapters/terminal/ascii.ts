import type { CharFrame } from '../../core/types.js';
import { WIDE_TRAIL } from '../../core/char-grid.js';

const ESC = 0x1b;
const NEWLINE = new TextEncoder().encode('\r\n');
const RESET = new TextEncoder().encode('\x1b[0m');
const CURSOR_HOME = new TextEncoder().encode('\x1b[H');

function writeAnsiColor(buf: number[], prefix: number, r: number, g: number, b: number): void {
  buf.push(ESC, 0x5b);
  pushDigits(buf, prefix);
  buf.push(0x3b, 0x32, 0x3b);
  pushDigits(buf, r);
  buf.push(0x3b);
  pushDigits(buf, g);
  buf.push(0x3b);
  pushDigits(buf, b);
  buf.push(0x6d);
}

function pushDigits(buf: number[], n: number): void {
  if (n >= 100) buf.push(0x30 + Math.floor(n / 100));
  if (n >= 10) buf.push(0x30 + (Math.floor(n / 10) % 10));
  buf.push(0x30 + (n % 10));
}

// Encodes a CharFrame as a stream of ANSI cells: per-cell fg, bg, then char.
// One terminal cell per buffer cell — char width = 1, no doubling.
export class AsciiEncoder {
  readonly name = 'ascii' as const;
  readonly cellRatio = { w: 1, h: 1 } as const;

  encode(frame: CharFrame): Uint8Array {
    const { w, h, chars, fg, bg } = frame;
    const out: number[] = [];
    out.push(...CURSOR_HOME);
    const enc = new TextEncoder();
    for (let y = 0; y < h; y++) {
      let curFgR = -1, curFgG = -1, curFgB = -1;
      let curBgR = -1, curBgG = -1, curBgB = -1;
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const ci = idx * 3;
        const fR = fg[ci]!;
        const fG = fg[ci + 1]!;
        const fB = fg[ci + 2]!;
        const bR = bg[ci]!;
        const bG = bg[ci + 1]!;
        const bB = bg[ci + 2]!;
        const codeRaw = chars[idx]!;
        // The cell trailing a wide glyph: emit nothing — the wide char to its
        // left already spans this terminal column.
        if (codeRaw === WIDE_TRAIL) continue;
        const code = codeRaw === 0 ? 0x20 : codeRaw;
        if (fR !== curFgR || fG !== curFgG || fB !== curFgB) {
          writeAnsiColor(out, 38, fR, fG, fB);
          curFgR = fR; curFgG = fG; curFgB = fB;
        }
        if (bR !== curBgR || bG !== curBgG || bB !== curBgB) {
          writeAnsiColor(out, 48, bR, bG, bB);
          curBgR = bR; curBgG = bG; curBgB = bB;
        }
        if (code < 0x80) {
          out.push(code);
        } else {
          const bytes = enc.encode(String.fromCharCode(code));
          for (const byte of bytes) out.push(byte);
        }
      }
      out.push(...RESET);
      if (y + 1 < h) out.push(...NEWLINE);
    }
    return new Uint8Array(out);
  }
}
