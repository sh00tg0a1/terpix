export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export function ease(t: number, kind: Ease = 'linear'): number {
  const u = clamp(t, 0, 1);
  switch (kind) {
    case 'easeIn':
      return u * u * u;
    case 'easeOut': {
      const v = 1 - u;
      return 1 - v * v * v;
    }
    case 'easeInOut':
      return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    case 'linear':
    default:
      return u;
  }
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const s = hex.startsWith('#') ? hex.slice(1) : hex;
  const n = parseInt(s, 16);
  if (s.length === 6) return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  if (s.length === 3) {
    const r = (n >> 8) & 0xf;
    const g = (n >> 4) & 0xf;
    const b = n & 0xf;
    return [r * 17, g * 17, b * 17];
  }
  throw new Error(`bad hex color: ${hex}`);
}
