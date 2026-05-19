import { readFile } from 'node:fs/promises';
import { ScenePlan, type ScenePlanT } from './dsl.js';
import { findNearestName, getAsset } from './assets/registry.js';

export type LoadResult =
  | { ok: true; plan: ScenePlanT }
  | { ok: false; errors: string[] };

export async function loadPlanFromFile(path: string): Promise<LoadResult> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    return { ok: false, errors: [`cannot read '${path}': ${(err as Error).message}`] };
  }
  return parsePlanText(raw, path);
}

export function parsePlanText(text: string, source = '<plan>'): LoadResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    const msg = (err as Error).message;
    const m = /position (\d+)/.exec(msg);
    let loc = '';
    if (m) {
      const pos = Number.parseInt(m[1]!, 10);
      const before = text.slice(0, pos);
      const line = before.split('\n').length;
      const col = pos - before.lastIndexOf('\n');
      loc = ` at line ${line}, col ${col}`;
    }
    return { ok: false, errors: [`${source}: invalid JSON${loc}: ${msg}`] };
  }
  return validatePlan(json, source);
}

export function validatePlan(json: unknown, source = '<plan>'): LoadResult {
  const parsed = ScenePlan.safeParse(json);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => {
      const path = i.path.length ? i.path.join('.') : '<root>';
      return `${source}: ${path}: ${i.message}`;
    });
    return { ok: false, errors };
  }
  const plan = parsed.data;
  const errors: string[] = [];
  for (let si = 0; si < plan.shots.length; si++) {
    const shot = plan.shots[si]!;
    for (let li = 0; li < shot.layers.length; li++) {
      const layer = shot.layers[li]!;
      if (layer.type !== 'sprite') continue;
      if (getAsset(layer.asset)) continue;
      const hint = findNearestName(layer.asset);
      const where = `shots[${si}].layers[${li}].asset`;
      errors.push(
        `${source}: ${where}: unknown sprite '${layer.asset}'` +
          (hint ? ` (did you mean '${hint}'?)` : '') +
          '. Run `terpix asset list` to see registered names.',
      );
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, plan };
}
