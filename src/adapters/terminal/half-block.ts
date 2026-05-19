import type { Encoder } from '../../core/encoder.js';
import type { CellRatio, RGBFrame } from '../../core/types.js';

const ESC = 0x1b;
const HALF_BLOCK = '▀';
const HALF_BYTES = new TextEncoder().encode(HALF_BLOCK);
const NEWLINE = new TextEncoder().encode('\r\n');
const RESET = new TextEncoder().encode('\x1b[0m');
const CURSOR_HOME = new TextEncoder().encode('\x1b[H');

function writeAnsiColor(buf: number[], prefix: number, r: number, g: number, b: number): void {
  buf.push(ESC, 0x5b); // ESC [
  pushDigits(buf, prefix);
  buf.push(0x3b, 0x32, 0x3b); // ;2;
  pushDigits(buf, r);
  buf.push(0x3b);
  pushDigits(buf, g);
  buf.push(0x3b);
  pushDigits(buf, b);
  buf.push(0x6d); // m
}

function pushDigits(buf: number[], n: number): void {
  if (n >= 100) buf.push(0x30 + Math.floor(n / 100));
  if (n >= 10) buf.push(0x30 + (Math.floor(n / 10) % 10));
  buf.push(0x30 + (n % 10));
}

export class HalfBlockEncoder implements Encoder {
  readonly name = 'half' as const;
  readonly cellRatio: CellRatio = { w: 1, h: 2 };

  encode(frame: RGBFrame): Uint8Array {
    const { w, h, rgba } = frame;
    if (rgba.length !== w * h * 4) {
      throw new Error(`half-block: expected ${w * h * 4} bytes, got ${rgba.length}`);
    }
    if (h % 2 !== 0) {
      throw new Error(`half-block: frame height must be even, got ${h}`);
    }

    const out: number[] = [];
    out.push(...CURSOR_HOME);

    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x++) {
        const topIdx = (y * w + x) * 4;
        const botIdx = ((y + 1) * w + x) * 4;
        writeAnsiColor(out, 38, rgba[topIdx]!, rgba[topIdx + 1]!, rgba[topIdx + 2]!);
        writeAnsiColor(out, 48, rgba[botIdx]!, rgba[botIdx + 1]!, rgba[botIdx + 2]!);
        out.push(...HALF_BYTES);
      }
      out.push(...RESET);
      if (y + 2 < h) out.push(...NEWLINE);
    }

    return new Uint8Array(out);
  }
}
