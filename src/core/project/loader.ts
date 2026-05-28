import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import { ScenePlan, type ScenePlanT } from '../dsl.js';
import { Scene2 } from '../scene2/schema.js';
import { compileScene, dropUnregisteredSprites } from '../scene2/compile.js';
import { loadUserAssets } from '../assets/loader.js';
import { Project, type ProjectT } from './schema.js';

export interface LoadedProject {
  dir: string;
  project: ProjectT;
  scenes: ScenePlanT[];
}

export type LoadResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

// A directory holding a `project.json` at its root is a terpix project.
export function isProjectDir(input: string): boolean {
  try {
    if (!statSync(input).isDirectory()) return false;
  } catch {
    return false;
  }
  return existsSync(join(input, 'project.json'));
}

// Read+parse JSON in one go with friendly errors.
function readJson(filePath: string): LoadResult<unknown> {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ok: false, errors: [`${filePath}: ${(err as Error).message}`] };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, errors: [`${filePath}: invalid JSON: ${(err as Error).message}`] };
  }
}

// Unified scene loader: detects v1 plan vs v2 scene by the `version` field.
// v2 files are compiled to v1 here so the renderer sees one IR. Both run
// through `dropUnregisteredSprites` so a stale reference can't crash render.
export function loadScene(filePath: string): LoadResult<ScenePlanT> {
  const j = readJson(filePath);
  if (!j.ok) return j;
  const v = (j.value as { version?: unknown }).version;
  if (v === 2) {
    const r = Scene2.safeParse(j.value);
    if (!r.success) {
      return {
        ok: false,
        errors: r.error.issues.map((i) => `${filePath}: ${i.path.join('.') || '<root>'}: ${i.message}`),
      };
    }
    const plan = compileScene(r.data);
    dropUnregisteredSprites(plan);
    return { ok: true, value: plan };
  }
  const r = ScenePlan.safeParse(j.value);
  if (!r.success) {
    return {
      ok: false,
      errors: r.error.issues.map((i) => `${filePath}: ${i.path.join('.') || '<root>'}: ${i.message}`),
    };
  }
  const plan = r.data;
  dropUnregisteredSprites(plan);
  return { ok: true, value: plan };
}

// Load a project directory: parse project.json, register the project's local
// `assets/` (so scenes referencing those custom sprites resolve before drop-
// unknown sanitation), then load every scene file in order.
export function loadProject(dir: string): LoadResult<LoadedProject> {
  const projPath = join(dir, 'project.json');
  const j = readJson(projPath);
  if (!j.ok) return j;
  const r = Project.safeParse(j.value);
  if (!r.success) {
    return {
      ok: false,
      errors: r.error.issues.map((i) => `project.json: ${i.path.join('.') || '<root>'}: ${i.message}`),
    };
  }
  const project = r.data;

  // Project-local assets — registered into the global registry but sourced
  // from the project dir, so a project's custom sprites travel with it.
  const assetsDir = join(dir, 'assets');
  if (existsSync(assetsDir)) loadUserAssets({ extraDirs: [assetsDir] });

  const errors: string[] = [];
  const scenes: ScenePlanT[] = [];
  for (const ref of project.scenes) {
    const p = isAbsolute(ref.file) ? ref.file : resolve(dir, ref.file);
    const s = loadScene(p);
    if (!s.ok) errors.push(...s.errors);
    else scenes.push(s.value);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { dir, project, scenes } };
}
