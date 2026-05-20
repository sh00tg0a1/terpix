import { describe, expect, it } from 'vitest';
import { buildFfmpegArgs } from '../src/adapters/ffmpeg/encoder.js';

describe('buildFfmpegArgs', () => {
  it('produces a sane mp4 command line', () => {
    const args = buildFfmpegArgs({
      output: 'out.mp4',
      width: 1280,
      height: 720,
      fps: 24,
    });
    expect(args).toContain('-f');
    expect(args[args.indexOf('-f') + 1]).toBe('rawvideo');
    expect(args).toContain('-pix_fmt');
    expect(args.filter((a) => a === '-pix_fmt')).toHaveLength(2);
    expect(args).toContain('rgba');
    expect(args).toContain('yuv420p');
    expect(args).toContain('libx264');
    expect(args).toContain('1280x720');
    expect(args[args.length - 1]).toBe('out.mp4');
    expect(args).toContain('-movflags');
    expect(args).toContain('+faststart');
  });

  it('honors preset + crf', () => {
    const args = buildFfmpegArgs({
      output: 'a.mp4',
      width: 640,
      height: 480,
      fps: 30,
      preset: 'fast',
      crf: 23,
    });
    expect(args).toContain('-preset');
    expect(args[args.indexOf('-preset') + 1]).toBe('fast');
    expect(args).toContain('-crf');
    expect(args[args.indexOf('-crf') + 1]).toBe('23');
  });

  it('adds a second input + aac when audio is provided', () => {
    const args = buildFfmpegArgs({
      output: 'b.mp4',
      width: 640,
      height: 480,
      fps: 30,
      audioPath: 'song.mp3',
    });
    expect(args.filter((a) => a === '-i')).toHaveLength(2);
    expect(args).toContain('song.mp3');
    expect(args).toContain('-c:a');
    expect(args[args.indexOf('-c:a') + 1]).toBe('aac');
    expect(args).toContain('-shortest');
  });

  it('rejects odd OUTPUT dimensions (yuv420p constraint)', () => {
    expect(() =>
      buildFfmpegArgs({ output: 'x.mp4', width: 1281, height: 720, fps: 24 }),
    ).toThrow(/even/);
    expect(() =>
      buildFfmpegArgs({ output: 'x.mp4', width: 640, height: 481, fps: 24 }),
    ).toThrow(/even/);
  });

  it('inserts nearest-neighbor scale filter when output dims differ', () => {
    const args = buildFfmpegArgs({
      output: 'pixel.mp4',
      width: 160,
      height: 80,
      outputWidth: 1920,
      outputHeight: 960,
      upscaleFilter: 'neighbor',
      fps: 24,
    });
    expect(args).toContain('-vf');
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=1920:960:flags=neighbor');
    expect(args[args.indexOf('-s') + 1]).toBe('160x80');
  });

  it('does not insert scale filter when input == output', () => {
    const args = buildFfmpegArgs({
      output: 'same.mp4',
      width: 1280,
      height: 720,
      fps: 24,
    });
    expect(args).not.toContain('-vf');
  });
});
