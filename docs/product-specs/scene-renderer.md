# scene-renderer

## Goal

Convert scene plan into stream of RGB frames at target fps and dimensions.

## Strategy (MVP)

Two sources:

1. **video-passthrough** — input is a local video; ffmpeg decodes to raw RGB24 piped on stdout, frame-by-frame.
2. **image-gen-per-shot** — each shot's `imagePrompt` → still image (via image-gen adapter, placeholder in Phase 3); apply Ken-Burns-style motion in code; interpolate between shot keyframes.

## Output

Async iterator yielding `{ ptsMs: number, rgba: Buffer, w: number, h: number }`.

## Resize policy

Target `(w_chars × cellRatio.w, h_chars × cellRatio.h)` based on encoder selected. Done via ffmpeg `scale=` filter for video-passthrough or canvas resampling for image-gen.

## Edge cases

- Source aspect != terminal aspect → letterbox with `--fit contain` (default) or crop with `--fit cover`.
- Source fps > target fps → drop frames at source.
- Source fps < target fps → duplicate frames; consider interpolation only if `--interp` set.

## Reference

- ffmpeg adapter: `src/adapters/ffmpeg/`
- core: `src/core/scene.ts`
