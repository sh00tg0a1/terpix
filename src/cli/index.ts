import { Command } from 'commander';
import { play } from './commands/play.js';
import { demo } from './commands/demo.js';
import { renderPlan } from './commands/render-plan.js';

const program = new Command();

program
  .name('terpix')
  .description('NL-driven terminal character-stream movie renderer')
  .version('0.0.1');

program
  .command('play')
  .description('Decode a video and play it in the current terminal')
  .argument('<input>', 'path to a video file')
  .option('--fps <n>', 'target frames per second', (v) => parseInt(v, 10), 24)
  .action(async (input: string, opts: { fps: number }) => {
    await play(input, { fps: opts.fps });
  });

program
  .command('demo')
  .description('Stream a procedurally generated animation to the terminal (no ffmpeg, no file)')
  .option('--scene <name>', 'gradient | starfield | crawl', 'gradient')
  .option('--fps <n>', 'frames per second', (v) => parseInt(v, 10), 24)
  .option('--duration <s>', 'duration in seconds', (v) => parseFloat(v), 5)
  .action(async (opts: { scene: string; fps: number; duration: number }) => {
    const scene = (['gradient', 'starfield', 'crawl'] as const).find((s) => s === opts.scene);
    if (!scene) {
      console.error(`unknown scene: ${opts.scene}. Use gradient|starfield|crawl.`);
      process.exit(1);
    }
    await demo({ scene, fps: opts.fps, durationMs: Math.round(opts.duration * 1000) });
  });

program
  .command('render-plan')
  .description('Render a JSON scene plan to the terminal (DSL → compositor → encoder)')
  .argument('<path>', 'path to a JSON plan file')
  .action(async (path: string) => {
    await renderPlan({ path });
  });

program
  .command('probe')
  .description('Print detected terminal capabilities')
  .action(async () => {
    const { probeCaps } = await import('../adapters/terminal/driver.js');
    console.log(JSON.stringify(probeCaps(), null, 2));
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
