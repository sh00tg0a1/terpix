# Procedural compositor

## Decision

The renderer is **procedural** (every pixel computed in-process from math + parameters) and **layered** (each shot composites a background + N layers in z-order to a single RGBA buffer per frame).

No image files. No external image-generation API. No native canvas binding.

## Rationale

| Concern | Why procedural wins |
|---|---|
| Resolution | Terminal half-block grid is ~200×80 cells = 200×160 px. Image-gen output (1024+ px) gets crushed during quantization — wasted bits. |
| Cost | Image-gen API ~$0.04/image × N shots × M trials = real money. Procedural is CPU-only. |
| Latency | Image-gen: 1–10s per call. Procedural: <5ms/frame at terminal size. |
| Determinism | Same `seed + plan` → identical bytes. Cache-friendly. Eval-friendly. |
| Aesthetic | Char-cinema is inherently **symbolic** — geometric primitives match the low-res, stylized look. Photorealism is anti-goal. |
| Offline | No network, no API key, no rate limits (after the planner LLM call). |

## Composition model

Per frame at time `t`:

```text
1. Allocate w*h*4 RGBA buffer.
2. paintBackground(buf, shot.background, t)
     - solid     → flat color
     - gradient  → linear interpolate two colors along axis
     - starfield → seeded random dots with sin() twinkle
     - nebula    → simplex-noise(x*scale, y*scale, t*drift) → lerp(colorA, colorB)
3. For each layer in shot.layers (bottom → top):
     a. Interpolate keyframes at t → {x, y, scale, rotation, opacity}
     b. Dispatch to drawer by layer.type:
          - sprite     → asset registry drawer (drawSpaceship, drawCat, ...)
          - text       → 5×7 bitmap font, position/style-aware
          - particles  → seeded-random emitter, kind-specific motion
     c. Alpha-blend into buffer.
4. Yield { ptsMs, rgba }.
```

## Why layered instead of "one big function per scene"

- LLM emits a **flat description** (declarative DSL); compositor interprets. Adding a new shot type doesn't need new code.
- Each primitive (`fillTriangle`, `fillCircle`, `drawSprite`, `drawTextBlock`) is independently testable.
- Layer addition is a data-only change.

## Hybrid path (future, not committed)

If a specific shot genuinely needs photorealism (rare), the architecture can support a "raster" layer type that loads a pre-generated PNG (cached on disk) and blits it. Image-gen would only generate **once per asset**, not per frame, then live in the asset cache.

Today (Phase 3): not implemented. Procedural covers char-cinema scope cleanly.

## Related

- [video-vocabulary.md](video-vocabulary.md) — concept ladder.
- [asset-system.md](asset-system.md) — how sprite drawers register and load.
- [scene-plan-schema.md](scene-plan-schema.md) — DSL wire format.
- [/src/core/compositor.ts](../../src/core/compositor.ts) — implementation.
