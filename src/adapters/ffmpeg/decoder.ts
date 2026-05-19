import { spawn } from 'node:child_process';
import type { RGBFrame } from '../../core/types.js';

export interface DecodeOpts {
  input: string;
  width: number;
  height: number;
  fps: number;
}

export async function* decodeFrames(opts: DecodeOpts): AsyncGenerator<RGBFrame> {
  const { input, width, height, fps } = opts;
  const frameBytes = width * height * 4;

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    input,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-vf',
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    '-r',
    String(fps),
    'pipe:1',
  ];

  const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let errBuf = '';
  child.stderr!.on('data', (chunk: Buffer) => {
    errBuf += chunk.toString('utf8');
  });

  const chunks: Buffer[] = [];
  let bufferedLength = 0;
  let frameIdx = 0;
  const cleanup = (): void => {
    if (!child.killed) child.kill('SIGTERM');
  };
  process.once('exit', cleanup);

  try {
    for await (const chunk of child.stdout! as AsyncIterable<Buffer>) {
      chunks.push(chunk);
      bufferedLength += chunk.length;
      while (bufferedLength >= frameBytes) {
        const merged = chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks, bufferedLength);
        const frame = new Uint8Array(merged.buffer, merged.byteOffset, frameBytes);
        const rest = Buffer.from(
          merged.buffer,
          merged.byteOffset + frameBytes,
          bufferedLength - frameBytes,
        );
        chunks.length = 0;
        if (rest.length > 0) chunks.push(rest);
        bufferedLength = rest.length;
        yield {
          w: width,
          h: height,
          ptsMs: Math.round((frameIdx * 1000) / fps),
          rgba: new Uint8Array(frame),
        };
        frameIdx++;
      }
    }
    const code: number = await new Promise((resolve) => child.on('close', resolve));
    if (code !== 0 && code !== null) {
      throw new Error(`ffmpeg exited ${code}: ${errBuf.trim()}`);
    }
  } finally {
    process.off('exit', cleanup);
    cleanup();
  }
}
