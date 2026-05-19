import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assetNames,
  clearRegistry,
  findNearestName,
  getAsset,
  listAssets,
  registerAsset,
} from '../src/core/assets/registry.js';
import { registerBuiltins } from '../src/core/assets/builtin/index.js';

const noop = (): void => {};

describe('asset registry', () => {
  beforeEach(() => {
    clearRegistry();
  });
  afterEach(() => {
    clearRegistry();
  });

  it('registers and retrieves an asset', () => {
    registerAsset({ name: 'a', description: 'aa', source: 'builtin', draw: noop });
    expect(getAsset('a')?.description).toBe('aa');
  });

  it('listAssets returns sorted by name', () => {
    registerAsset({ name: 'zebra', description: '', source: 'builtin', draw: noop });
    registerAsset({ name: 'apple', description: '', source: 'builtin', draw: noop });
    expect(listAssets().map((e) => e.name)).toEqual(['apple', 'zebra']);
  });

  it('assetNames returns sorted', () => {
    registerAsset({ name: 'z', description: '', source: 'builtin', draw: noop });
    registerAsset({ name: 'a', description: '', source: 'builtin', draw: noop });
    expect(assetNames()).toEqual(['a', 'z']);
  });

  it('overriding same-source asset is silent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerAsset({ name: 'x', description: 'v1', source: 'builtin', draw: noop });
    registerAsset({ name: 'x', description: 'v2', source: 'builtin', draw: noop });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('overriding with a different source warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registerAsset({ name: 'x', description: 'v1', source: 'builtin', draw: noop });
    registerAsset({ name: 'x', description: 'v2', source: 'shape', draw: noop, origin: 'x.json' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('clearRegistry empties the map', () => {
    registerAsset({ name: 'x', description: '', source: 'builtin', draw: noop });
    clearRegistry();
    expect(getAsset('x')).toBeUndefined();
    expect(assetNames()).toEqual([]);
  });

  describe('findNearestName', () => {
    beforeEach(() => {
      registerAsset({ name: 'spaceship', description: '', source: 'builtin', draw: noop });
      registerAsset({ name: 'superman', description: '', source: 'builtin', draw: noop });
      registerAsset({ name: 'planet', description: '', source: 'builtin', draw: noop });
    });
    it('finds close typos', () => {
      expect(findNearestName('spacship')).toBe('spaceship');
      expect(findNearestName('superwoman')).toBe('superman');
    });
    it('returns undefined when too far', () => {
      expect(findNearestName('zzzzzzz')).toBeUndefined();
    });
    it('returns undefined when registry empty', () => {
      clearRegistry();
      expect(findNearestName('anything')).toBeUndefined();
    });
  });

  describe('registerBuiltins', () => {
    it('registers all 7 builtin assets', () => {
      clearRegistry();
      registerBuiltins();
      const names = assetNames();
      expect(names).toContain('spaceship');
      expect(names).toContain('planet');
      expect(names).toContain('moon');
      expect(names).toContain('star');
      expect(names).toContain('mountain');
      expect(names).toContain('tree');
      expect(names).toContain('superman');
    });
    it('is idempotent (second call is a no-op)', () => {
      clearRegistry();
      registerBuiltins();
      const before = assetNames().length;
      registerBuiltins();
      expect(assetNames().length).toBe(before);
    });
    it('each builtin has non-empty description', () => {
      clearRegistry();
      registerBuiltins();
      for (const entry of listAssets()) {
        expect(entry.description.length).toBeGreaterThan(5);
        expect(entry.source).toBe('builtin');
      }
    });
  });
});
