# Encoder strategy

Six backends. One default. See full background in [/terminal_pixel_renderer_notes.md](../../terminal_pixel_renderer_notes.md).

## Selection precedence

1. Explicit `--mode <name>` flag.
2. Cap probe: kitty proto > sixel > half-block (only if user opted into auto-upgrade with `--auto-mode`).
3. Default: `half-block`.

## Per-mode contract

Every encoder implements:

```ts
interface Encoder {
  name: 'ascii' | 'block' | 'braille' | 'half' | 'sixel' | 'kitty';
  cellRatio: { w: number; h: number }; // pixels per terminal cell
  encode(frame: RGBFrame, opts: EncodeOpts): Uint8Array; // bytes ready for stdout
}
```

- `cellRatio` lets `scene-renderer` resize correctly per mode (e.g. half-block = 1×2, braille = 2×4).
- `encode` is pure: same input → same bytes.

## Diff strategy

Per-cell diff against previous frame; only emit cursor-move + char for changed cells. Reset row on excess churn (>50% changed) to keep escape stream small.

## Mode comparison

See [/terminal_pixel_renderer_notes.md §6](../../terminal_pixel_renderer_notes.md) table.

## Open questions

- braille color: cell is monochrome (one char = 8 dots, no per-dot color). Decide: average cell color, or fg-only.
- sixel palette: dynamic per frame vs fixed 256.
