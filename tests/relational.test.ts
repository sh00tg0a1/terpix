import { describe, expect, it, beforeEach } from 'vitest';
import { clearRegistry } from '../src/core/assets/registry.js';
import { registerBuiltins } from '../src/core/assets/builtin/index.js';
import { loadUserAssets } from '../src/core/assets/loader.js';
import { resolveSpriteGeoms } from '../src/core/compositor.js';
import { createBuffer } from '../src/core/pixel.js';
import { Layer, type LayerT, type CameraT } from '../src/core/dsl.js';

const FLAT: CameraT = { projection: 'flat', tilt: 0.5 };

function sprite(raw: unknown): LayerT {
  return Layer.parse(raw);
}

describe('relational placement (`on`)', () => {
  beforeEach(() => {
    clearRegistry();
    registerBuiltins();
    loadUserAssets(); // bowl
  });

  const table = sprite({
    type: 'sprite', asset: 'table', id: 'tbl', ease: 'linear',
    keyframes: [{ tMs: 0, x: 0.5, y: 0.6, scale: 4 }],
  });

  it('lifts a sprite onto its target surface, overriding its own y', () => {
    // bowl's own keyframe would put it near the bottom (y=0.9 → cy≈324 of 360);
    // placing it ON the table must lift it to the surface band instead.
    const bowl = sprite({
      type: 'sprite', asset: 'bowl', ease: 'linear',
      on: { layer: 'tbl', at: 'surface', depth: 0.5 },
      keyframes: [{ tMs: 0, x: 0.5, y: 0.9, scale: 1 }],
    });
    const buf = createBuffer(640, 360);
    const geoms = resolveSpriteGeoms([table, bowl], buf, FLAT, 0);
    const g = geoms.get(bowl)!;
    expect(g.cy).toBeLessThan(250); // on the table, not at its own y=0.9 (≈324)
    expect(g.cy).toBeGreaterThan(120);
  });

  it('makes far (depth=1) items higher and smaller than near (depth=0)', () => {
    const near = sprite({ type: 'sprite', asset: 'bowl', ease: 'linear', on: { layer: 'tbl', depth: 0 }, keyframes: [{ tMs: 0, scale: 1 }] });
    const far = sprite({ type: 'sprite', asset: 'bowl', ease: 'linear', on: { layer: 'tbl', depth: 1 }, keyframes: [{ tMs: 0, scale: 1 }] });
    const buf = createBuffer(640, 360);
    const geoms = resolveSpriteGeoms([table, near, far], buf, FLAT, 0);
    const gn = geoms.get(near)!;
    const gf = geoms.get(far)!;
    expect(gf.cy).toBeLessThan(gn.cy); // far is higher up the frame
    expect(gf.size).toBeLessThan(gn.size); // far is smaller
  });

  it('falls back to own keyframes when the target id is unknown', () => {
    const orphan = sprite({
      type: 'sprite', asset: 'bowl', ease: 'linear',
      on: { layer: 'nope', at: 'surface' },
      keyframes: [{ tMs: 0, x: 0.5, y: 0.9, scale: 1 }],
    });
    const buf = createBuffer(640, 360);
    const geoms = resolveSpriteGeoms([orphan], buf, FLAT, 0);
    const g = geoms.get(orphan)!;
    expect(g.cy).toBeCloseTo(0.9 * 360, 0); // unresolved → its own y
  });
});
