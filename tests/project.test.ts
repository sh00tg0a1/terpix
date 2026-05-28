import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isProjectDir, loadProject, loadScene } from '../src/core/project/loader.js';
import { sequence, totalDurationMs } from '../src/core/project/sequencer.js';
import { clearRegistry } from '../src/core/assets/registry.js';
import { registerBuiltins } from '../src/core/assets/builtin/index.js';
import type { ScenePlanT } from '../src/core/dsl.js';

const minimalV1 = (id: string, durationMs: number, color = '#101010') => ({
  version: 1,
  fps: 24,
  renderer: 'half',
  shots: [
    {
      id,
      durationMs,
      background: { type: 'solid', color },
      layers: [],
    },
  ],
});

const minimalV2 = (durationMs: number) => ({
  version: 2,
  renderer: 'half',
  durationMs,
  background: { type: 'solid', color: '#202020' },
  nodes: [{ kind: 'sprite', asset: 'planet', place: { in: 'center' } }],
});

describe('project loader', () => {
  let dir: string;
  beforeEach(() => {
    clearRegistry();
    registerBuiltins();
    dir = mkdtempSync(join(tmpdir(), 'terpix-proj-'));
  });
  afterEach(() => clearRegistry());

  it('isProjectDir is true iff the dir holds project.json', () => {
    expect(isProjectDir(dir)).toBe(false);
    writeFileSync(join(dir, 'project.json'), '{}');
    expect(isProjectDir(dir)).toBe(true);
  });

  it('loadScene reads a v1 plan file', () => {
    const p = join(dir, 'a.json');
    writeFileSync(p, JSON.stringify(minimalV1('s', 1000)));
    const r = loadScene(p);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.shots[0]!.id).toBe('s');
  });

  it('loadScene compiles a v2 scene file to v1', () => {
    const p = join(dir, 'b.json');
    writeFileSync(p, JSON.stringify(minimalV2(2000)));
    const r = loadScene(p);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.version).toBe(1);
      expect(r.value.shots[0]!.durationMs).toBe(2000);
    }
  });

  it('loadProject parses project.json and loads each referenced scene', () => {
    mkdirSync(join(dir, 'scenes'));
    writeFileSync(join(dir, 'scenes', 'a.json'), JSON.stringify(minimalV1('a', 1000)));
    writeFileSync(join(dir, 'scenes', 'b.json'), JSON.stringify(minimalV2(2000)));
    writeFileSync(
      join(dir, 'project.json'),
      JSON.stringify({ fps: 24, scenes: [{ file: 'scenes/a.json' }, { file: 'scenes/b.json' }] }),
    );
    const r = loadProject(dir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.scenes).toHaveLength(2);
      expect(totalDurationMs(r.value.scenes)).toBe(3000);
    }
  });

  it('loadProject surfaces a scene-file error with its path', () => {
    writeFileSync(
      join(dir, 'project.json'),
      JSON.stringify({ scenes: [{ file: 'missing.json' }] }),
    );
    const r = loadProject(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(/missing\.json/);
  });
});

describe('sequencer', () => {
  beforeEach(() => {
    clearRegistry();
    registerBuiltins();
  });

  it('offsets ptsMs by cumulative prior plan duration (monotonic timeline)', async () => {
    const plans: ScenePlanT[] = [
      {
        version: 1, title: '', fps: 10, renderer: 'half',
        shots: [{ id: 'a', durationMs: 200, background: { type: 'solid', color: '#000' }, layers: [] }],
      },
      {
        version: 1, title: '', fps: 10, renderer: 'half',
        shots: [{ id: 'b', durationMs: 200, background: { type: 'solid', color: '#fff' }, layers: [] }],
      },
    ];
    const pts: number[] = [];
    for await (const f of sequence(plans, { w: 4, h: 4, fps: 10 })) pts.push(f.ptsMs);
    // Strictly monotonic across the boundary; second plan's frames start at or above the first plan's total.
    for (let i = 1; i < pts.length; i++) expect(pts[i]!).toBeGreaterThanOrEqual(pts[i - 1]!);
    expect(pts[pts.length - 1]!).toBeGreaterThanOrEqual(200);
  });
});
