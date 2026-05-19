# frame-encoder

## Goal

Encode RGB frame to terminal bytes. Six interchangeable backends.

## Modes

| Mode | Char unit | Cell ratio (px) | Color depth |
|---|---|---|---|
| ascii | density char | 1×2 | mono / 256 fg |
| block | `█▓▒░` | 1×2 | 256 fg |
| braille | `⠿` (2×4 dots) | 2×4 | mono / cell fg |
| half (default) | `▀` | 1×2 | truecolor fg+bg |
| sixel | DCS sixel | 1×1 (sub-cell vertical 6px) | palette |
| kitty | kitty graphics proto | 1×1 | RGBA |

## Selection

`--mode <name>`. Default `half`. `--auto-mode` probes terminal caps.

## Contract

```ts
interface Encoder {
  name: EncoderMode;
  cellRatio: { w: number; h: number };
  encode(frame: RGBFrame, prev?: RGBFrame, opts?: EncodeOpts): Uint8Array;
}
```

Pure. Diff against `prev` produces minimal escape stream.

## Edge cases

- Terminal does not support truecolor → fall back to 256-color quantization.
- Terminal width changes mid-stream → upstream sends new frame size; encoder is stateless across resize.
- Sixel/kitty requested on incompatible terminal → exit 1 with hint, suggest `--mode half`.

## Reference

- [docs/design-docs/encoder-strategy.md](../design-docs/encoder-strategy.md)
- [/terminal_pixel_renderer_notes.md](../../terminal_pixel_renderer_notes.md)
