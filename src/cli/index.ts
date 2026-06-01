import { Command } from 'commander';
import { play } from './commands/play.js';
import { demo } from './commands/demo.js';
import { renderPlan } from './commands/render-plan.js';
import { render as renderToFile } from './commands/render.js';
import { validatePlan } from './commands/validate-plan.js';
import { parseDurationMs, planCmd } from './commands/plan.js';
import { configCmd } from './commands/config-cmd.js';
import { newProject } from './commands/new.js';
import { sceneAdd } from './commands/scene-add.js';
import { assetAdd } from './commands/asset-add.js';
import { film } from './commands/film.js';
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
  .option('--model <id>', 'LLM model id (NL only, defaults to config default_model)')
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
  .option('--model <id>', 'LLM model id (defaults to config default_model)')
  .option('--renderer <name>', 'half | ascii', 'half')
  .option('--style <name>', 'default | starwars | minimalist | silhouette | noir')
  .option('--vision-model <id>', 'vision-LLM id for the in-loop frame critic (e.g. qwen-vl-plus). When set, the planner renders a preview frame, asks this model what to fix, and retries.')
  .option('--vision-rounds <n>', 'max vision-critic retries (default 1)', '1')
  .option('--visual-fewshot', 'prepend rendered reference frames + their JSON to the prompt (requires a vision-capable planner model, e.g. qwen-plus)')
  .option('--gen-assets', 'generate scene-specific sprites for objects not in the builtin catalog before composing; --vision-model gates them for recognizability')
  .option('--asset-mode <mode>', 'sprite generation mode for --gen-assets: shape (LLM primitives, recolors) | image (Qwen-Image PNG, bitmap)', 'shape')
  .option('--image-model <id>', 'Qwen-Image model id for --asset-mode image (default qwen-image-2.0-pro)')
  .option('--image-size <WxH>', 'Qwen-Image canvas size, e.g. 1328*1328 (default), 1664*928, 928*1664')
  .option('--image-max-side <n>', 'max side (px) of the cooked sprite stored on disk (default 96)', (v) => parseInt(v, 10))
  .action(async (prompt: string, opts: { duration: string; out?: string; model?: string; renderer?: string; style?: string; visionModel?: string; visionRounds?: string; visualFewshot?: boolean; genAssets?: boolean; assetMode?: string; imageModel?: string; imageSize?: string; imageMaxSide?: number }) => {
    let durationMs: number;
    try {
      durationMs = parseDurationMs(opts.duration);
    } catch (err) {
      console.error(`terpix plan: ${(err as Error).message}`);
      process.exit(1);
    }
    const assetMode = opts.assetMode === 'image' ? 'image' : opts.assetMode === 'shape' ? 'shape' : undefined;
    if (opts.assetMode && !assetMode) {
      console.error(`terpix plan: --asset-mode must be 'shape' or 'image'`);
      process.exit(1);
    }
    await planCmd({
      prompt,
      durationMs,
      ...(opts.out ? { out: opts.out } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.renderer === 'ascii' ? { renderer: 'ascii' as const } : { renderer: 'half' as const }),
      ...(opts.style ? { style: opts.style } : {}),
      ...(opts.visionModel ? { visionModel: opts.visionModel } : {}),
      ...(opts.visionRounds ? { visionRounds: parseInt(opts.visionRounds, 10) } : {}),
      ...(opts.visualFewshot ? { visualFewShot: true } : {}),
      ...(opts.genAssets ? { genAssets: true } : {}),
      ...(assetMode ? { assetMode } : {}),
      ...(opts.imageModel ? { imageModel: opts.imageModel } : {}),
      ...(opts.imageSize ? { imageSize: opts.imageSize } : {}),
      ...(opts.imageMaxSide !== undefined ? { imageMaxSide: opts.imageMaxSide } : {}),
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
  .option('--model <id>', 'LLM model id (NL only, defaults to config default_model)')
  .option('--style <name>', 'override plan style')
  .option('--audio <path>', 'mux an audio track into the output')
  .option('--upscale <n>', 'render small, then upscale by N for chunky terminal look (default 1 = off)', (v) => parseInt(v, 10))
  .option('--filter <name>', 'upscale filter: neighbor | lanczos | bicubic', 'neighbor')
  .option('--preset <name>', 'x264 preset (ultrafast..veryslow)', 'medium')
  .option('--crf <n>', 'x264 crf (lower=better, 18 is visually lossless)', (v) => parseInt(v, 10))
  .option('--save-plan <path>', 'also write the generated plan to disk (NL only)')
  .option('--force', 'overwrite existing output')
  .action(async (
    input: string,
    opts: {
      out: string; size?: string; fps?: number; duration: string;
      model?: string; style?: string; audio?: string;
      upscale?: number; filter?: string;
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
      ...(opts.upscale !== undefined ? { upscale: opts.upscale } : {}),
      ...(opts.filter ? { filter: opts.filter as 'neighbor' | 'lanczos' | 'bicubic' } : {}),
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
  .command('config')
  .description('Manage ~/.config/terpix/config.json (API key, provider, default model, default style/renderer)')
  .argument('<subcommand>', 'show | setup | get <key> | set <key> [value] | unset <key> | path')
  .argument('[key]', 'config key (provider | anthropic_api_key | openai_api_key | minimax_api_key | qwen_api_key | openai_compat_api_key | openai_compat_base_url | default_model | default_style | default_renderer)')
  .argument('[value]', 'value (omit for `set` to prompt with hidden input on a TTY)')
  .action(async (subcommand: string, key?: string, value?: string) => {
    const sub = subcommand as 'show' | 'setup' | 'get' | 'set' | 'unset' | 'path';
    if (!['show', 'setup', 'get', 'set', 'unset', 'path'].includes(sub)) {
      console.error(`terpix config: unknown subcommand '${subcommand}'. Try: show | setup | get | set | unset | path`);
      process.exit(1);
    }
    await configCmd({
      subcommand: sub,
      ...(key ? { key } : {}),
      ...(value !== undefined ? { value } : {}),
    });
  });

const assetCmd = program.command('asset').description('Manage assets (registered builtins + generated shapes)');
assetCmd
  .command('list')
  .description('List every registered asset (name, source, description)')
  .action(() => {
    for (const entry of listAssets()) {
      console.log(`${entry.name.padEnd(14)} [${entry.source}]  ${entry.description}`);
    }
  });
assetCmd
  .command('add')
  .description('Generate a new shape sprite into <projdir>/assets/ via LLM')
  .argument('<projdir>', 'path to a terpix project directory')
  .argument('<name>', 'asset id (lowercase a-z, 0-9, -)')
  .argument('<description...>', "one short line describing what it looks like")
  .option('--model <id>', 'LLM model id (defaults to provider default)')
  .option('--vision-model <id>', 'override the recognizability vision model (default: qwen-vl-plus on qwen, gpt-4o-mini on openai)')
  .option('--no-vision', 'skip the vision recognizability gate (faster, cheaper, less reliable)')
  .option('--asset-mode <mode>', 'sprite generation mode: shape (default) | image (Qwen-Image PNG → bitmap)', 'shape')
  .option('--image-model <id>', 'Qwen-Image model id for --asset-mode image')
  .option('--image-size <WxH>', 'Qwen-Image canvas size, e.g. 1328*1328')
  .option('--image-max-side <n>', 'cooked sprite max side (px), default 96', (v) => parseInt(v, 10))
  .action(async (
    projdir: string,
    name: string,
    description: string[],
    opts: { model?: string; visionModel?: string; vision?: boolean; assetMode?: string; imageModel?: string; imageSize?: string; imageMaxSide?: number },
  ) => {
    // Commander turns --no-vision into vision=false.
    const assetMode = opts.assetMode === 'image' ? 'image' : opts.assetMode === 'shape' ? 'shape' : undefined;
    if (opts.assetMode && !assetMode) {
      console.error(`terpix asset add: --asset-mode must be 'shape' or 'image'`);
      process.exit(1);
    }
    await assetAdd({
      dir: projdir,
      name,
      description: description.join(' '),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.visionModel ? { visionModel: opts.visionModel } : {}),
      ...(opts.vision === false ? { noVision: true } : {}),
      ...(assetMode ? { assetMode } : {}),
      ...(opts.imageModel ? { imageModel: opts.imageModel } : {}),
      ...(opts.imageSize ? { imageSize: opts.imageSize } : {}),
      ...(opts.imageMaxSide !== undefined ? { imageMaxSide: opts.imageMaxSide } : {}),
    });
  });

program
  .command('new')
  .description('Scaffold a new terpix project (project.json + scenes/ + assets/)')
  .argument('<dir>', 'directory to create')
  .argument('[title]', 'human-readable title')
  .option('--fps <n>', 'project fps', (v) => parseInt(v, 10))
  .option('--size <WxH>', 'output dimensions (e.g. 1280x720)')
  .option('--renderer <name>', 'half | ascii')
  .option('--force', 'overwrite an existing project.json')
  .action(async (
    dir: string,
    title: string | undefined,
    opts: { fps?: number; size?: string; renderer?: string; force?: boolean },
  ) => {
    await newProject({
      dir,
      ...(title ? { title } : {}),
      ...(opts.fps !== undefined ? { fps: opts.fps } : {}),
      ...(opts.size ? { size: opts.size } : {}),
      ...(opts.renderer ? { renderer: opts.renderer as 'half' | 'ascii' } : {}),
      ...(opts.force ? { force: true } : {}),
    });
  });

const sceneCmd = program.command('scene').description('Scene operations on a terpix project');
sceneCmd
  .command('add')
  .description('Plan one new scene from NL and write it into <projdir>/scenes/')
  .argument('<projdir>', 'terpix project directory')
  .argument('<prompt...>', 'natural-language scene description')
  .option('--duration <t>', 'scene duration (e.g. 6s, 800ms)', '6s')
  .option('--model <id>', 'LLM model id')
  .option('--style <name>', 'override scene style')
  .option('--name <slug>', 'override the scene file name slug')
  .option('--gen-assets', 'auto-generate any sprites the catalog lacks (into <projdir>/assets/)')
  .option('--asset-mode <mode>', 'sprite generation mode for --gen-assets: shape | image', 'shape')
  .option('--image-model <id>', 'Qwen-Image model id for --asset-mode image')
  .option('--image-size <WxH>', 'Qwen-Image canvas size, e.g. 1328*1328')
  .option('--image-max-side <n>', 'cooked sprite max side (px), default 96', (v) => parseInt(v, 10))
  .action(async (
    projdir: string,
    prompt: string[],
    opts: { duration?: string; model?: string; style?: string; name?: string; genAssets?: boolean; assetMode?: string; imageModel?: string; imageSize?: string; imageMaxSide?: number },
  ) => {
    const assetMode = opts.assetMode === 'image' ? 'image' : opts.assetMode === 'shape' ? 'shape' : undefined;
    if (opts.assetMode && !assetMode) {
      console.error(`terpix scene add: --asset-mode must be 'shape' or 'image'`);
      process.exit(1);
    }
    const r = await sceneAdd({
      dir: projdir,
      prompt: prompt.join(' '),
      ...(opts.duration ? { duration: opts.duration } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.style ? { style: opts.style } : {}),
      ...(opts.name ? { name: opts.name } : {}),
      ...(opts.genAssets ? { genAssets: true } : {}),
      ...(assetMode ? { assetMode } : {}),
      ...(opts.imageModel ? { imageModel: opts.imageModel } : {}),
      ...(opts.imageSize ? { imageSize: opts.imageSize } : {}),
      ...(opts.imageMaxSide !== undefined ? { imageMaxSide: opts.imageMaxSide } : {}),
    });
    if (!r.ok) {
      console.error('terpix scene add: ' + r.error);
      process.exit(1);
    }
  });

program
  .command('film')
  .description('Direct + plan a whole film: LLM decomposes the idea into scenes, each is planned into <projdir>/scenes/')
  .argument('<projdir>', 'terpix project directory')
  .argument('<prompt...>', 'high-level film idea')
  .option('--duration <t>', 'total film duration (e.g. 30s, 1m)', '30s')
  .option('--scenes <n>', 'target number of scenes (1-8)', (v) => parseInt(v, 10))
  .option('--model <id>', 'LLM model id')
  .option('--gen-assets', 'auto-generate missing sprites per scene (into <projdir>/assets/)')
  .option('--asset-mode <mode>', 'sprite generation mode for --gen-assets: shape | image', 'shape')
  .option('--image-model <id>', 'Qwen-Image model id for --asset-mode image')
  .option('--image-size <WxH>', 'Qwen-Image canvas size, e.g. 1328*1328')
  .option('--image-max-side <n>', 'cooked sprite max side (px), default 96', (v) => parseInt(v, 10))
  .action(async (
    projdir: string,
    prompt: string[],
    opts: { duration?: string; scenes?: number; model?: string; genAssets?: boolean; assetMode?: string; imageModel?: string; imageSize?: string; imageMaxSide?: number },
  ) => {
    const assetMode = opts.assetMode === 'image' ? 'image' : opts.assetMode === 'shape' ? 'shape' : undefined;
    if (opts.assetMode && !assetMode) {
      console.error(`terpix film: --asset-mode must be 'shape' or 'image'`);
      process.exit(1);
    }
    await film({
      dir: projdir,
      prompt: prompt.join(' '),
      ...(opts.duration ? { duration: opts.duration } : {}),
      ...(opts.scenes !== undefined ? { scenes: opts.scenes } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.genAssets ? { genAssets: true } : {}),
      ...(assetMode ? { assetMode } : {}),
      ...(opts.imageModel ? { imageModel: opts.imageModel } : {}),
      ...(opts.imageSize ? { imageSize: opts.imageSize } : {}),
      ...(opts.imageMaxSide !== undefined ? { imageMaxSide: opts.imageMaxSide } : {}),
    });
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
