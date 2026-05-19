import { describe, expect, it } from 'vitest';
import { applyStyle, resolveStyle } from '../src/core/styles.js';
import { createBuffer } from '../src/core/pixel.js';
import { hexToRgb } from '../src/core/math.js';

describe('styles', () => {
  describe('resolveStyle', () => {
    it('returns default config for undefined preset', () => {
      const cfg = resolveStyle(undefined);
      expect(cfg.palette).toBe('full');
      expect(cfg.edgeOnly).toBe(false);
    });

    it('starwars uses duotone + black bg + edge-only', () => {
      const cfg = resolveStyle('starwars');
      expect(cfg.palette).toBe('duotone');
      expect(cfg.edgeOnly).toBe(true);
      expect(cfg.forceBackground).toBe('#000000');
      expect(cfg.paletteColors).toEqual(['#000000', '#ffd633']);
    });

    it('minimalist uses light bg with dark stroke', () => {
      const cfg = resolveStyle('minimalist');
      expect(cfg.palette).toBe('duotone');
      expect(cfg.edgeOnly).toBe(true);
      expect(cfg.forceBackground).toBe('#f6f3ec');
    });
  });

  describe('applyStyle duotone', () => {
    it('quantizes every pixel to one of the two palette colors', () => {
      const buf = createBuffer(4, 1);
      // 4 pixels: black, dark-grey, light-grey, white
      buf.rgba.set([0, 0, 0, 255, 80, 80, 80, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
      applyStyle(buf, {
        palette: 'duotone',
        paletteColors: ['#000000', '#ffd633'],
        edgeOnly: false,
        edgeThreshold: 25,
      });
      const fg = hexToRgb('#ffd633');
      const bg = hexToRgb('#000000');
      for (let i = 0; i < 4; i++) {
        const r = buf.rgba[i * 4]!;
        const g = buf.rgba[i * 4 + 1]!;
        const b = buf.rgba[i * 4 + 2]!;
        const isFg = r === fg[0] && g === fg[1] && b === fg[2];
        const isBg = r === bg[0] && g === bg[1] && b === bg[2];
        expect(isFg || isBg).toBe(true);
      }
      // Brightest pixel should map to fg (lighter palette color).
      expect(buf.rgba[12]).toBe(fg[0]);
    });

    it('respects fg-darker-than-bg palette ordering', () => {
      const buf = createBuffer(2, 1);
      buf.rgba.set([0, 0, 0, 255, 255, 255, 255, 255]);
      applyStyle(buf, {
        palette: 'duotone',
        paletteColors: ['#ffffff', '#000000'],
        edgeOnly: false,
        edgeThreshold: 25,
      });
      // bg=white, fg=black; black pixel → fg (black), white pixel → bg (white)
      expect(buf.rgba[0]).toBe(0);
      expect(buf.rgba[4]).toBe(255);
    });
  });

  describe('applyStyle edge-only', () => {
    it('flat region → all background; transition row → fg edge', () => {
      const buf = createBuffer(6, 3);
      // Half black, half white horizontally.
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 6; x++) {
          const i = (y * 6 + x) * 4;
          const v = x < 3 ? 0 : 255;
          buf.rgba[i] = v;
          buf.rgba[i + 1] = v;
          buf.rgba[i + 2] = v;
          buf.rgba[i + 3] = 255;
        }
      }
      applyStyle(buf, {
        palette: 'duotone',
        paletteColors: ['#000000', '#ffd633'],
        edgeOnly: true,
        edgeThreshold: 50,
      });
      const fg = hexToRgb('#ffd633');
      // Center row: pixels at x=2 and x=3 sit at the boundary → fg.
      const i23 = (1 * 6 + 2) * 4;
      const i33 = (1 * 6 + 3) * 4;
      expect(buf.rgba[i23]).toBe(fg[0]);
      expect(buf.rgba[i33]).toBe(fg[0]);
      // Far-left pixel (no neighbor change) → bg.
      const i00 = 0;
      expect(buf.rgba[i00]).toBe(0);
    });
  });

  describe('default preset is a no-op', () => {
    it('does not mutate the buffer', () => {
      const buf = createBuffer(3, 3);
      for (let i = 0; i < buf.rgba.length; i += 4) {
        buf.rgba[i] = 12;
        buf.rgba[i + 1] = 34;
        buf.rgba[i + 2] = 56;
        buf.rgba[i + 3] = 255;
      }
      const snapshot = Array.from(buf.rgba);
      applyStyle(buf, resolveStyle('default'));
      expect(Array.from(buf.rgba)).toEqual(snapshot);
    });
  });
});
