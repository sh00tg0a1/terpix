import { describe, expect, it } from 'vitest';
import {
  blit,
  createBuffer,
  fillCircle,
  fillRect,
  fillTriangle,
  setPixel,
} from '../src/core/pixel.js';

function px(buf: ReturnType<typeof createBuffer>, x: number, y: number): [number, number, number, number] {
  const i = (y * buf.w + x) * 4;
  return [buf.rgba[i]!, buf.rgba[i + 1]!, buf.rgba[i + 2]!, buf.rgba[i + 3]!];
}

describe('pixel', () => {
  describe('createBuffer', () => {
    it('initializes alpha 255 with no fill', () => {
      const b = createBuffer(3, 2);
      expect(b.w).toBe(3);
      expect(b.h).toBe(2);
      expect(b.rgba.length).toBe(24);
      for (let i = 3; i < b.rgba.length; i += 4) expect(b.rgba[i]).toBe(255);
    });
    it('honors fill color', () => {
      const b = createBuffer(2, 2, [10, 20, 30]);
      for (let i = 0; i < 4; i++) {
        expect(px(b, i % 2, Math.floor(i / 2))).toEqual([10, 20, 30, 255]);
      }
    });
  });

  describe('setPixel', () => {
    it('writes opaque', () => {
      const b = createBuffer(2, 2);
      setPixel(b, 1, 1, 100, 150, 200);
      expect(px(b, 1, 1)).toEqual([100, 150, 200, 255]);
    });
    it('clips out-of-bounds', () => {
      const b = createBuffer(2, 2);
      setPixel(b, -1, 0, 255, 0, 0);
      setPixel(b, 2, 0, 255, 0, 0);
      setPixel(b, 0, -1, 255, 0, 0);
      setPixel(b, 0, 2, 255, 0, 0);
      for (let i = 0; i < 4; i++) expect(px(b, i % 2, Math.floor(i / 2))).toEqual([0, 0, 0, 255]);
    });
    it('alpha blends', () => {
      const b = createBuffer(1, 1, [0, 0, 0]);
      setPixel(b, 0, 0, 200, 200, 200, 128);
      const [r, g, bl, a] = px(b, 0, 0);
      expect(r).toBeGreaterThan(80);
      expect(r).toBeLessThan(120);
      expect(g).toBe(r);
      expect(bl).toBe(r);
      expect(a).toBe(255);
    });
  });

  describe('fillRect', () => {
    it('fills the requested region only', () => {
      const b = createBuffer(4, 4);
      fillRect(b, 1, 1, 2, 2, 255, 0, 0);
      expect(px(b, 0, 0)).toEqual([0, 0, 0, 255]);
      expect(px(b, 1, 1)).toEqual([255, 0, 0, 255]);
      expect(px(b, 2, 2)).toEqual([255, 0, 0, 255]);
      expect(px(b, 3, 3)).toEqual([0, 0, 0, 255]);
    });
    it('clips to buffer', () => {
      const b = createBuffer(3, 3);
      fillRect(b, -2, -2, 10, 10, 0, 255, 0);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) expect(px(b, x, y)[1]).toBe(255);
    });
  });

  describe('fillCircle', () => {
    it('fills inside radius, skips outside', () => {
      const b = createBuffer(9, 9);
      fillCircle(b, 4, 4, 2, 0, 0, 255);
      expect(px(b, 4, 4)).toEqual([0, 0, 255, 255]); // center
      expect(px(b, 3, 4)[2]).toBe(255); // inside (distance 1)
      expect(px(b, 4, 0)[2]).toBe(0); // outside (distance 4 > r=2)
      expect(px(b, 8, 4)[2]).toBe(0); // outside (distance 4)
    });
  });

  describe('fillTriangle', () => {
    it('fills closed triangle', () => {
      const b = createBuffer(5, 5);
      fillTriangle(b, 0, 0, 4, 0, 0, 4, 255, 0, 0);
      expect(px(b, 0, 0)).toEqual([255, 0, 0, 255]);
      expect(px(b, 1, 1)).toEqual([255, 0, 0, 255]);
      expect(px(b, 4, 4)).toEqual([0, 0, 0, 255]);
    });
    it('degenerate triangle (collinear) draws nothing', () => {
      const b = createBuffer(4, 4);
      fillTriangle(b, 0, 0, 1, 0, 2, 0, 255, 0, 0);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) expect(px(b, x, y)[0]).toBe(0);
    });
  });

  describe('blit', () => {
    it('copies opaque pixels', () => {
      const dst = createBuffer(4, 4);
      const src = createBuffer(2, 2, [255, 128, 64]);
      blit(dst, src, 1, 1);
      expect(px(dst, 0, 0)).toEqual([0, 0, 0, 255]);
      expect(px(dst, 1, 1)).toEqual([255, 128, 64, 255]);
      expect(px(dst, 2, 2)).toEqual([255, 128, 64, 255]);
    });
    it('skips alpha-0 source pixels', () => {
      const dst = createBuffer(2, 1, [10, 20, 30]);
      const src = createBuffer(2, 1);
      src.rgba[3] = 0; // first pixel transparent
      src.rgba[4] = 200;
      src.rgba[5] = 100;
      src.rgba[6] = 50;
      src.rgba[7] = 255;
      blit(dst, src, 0, 0);
      expect(px(dst, 0, 0)).toEqual([10, 20, 30, 255]);
      expect(px(dst, 1, 0)).toEqual([200, 100, 50, 255]);
    });
  });
});
