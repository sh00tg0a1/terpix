import { describe, expect, it, beforeEach } from 'vitest';
import { clearRegistry } from '../src/core/assets/registry.js';
import { registerBuiltins } from '../src/core/assets/builtin/index.js';
import { loadUserAssets } from '../src/core/assets/loader.js';
import { critiquePlan } from '../src/adapters/llm/plan-critic.js';
import type { ScenePlanT } from '../src/core/dsl.js';

function sprite(asset: string, x: number, y: number, scale: number) {
  return { type: 'sprite' as const, asset, ease: 'linear' as const, keyframes: [{ tMs: 0, x, y, scale }] };
}
function text(content: string, x: number, y: number, size: 'sm' | 'md' | 'lg' = 'sm') {
  return { type: 'text' as const, content, style: 'fade-in' as const, color: '#ffffff', size, position: { x, y } };
}
function plan(layers: unknown[], style?: string): ScenePlanT {
  return {
    version: 1,
    title: 't',
    fps: 24,
    renderer: 'half',
    ...(style ? { style } : {}),
    shots: [
      {
        id: 's',
        durationMs: 5000,
        background: { type: 'gradient', from: '#3a2218', to: '#180c08', direction: 'vertical' },
        layers: layers as never,
      },
    ],
  } as ScenePlanT;
}

const rules = (prompt: string, p: ScenePlanT) => critiquePlan(prompt, p).issues.map((i) => i.rule);

describe('critiquePlan', () => {
  beforeEach(() => {
    clearRegistry();
    registerBuiltins();
    loadUserAssets(); // picks up bowl/steam shape assets
  });

  it('flags too few sprites for a crowd prompt (coverage)', () => {
    const p = plan([sprite('bowl', 0.5, 0.75, 1.0)]);
    expect(rules('一桌子菜', p)).toContain('coverage');
  });

  it('passes coverage when enough subjects are present', () => {
    const layers = [0.2, 0.35, 0.5, 0.65, 0.8].map((x) => sprite('bowl', x, 0.75, 1.0));
    expect(rules('一桌子菜', plan(layers))).not.toContain('coverage');
  });

  it('flags cat used for people (wrong-substitute)', () => {
    const p = plan([sprite('cat', 0.3, 0.7, 1.0), sprite('cat', 0.7, 0.7, 1.0)]);
    expect(rules('两个人', p)).toContain('wrong-substitute');
  });

  it('does not flag cat when the prompt mentions a cat', () => {
    const p = plan([sprite('cat', 0.5, 0.7, 1.0)]);
    expect(rules('a cat', p)).not.toContain('wrong-substitute');
  });

  it('flags an undersized named subject (subject-scale)', () => {
    const p = plan([sprite('spaceship', 0.5, 0.5, 0.4), sprite('planet', 0.8, 0.4, 2.6)]);
    expect(rules('a spaceship', p)).toContain('subject-scale');
  });

  it('respects a "tiny" hint and skips subject-scale', () => {
    const p = plan([sprite('spaceship', 0.5, 0.5, 0.4), sprite('planet', 0.8, 0.4, 2.6)]);
    expect(rules('a tiny distant spaceship', p)).not.toContain('subject-scale');
  });

  it('flags non-ASCII text (text-charset)', () => {
    const p = plan([sprite('planet', 0.7, 0.4, 2.6), sprite('spaceship', 0.4, 0.5, 1.0), text('真好吃', 0.5, 0.1)]);
    expect(rules('a ship', p)).toContain('text-charset');
  });

  it('accepts plain uppercase ASCII text', () => {
    const p = plan([sprite('planet', 0.7, 0.4, 2.6), sprite('spaceship', 0.4, 0.5, 1.0), text('SO GOOD!', 0.5, 0.1)]);
    expect(rules('a ship', p)).not.toContain('text-charset');
  });

  it('flags a bottom-anchored sprite floating in the sky (anchor)', () => {
    const layers = [0.2, 0.4, 0.6, 0.8, 0.5].map((x) => sprite('bowl', x, 0.3, 1.0));
    expect(rules('一桌子菜', plan(layers))).toContain('anchor');
  });

  it('flags a centered title overlapping a centered subject (text-collision)', () => {
    const p = plan([sprite('spaceship', 0.5, 0.5, 1.2), sprite('planet', 0.5, 0.5, 2.6), text('HELLO', 0.5, 0.5, 'lg')]);
    expect(rules('a ship', p)).toContain('text-collision');
  });

  it('does NOT flag a centered title above edge-placed subjects', () => {
    const p = plan([sprite('human', 0.2, 0.6, 1.2), sprite('human', 0.8, 0.6, 1.2), text('SO GOOD', 0.5, 0.1, 'sm')]);
    expect(rules('two people', p)).not.toContain('text-collision');
  });

  it('flags minimalist style on an indoor prompt (style-mismatch)', () => {
    const layers = [0.2, 0.4, 0.6, 0.8, 0.5].map((x) => sprite('bowl', x, 0.75, 1.0));
    expect(rules('一桌子菜', plan(layers, 'minimalist'))).toContain('style-mismatch');
  });
});
