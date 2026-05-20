import { Command } from 'commander';
import { play } from './commands/play.js';
import { demo } from './commands/demo.js';
import { renderPlan } from './commands/render-plan.js';
import { render as renderToFile } from './commands/render.js';
import { validatePlan } from './commands/validate-plan.js';
import { parseDurationMs, planCmd } from './commands/plan.js';
import { registerBuiltins } from '../core/assets/builtin/index.js';
import { listAssets } from '../core/assets/registry.js';
import { loadUserAssets } from '../core/assets/loader.js';

registerBuiltins();
const loadReport = loadUserAssets();
for (const err of loadReport.errors) {
  console.error(`[terpix] failed to load asset '${err.path}':`);
  for (const m of err.messages) console.error('  - ' + m);
}

const program = new Command();

program
  .name('terpix')
  .description('NL-driven terminal character-stream movie renderer')
  .version('0.0.1');

program
  .command('play')
  .description('Play a video file OR an NL prompt (calls Claude → renders inline)')
  .argument('<input>', 'video file path OR natural-language prompt')
  .option('--fps <n>', 'target frames per second (video only)', (v) => parseInt(v, 10), 24)
  .option('--duration <t>', 'NL prompt total duration (e.g. 15s, 1m)', '15s')
  .option('--model <id>', 'Anthropic model id (NL only)', 'claude-sonnet-4-6')
  .option('--style <name>', 'override plan style (NL only)')
  .option('--save-plan <path>', 'also write the generated plan to disk (NL only)')
  .action(async (
    input: string,
    opts: { fps: number; duration: string; model?: string; style?: string; savePlan?: string },
  ) => {
    await play(input, {
      fps: opts.fps,
      duration: opts.duration,
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.style ? { style: opts.style } : {}),
      ...(opts.savePlan ? { savePlan: opts.savePlan } : {}),
    });
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
  .option('--style <name>', 'override plan style: default|starwars|minimalist|silhouette|noir')
  .option('--renderer <name>', 'override plan renderer: half|ascii')
  .action(async (path: string, opts: { style?: string; renderer?: string }) => {
    await renderPlan({
      path,
      ...(opts.style ? { style: opts.style } : {}),
      ...(opts.renderer ? { renderer: opts.renderer } : {}),
    });
  });

program
  .command('plan')
  .description('Generate a JSON scene plan from a natural-language prompt via Claude')
  .argument('<prompt>', 'natural-language description of the scene')
  .option('--duration <t>', 'total duration (e.g. 15s, 1m30s, 500ms)', '15s')
  .option('-o, --out <path>', 'output file (default stdout); "-" also = stdout')
  .option('--model <id>', 'Anthropic model id', 'claude-sonnet-4-6')
  .option('--renderer <name>', 'half | ascii', 'half')
  .option('--style <name>', 'default | starwars | minimalist | silhouette | noir')
  .action(async (prompt: string, opts: { duration: string; out?: string; model?: string; renderer?: string; style?: string }) => {
    let durationMs: number;
    try {
      durationMs = parseDurationMs(opts.duration);
    } catch (err) {
      console.error(`terpix plan: ${(err as Error).message}`);
      process.exit(1);
    }
    await planCmd({
      prompt,
      durationMs,
      ...(opts.out ? { out: opts.out } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.renderer === 'ascii' ? { renderer: 'ascii' as const } : { renderer: 'half' as const }),
      ...(opts.style ? { style: opts.style } : {}),
    });
  });

program
  .command('render')
  .description('Render a plan file OR an NL prompt to an mp4 (or other ffmpeg format)')
  .argument('<input>', 'path to a plan .json file OR a natural-language prompt')
  .requiredOption('-o, --out <path>', 'output file (e.g. out.mp4)')
  .option('--size <WxH>', 'output dimensions in pixels (default 1280x720)')
  .option('--fps <n>', 'fps (override plan.fps)', (v) => parseInt(v, 10))
  .option('--duration <t>', 'NL prompt total duration (e.g. 15s, 1m)', '15s')
  .option('--model <id>', 'Anthropic model id (NL only)', 'claude-sonnet-4-6')
  .option('--style <name>', 'override plan style')
  .option('--audio <path>', 'mux an audio track into the output')
  .option('--preset <name>', 'x264 preset (ultrafast..veryslow)', 'medium')
  .option('--crf <n>', 'x264 crf (lower=better, 18 is visually lossless)', (v) => parseInt(v, 10))
  .option('--save-plan <path>', 'also write the generated plan to disk (NL only)')
  .option('--force', 'overwrite existing output')
  .action(async (
    input: string,
    opts: {
      out: string; size?: string; fps?: number; duration: string;
      model?: string; style?: string; audio?: string;
      preset?: string; crf?: number; savePlan?: string; force?: boolean;
    },
  ) => {
    await renderToFile({
      input,
      out: opts.out,
      duration: opts.duration,
      force: !!opts.force,
      ...(opts.size ? { size: opts.size } : {}),
      ...(opts.fps !== undefined ? { fps: opts.fps } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.style ? { style: opts.style } : {}),
      ...(opts.audio ? { audio: opts.audio } : {}),
      ...(opts.preset ? { preset: opts.preset } : {}),
      ...(opts.crf !== undefined ? { crf: opts.crf } : {}),
      ...(opts.savePlan ? { savePlan: opts.savePlan } : {}),
    });
  });

program
  .command('validate-plan')
  .description('Parse + type-check a scene plan and verify all sprite assets exist')
  .argument('<path>', 'path to a JSON plan file')
  .action(async (path: string) => {
    await validatePlan({ path });
  });

program
  .command('probe')
  .description('Print detected terminal capabilities')
  .action(async () => {
    const { probeCaps } = await import('../adapters/terminal/driver.js');
    console.log(JSON.stringify(probeCaps(), null, 2));
  });

program
  .command('asset')
  .description('Inspect registered assets')
  .argument('<subcommand>', 'list')
  .action((subcommand: string) => {
    if (subcommand !== 'list') {
      console.error(`terpix asset: unknown subcommand '${subcommand}'. Try 'list'.`);
      process.exit(1);
    }
    const rows = listAssets();
    for (const entry of rows) {
      console.log(`${entry.name.padEnd(14)} [${entry.source}]  ${entry.description}`);
    }
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
