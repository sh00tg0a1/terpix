import { mkdtempSync, readFileSync, rmSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Config,
  configFileInfo,
  configPath,
  getAnthropicApiKey,
  getDefaultModel,
  maskKey,
  readConfig,
  updateConfig,
  writeConfig,
} from '../src/core/config.js';

describe('config', () => {
  let dir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'terpix-cfg-'));
    savedEnv['TERPIX_CONFIG'] = process.env['TERPIX_CONFIG'];
    savedEnv['ANTHROPIC_API_KEY'] = process.env['ANTHROPIC_API_KEY'];
    savedEnv['TERPIX_MODEL'] = process.env['TERPIX_MODEL'];
    process.env['TERPIX_CONFIG'] = join(dir, 'config.json');
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['TERPIX_MODEL'];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('configPath honors TERPIX_CONFIG', () => {
    expect(configPath()).toBe(join(dir, 'config.json'));
  });

  it('readConfig returns {} when file absent', () => {
    expect(readConfig()).toEqual({});
  });

  it('writeConfig + readConfig roundtrip', () => {
    const path = writeConfig({ anthropic_api_key: 'sk-ant-test-1234567890' });
    expect(existsSync(path)).toBe(true);
    expect(readConfig()).toEqual({ anthropic_api_key: 'sk-ant-test-1234567890' });
  });

  it('writeConfig sets 600 perms', () => {
    const path = writeConfig({ anthropic_api_key: 'sk-ant-key-abcdefgh' });
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('updateConfig patches without losing other keys', () => {
    writeConfig({ anthropic_api_key: 'sk-keep-1234567', default_model: 'claude-opus-4-7' });
    const { config } = updateConfig({ default_style: 'starwars' });
    expect(config.anthropic_api_key).toBe('sk-keep-1234567');
    expect(config.default_model).toBe('claude-opus-4-7');
    expect(config.default_style).toBe('starwars');
  });

  it('updateConfig with empty value unsets a key', () => {
    writeConfig({ anthropic_api_key: 'sk-keep-1234567', default_model: 'claude-opus-4-7' });
    const { config } = updateConfig({ default_model: '' });
    expect(config.default_model).toBeUndefined();
    expect(config.anthropic_api_key).toBe('sk-keep-1234567');
  });

  it('Config rejects short keys', () => {
    expect(Config.safeParse({ anthropic_api_key: 'short' }).success).toBe(false);
  });

  it('getAnthropicApiKey: env wins over config', () => {
    writeConfig({ anthropic_api_key: 'sk-from-config-1234' });
    process.env['ANTHROPIC_API_KEY'] = 'sk-from-env-9999';
    expect(getAnthropicApiKey()).toBe('sk-from-env-9999');
  });

  it('getAnthropicApiKey: falls back to config', () => {
    writeConfig({ anthropic_api_key: 'sk-from-config-1234' });
    expect(getAnthropicApiKey()).toBe('sk-from-config-1234');
  });

  it('getAnthropicApiKey: undefined when nothing set', () => {
    expect(getAnthropicApiKey()).toBeUndefined();
  });

  it('getDefaultModel: env > config > built-in default', () => {
    expect(getDefaultModel()).toBe('claude-sonnet-4-6');
    writeConfig({ default_model: 'claude-opus-4-7' });
    expect(getDefaultModel()).toBe('claude-opus-4-7');
    process.env['TERPIX_MODEL'] = 'claude-haiku-x';
    expect(getDefaultModel()).toBe('claude-haiku-x');
  });

  it('maskKey hides middle of long key', () => {
    expect(maskKey('sk-ant-1234567890abcdef')).toBe('sk-ant-1...cdef');
    expect(maskKey(undefined)).toBe('(unset)');
    expect(maskKey('short')).toBe('*****');
  });

  it('configFileInfo reports existence and mode', () => {
    expect(configFileInfo().exists).toBe(false);
    writeConfig({ anthropic_api_key: 'sk-ant-1234567890' });
    const info = configFileInfo();
    expect(info.exists).toBe(true);
    expect(info.mode).toBe('600');
  });

  it('readConfig rejects malformed JSON', () => {
    const p = join(dir, 'config.json');
    mkdirSync(dir, { recursive: true });
    writeFileSync(p, '{ not json');
    expect(() => readConfig()).toThrow(/not valid JSON|invalid|Unexpected/);
  });

  it('readConfig rejects schema violations', () => {
    const p = join(dir, 'config.json');
    writeFileSync(p, JSON.stringify({ default_renderer: 'metaball' }));
    expect(() => readConfig()).toThrow(/default_renderer/);
  });
});
