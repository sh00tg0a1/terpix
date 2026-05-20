import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeConfig } from '../src/core/config.js';
import { resolveProvider, hasLLMKey, activeProviderLabel } from '../src/adapters/llm/provider.js';

describe('provider resolution', () => {
  let dir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'terpix-prov-'));
    savedEnv['TERPIX_CONFIG'] = process.env['TERPIX_CONFIG'];
    savedEnv['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY'];
    savedEnv['OPENAI_API_KEY'] = process.env['OPENAI_API_KEY'];
    savedEnv['MINIMAX_API_KEY'] = process.env['MINIMAX_API_KEY'];
    savedEnv['OPENAI_COMPAT_API_KEY'] = process.env['OPENAI_COMPAT_API_KEY'];
    savedEnv['OPENAI_COMPAT_BASE_URL'] = process.env['OPENAI_COMPAT_BASE_URL'];
    savedEnv['TERPIX_PROVIDER'] = process.env['TERPIX_PROVIDER'];
    savedEnv['TERPIX_MODEL'] = process.env['TERPIX_MODEL'];
    process.env['TERPIX_CONFIG'] = join(dir, 'config.json');
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['MINIMAX_API_KEY'];
    delete process.env['OPENAI_COMPAT_API_KEY'];
    delete process.env['OPENAI_COMPAT_BASE_URL'];
    delete process.env['TERPIX_PROVIDER'];
    delete process.env['TERPIX_MODEL'];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('anthropic: resolves when key present', () => {
    writeConfig({ provider: 'anthropic', anthropic_api_key: 'sk-ant-1234567890' });
    const r = resolveProvider();
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.kind).toBe('anthropic');
    expect(r.apiKey).toBe('sk-ant-1234567890');
    expect(r.defaultModel).toBe('claude-sonnet-4-6');
    expect(r.baseURL).toBeUndefined();
  });

  it('anthropic: error when key missing', () => {
    writeConfig({ provider: 'anthropic' });
    const r = resolveProvider();
    expect('error' in r).toBe(true);
    if (!('error' in r)) return;
    expect(r.error).toMatch(/Anthropic API key/);
  });

  it('openai: resolves when key present', () => {
    writeConfig({ provider: 'openai', openai_api_key: 'sk-openai-1234' });
    const r = resolveProvider();
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.kind).toBe('openai');
    expect(r.apiKey).toBe('sk-openai-1234');
    expect(r.defaultModel).toBe('gpt-4o');
    expect(r.baseURL).toBeUndefined();
  });

  it('openai: error when key missing', () => {
    writeConfig({ provider: 'openai' });
    const r = resolveProvider();
    expect('error' in r).toBe(true);
    if (!('error' in r)) return;
    expect(r.error).toMatch(/OpenAI API key/);
  });

  it('minimax: resolves and sets MiniMax baseURL', () => {
    writeConfig({ provider: 'minimax', minimax_api_key: 'mm-12345678' });
    const r = resolveProvider();
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.kind).toBe('minimax');
    expect(r.apiKey).toBe('mm-12345678');
    expect(r.baseURL).toBe('https://api.minimax.io/v1');
    expect(r.defaultModel).toBe('MiniMax-M2.7');
  });

  it('minimax: error when key missing', () => {
    writeConfig({ provider: 'minimax' });
    const r = resolveProvider();
    expect('error' in r).toBe(true);
    if (!('error' in r)) return;
    expect(r.error).toMatch(/MiniMax API key/);
  });

  it('openai-compat: requires both key and baseURL', () => {
    writeConfig({ provider: 'openai-compat', openai_compat_api_key: 'oc-12345678' });
    const r = resolveProvider();
    expect('error' in r).toBe(true);
    if (!('error' in r)) return;
    expect(r.error).toMatch(/openai-compat requires both/);
  });

  it('openai-compat: resolves when both set', () => {
    writeConfig({
      provider: 'openai-compat',
      openai_compat_api_key: 'oc-12345678',
      openai_compat_base_url: 'https://proxy.example.com/v1',
    });
    const r = resolveProvider();
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.kind).toBe('openai-compat');
    expect(r.apiKey).toBe('oc-12345678');
    expect(r.baseURL).toBe('https://proxy.example.com/v1');
  });

  it('explicit override argument bypasses configured provider', () => {
    writeConfig({
      provider: 'anthropic',
      anthropic_api_key: 'sk-ant-1234567890',
      minimax_api_key: 'mm-12345678',
    });
    const r = resolveProvider('minimax');
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.kind).toBe('minimax');
  });

  it('hasLLMKey: false without key, true with key', () => {
    writeConfig({ provider: 'minimax' });
    expect(hasLLMKey()).toBe(false);
    writeConfig({ provider: 'minimax', minimax_api_key: 'mm-12345678' });
    expect(hasLLMKey()).toBe(true);
  });

  it('activeProviderLabel: includes provider, model, baseURL for minimax', () => {
    writeConfig({ provider: 'minimax', minimax_api_key: 'mm-12345678' });
    const label = activeProviderLabel();
    expect(label).toContain('minimax');
    expect(label).toContain('MiniMax-M2.7');
    expect(label).toContain('api.minimax.io');
  });

  it('activeProviderLabel: no-key state', () => {
    writeConfig({ provider: 'openai' });
    expect(activeProviderLabel()).toMatch(/openai \(no key\)/);
  });

  it('env keys win for openai resolution', () => {
    writeConfig({ provider: 'openai' });
    process.env['OPENAI_API_KEY'] = 'sk-env-9999';
    const r = resolveProvider();
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.apiKey).toBe('sk-env-9999');
  });
});
