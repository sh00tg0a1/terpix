import { generateGradient } from '../../core/synthetic.js';
import { generateStarfield } from '../../core/scenes/starfield.js';
import { generateCrawl } from '../../core/scenes/crawl.js';
import { HalfBlockEncoder } from '../../adapters/terminal/half-block.js';
import { TerminalDriver, probeCaps } from '../../adapters/terminal/driver.js';
import type { RGBFrame } from '../../core/types.js';

export type SceneName = 'gradient' | 'starfield' | 'crawl';

export interface DemoOpts {
  fps: number;
  durationMs: number;
  scene: SceneName;
}

export async function demo(opts: DemoOpts): Promise<void> {
  if (!process.stdout.isTTY) {
    console.error('terpix demo: stdout is not a TTY.');
    process.exit(2);
  }

  const caps = probeCaps();
  const encoder = new HalfBlockEncoder();
  const cols = caps.cols;
  const rows = Math.max(2, caps.rows - 1);
  const targetW = cols * encoder.cellRatio.w;
  const targetH = rows * encoder.cellRatio.h;
  const evenH = targetH % 2 === 0 ? targetH : targetH - 1;

  const sceneOpts = { w: targetW, h: evenH, fps: opts.fps, durationMs: opts.durationMs };
  let source: AsyncGenerator<RGBFrame>;
  switch (opts.scene) {
    case 'starfield':
      source = generateStarfield(sceneOpts);
      break;
    case 'crawl':
      source = generateCrawl(sceneOpts);
      break;
    case 'gradient':
    default:
      source = generateGradient(sceneOpts);
      break;
  }

  const driver = new TerminalDriver();
  driver.start();

  const startedAt = Date.now();

  try {
    for await (const frame of source) {
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
