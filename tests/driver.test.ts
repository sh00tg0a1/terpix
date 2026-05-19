import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { TerminalDriver, probeCaps } from '../src/adapters/terminal/driver.js';

class CaptureStream extends Writable {
  chunks: Buffer[] = [];
  override _write(
    chunk: Buffer,
    _enc: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    cb();
  }
  data(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

describe('TerminalDriver', () => {
  it('start emits alt-screen + cursor hide + clear', () => {
    const cap = new CaptureStream();
    const drv = new TerminalDriver(cap);
    drv.start();
    drv.stop();
    const out = cap.data();
    expect(out).toContain('\x1b[?1049h');
    expect(out).toContain('\x1b[?25l');
    expect(out).toContain('\x1b[2J\x1b[H');
  });

  it('stop restores colors + cursor + alt-screen off', () => {
    const cap = new CaptureStream();
    const drv = new TerminalDriver(cap);
    drv.start();
    drv.stop();
    const out = cap.data();
    expect(out).toContain('\x1b[0m');
    expect(out).toContain('\x1b[?25h');
    expect(out).toContain('\x1b[?1049l');
  });

  it('start is idempotent', () => {
    const cap = new CaptureStream();
    const drv = new TerminalDriver(cap);
    drv.start();
    const first = cap.data().length;
    drv.start();
    expect(cap.data().length).toBe(first);
    drv.stop();
  });

  it('stop is idempotent', () => {
    const cap = new CaptureStream();
    const drv = new TerminalDriver(cap);
    drv.start();
    drv.stop();
    const beforeSecond = cap.data().length;
    drv.stop();
    expect(cap.data().length).toBe(beforeSecond);
  });

  it('writeFrame forwards bytes to the stream', async () => {
    const cap = new CaptureStream();
    const drv = new TerminalDriver(cap);
    drv.start();
    await drv.writeFrame(new Uint8Array([65, 66, 67]));
    drv.stop();
    expect(cap.data()).toContain('ABC');
  });
});

describe('probeCaps', () => {
  it('returns cols/rows from process.stdout', () => {
    const caps = probeCaps();
    expect(typeof caps.cols).toBe('number');
    expect(typeof caps.rows).toBe('number');
    expect(typeof caps.truecolor).toBe('boolean');
  });

  it('truecolor is true when COLORTERM=truecolor', () => {
    const prev = process.env['COLORTERM'];
    process.env['COLORTERM'] = 'truecolor';
    expect(probeCaps().truecolor).toBe(true);
    if (prev === undefined) delete process.env['COLORTERM'];
    else process.env['COLORTERM'] = prev;
  });

  it('truecolor is false when COLORTERM is absent', () => {
    const prev = process.env['COLORTERM'];
    delete process.env['COLORTERM'];
    expect(probeCaps().truecolor).toBe(false);
    if (prev !== undefined) process.env['COLORTERM'] = prev;
  });
});
