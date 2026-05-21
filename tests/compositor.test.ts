import { describe, expect, it, beforeEach } from 'vitest';
import { z } from 'zod';
import { composite } from '../src/core/compositor.js';
import { ScenePlan, type ScenePlanT } from '../src/core/dsl.js';
import { clearRegistry } from '../src/core/assets/registry.js';
import { registerBuiltins } from '../src/core/assets/builtin/index.js';

type PlanInput = z.input<typeof ScenePlan>;

function plan(p: Partial<PlanInput>): ScenePlanT {
  return ScenePlan.parse({
    version: 1,
    fps: 10,
    shots: [
      {
        id: 's1',
        durationMs: 200,
        background: { type: 'solid', color: '#101010' },
        layers: [],
      },
    ],
    ...p,
  });
}

async function collect(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const arr: unknown[] = [];
  for await (const v of gen) arr.push(v);
  return arr;
}

describe('composite', () => {
  beforeEach(() => {
    clearRegistry();
    registerBuiltins();
  });

  it('emits one frame per fps*durationMs', async () => {
    const frames = await collect(
      composite(plan({}), { w: 4, h: 4, fps: 10 }),
    );
    // 200ms × 10fps = 2 frames
    expect(frames.length).toBe(2);
  });

  it('emits monotonically increasing ptsMs', async () => {
    const p = plan({
      shots: [
        { id: 'a', durationMs: 300, background: { type: 'solid', color: '#000000' }, layers: [] },
        { id: 'b', durationMs: 200, background: { type: 'solid', color: '#ffffff' }, layers: [] },
      ],
    });
    const frames = (await collect(composite(p, { w: 2, h: 2, fps: 10 }))) as Array<{ ptsMs: number }>;
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.ptsMs).toBeGreaterThanOrEqual(frames[i - 1]!.ptsMs);
    }
  });

  it('paints solid background color into every pixel', async () => {
    const p = plan({
      shots: [
        { id: 's1', durationMs: 100, background: { type: 'solid', color: '#102030' }, layers: [] },
      ],
    });
    const frames = (await collect(composite(p, { w: 2, h: 2, fps: 10 }))) as Array<{
      rgba: Uint8Array;
    }>;
    const first = frames[0]!.rgba;
    for (let i = 0; i < first.length; i += 4) {
      expect(first[i]).toBe(0x10);
      expect(first[i + 1]).toBe(0x20);
      expect(first[i + 2]).toBe(0x30);
    }
  });

  it('vertical gradient: top differs from bottom', async () => {
    const p = plan({
      shots: [
        {
          id: 's1',
          durationMs: 100,
          background: { type: 'gradient', from: '#000000', to: '#ffffff', direction: 'vertical' },
          layers: [],
        },
      ],
    });
    const [frame] = (await collect(composite(p, { w: 1, h: 8, fps: 10 }))) as Array<{
      rgba: Uint8Array;
    }>;
    expect(frame!.rgba[0]).toBeLessThan(frame!.rgba[(7 * 1 * 4)]!);
  });

  it('throws on unknown sprite asset with nearest-name suggestion', async () => {
    const p = plan({
      shots: [
        {
          id: 's1',
          durationMs: 100,
          background: { type: 'solid', color: '#000000' },
          layers: [
            {
              type: 'sprite',
              asset: 'spacship',
              keyframes: [{ tMs: 0, x: 0.5, y: 0.5 }],
            },
          ],
        },
      ],
    });
    await expect(
      collect(composite(p, { w: 4, h: 4, fps: 10 })),
    ).rejects.toThrow(/spaceship/);
  });

  it('sprite renders pixels different from background', async () => {
    const p = plan({
      shots: [
        {
          id: 's1',
          durationMs: 100,
          background: { type: 'solid', color: '#000000' },
          layers: [
            {
              type: 'sprite',
              asset: 'planet',
              color: '#ff0000',
              keyframes: [{ tMs: 0, x: 0.5, y: 0.5, scale: 1 }],
            },
          ],
        },
      ],
    });
    const [frame] = (await collect(composite(p, { w: 16, h: 16, fps: 10 }))) as Array<{
      rgba: Uint8Array;
    }>;
    let red = 0;
    for (let i = 0; i < frame!.rgba.length; i += 4) {
      if (frame!.rgba[i]! > 100 && frame!.rgba[i + 1]! < 50 && frame!.rgba[i + 2]! < 50) red++;
    }
    expect(red).toBeGreaterThan(0);
  });

  it('keyframe interpolation: midpoint x is between endpoints', async () => {
    const p = plan({
      shots: [
        {
          id: 's1',
          durationMs: 200,
          background: { type: 'solid', color: '#000000' },
          layers: [
            {
              type: 'sprite',
              asset: 'planet',
              color: '#00ff00',
              keyframes: [
                { tMs: 0, x: 0.1, y: 0.5, scale: 1.5 },
                { tMs: 200, x: 0.9, y: 0.5, scale: 1.5 },
              ],
            },
          ],
        },
      ],
    });
    const frames = (await collect(composite(p, { w: 32, h: 8, fps: 10 }))) as Array<{
      rgba: Uint8Array;
      w: number;
      h: number;
    }>;
    function centroidX(rgba: Uint8Array, w: number, h: number): number {
      let sum = 0;
      let n = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (rgba[i + 1]! > 100 && rgba[i]! < 50) {
            sum += x;
            n++;
          }
        }
      }
      return n === 0 ? -1 : sum / n;
    }
    const xs = frames.map((f) => centroidX(f.rgba, f.w, f.h));
    const valid = xs.filter((x) => x >= 0);
    expect(valid.length).toBeGreaterThan(1);
    expect(valid[valid.length - 1]!).toBeGreaterThan(valid[0]!);
  });

  it('scatter tiles `count` instances across the area x-span', async () => {
    const p = plan({
      shots: [
        {
          id: 's1',
          durationMs: 100,
          background: { type: 'solid', color: '#000000' },
          layers: [
            {
              type: 'scatter',
              asset: 'planet',
              color: '#ff0000',
              count: 4,
              area: { x0: 0.1, y0: 0.5, x1: 0.9, y1: 0.5 },
              scale: 0.5,
              scaleJitter: 0,
              seed: 1,
            },
          ],
        },
      ],
    });
    const [frame] = (await collect(composite(p, { w: 64, h: 16, fps: 10 }))) as Array<{
      rgba: Uint8Array;
      w: number;
      h: number;
    }>;
    let minX = Infinity;
    let maxX = -Infinity;
    let red = 0;
    for (let y = 0; y < frame!.h; y++) {
      for (let x = 0; x < frame!.w; x++) {
        const i = (y * frame!.w + x) * 4;
        if (frame!.rgba[i]! > 100 && frame!.rgba[i + 1]! < 50 && frame!.rgba[i + 2]! < 50) {
          red++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    expect(red).toBeGreaterThan(0);
    // Four instances tiled from x≈0.1→0.9 should span well over half the width.
    expect(maxX - minX).toBeGreaterThan(frame!.w * 0.5);
  });

  it('iso camera makes a deep sprite recede (higher up + smaller)', async () => {
    function redStats(rgba: Uint8Array, w: number, h: number) {
      let sum = 0;
      let n = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (rgba[i]! > 100 && rgba[i + 1]! < 50 && rgba[i + 2]! < 50) {
            sum += y;
            n++;
          }
        }
      }
      return { cy: n === 0 ? -1 : sum / n, count: n };
    }
    const layer = (depth: number) => ({
      type: 'sprite' as const,
      asset: 'planet',
      color: '#ff0000',
      keyframes: [{ tMs: 0, x: 0.5, y: 0.8, scale: 1, depth }],
    });
    const makePlan = (iso: boolean) =>
      plan({
        ...(iso ? { camera: { projection: 'iso' as const, tilt: 0.6 } } : {}),
        shots: [
          {
            id: 's1',
            durationMs: 100,
            background: { type: 'solid', color: '#000000' },
            layers: [layer(iso ? 1 : 0)],
          },
        ],
      });
    const [flat] = (await collect(composite(makePlan(false), { w: 32, h: 32, fps: 10 }))) as Array<{
      rgba: Uint8Array; w: number; h: number;
    }>;
    const [iso] = (await collect(composite(makePlan(true), { w: 32, h: 32, fps: 10 }))) as Array<{
      rgba: Uint8Array; w: number; h: number;
    }>;
    const fs = redStats(flat!.rgba, flat!.w, flat!.h);
    const is = redStats(iso!.rgba, iso!.w, iso!.h);
    expect(is.cy).toBeLessThan(fs.cy); // receded up the frame
    expect(is.count).toBeLessThan(fs.count); // shrank
  });
});
