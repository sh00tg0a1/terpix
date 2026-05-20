import { existsSync, statSync } from 'node:fs';
import { decodeFrames } from '../../adapters/ffmpeg/decoder.js';
import { HalfBlockEncoder } from '../../adapters/terminal/half-block.js';
import { TerminalDriver, probeCaps } from '../../adapters/terminal/driver.js';
import { computeRenderSize } from '../render-size.js';
import { composite } from '../../core/compositor.js';
import { planFromNL, hasAnthropicApiKey } from '../../adapters/llm/anthropic.js';
import { parseDurationMs } from './plan.js';
import { StylePresetName, type ScenePlanT } from '../../core/dsl.js';
import type { RGBFrame } from '../../core/types.js';

export interface PlayOpts {
  fps: number;
  duration?: string;
  model?: string;
  style?: string;
  savePlan?: string;
}

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v', '.gif']);

function looksLikeVideoPath(input: string): boolean {
  // Existing file with a video-ish extension → treat as video; everything
  // else (including bare strings with spaces, prompts, or non-existent
  // paths) goes through the NL planner.
  if (!existsSync(input)) return false;
  try {
    if (!statSync(input).isFile()) return false;
  } catch {
    return false;
  }
  const dot = input.lastIndexOf('.');
  if (dot < 0) return false;
  return VIDEO_EXT.has(input.slice(dot).toLowerCase());
}

export async function play(input: string, opts: PlayOpts): Promise<void> {
  if (!process.stdout.isTTY) {
    console.error('terpix play: stdout is not a TTY. Use `terpix render` for file output.');
    process.exit(2);
  }
  if (looksLikeVideoPath(input)) {
    await playVideo(input, opts);
  } else {
    await playNL(input, opts);
  }
}

async function playVideo(input: string, opts: PlayOpts): Promise<void> {
  const caps = probeCaps();
  if (!caps.truecolor) {
    console.error('warning: COLORTERM is not truecolor; colors may be quantized by terminal.');
  }
  const encoder = new HalfBlockEncoder();
  const { w: targetW, h: evenH } = computeRenderSize(encoder.cellRatio);

  const driver = new TerminalDriver();
  driver.start();

  const startedAt = Date.now();
  let lastWriteAt = startedAt;
  let prevFrame: RGBFrame | undefined;
  try {
    for await (const frame of decodeFrames({
      input,
      width: targetW,
      height: evenH,
      fps: opts.fps,
    })) {
      const targetMs = startedAt + frame.ptsMs;
      const wait = targetMs - Date.now();
      if (wait > 1) await new Promise((r) => setTimeout(r, wait));
      else if (wait < -100) continue;
      const bytes = encoder.encode(frame, prevFrame);
      await driver.writeFrame(bytes);
      prevFrame = frame;
      lastWriteAt = Date.now();
    }
  } finally {
    driver.stop();
    const elapsed = ((lastWriteAt - startedAt) / 1000).toFixed(2);
    console.error(`terpix: played ${elapsed}s`);
  }
}

async function playNL(prompt: string, opts: PlayOpts): Promise<void> {
  if (!hasAnthropicApiKey()) {
    console.error(
      "terpix play: input '" + prompt + "' is not a video file, and no Anthropic API key found.\n" +
        "  Set one with: terpix config set anthropic_api_key sk-ant-...\n" +
        "  Or export ANTHROPIC_API_KEY in your shell.",
    );
    process.exit(2);
  }
  if (opts.style) {
    const ok = StylePresetName.safeParse(opts.style);
    if (!ok.success) {
      console.error(`terpix play: unknown style '${opts.style}'.`);
      process.exit(1);
    }
  }

  const durationMs = opts.duration ? parseDurationMs(opts.duration) : 15000;
  process.stderr.write(`terpix play: planning "${prompt}" (${durationMs}ms)...\n`);
  const result = await planFromNL({
    prompt,
    durationMs,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.style ? { style: opts.style } : {}),
  });
  if (!result.ok) {
    console.error(`terpix play: ${result.error}`);
    process.exit(1);
  }
  process.stderr.write(
    `terpix play: plan ready in ${result.attempts} attempt(s) — ` +
      `tokens in=${result.inputTokens} out=${result.outputTokens} cache_read=${result.cacheReadTokens}\n`,
  );
  const plan: ScenePlanT = result.plan;
  if (opts.style) plan.style = opts.style as ScenePlanT['style'];
  if (opts.savePlan) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(opts.savePlan, JSON.stringify(plan, null, 2) + '\n', 'utf8');
    process.stderr.write(`terpix play: saved plan to ${opts.savePlan}\n`);
  }

  await renderInlinePlan(plan);
}

async function renderInlinePlan(plan: ScenePlanT): Promise<void> {
  const encoder = new HalfBlockEncoder();
  const { w: targetW, h: targetH } = computeRenderSize(encoder.cellRatio, plan.size);

  const driver = new TerminalDriver();
  driver.start();

  const startedAt = Date.now();
  let prevFrame: RGBFrame | undefined;
  try {
    for await (const frame of composite(plan, { w: targetW, h: targetH, fps: plan.fps })) {
      const targetMs = startedAt + frame.ptsMs;
      const wait = targetMs - Date.now();
      if (wait > 1) await new Promise((r) => setTimeout(r, wait));
      else if (wait < -100) continue;
      const bytes = encoder.encode(frame, prevFrame);
      await driver.writeFrame(bytes);
      prevFrame = frame;
    }
  } finally {
    driver.stop();
  }
}
