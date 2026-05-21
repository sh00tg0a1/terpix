import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeShapeDrawer, parseShapeJson } from '../src/core/assets/formats/shape.js';
import { loadUserAssets } from '../src/core/assets/loader.js';
import { assetNames, clearRegistry, getAsset } from '../src/core/assets/registry.js';
import { createBuffer } from '../src/core/pixel.js';

describe('parseShapeJson', () => {
  it('parses a minimal valid shape', () => {
    const result = parseShapeJson(
      JSON.stringify({
        name: 'dot',
        description: 'a single dot',
        viewBox: { w: 10, h: 10 },
        primitives: [{ kind: 'circle', cx: 5, cy: 5, r: 2, color: '#ff0000' }],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.spec.name).toBe('dot');
  });

  it('accepts @main color placeholder', () => {
    const result = parseShapeJson(
      JSON.stringify({
        name: 'a',
        description: 'asset a',
        viewBox: { w: 1, h: 1 },
        primitives: [{ kind: 'circle', cx: 0.5, cy: 0.5, r: 0.1, color: '@main' }],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects unknown primitive kind', () => {
    const result = parseShapeJson(
      JSON.stringify({
        name: 'bad',
        description: 'd',
        viewBox: { w: 1, h: 1 },
        primitives: [{ kind: 'oval', cx: 0, cy: 0, r: 1, color: '#000' }],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects bad name (spaces)', () => {
    const result = parseShapeJson(
      JSON.stringify({
        name: 'with spaces',
        description: 'd',
        viewBox: { w: 1, h: 1 },
        primitives: [{ kind: 'circle', cx: 0, cy: 0, r: 1, color: '#000' }],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects empty primitives', () => {
    const result = parseShapeJson(
      JSON.stringify({
        name: 'a',
        description: 'aa',
        viewBox: { w: 1, h: 1 },
        primitives: [],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects non-hex color (without @main)', () => {
    const result = parseShapeJson(
      JSON.stringify({
        name: 'a',
        description: 'aa',
        viewBox: { w: 1, h: 1 },
        primitives: [{ kind: 'circle', cx: 0, cy: 0, r: 1, color: 'red' }],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('reports invalid JSON with location', () => {
    const result = parseShapeJson('{ "bad" ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/JSON/);
  });
});

describe('makeShapeDrawer', () => {
  it('renders a circle into the buffer', () => {
    const spec = {
      name: 'redspot',
      description: 'a red circle',
      viewBox: { w: 100, h: 100 },
      primitives: [{ kind: 'circle' as const, cx: 50, cy: 50, r: 40, color: '#ff0000' }],
    };
    const draw = makeShapeDrawer(spec);
    const buf = createBuffer(40, 40);
    draw({ buf, cx: 20, cy: 20, size: 30, color: [200, 200, 200] });
    let redPixels = 0;
    for (let i = 0; i < buf.rgba.length; i += 4) {
      if (buf.rgba[i]! > 200 && buf.rgba[i + 1]! < 50) redPixels++;
    }
    expect(redPixels).toBeGreaterThan(0);
  });

  it('@main color uses ctx.color', () => {
    const spec = {
      name: 'placeholder',
      description: 'uses main',
      viewBox: { w: 10, h: 10 },
      primitives: [{ kind: 'rect' as const, x: 0, y: 0, w: 10, h: 10, color: '@main' }],
    };
    const draw = makeShapeDrawer(spec);
    const buf = createBuffer(20, 20);
    draw({ buf, cx: 10, cy: 10, size: 8, color: [0, 200, 0] });
    let greenPixels = 0;
    for (let i = 0; i < buf.rgba.length; i += 4) {
      if (buf.rgba[i + 1]! > 150 && buf.rgba[i]! < 50) greenPixels++;
    }
    expect(greenPixels).toBeGreaterThan(0);
  });

  it('rotation turns a tall bar into a wide one (rect → rotated polygon)', () => {
    // A narrow, tall bar centered in a 100×100 viewBox.
    const spec = {
      name: 'bar',
      description: 'a tall vertical bar',
      viewBox: { w: 100, h: 100 },
      primitives: [{ kind: 'rect' as const, x: 40, y: 10, w: 20, h: 80, color: '#ff0000' }],
    };
    const draw = makeShapeDrawer(spec);
    function paintedExtent(rotation: number) {
      const buf = createBuffer(100, 100);
      draw({ buf, cx: 50, cy: 50, size: 100, color: [255, 0, 0], rotation });
      let minX = 100, maxX = -1, minY = 100, maxY = -1;
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          const i = (y * 100 + x) * 4;
          if (buf.rgba[i]! > 200 && buf.rgba[i + 1]! < 50 && buf.rgba[i + 2]! < 50) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      return { w: maxX - minX, h: maxY - minY };
    }
    const flat = paintedExtent(0);
    const turned = paintedExtent(90);
    expect(flat.h).toBeGreaterThan(flat.w); // upright: taller than wide
    expect(turned.w).toBeGreaterThan(turned.h); // rotated 90°: wider than tall
  });
});

describe('loadUserAssets', () => {
  let tempDir: string;

  beforeEach(() => {
    clearRegistry();
    tempDir = mkdtempSync(join(tmpdir(), 'terpix-assets-'));
  });
  afterEach(() => {
    clearRegistry();
  });

  it('discovers and registers a shape JSON', () => {
    writeFileSync(
      join(tempDir, 'spot.json'),
      JSON.stringify({
        name: 'spot',
        description: 'a tiny spot',
        viewBox: { w: 1, h: 1 },
        primitives: [{ kind: 'circle', cx: 0.5, cy: 0.5, r: 0.4, color: '#3399ff' }],
      }),
    );
    const report = loadUserAssets({ extraDirs: [tempDir] });
    expect(report.loaded.map((l) => l.name)).toContain('spot');
    expect(getAsset('spot')?.source).toBe('shape');
  });

  it('reports per-file errors and keeps loading the rest', () => {
    writeFileSync(join(tempDir, 'good.json'), JSON.stringify({
      name: 'good',
      description: 'fine',
      viewBox: { w: 1, h: 1 },
      primitives: [{ kind: 'circle', cx: 0, cy: 0, r: 0.5, color: '#fff' }],
    }));
    writeFileSync(join(tempDir, 'bad.json'), '{ broken');
    const report = loadUserAssets({ extraDirs: [tempDir] });
    expect(report.loaded.some((l) => l.name === 'good')).toBe(true);
    expect(report.errors.length).toBeGreaterThan(0);
  });

  it('non-existent dir is skipped silently', () => {
    const report = loadUserAssets({ extraDirs: [join(tempDir, 'nope')] });
    expect(report.errors).toEqual([]);
  });

  it('honors nested directory layout under extraDirs (top-level only)', () => {
    mkdirSync(join(tempDir, 'sub'));
    writeFileSync(join(tempDir, 'sub', 'nested.json'), '{}');
    // current loader does not recurse; should not register nested asset
    writeFileSync(
      join(tempDir, 'top.json'),
      JSON.stringify({
        name: 'top',
        description: 'top-level',
        viewBox: { w: 1, h: 1 },
        primitives: [{ kind: 'circle', cx: 0, cy: 0, r: 0.5, color: '#fff' }],
      }),
    );
    const report = loadUserAssets({ extraDirs: [tempDir] });
    expect(assetNames()).toContain('top');
    expect(assetNames()).not.toContain('nested');
  });
});
