# Style system

## Goal

Let users (and the LLM planner) change the visual mood of an entire plan with a single field, without rewriting backgrounds, colors, or sprite-by-sprite variants.

A `style` preset is a post-process recipe applied uniformly to every composed frame: palette quantization, edge extraction, and optional background override.

## Decision

`ScenePlan.style?: 'default' | 'starwars' | 'minimalist' | 'silhouette' | 'noir'`

Resolved at compositor entry to a `StyleConfig`:

```ts
interface StyleConfig {
  palette: 'full' | 'duotone';
  paletteColors?: [bgHex, fgHex];
  edgeOnly: boolean;
  forceBackground?: string;     // overrides shot.background paint
  edgeThreshold: number;        // luma-diff cutoff for edge detect
}
```

Applied **after** the per-frame composition pass; **before** encoding to bytes.

## Why post-process instead of per-asset style variants

- Works on every asset (built-in + shape-json + future bitmap/plugin) **without per-asset code changes**. New asset → automatically respects style.
- Two universal transforms — palette + edge — cover most stylistic intents (Star Wars, minimalist line art, silhouettes, noir).
- Pure pixel math; no DSL bloat per asset.

## Preset recipes

| Preset | Palette | Edge-only | Force bg | Vibe |
|---|---|---|---|---|
| `default` | full | off | — | rich colors |
| `starwars` | duotone `#000` / `#ffd633` | on | `#000000` | yellow line art on black |
| `minimalist` | duotone `#f6f3ec` / `#1f2933` | on | `#f6f3ec` | clean dark stroke on warm cream |
| `silhouette` | duotone `#fde7c1` / `#101015` | off | `#fde7c1` | inky shadows on dusk-yellow |
| `noir` | full | off | `#0c0c12` | low-light, high-contrast |

## Algorithms

### Duotone quantization

```text
luma(px) = 0.299*R + 0.587*G + 0.114*B
isFg = (fgL > bgL) ? luma > mid : luma < mid
out = isFg ? fgRGB : bgRGB
```

`mid` is the average of the two palette lumas. Comparison sign flips so darker palette FG (e.g. minimalist) still maps dark pixels to fg.

### Edge-only

Precompute luma into a flat Float32Array. For each pixel, take max(|c-n|, |c-s|, |c-e|, |c-w|). If ≥ `edgeThreshold`, paint fg; else bg. 4-neighbor instead of full Sobel — cheap, plenty for char-cinema resolution.

Edge-only implies duotone; the palette colors apply directly.

## DSL

```json
{
  "version": 1,
  "style": "starwars",
  "shots": [ ... ]
}
```

Optional. Omitted = `default`. Per-shot override is **not** supported — style is plan-wide for visual coherence. Override at CLI: `terpix render-plan plan.json --style minimalist`.

## LLM coupling

System prompt (Phase 3.2) will expose the preset enum + a short hint per preset, so the LLM can pick a style matching the user's prompt:

```text
- "宇宙飞船穿越星云" → default (rich color)
- "极简的禅意石头" → minimalist
- "星战开场" → starwars
- "黑色电影" → noir
```

LLM emits the chosen preset name as a single string; tool_use schema constrains to the enum.

## Forward path

- **Per-shot styling**: only if a real need emerges. Today's preset-on-plan keeps editorial coherence.
- **Custom `StyleConfig`** (advanced users): allow inline config blob `style: { palette: ..., paletteColors: [...], ... }`. Adds expressive power but increases LLM error surface.
- **Sobel / Canny edge detect**: switch when 4-neighbor produces too much noise on detailed assets.
- **HSL-aware palette**: today's quantization is luma-only; HSL clustering could give better duotone on highly-saturated frames.
- **Per-asset line drawers**: not abandoned — for sprites where outline geometry is known (e.g. spaceship), a native line variant beats edge-detect. Add a `Style.geometry: 'filled' | 'line'` later if needed.

## Related

- [/src/core/styles.ts](../../src/core/styles.ts) — implementation
- [procedural-compositor.md](procedural-compositor.md) — where applyStyle slots in
- [llm-integration.md](llm-integration.md) — how the LLM picks a preset
- [/tests/styles.test.ts](../../tests/styles.test.ts) — duotone + edge tests
