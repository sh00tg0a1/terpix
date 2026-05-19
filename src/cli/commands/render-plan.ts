import { composite } from '../../core/compositor.js';
import { compositeAscii } from '../../core/compositor-ascii.js';
import { loadPlanFromFile } from '../../core/plan-loader.js';
import { HalfBlockEncoder } from '../../adapters/terminal/half-block.js';
import { AsciiEncoder } from '../../adapters/terminal/ascii.js';
import { TerminalDriver, probeCaps } from '../../adapters/terminal/driver.js';
import { Renderer, StylePresetName } from '../../core/dsl.js';

export interface RenderPlanOpts {
  path: string;
  style?: string;
  renderer?: string;
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
  if (opts.style) {
    const parsed = StylePresetName.safeParse(opts.style);
    if (!parsed.success) {
      console.error(`terpix render-plan: unknown style '${opts.style}'. Try: default | starwars | minimalist | silhouette | noir`);
      process.exit(1);
    }
    plan.style = parsed.data;
  }
  if (opts.renderer) {
    const parsed = Renderer.safeParse(opts.renderer);
    if (!parsed.success) {
      console.error(`terpix render-plan: unknown renderer '${opts.renderer}'. Try: half | ascii`);
      process.exit(1);
    }
    plan.renderer = parsed.data;
  }

  const caps = probeCaps();
  const cols = caps.cols;
  const rows = Math.max(2, caps.rows - 1);
  const MAX_RENDER_COLS = parseInt(process.env['TERPIX_MAX_COLS'] ?? '160', 10);

  const driver = new TerminalDriver();
  driver.start();
  const startedAt = Date.now();

  try {
    if (plan.renderer === 'ascii') {
      const encoder = new AsciiEncoder();
      const effCols = plan.size ? plan.size.w : Math.min(cols, MAX_RENDER_COLS);
      const effRows = plan.size ? plan.size.h : rows;
      for await (const frame of compositeAscii(plan, { w: effCols, h: effRows, fps: plan.fps })) {
        const targetMs = startedAt + frame.ptsMs;
        const wait = targetMs - Date.now();
        if (wait > 1) await new Promise((r) => setTimeout(r, wait));
        else if (wait < -100) continue;
        await driver.writeFrame(encoder.encode(frame));
      }
    } else {
      const encoder = new HalfBlockEncoder();
      const effCols = plan.size ? plan.size.w : Math.min(cols, MAX_RENDER_COLS);
      const effRows = plan.size ? plan.size.h : rows;
      const targetW = effCols * encoder.cellRatio.w;
      const targetHRaw = effRows * encoder.cellRatio.h;
      const targetH = targetHRaw % 2 === 0 ? targetHRaw : targetHRaw - 1;
      let prevFrame: import('../../core/types.js').RGBFrame | undefined;
      for await (const frame of composite(plan, { w: targetW, h: targetH, fps: plan.fps })) {
        const targetMs = startedAt + frame.ptsMs;
        const wait = targetMs - Date.now();
        if (wait > 1) await new Promise((r) => setTimeout(r, wait));
        else if (wait < -100) continue;
        await driver.writeFrame(encoder.encode(frame, prevFrame));
        prevFrame = frame;
      }
    }
  } finally {
    driver.stop();
  }
}
