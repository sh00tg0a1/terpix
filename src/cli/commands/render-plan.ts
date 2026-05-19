import { composite } from '../../core/compositor.js';
import { loadPlanFromFile } from '../../core/plan-loader.js';
import { HalfBlockEncoder } from '../../adapters/terminal/half-block.js';
import { TerminalDriver, probeCaps } from '../../adapters/terminal/driver.js';

export interface RenderPlanOpts {
  path: string;
}

export async function renderPlan(opts: RenderPlanOpts): Promise<void> {
  if (!process.stdout.isTTY) {
    console.error('terpix render-plan: stdout is not a TTY.');
    process.exit(2);
  }

  const result = await loadPlanFromFile(opts.path);
  if (!result.ok) {
    console.error('terpix render-plan: invalid plan:');
    for (const e of result.errors) console.error('  - ' + e);
    process.exit(1);
  }
  const plan = result.plan;

  const caps = probeCaps();
  const encoder = new HalfBlockEncoder();
  const cols = caps.cols;
  const rows = Math.max(2, caps.rows - 1);
  const targetW = (plan.size?.w ?? cols) * encoder.cellRatio.w;
  const targetHRaw = (plan.size?.h ?? rows) * encoder.cellRatio.h;
  const targetH = targetHRaw % 2 === 0 ? targetHRaw : targetHRaw - 1;

  const driver = new TerminalDriver();
  driver.start();

  const startedAt = Date.now();
  try {
    for await (const frame of composite(plan, { w: targetW, h: targetH, fps: plan.fps })) {
      const targetMs = startedAt + frame.ptsMs;
      const wait = targetMs - Date.now();
      if (wait > 1) await new Promise((r) => setTimeout(r, wait));
      else if (wait < -100) continue;
      const bytes = encoder.encode(frame);
      await driver.writeFrame(bytes);
    }
  } finally {
    driver.stop();
  }
}
