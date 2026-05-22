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
