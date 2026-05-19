import { describe, expect, it } from 'vitest';
import { clamp, ease, hexToRgb, lerp, lerpRgb, mulberry32 } from '../src/core/math.js';

describe('math', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('lerp', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('lerpRgb', () => {
    expect(lerpRgb([0, 0, 0], [255, 255, 255], 0.5)).toEqual([127.5, 127.5, 127.5]);
    expect(lerpRgb([255, 0, 0], [0, 0, 255], 0)).toEqual([255, 0, 0]);
    expect(lerpRgb([255, 0, 0], [0, 0, 255], 1)).toEqual([0, 0, 255]);
  });

  describe('ease', () => {
    it('linear is identity in [0,1]', () => {
      expect(ease(0, 'linear')).toBe(0);
      expect(ease(0.5, 'linear')).toBe(0.5);
      expect(ease(1, 'linear')).toBe(1);
    });
    it('clamps out-of-range input', () => {
      expect(ease(-1, 'linear')).toBe(0);
      expect(ease(2, 'linear')).toBe(1);
    });
    it('easeIn starts slow, ends fast', () => {
      expect(ease(0.5, 'easeIn')).toBeLessThan(0.5);
      expect(ease(0, 'easeIn')).toBe(0);
      expect(ease(1, 'easeIn')).toBe(1);
    });
    it('easeOut starts fast, ends slow', () => {
      expect(ease(0.5, 'easeOut')).toBeGreaterThan(0.5);
      expect(ease(0, 'easeOut')).toBe(0);
      expect(ease(1, 'easeOut')).toBe(1);
    });
    it('easeInOut symmetric around 0.5', () => {
      expect(ease(0.5, 'easeInOut')).toBeCloseTo(0.5, 5);
      expect(ease(0.25, 'easeInOut') + ease(0.75, 'easeInOut')).toBeCloseTo(1, 5);
    });
  });

  describe('mulberry32', () => {
    it('is deterministic for same seed', () => {
      const r1 = mulberry32(42);
      const r2 = mulberry32(42);
      for (let i = 0; i < 10; i++) expect(r1()).toBe(r2());
    });
    it('differs across seeds', () => {
      const r1 = mulberry32(1);
      const r2 = mulberry32(2);
      expect(r1()).not.toBe(r2());
    });
    it('outputs in [0,1)', () => {
      const r = mulberry32(7);
      for (let i = 0; i < 200; i++) {
        const v = r();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  });

  describe('hexToRgb', () => {
    it('6-digit', () => {
      expect(hexToRgb('#ff0000')).toEqual([255, 0, 0]);
      expect(hexToRgb('00ff00')).toEqual([0, 255, 0]);
      expect(hexToRgb('#0000ff')).toEqual([0, 0, 255]);
      expect(hexToRgb('#abcdef')).toEqual([0xab, 0xcd, 0xef]);
    });
    it('3-digit expanded', () => {
      expect(hexToRgb('#f00')).toEqual([255, 0, 0]);
      expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
    });
    it('throws on bad input', () => {
      expect(() => hexToRgb('#xx')).toThrow();
      expect(() => hexToRgb('#12345')).toThrow();
    });
  });
});
