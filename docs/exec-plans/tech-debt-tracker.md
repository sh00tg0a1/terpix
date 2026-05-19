# Tech debt tracker

| Item | Area | Notes | Priority |
|---|---|---|---|
| `SPRITE_DRAWERS` → `ASSET_REGISTRY` refactor | core/assets | Required before LLM planner; see [asset-system.md](../design-docs/asset-system.md) Phase 3.1 | high |
| `SpriteAsset` zod enum → `z.string()` + runtime check | core/dsl.ts | Enables dynamic registry; built-time enum is anti-pattern | high |
| 5×7 font is inlined in `compositor.ts` | core | Extract to `core/text/font5x7.ts`; consider 3×5 fallback for small sizes | medium |
| `pixel.ts` `fillTriangle` uses scanline-y baseline — recompute area per pixel | core | Replace with proper edge function for perf when frame counts grow | low |
| ffmpeg decoder uses fixed 24fps fallback | adapters/ffmpeg | Add ffprobe to detect source fps | medium |
| No SIGWINCH handling in `play`/`demo` mid-stream | adapters/terminal | Currently a resize during playback breaks frame geometry | medium |
| Markdownlint cosmetic warnings in `docs/` (table separators, blank lines) | docs | Cosmetic; could batch-format with `prettier --plugin=prettier-plugin-markdown` | low |

Add items as discovered. Pay down small chunks per PR.
