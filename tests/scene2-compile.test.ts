import { describe, expect, it } from 'vitest';
import { Scene2 } from '../src/core/scene2/schema.js';
import { compileScene } from '../src/core/scene2/compile.js';
import type { LayerT } from '../src/core/dsl.js';

const bg = { type: 'gradient', from: '#000000', to: '#111111', direction: 'vertical' } as const;

function compile(nodes: unknown[]) {
  return compileScene(Scene2.parse({ version: 2, renderer: 'half', background: bg, nodes }));
}
const sprites = (ls: LayerT[]) => ls.filter((l) => l.type === 'sprite') as Extract<LayerT, { type: 'sprite' }>[];

describe('compileScene (v2 relational → v1)', () => {
  it('produces a valid v1 plan with one shot', () => {
    const plan = compile([{ kind: 'sprite', asset: 'planet', place: { in: 'center' } }]);
    expect(plan.version).toBe(1);
    expect(plan.shots).toHaveLength(1);
    expect(plan.shots[0]!.layers).toHaveLength(1);
  });

  it('expands repeat into N layers spread along a row', () => {
    const plan = compile([
      { kind: 'sprite', asset: 'tree', repeat: 4, place: { in: 'ground' }, distribute: { layout: 'row', gap: 0.2 } },
    ]);
    const xs = sprites(plan.shots[0]!.layers).map((l) => l.keyframes[0]!.x!);
    expect(xs).toHaveLength(4);
    expect(xs[0]!).toBeLessThan(xs[3]!); // spread left→right
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0); // stays on-frame
    expect(Math.max(...xs)).toBeLessThanOrEqual(1);
  });

  it('compiles `on` into a relational layer referencing the target id', () => {
    const plan = compile([
      { kind: 'sprite', asset: 'table', id: 't', place: { in: 'ground' } },
      { kind: 'sprite', asset: 'bowl', repeat: 3, place: { on: 't.surface' } },
    ]);
    const ls = sprites(plan.shots[0]!.layers);
    const table = ls.find((l) => l.id === 't')!;
    expect(table).toBeTruthy();
    const bowls = ls.filter((l) => l.asset === 'bowl');
    expect(bowls).toHaveLength(3);
    for (const b of bowls) {
      expect(b.on?.layer).toBe('t');
      expect(b.on?.at).toBe('surface');
    }
    // spread across the surface via dx
    expect(bowls[0]!.on!.dx).toBeLessThan(bowls[2]!.on!.dx);
  });

  it('places by region + alignment (sky top-right is up and to the right)', () => {
    const plan = compile([{ kind: 'sprite', asset: 'moon', place: { in: 'sky', align: 'top-right' } }]);
    const kf = sprites(plan.shots[0]!.layers)[0]!.keyframes[0]!;
    expect(kf.y!).toBeLessThan(0.4); // sky = upper frame
    expect(kf.x!).toBeGreaterThan(0.55); // right
  });

  it('motion cross compiles to two keyframes that span off-frame edge to edge', () => {
    const plan = compile([
      { kind: 'sprite', asset: 'spaceship', place: { in: 'center' }, motion: { kind: 'cross', dir: 'right' } },
    ]);
    const kfs = sprites(plan.shots[0]!.layers)[0]!.keyframes;
    expect(kfs).toHaveLength(2);
    expect(kfs[0]!.x!).toBeLessThan(0); // enters off the left edge
    expect(kfs[1]!.x!).toBeGreaterThan(1); // exits off the right edge
    expect(kfs[1]!.tMs).toBeGreaterThan(kfs[0]!.tMs); // travels over time
  });

  it('motion rise compiles to an upward (decreasing y) two-keyframe path', () => {
    const plan = compile([
      { kind: 'sprite', asset: 'steam', place: { in: 'center' }, motion: { kind: 'rise' } },
    ]);
    const kfs = sprites(plan.shots[0]!.layers)[0]!.keyframes;
    expect(kfs).toHaveLength(2);
    expect(kfs[1]!.y!).toBeLessThan(kfs[0]!.y!); // moves up
  });

  it('passes an iso camera through and threads node depth into keyframes', () => {
    const plan = compileScene(
      Scene2.parse({
        version: 2,
        renderer: 'half',
        background: bg,
        camera: { projection: 'iso', tilt: 0.5 },
        nodes: [{ kind: 'sprite', asset: 'bowl', depth: 0.6, place: { in: 'ground' } }],
      }),
    );
    expect(plan.camera?.projection).toBe('iso');
    expect(sprites(plan.shots[0]!.layers)[0]!.keyframes[0]!.depth).toBe(0.6);
  });

  it('omits camera and depth when not set (flat scenes stay clean)', () => {
    const plan = compile([{ kind: 'sprite', asset: 'bowl', place: { in: 'ground' } }]);
    expect(plan.camera).toBeUndefined();
    expect(sprites(plan.shots[0]!.layers)[0]!.keyframes[0]!.depth).toBeUndefined();
  });

  it('compiles a multi-shot scene into sequential v1 shots with their own backgrounds', () => {
    const plan = compileScene(
      Scene2.parse({
        version: 2,
        renderer: 'half',
        style: 'noir',
        shots: [
          { durationMs: 3000, background: bg, nodes: [{ kind: 'sprite', asset: 'spaceship', place: { in: 'center' } }] },
          {
            durationMs: 2000,
            background: { type: 'solid', color: '#220000' },
            nodes: [{ kind: 'sprite', asset: 'planet', place: { in: 'center' } }],
          },
        ],
      }),
    );
    expect(plan.shots).toHaveLength(2);
    expect(plan.shots[0]!.durationMs).toBe(3000);
    expect(plan.shots[1]!.durationMs).toBe(2000);
    expect(plan.shots[1]!.background).toMatchObject({ type: 'solid', color: '#220000' });
    expect(plan.style).toBe('noir'); // plan-level, applies to all shots
    expect(plan.shots[0]!.id).not.toBe(plan.shots[1]!.id); // distinct ids
  });

  it('rejects a scene with neither nodes nor shots', () => {
    expect(() => Scene2.parse({ version: 2, renderer: 'half', background: bg })).toThrow();
  });

  it('is content-agnostic: a landscape and a dinner use the same primitives', () => {
    const land = compile([
      { kind: 'sprite', asset: 'mountain', repeat: 3, place: { in: 'ground' }, distribute: { layout: 'row', gap: 0.3 } },
      { kind: 'text', content: 'WILD', place: { in: 'frame', align: 'bottom' } },
    ]);
    const dinner = compile([
      { kind: 'sprite', asset: 'table', id: 't', place: { in: 'ground' } },
      { kind: 'sprite', asset: 'bowl', repeat: 5, place: { on: 't.surface' } },
    ]);
    expect(land.shots[0]!.layers.length).toBe(4); // 3 mountains + text
    expect(dinner.shots[0]!.layers.length).toBe(6); // table + 5 bowls
  });
});
