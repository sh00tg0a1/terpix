import { existsSync } from 'node:fs';
import { decodeFrames } from '../../adapters/ffmpeg/decoder.js';
import { HalfBlockEncoder } from '../../adapters/terminal/half-block.js';
import { TerminalDriver, probeCaps } from '../../adapters/terminal/driver.js';
import { computeRenderSize } from '../render-size.js';
import type { RGBFrame } from '../../core/types.js';

export interface PlayOpts {
  fps: number;
}

export async function play(input: string, opts: PlayOpts): Promise<void> {
  if (!process.stdout.isTTY) {
    console.error('terpix play: stdout is not a TTY. Use `terpix render` for file output.');
    process.exit(2);
  }
  if (!existsSync(input)) {
    console.error(`terpix play: file not found: ${input}`);
    process.exit(1);
  }

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
      const now = Date.now();
      const wait = targetMs - now;
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
