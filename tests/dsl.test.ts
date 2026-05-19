import { describe, expect, it } from 'vitest';
import { ScenePlan, Shot, Layer } from '../src/core/dsl.js';

describe('ScenePlan zod schema', () => {
  it('parses a minimal valid plan', () => {
    const result = ScenePlan.safeParse({
      version: 1,
      fps: 24,
      shots: [
        {
          id: 's1',
          durationMs: 1000,
          background: { type: 'solid', color: '#000000' },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing version', () => {
    const result = ScenePlan.safeParse({
      fps: 24,
      shots: [{ id: 's1', durationMs: 1000, background: { type: 'solid', color: '#000' } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty shots', () => {
    const result = ScenePlan.safeParse({
      version: 1,
      shots: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative duration', () => {
    const result = ScenePlan.safeParse({
      version: 1,
      shots: [{ id: 's1', durationMs: -1, background: { type: 'solid', color: '#000' } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects bad hex color', () => {
    const result = ScenePlan.safeParse({
      version: 1,
      shots: [{ id: 's1', durationMs: 100, background: { type: 'solid', color: 'red' } }],
    });
    expect(result.success).toBe(false);
  });

  it('applies defaults for fps and ease', () => {
    const result = ScenePlan.parse({
      version: 1,
      shots: [
        {
          id: 's1',
          durationMs: 100,
          background: { type: 'solid', color: '#000000' },
          layers: [
            {
              type: 'sprite',
              asset: 'spaceship',
              keyframes: [{ tMs: 0, x: 0.5, y: 0.5 }],
            },
          ],
        },
      ],
    });
    expect(result.fps).toBe(24);
    const layer = result.shots[0]!.layers[0]!;
    if (layer.type === 'sprite') expect(layer.ease).toBe('linear');
  });

  it('accepts arbitrary sprite asset names (registry-driven)', () => {
    const result = Layer.safeParse({
      type: 'sprite',
      asset: 'my-custom-dragon',
      keyframes: [{ tMs: 0, x: 0.5, y: 0.5 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty sprite asset name', () => {
    const result = Layer.safeParse({
      type: 'sprite',
      asset: '',
      keyframes: [{ tMs: 0, x: 0.5, y: 0.5 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown background type', () => {
    const result = Shot.safeParse({
      id: 's1',
      durationMs: 100,
      background: { type: 'cloudz' },
    });
    expect(result.success).toBe(false);
  });

  it('layer text content max 500', () => {
    const longText = 'a'.repeat(501);
    const result = Layer.safeParse({
      type: 'text',
      content: longText,
    });
    expect(result.success).toBe(false);
  });

  it('keyframes must be non-empty', () => {
    const result = Layer.safeParse({
      type: 'sprite',
      asset: 'spaceship',
      keyframes: [],
    });
    expect(result.success).toBe(false);
  });
});
