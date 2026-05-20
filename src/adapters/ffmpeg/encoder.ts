import { spawn, type ChildProcess } from 'node:child_process';

export interface FfmpegEncoderOpts {
  output: string;
  width: number; // input (raw frame) width in pixels
  height: number; // input (raw frame) height in pixels
  outputWidth?: number; // optional final encoded width (after scale)
  outputHeight?: number; // optional final encoded height (after scale)
  upscaleFilter?: 'neighbor' | 'lanczos' | 'bicubic'; // for the scale stage
  fps: number;
  preset?: string;
  crf?: number;
  audioPath?: string;
}

export function buildFfmpegArgs(opts: FfmpegEncoderOpts): string[] {
  const outW = opts.outputWidth ?? opts.width;
  const outH = opts.outputHeight ?? opts.height;
  if (outW % 2 !== 0 || outH % 2 !== 0) {
    throw new Error(`ffmpeg encoder: output dimensions must be even (got ${outW}x${outH})`);
  }
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-s',
    `${opts.width}x${opts.height}`,
    '-r',
    String(opts.fps),
    '-i',
    'pipe:0',
  ];
  if (opts.audioPath) {
    args.push('-i', opts.audioPath);
  }
  const needsScale = outW !== opts.width || outH !== opts.height;
  if (needsScale) {
    const flags = opts.upscaleFilter ?? 'neighbor';
    args.push('-vf', `scale=${outW}:${outH}:flags=${flags}`);
  }
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    opts.preset ?? 'medium',
    '-crf',
    String(opts.crf ?? 18),
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
  );
  if (opts.audioPath) {
    args.push('-c:a', 'aac', '-shortest');
  }
  args.push(opts.output);
  return args;
}

export class FfmpegMp4Encoder {
  private child?: ChildProcess;
  private stderrBuf = '';
  private started = false;
  private exited?: Promise<number>;

  constructor(public readonly opts: FfmpegEncoderOpts) {}

  start(): void {
    if (this.started) return;
    const args = buildFfmpegArgs(this.opts);
    this.child = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    this.child.stderr!.on('data', (chunk: Buffer) => {
      this.stderrBuf += chunk.toString('utf8');
    });
    this.exited = new Promise((resolve) => {
      this.child!.on('close', (code) => resolve(code ?? -1));
    });
    this.started = true;
  }

  async writeFrame(rgba: Uint8Array): Promise<void> {
    if (!this.started || !this.child) throw new Error('encoder not started');
    const stdin = this.child.stdin!;
    if (!stdin.writable) throw new Error('ffmpeg stdin closed unexpectedly: ' + this.stderrBuf.trim());
    if (!stdin.write(rgba)) {
      await new Promise<void>((resolve) => stdin.once('drain', resolve));
    }
  }

  async end(): Promise<void> {
    if (!this.child) return;
    this.child.stdin!.end();
    const code = await this.exited!;
    if (code !== 0) {
      throw new Error(`ffmpeg exited ${code}: ${this.stderrBuf.trim()}`);
    }
  }

  kill(): void {
    if (this.child && !this.child.killed) this.child.kill('SIGTERM');
  }
}
