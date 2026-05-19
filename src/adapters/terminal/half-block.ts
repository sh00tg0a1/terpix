import type { Encoder } from '../../core/encoder.js';
import type { CellRatio, RGBFrame } from '../../core/types.js';

const ESC = 0x1b;
const LBR = 0x5b; // '['
const SEMI = 0x3b; // ';'
const M = 0x6d; // 'm'
// ▀ U+2580 → UTF-8 0xE2 0x96 0x80 (used for cells with top ≠ bottom).
const HB0 = 0xe2;
const HB1 = 0x96;
const HB2 = 0x80;
const SP = 0x20; // SPACE — for solid (top == bot) cells.
const CR = 0x0d;
const LF = 0x0a;
const H = 0x48; // 'H' for cursor home

function writeDigits(out: Uint8Array, off: number, n: number): number {
  if (n >= 100) {
    out[off++] = 0x30 + Math.floor(n / 100);
    out[off++] = 0x30 + (Math.floor(n / 10) % 10);
    out[off++] = 0x30 + (n % 10);
  } else if (n >= 10) {
    out[off++] = 0x30 + Math.floor(n / 10);
    out[off++] = 0x30 + (n % 10);
  } else {
    out[off++] = 0x30 + n;
  }
  return off;
}

function writeAnsiColor(
  out: Uint8Array,
  off: number,
  prefix: number,
  r: number,
  g: number,
  b: number,
): number {
  out[off++] = ESC;
  out[off++] = LBR;
  off = writeDigits(out, off, prefix);
  out[off++] = SEMI;
  out[off++] = 0x32; // '2'
  out[off++] = SEMI;
  off = writeDigits(out, off, r);
  out[off++] = SEMI;
  off = writeDigits(out, off, g);
  out[off++] = SEMI;
  off = writeDigits(out, off, b);
  out[off++] = M;
  return off;
}

function writeCursorForward(out: Uint8Array, off: number, n: number): number {
  if (n <= 0) return off;
  out[off++] = ESC;
  out[off++] = LBR;
  off = writeDigits(out, off, n);
  out[off++] = 0x43; // 'C'
  return off;
}

export class HalfBlockEncoder implements Encoder {
  readonly name = 'half' as const;
  readonly cellRatio: CellRatio = { w: 1, h: 2 };
  // Re-used scratch buffer; grows as needed. Allocating once avoids 50k+
  // Array.push calls per frame.
  private scratch = new Uint8Array(0);

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

    // Worst-case bytes per cell: ESC[38;2;R;G;Bm (≤20) + ESC[48;2;R;G;Bm (≤20)
    // + 3 bytes ▀ = 43. Plus per-row ESC[0m + CRLF + occasional ESC[<N>C.
    // Reserve generously; cheaper than reallocating mid-frame.
    const cells = (w * h) / 2;
    const need = cells * 48 + h * 8 + 16;
    if (this.scratch.length < need) this.scratch = new Uint8Array(need);
    const out = this.scratch;
    let off = 0;

    // ESC [ H — cursor home
    out[off++] = ESC;
    out[off++] = LBR;
    out[off++] = H;

    for (let y = 0; y < h; y += 2) {
      let curFgR = -1, curFgG = -1, curFgB = -1;
      let curBgR = -1, curBgG = -1, curBgB = -1;
      let skipCount = 0;
      const yw = y * w;
      const ywNext = (y + 1) * w;

      for (let x = 0; x < w; x++) {
        const topIdx = (yw + x) * 4;
        const botIdx = (ywNext + x) * 4;
        const tR = rgba[topIdx]!;
        const tG = rgba[topIdx + 1]!;
        const tB = rgba[topIdx + 2]!;
        const bR = rgba[botIdx]!;
        const bG = rgba[botIdx + 1]!;
        const bB = rgba[botIdx + 2]!;

        if (p !== undefined) {
          if (
            tR === p[topIdx] &&
            tG === p[topIdx + 1] &&
            tB === p[topIdx + 2] &&
            bR === p[botIdx] &&
            bG === p[botIdx + 1] &&
            bB === p[botIdx + 2]
          ) {
            skipCount++;
            curFgR = -1;
            curBgR = -1;
            continue;
          }
        }

        if (skipCount > 0) {
          off = writeCursorForward(out, off, skipCount);
          skipCount = 0;
        }

        const solid = tR === bR && tG === bG && tB === bB;
        const wantBgR = solid ? tR : bR;
        const wantBgG = solid ? tG : bG;
        const wantBgB = solid ? tB : bB;
        if (tR !== curFgR || tG !== curFgG || tB !== curFgB) {
          off = writeAnsiColor(out, off, 38, tR, tG, tB);
          curFgR = tR; curFgG = tG; curFgB = tB;
        }
        if (wantBgR !== curBgR || wantBgG !== curBgG || wantBgB !== curBgB) {
          off = writeAnsiColor(out, off, 48, wantBgR, wantBgG, wantBgB);
          curBgR = wantBgR; curBgG = wantBgG; curBgB = wantBgB;
        }
        if (solid) {
          out[off++] = SP;
        } else {
          out[off++] = HB0;
          out[off++] = HB1;
          out[off++] = HB2;
        }
      }
      // ESC [ 0 m
      out[off++] = ESC;
      out[off++] = LBR;
      out[off++] = 0x30;
      out[off++] = M;
      if (y + 2 < h) {
        out[off++] = CR;
        out[off++] = LF;
      }
    }

    return out.subarray(0, off);
  }
}
