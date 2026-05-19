export type EncoderMode = 'ascii' | 'block' | 'braille' | 'half' | 'sixel' | 'kitty';

export interface RGBFrame {
  w: number;
  h: number;
  ptsMs: number;
  rgba: Uint8Array;
}

// Char-grid frame for ASCII-style rendering. Each cell stores a UTF-16
// code unit + RGB foreground + RGB background. Code 0 means "transparent
// to background"; encoder treats it as ' '.
export interface CharFrame {
  w: number;
  h: number;
  ptsMs: number;
  chars: Uint16Array; // length w*h
  fg: Uint8Array;     // length w*h*3 (rgb)
  bg: Uint8Array;     // length w*h*3 (rgb)
}

export interface EncodeOpts {
  truecolor?: boolean;
}

export interface CellRatio {
  w: number;
  h: number;
}
