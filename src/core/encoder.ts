import type { CellRatio, EncodeOpts, EncoderMode, RGBFrame } from './types.js';

export interface Encoder {
  readonly name: EncoderMode;
  readonly cellRatio: CellRatio;
  encode(frame: RGBFrame, prev?: RGBFrame, opts?: EncodeOpts): Uint8Array;
}
