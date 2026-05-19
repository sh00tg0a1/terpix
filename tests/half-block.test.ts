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
});
