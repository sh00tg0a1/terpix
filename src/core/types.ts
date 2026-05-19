export type EncoderMode = 'ascii' | 'block' | 'braille' | 'half' | 'sixel' | 'kitty';

export interface RGBFrame {
  w: number;
  h: number;
  ptsMs: number;
  rgba: Uint8Array;
}

export interface EncodeOpts {
  truecolor?: boolean;
}

export interface CellRatio {
  w: number;
  h: number;
}
