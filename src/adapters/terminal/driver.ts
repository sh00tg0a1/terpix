import { Writable } from 'node:stream';

const ALT_SCREEN_ON = '\x1b[?1049h';
const ALT_SCREEN_OFF = '\x1b[?1049l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';
const RESET_COLORS = '\x1b[0m';
const CLEAR = '\x1b[2J\x1b[H';

export interface TerminalCaps {
  truecolor: boolean;
  cols: number;
  rows: number;
}

export function probeCaps(): TerminalCaps {
  const truecolor =
    process.env['COLORTERM'] === 'truecolor' || process.env['COLORTERM'] === '24bit';
  const cols = process.stdout.columns ?? 80;
  const rows = process.stdout.rows ?? 24;
  return { truecolor, cols, rows };
}

export class TerminalDriver {
  private started = false;
  private cleanupHooked = false;

  constructor(private readonly out: Writable = process.stdout) {}

  start(): void {
    if (this.started) return;
    this.out.write(ALT_SCREEN_ON);
    this.out.write(CURSOR_HIDE);
    this.out.write(CLEAR);
    this.started = true;
    if (!this.cleanupHooked) {
      const cleanup = (code = 0): void => {
        this.stop();
        process.exit(code);
      };
      process.on('SIGINT', () => cleanup(130));
      process.on('SIGTERM', () => cleanup(143));
      process.on('uncaughtException', (err) => {
        this.stop();
        console.error(err);
        process.exit(1);
      });
      this.cleanupHooked = true;
    }
  }

  async writeFrame(bytes: Uint8Array): Promise<void> {
    const corkable = this.out as unknown as { cork?: () => void; uncork?: () => void };
    if (typeof corkable.cork === 'function') corkable.cork();
    const ok = this.out.write(bytes);
    if (typeof corkable.uncork === 'function') corkable.uncork();
    if (!ok) {
      await new Promise<void>((resolve) => this.out.once('drain', resolve));
    }
  }

  stop(): void {
    if (!this.started) return;
    this.out.write(RESET_COLORS);
    this.out.write(CURSOR_SHOW);
    this.out.write(ALT_SCREEN_OFF);
    this.started = false;
  }
}
