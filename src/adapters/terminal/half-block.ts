import type { Encoder } from '../../core/encoder.js';
import type { CellRatio, RGBFrame } from '../../core/types.js';

const ESC = 0x1b;
const HALF_BLOCK_BYTES = new TextEncoder().encode('▀');
const NEWLINE = new TextEncoder().encode('\r\n');
const RESET = new TextEncoder().encode('\x1b[0m');
const CURSOR_HOME = new TextEncoder().encode('\x1b[H');

function pushDigits(buf: number[], n: number): void {
  if (n >= 100) buf.push(0x30 + Math.floor(n / 100));
  if (n >= 10) buf.push(0x30 + (Math.floor(n / 10) % 10));
  buf.push(0x30 + (n % 10));
}

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

// Cursor forward N columns: ESC[<N>C
function writeCursorForward(buf: number[], n: number): void {
  if (n <= 0) return;
  buf.push(ESC, 0x5b);
  pushDigits(buf, n);
  buf.push(0x43);
}

export class HalfBlockEncoder implements Encoder {
  readonly name = 'half' as const;
  readonly cellRatio: CellRatio = { w: 1, h: 2 };

  encode(frame: RGBFrame, prev?: RGBFrame): Uint8Array {
    const { w, h, rgba } = frame;
    if (rgba.length !== w * h * 4) {
      throw new Error(`half-block: expected ${w * h * 4} bytes, got ${rgba.length}`);
    }
    if (h % 2 !== 0) {
      throw new Error(`half-block: frame height must be even, got ${h}`);
    }
    const sameShape = !!prev && prev.w === w && prev.h === h && prev.rgba.length === rgba.length;
    const p = sameShape && prev ? prev.rgba : undefined;

    const out: number[] = [];
    out.push(...CURSOR_HOME);

    for (let y = 0; y < h; y += 2) {
      // Per-row state. Initial "unknown" colors force first emission of fg/bg.
      let curFgR = -1, curFgG = -1, curFgB = -1;
      let curBgR = -1, curBgG = -1, curBgB = -1;
      let skipCount = 0;

      for (let x = 0; x < w; x++) {
        const topIdx = (y * w + x) * 4;
        const botIdx = ((y + 1) * w + x) * 4;
        const tR = rgba[topIdx]!;
        const tG = rgba[topIdx + 1]!;
        const tB = rgba[topIdx + 2]!;
        const bR = rgba[botIdx]!;
        const bG = rgba[botIdx + 1]!;
        const bB = rgba[botIdx + 2]!;

        // Frame diff: skip cells unchanged from previous frame.
        if (p) {
          const ptR = p[topIdx]!;
          const ptG = p[topIdx + 1]!;
          const ptB = p[topIdx + 2]!;
          const pbR = p[botIdx]!;
          const pbG = p[botIdx + 1]!;
          const pbB = p[botIdx + 2]!;
          if (tR === ptR && tG === ptG && tB === ptB && bR === pbR && bG === pbG && bB === pbB) {
            skipCount++;
            // Skipping invalidates the running fg/bg state because we did not emit.
            curFgR = -1;
            curBgR = -1;
            continue;
          }
        }

        if (skipCount > 0) {
          writeCursorForward(out, skipCount);
          skipCount = 0;
        }

        // Same-color coalescing across consecutive cells on this row.
        if (tR !== curFgR || tG !== curFgG || tB !== curFgB) {
          writeAnsiColor(out, 38, tR, tG, tB);
          curFgR = tR; curFgG = tG; curFgB = tB;
        }
        if (bR !== curBgR || bG !== curBgG || bB !== curBgB) {
          writeAnsiColor(out, 48, bR, bG, bB);
          curBgR = bR; curBgG = bG; curBgB = bB;
        }
        out.push(...HALF_BLOCK_BYTES);
      }
      // End-of-row: only reset if we drew anything to leave a clean state.
      out.push(...RESET);
      if (y + 2 < h) out.push(...NEWLINE);
    }

    return new Uint8Array(out);
  }
}
