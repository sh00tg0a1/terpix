import { describe, expect, it } from 'vitest';
import { HalfBlockEncoder } from '../src/adapters/terminal/half-block.js';
import type { RGBFrame } from '../src/core/types.js';

function frame(w: number, h: number, pixels: number[][]): RGBFrame {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < pixels.length; i++) {
    const [r, g, b] = pixels[i]!;
    rgba[i * 4] = r!;
    rgba[i * 4 + 1] = g!;
    rgba[i * 4 + 2] = b!;
    rgba[i * 4 + 3] = 255;
  }
  return { w, h, ptsMs: 0, rgba };
}

describe('HalfBlockEncoder', () => {
  it('cellRatio is 1x2', () => {
    expect(new HalfBlockEncoder().cellRatio).toEqual({ w: 1, h: 2 });
  });

  it('rejects odd height', () => {
    const enc = new HalfBlockEncoder();
    expect(() => enc.encode(frame(1, 1, [[0, 0, 0]]))).toThrow(/even/);
  });

  it('rejects wrong byte length', () => {
    const enc = new HalfBlockEncoder();
    expect(() =>
      enc.encode({ w: 2, h: 2, ptsMs: 0, rgba: new Uint8Array(4) }),
    ).toThrow(/expected/);
  });

  it('encodes 1x2 red-over-blue to fg-red + bg-blue + half-block', () => {
    const enc = new HalfBlockEncoder();
    const bytes = enc.encode(
      frame(1, 2, [
        [255, 0, 0],
        [0, 0, 255],
      ]),
    );
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('\x1b[H');
    expect(text).toContain('\x1b[38;2;255;0;0m');
    expect(text).toContain('\x1b[48;2;0;0;255m');
    expect(text).toContain('▀');
    expect(text.endsWith('\x1b[0m')).toBe(true);
  });

  it('produces stable bytes for 2x2 fixture', () => {
    const enc = new HalfBlockEncoder();
    const bytes = enc.encode(
      frame(2, 2, [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [255, 255, 0],
      ]),
    );
    const text = new TextDecoder().decode(bytes);
    const expected =
      '\x1b[H' +
      '\x1b[38;2;255;0;0m\x1b[48;2;0;0;255m▀' +
      '\x1b[38;2;0;255;0m\x1b[48;2;255;255;0m▀' +
      '\x1b[0m';
    expect(text).toBe(expected);
  });

  it('coalesces consecutive same-color cells (single fg+bg emit per run)', () => {
    const enc = new HalfBlockEncoder();
    const bytes = enc.encode(
      frame(4, 2, [
        [255, 0, 0], [255, 0, 0], [255, 0, 0], [255, 0, 0],
        [0, 0, 255], [0, 0, 255], [0, 0, 255], [0, 0, 255],
      ]),
    );
    const text = new TextDecoder().decode(bytes);
    expect(text.match(/\x1b\[38;2;255;0;0m/g)?.length).toBe(1);
    expect(text.match(/\x1b\[48;2;0;0;255m/g)?.length).toBe(1);
    expect(text.match(/▀/g)?.length).toBe(4);
  });

  it('skips unchanged cells when prev frame supplied (cursor-forward)', () => {
    const enc = new HalfBlockEncoder();
    const f1 = frame(3, 2, [
      [255, 0, 0], [0, 255, 0], [0, 0, 255],
      [10, 10, 10], [20, 20, 20], [30, 30, 30],
    ]);
    const f2 = frame(3, 2, [
      [255, 0, 0], [9, 9, 9], [0, 0, 255],
      [10, 10, 10], [99, 99, 99], [30, 30, 30],
    ]);
    const bytes = enc.encode(f2, f1);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('\x1b[1C');
    expect(text).toContain('\x1b[38;2;9;9;9m');
    expect(text).toContain('\x1b[48;2;99;99;99m');
    expect(text).not.toContain('\x1b[38;2;255;0;0m');
  });

  it('falls back to full repaint when prev shape mismatches', () => {
    const enc = new HalfBlockEncoder();
    const f1 = frame(2, 2, [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]]);
    const f2 = frame(4, 2, [
      [1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12],
      [13, 14, 15], [16, 17, 18], [19, 20, 21], [22, 23, 24],
    ]);
    const bytes = enc.encode(f2, f1);
    const text = new TextDecoder().decode(bytes);
    expect(text).not.toContain('\x1b[1C');
    expect(text.match(/▀/g)?.length).toBe(4);
  });

  it('uses FULL BLOCK (█) when top and bottom pixel are the same color', () => {
    const enc = new HalfBlockEncoder();
    const bytes = enc.encode(
      frame(2, 2, [
        [255, 0, 0], [255, 0, 0],
        [255, 0, 0], [255, 0, 0],
      ]),
    );
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('█');
    // bg = fg for solid cells (prevents terminal default bg leaking through).
    expect(text).toContain('\x1b[48;2;255;0;0m');
    expect(text.match(/\x1b\[38;2;255;0;0m/g)?.length).toBe(1);
    expect(text.match(/\x1b\[48;2;255;0;0m/g)?.length).toBe(1);
    expect(text.match(/█/g)?.length).toBe(2);
  });

  it('mixed solid + split cells use █ and ▀ respectively', () => {
    const enc = new HalfBlockEncoder();
    // Cell 0: top=red, bot=red (solid) → █
    // Cell 1: top=red, bot=blue (split) → ▀
    const bytes = enc.encode(
      frame(2, 2, [
        [255, 0, 0], [255, 0, 0], // top row: both red
        [255, 0, 0], [0, 0, 255], // bot row: red, blue
      ]),
    );
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('█');
    expect(text).toContain('▀');
    expect(text).toContain('\x1b[48;2;0;0;255m'); // bg blue for the split cell
  });
});
