import { existsSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { composite } from '../../core/compositor.js';
import { loadPlanFromFile } from '../../core/plan-loader.js';
import { FfmpegMp4Encoder } from '../../adapters/ffmpeg/encoder.js';
import { planFromNL } from '../../adapters/llm/anthropic.js';
import { parseDurationMs } from './plan.js';
import { StylePresetName, type ScenePlanT } from '../../core/dsl.js';

export interface RenderOpts {
  input: string;
  out: string;
  size?: string;
  fps?: number;
  duration?: string;
  model?: string;
  style?: string;
  audio?: string;
  preset?: string;
  crf?: number;
  force?: boolean;
  savePlan?: string;
  upscale?: number; // render at size/upscale then nearest-neighbor upsize
  filter?: 'neighbor' | 'lanczos' | 'bicubic';
}

function parseSize(s: string | undefined, fallback: [number, number]): [number, number] {
  if (!s) return fallback;
  const m = /^(\d+)x(\d+)$/i.exec(s.trim());
  if (!m) throw new Error(`bad --size '${s}' (expected WxH like 1280x720)`);
  return [parseInt(m[1]!, 10), parseInt(m[2]!, 10)];
}

function evenDown(n: number): number {
  return n % 2 === 0 ? n : n - 1;
}

function looksLikePlanFile(input: string): boolean {
  if (!existsSync(input)) return false;
  try {
    if (!statSync(input).isFile()) return false;
  } catch {
    return false;
  }
  return input.toLowerCase().endsWith('.json');
}

async function loadOrPlan(opts: RenderOpts): Promise<ScenePlanT> {
  if (looksLikePlanFile(opts.input)) {
    const r = await loadPlanFromFile(opts.input);
    if (!r.ok) {
      console.error('terpix render: invalid plan:');
      for (const e of r.errors) console.error('  - ' + e);
      process.exit(1);
    }
    return r.plan;
  }
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error("terpix render: input is not a .json plan, and ANTHROPIC_API_KEY is not set for NL planning.");
    process.exit(2);
  }
  if (opts.style) {
    const ok = StylePresetName.safeParse(opts.style);
    if (!ok.success) {
      console.error(`terpix render: unknown style '${opts.style}'.`);
      process.exit(1);
    }
  }
  const durationMs = opts.duration ? parseDurationMs(opts.duration) : 15000;
  process.stderr.write(`terpix render: planning "${opts.input}" (${durationMs}ms)...\n`);
  const res = await planFromNL({
    prompt: opts.input,
    durationMs,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.style ? { style: opts.style } : {}),
  });
  if (!res.ok) {
    console.error('terpix render: ' + res.error);
    process.exit(1);
  }
  process.stderr.write(
    `terpix render: plan ready in ${res.attempts} attempt(s) — ` +
      `tokens in=${res.inputTokens} out=${res.outputTokens} cache_read=${res.cacheReadTokens}\n`,
  );
  return res.plan;
}

export async function render(opts: RenderOpts): Promise<void> {
  if (!opts.force && existsSync(opts.out)) {
    console.error(`terpix render: output exists: ${opts.out} (use --force to overwrite)`);
    process.exit(1);
  }

  const plan = await loadOrPlan(opts);
  if (opts.style) plan.style = opts.style as ScenePlanT['style'];

  if (opts.savePlan) {
    await writeFile(opts.savePlan, JSON.stringify(plan, null, 2) + '\n', 'utf8');
    process.stderr.write(`terpix render: saved plan to ${opts.savePlan}\n`);
  }

  const [wRaw, hRaw] = parseSize(opts.size, [1280, 720]);
  const outputWidth = evenDown(wRaw);
  const outputHeight = evenDown(hRaw);
  const upscale = Math.max(1, Math.floor(opts.upscale ?? 1));
  // Internal compositor render dims = output / upscale, rounded down to even.
  const width = upscale > 1 ? evenDown(Math.floor(outputWidth / upscale)) : outputWidth;
  const height = upscale > 1 ? evenDown(Math.floor(outputHeight / upscale)) : outputHeight;
  const fps = opts.fps ?? plan.fps;

  const totalMs = plan.shots.reduce((s, sh) => s + sh.durationMs, 0);
  const totalFrames = Math.ceil((totalMs / 1000) * fps);
  if (upscale > 1) {
    process.stderr.write(
      `terpix render: composing ${width}x${height} → upscale x${upscale} (${opts.filter ?? 'neighbor'}) → ${outputWidth}x${outputHeight} @ ${fps}fps × ~${totalFrames} frames → ${opts.out}\n`,
    );
  } else {
    process.stderr.write(
      `terpix render: encoding ${width}x${height} @ ${fps}fps × ~${totalFrames} frames → ${opts.out}\n`,
    );
  }

  const encoder = new FfmpegMp4Encoder({
    output: opts.out,
    width,
    height,
    fps,
    ...(upscale > 1 ? { outputWidth, outputHeight, upscaleFilter: opts.filter ?? 'neighbor' } : {}),
    ...(opts.preset ? { preset: opts.preset } : {}),
    ...(opts.crf !== undefined ? { crf: opts.crf } : {}),
    ...(opts.audio ? { audioPath: opts.audio } : {}),
  });
  encoder.start();

  const startedAt = Date.now();
  let count = 0;
  let lastReportAt = startedAt;

  try {
    for await (const frame of composite(plan, { w: width, h: height, fps })) {
      await encoder.writeFrame(frame.rgba);
      count++;
      const now = Date.now();
      if (now - lastReportAt > 1000) {
        const elapsedS = (now - startedAt) / 1000;
        const realtimeFps = count / elapsedS;
        process.stderr.write(
          `terpix render: ${count}/${totalFrames} frames (${realtimeFps.toFixed(1)} fps real)\n`,
        );
        lastReportAt = now;
      }
    }
  } catch (err) {
    encoder.kill();
    throw err;
  }

  await encoder.end();
  const totalS = ((Date.now() - startedAt) / 1000).toFixed(2);
  process.stderr.write(`terpix render: done — ${count} frames in ${totalS}s → ${opts.out}\n`);
}
