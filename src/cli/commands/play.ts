import { existsSync } from 'node:fs';
import { decodeFrames } from '../../adapters/ffmpeg/decoder.js';
import { HalfBlockEncoder } from '../../adapters/terminal/half-block.js';
import { TerminalDriver, probeCaps } from '../../adapters/terminal/driver.js';

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
  const cols = caps.cols;
  const rows = Math.max(2, caps.rows - 1);
  const targetW = cols * encoder.cellRatio.w;
  const targetH = rows * encoder.cellRatio.h;
  const evenH = targetH % 2 === 0 ? targetH : targetH - 1;

  const driver = new TerminalDriver();
  driver.start();

  const startedAt = Date.now();
  let lastWriteAt = startedAt;

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
      else if (wait < -100) continue; // drop frame: behind by >100ms
      const bytes = encoder.encode(frame);
      await driver.writeFrame(bytes);
      lastWriteAt = Date.now();
    }
  } finally {
    driver.stop();
    const elapsed = ((lastWriteAt - startedAt) / 1000).toFixed(2);
    console.error(`terpix: played ${elapsed}s`);
  }
}
