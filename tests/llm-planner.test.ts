import { describe, expect, it, beforeEach, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { clearRegistry } from '../src/core/assets/registry.js';
import { registerBuiltins } from '../src/core/assets/builtin/index.js';
import { planFromNLAnthropic } from '../src/adapters/llm/anthropic.js';

// All planFromNL tests in this file target the Anthropic adapter directly,
// bypassing the provider-resolution layer so the config file is irrelevant.
const planFromNL = (req: Parameters<typeof planFromNLAnthropic>[0]) =>
  planFromNLAnthropic(req, { apiKey: 'sk-mock', defaultModel: 'claude-sonnet-4-6' });
import { catalogMarkdown, spriteEnumForSchema } from '../src/adapters/llm/asset-catalog.js';

type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: unknown };

function fakeResp(input: unknown, usage: Partial<{ input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }> = {}) {
  return {
    content: [
      { type: 'tool_use', id: 't1', name: 'submit_plan', input } satisfies ToolUseBlock,
    ],
    usage: { input_tokens: 100, output_tokens: 200, ...usage },
  };
}

function fakeNoToolResp() {
  return {
    content: [{ type: 'text', text: 'sorry' }],
    usage: { input_tokens: 50, output_tokens: 5 },
  };
}

function mockClient(...responses: unknown[]): Anthropic {
  const create = vi.fn();
  for (const r of responses) create.mockResolvedValueOnce(r);
  return { messages: { create } } as unknown as Anthropic;
}

// A Scene v2 that passes BOTH schema and the semantic critic (large enough
// subject + a backdrop so it doesn't trip empty-frame / subject-scale). The
// adapter parses Scene2 and compiles it to a v1 plan before critiquing.
const VALID_PLAN_INPUT = {
  version: 2,
  fps: 24,
  renderer: 'half',
  durationMs: 5000,
  background: { type: 'solid', color: '#000000' },
  nodes: [
    { kind: 'sprite', asset: 'planet', scale: 2.6, place: { in: 'sky', align: 'top-right' } },
    { kind: 'sprite', asset: 'spaceship', scale: 1.0, place: { in: 'center', align: 'center' } },
  ],
};

describe('asset-catalog', () => {
  beforeEach(() => {
    clearRegistry();
    registerBuiltins();
  });

  it('catalogMarkdown lists builtin sprites', () => {
    const md = catalogMarkdown({ renderer: 'half' });
    expect(md).toContain('spaceship');
    expect(md).toContain('planet');
  });

  it('half renderer hides ascii-only assets', () => {
    const names = spriteEnumForSchema({ renderer: 'half' });
    expect(names).not.toContain('droid');
    // human is half-renderable (silhouette draw), so it IS in the half catalog
    expect(names).toContain('human');
    expect(names).toContain('spaceship');
  });

  it('ascii renderer includes ascii-only assets', () => {
    const names = spriteEnumForSchema({ renderer: 'ascii' });
    expect(names).toContain('droid');
  });
});

describe('planFromNL', () => {
  beforeEach(() => {
    clearRegistry();
    registerBuiltins();
  });

  it('returns the parsed plan on a single successful call', async () => {
    const client = mockClient(fakeResp(VALID_PLAN_INPUT));
    const result = await planFromNL({
      prompt: 'a ship in space',
      durationMs: 5000,
      client,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(1);
      expect(result.plan.shots[0]!.id).toBe('scene');
    }
  });

  it('drops layers referencing assets not in the registry (hallucination safety net)', async () => {
    const sceneWithBogus = {
      version: 2,
      fps: 24,
      renderer: 'half',
      durationMs: 5000,
      background: { type: 'solid', color: '#000000' },
      nodes: [
        { kind: 'sprite', asset: 'planet', scale: 2.6, place: { in: 'sky', align: 'top-right' } },
        { kind: 'sprite', asset: 'spaceship', scale: 1.0, place: { in: 'center', align: 'center' } },
        { kind: 'sprite', asset: 'totally-made-up', scale: 1.0, place: { in: 'ground' } },
      ],
    };
    const client = mockClient(fakeResp(sceneWithBogus));
    const result = await planFromNL({ prompt: 'a ship in space', durationMs: 5000, client });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const assets = result.plan.shots[0]!.layers
        .filter((l) => l.type === 'sprite')
        .map((l) => (l as { asset: string }).asset);
      expect(assets).not.toContain('totally-made-up');
      expect(assets).toContain('planet');
    }
  });

  it('retries on zod validation failure and recovers', async () => {
    const badInput = { ...VALID_PLAN_INPUT, version: 99 };
    const client = mockClient(fakeResp(badInput), fakeResp(VALID_PLAN_INPUT));
    const result = await planFromNL({
      prompt: 'x',
      durationMs: 1000,
      client,
      maxRetries: 3,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.attempts).toBe(2);
  });

  it('returns ok=false after exhausting retries', async () => {
    const badInput = { ...VALID_PLAN_INPUT, version: 99 };
    const client = mockClient(fakeResp(badInput), fakeResp(badInput), fakeResp(badInput));
    const result = await planFromNL({
      prompt: 'x',
      durationMs: 1000,
      client,
      maxRetries: 3,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toBe(3);
      expect(result.error).toMatch(/failed after 3/);
    }
  });

  it('retries when LLM omits the tool call', async () => {
    const client = mockClient(fakeNoToolResp(), fakeResp(VALID_PLAN_INPUT));
    const result = await planFromNL({ prompt: 'x', durationMs: 1000, client });
    expect(result.ok).toBe(true);
  });

  it('counts usage tokens across retries', async () => {
    const client = mockClient(
      fakeResp({ ...VALID_PLAN_INPUT, version: 99 }, { input_tokens: 100, output_tokens: 50 }),
      fakeResp(VALID_PLAN_INPUT, { input_tokens: 30, output_tokens: 40, cache_read_input_tokens: 90 }),
    );
    const result = await planFromNL({ prompt: 'x', durationMs: 1000, client });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.inputTokens).toBe(130);
      expect(result.outputTokens).toBe(90);
      expect(result.cacheReadTokens).toBe(90);
    }
  });
});
