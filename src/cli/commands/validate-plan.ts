import { loadPlanFromFile } from '../../core/plan-loader.js';

export interface ValidatePlanOpts {
  path: string;
}

export async function validatePlan(opts: ValidatePlanOpts): Promise<void> {
  const result = await loadPlanFromFile(opts.path);
  if (!result.ok) {
    console.error(`terpix validate-plan: ${result.errors.length} error(s):`);
    for (const e of result.errors) console.error('  - ' + e);
    process.exit(1);
  }
  const p = result.plan;
  const shots = p.shots.length;
  const totalMs = p.shots.reduce((s, sh) => s + sh.durationMs, 0);
  const layers = p.shots.reduce((s, sh) => s + sh.layers.length, 0);
  console.log(`terpix validate-plan: OK`);
  console.log(`  title:    ${p.title || '(untitled)'}`);
  console.log(`  fps:      ${p.fps}`);
  console.log(`  shots:    ${shots}`);
  console.log(`  layers:   ${layers}`);
  console.log(`  duration: ${(totalMs / 1000).toFixed(2)}s`);
}
