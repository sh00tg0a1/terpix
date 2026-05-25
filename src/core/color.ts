export type RGB = [number, number, number];

const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/**
 * Scale a color's brightness. `f > 1` lightens, `f < 1` darkens. Used to
 * derive shadow/highlight tones from a single base color so a sprite drawn
 * from one `layer.color` still reads with volume instead of a flat blob.
 */
export function shade([r, g, b]: RGB, f: number): RGB {
  return [clamp(r * f), clamp(g * f), clamp(b * f)];
}

/** Linear blend from a to b, t in 0..1. */
export function mix([r1, g1, b1]: RGB, [r2, g2, b2]: RGB, t: number): RGB {
  return [clamp(r1 + (r2 - r1) * t), clamp(g1 + (g2 - g1) * t), clamp(b1 + (b2 - b1) * t)];
}
