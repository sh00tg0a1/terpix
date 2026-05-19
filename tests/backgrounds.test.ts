import { describe, expect, it } from 'vitest';
import { paintBackground } from '../src/core/backgrounds.js';
import { createBuffer } from '../src/core/pixel.js';

describe('backgrounds', () => {
  it('solid fills uniformly', () => {
    const buf = createBuffer(3, 3);
    paintBackground(buf, { type: 'solid', color: '#aabbcc' }, 0);
    for (let i = 0; i < buf.rgba.length; i += 4) {
      expect(buf.rgba[i]).toBe(0xaa);
      expect(buf.rgba[i + 1]).toBe(0xbb);
      expect(buf.rgba[i + 2]).toBe(0xcc);
      expect(buf.rgba[i + 3]).toBe(255);
    }
  });

  it('vertical gradient: top row near "from", bottom row near "to"', () => {
    const buf = createBuffer(2, 4);
    paintBackground(
      buf,
      { type: 'gradient', from: '#000000', to: '#ffffff', direction: 'vertical' },
      0,
    );
    expect(buf.rgba[0]).toBe(0); // top-left R
    expect(buf.rgba[(3 * 2) * 4]).toBe(255); // bottom-left R
  });

  it('horizontal gradient: left col near "from", right col near "to"', () => {
    const buf = createBuffer(4, 2);
    paintBackground(
      buf,
      { type: 'gradient', from: '#000000', to: '#ffffff', direction: 'horizontal' },
      0,
    );
    expect(buf.rgba[0]).toBe(0); // (0,0) R
    expect(buf.rgba[3 * 4]).toBe(255); // (3,0) R
  });

  it('starfield is deterministic for same seed + t', () => {
    const a = createBuffer(20, 20);
    const b = createBuffer(20, 20);
    paintBackground(a, { type: 'starfield', density: 0.1, seed: 5 }, 100);
    paintBackground(b, { type: 'starfield', density: 0.1, seed: 5 }, 100);
    expect(Array.from(a.rgba)).toEqual(Array.from(b.rgba));
  });

  it('starfield differs for different seeds', () => {
    const a = createBuffer(20, 20);
    const b = createBuffer(20, 20);
    paintBackground(a, { type: 'starfield', density: 0.2, seed: 1 }, 0);
    paintBackground(b, { type: 'starfield', density: 0.2, seed: 999 }, 0);
    expect(Array.from(a.rgba)).not.toEqual(Array.from(b.rgba));
  });

  it('nebula is deterministic for same seed + t', () => {
    const a = createBuffer(16, 16);
    const b = createBuffer(16, 16);
    paintBackground(
      a,
      { type: 'nebula', colorA: '#220044', colorB: '#aa44ff', scale: 0.02, seed: 7 },
      500,
    );
    paintBackground(
      b,
      { type: 'nebula', colorA: '#220044', colorB: '#aa44ff', scale: 0.02, seed: 7 },
      500,
    );
    expect(Array.from(a.rgba)).toEqual(Array.from(b.rgba));
  });

  it('nebula drifts over time', () => {
    const a = createBuffer(16, 16);
    const b = createBuffer(16, 16);
    paintBackground(
      a,
      { type: 'nebula', colorA: '#220044', colorB: '#aa44ff', scale: 0.02, seed: 7 },
      0,
    );
    paintBackground(
      b,
      { type: 'nebula', colorA: '#220044', colorB: '#aa44ff', scale: 0.02, seed: 7 },
      8000,
    );
    expect(Array.from(a.rgba)).not.toEqual(Array.from(b.rgba));
  });
});
