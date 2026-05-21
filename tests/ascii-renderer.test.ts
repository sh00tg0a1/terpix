import { describe, expect, it, beforeAll } from 'vitest';
import { ScenePlan } from '../src/core/dsl.js';
import { compositeAscii } from '../src/core/compositor-ascii.js';
import { AsciiEncoder } from '../src/adapters/terminal/ascii.js';
import { registerBuiltins } from '../src/core/assets/builtin/index.js';

beforeAll(() => registerBuiltins());

const basePlan = {
  version: 1 as const,
  fps: 12,
  renderer: 'ascii' as const,
  shots: [
    {
      id: 's',
      durationMs: 250,
      background: { type: 'solid' as const, color: '#000000' },
      layers: [
        {
          type: 'text' as const,
          content: 'HI',
          style: 'static' as const,
          color: '#ffffff',
          size: 'md' as const,
          position: { x: 0.5, y: 0.5 },
        },
      ],
    },
  ],
};

describe('ascii renderer', () => {
  it('plan parses with renderer=ascii and defaults to half', () => {
    const ok = ScenePlan.parse(basePlan);
    expect(ok.renderer).toBe('ascii');
    const def = ScenePlan.parse({ ...basePlan, renderer: undefined });
    expect(def.renderer).toBe('half');
  });

  it('compositeAscii produces CharFrames with expected dimensions', async () => {
    const plan = ScenePlan.parse(basePlan);
    const frames = [];
    for await (const f of compositeAscii(plan, { w: 40, h: 10, fps: 12 })) frames.push(f);
    expect(frames.length).toBeGreaterThan(0);
    const first = frames[0]!;
    expect(first.w).toBe(40);
    expect(first.h).toBe(10);
    expect(first.chars.length).toBe(40 * 10);
    expect(first.fg.length).toBe(40 * 10 * 3);
  });

  it('text drawn into char buffer is centered around position.x', async () => {
    const plan = ScenePlan.parse(basePlan);
    const frames = [];
    for await (const f of compositeAscii(plan, { w: 40, h: 10, fps: 12 })) frames.push(f);
    const frame = frames[0]!;
    const y = Math.floor(0.5 * 10);
    const centerX = Math.floor(40 * 0.5 - 'HI'.length / 2);
    expect(frame.chars[y * 40 + centerX]).toBe('H'.charCodeAt(0));
    expect(frame.chars[y * 40 + centerX + 1]).toBe('I'.charCodeAt(0));
  });

  it('AsciiEncoder emits CSI escape + text body', async () => {
    const plan = ScenePlan.parse(basePlan);
    const enc = new AsciiEncoder();
    let bytes: Uint8Array | undefined;
    for await (const f of compositeAscii(plan, { w: 20, h: 5, fps: 12 })) {
      bytes = enc.encode(f);
      break;
    }
    expect(bytes).toBeDefined();
    const s = new TextDecoder().decode(bytes!);
    expect(s).toMatch(/\x1b\[H/);
    expect(s).toMatch(/H/);
    expect(s).toMatch(/I/);
  });

  it('renders CJK text natively into the char grid (wide cells + trailing sentinel)', async () => {
    const cjkPlan = ScenePlan.parse({
      ...basePlan,
      shots: [
        {
          ...basePlan.shots[0],
          layers: [
            {
              type: 'text' as const,
              content: '真好吃',
              style: 'static' as const,
              color: '#ffffff',
              size: 'md' as const,
              position: { x: 0.5, y: 0.5 },
            },
          ],
        },
      ],
    });
    const frames = [];
    for await (const f of compositeAscii(cjkPlan, { w: 40, h: 10, fps: 12 })) frames.push(f);
    const frame = frames[0]!;
    const y = Math.floor(0.5 * 10);
    const startX = Math.floor(40 * 0.5 - 3 /* displayWidth("真好吃")=6 */);
    // First glyph at startX, its trailing column is the WIDE_TRAIL sentinel.
    expect(frame.chars[y * 40 + startX]).toBe('真'.charCodeAt(0));
    expect(frame.chars[y * 40 + startX + 1]).toBe(0x0001);
    expect(frame.chars[y * 40 + startX + 2]).toBe('好'.charCodeAt(0));
    expect(frame.chars[y * 40 + startX + 4]).toBe('吃'.charCodeAt(0));
    // Encoder emits the multi-byte UTF-8 for the CJK chars and the round-trip
    // string contains them (the sentinel produces no output).
    const s = new TextDecoder().decode(new AsciiEncoder().encode(frame));
    expect(s).toContain('真好吃');
  });

  it('sprite layer without drawAscii throws helpful error', async () => {
    const badPlan = ScenePlan.parse({
      ...basePlan,
      shots: [
        {
          ...basePlan.shots[0],
          layers: [
            {
              type: 'sprite' as const,
              asset: 'mountain',
              color: '#cccccc',
              ease: 'linear' as const,
              keyframes: [{ tMs: 0, x: 0.5, y: 0.5 }],
            },
          ],
        },
      ],
    });
    await expect(async () => {
      for await (const _ of compositeAscii(badPlan, { w: 20, h: 5, fps: 12 })) {
        // exhaust
      }
    }).rejects.toThrow(/has no ASCII representation/);
  });
});
