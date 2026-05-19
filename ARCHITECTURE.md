# Architecture

Hexagonal. Core domain is pure; all IO via adapters.

## Data flow

```text
NL prompt
   │
   ▼
┌─────────────┐    LLM adapter
│ nl-planner  │───────────────────▶ Anthropic / OpenAI
└─────────────┘
   │  Scene plan (JSON: shots, durations, prompts)
   ▼
┌──────────────────┐  ffmpeg/canvas adapter
│ scene-renderer   │───────────────▶ ffmpeg pipe / image-gen
└──────────────────┘
   │  RGB frames (Buffer<RGBA>, w×h)
   ▼
┌────────────────┐
│ frame-encoder  │  strategy: ascii | block | braille | half | sixel | kitty
└────────────────┘
   │  bytes (ANSI/Unicode stream OR raw RGB passthrough)
   ▼
┌────────────────────┐         ┌──────────────┐
│ terminal-driver    │   OR    │ exporter     │
│ (tty + caps probe) │         │ (mp4 / cast) │
└────────────────────┘         └──────────────┘
        │                              │
   stdout (live)                  file out
        ▲                              ▲
        └── audio-sync (clock) ────────┘
```

## Module boundaries

| Package | Allowed deps |
|---|---|
| `src/core/*` | Pure TS; no node `fs`/`child_process`. Asset registry lives here (`src/core/assets/`). |
| `src/adapters/llm/*` | `core` + Anthropic SDK; system prompt derived from `ASSET_REGISTRY`. |
| `src/adapters/ffmpeg/*` | `core` + node child_process |
| `src/adapters/terminal/*` | `core` + node tty |
| `src/adapters/exporter/*` | `core` + ffmpeg adapter |
| `src/cli/*` | All of the above |

Edges flow `cli → adapters → core`. Core never imports adapters.

## Asset registry

`src/core/assets/registry.ts` (Phase 3.1+) owns `ASSET_REGISTRY: Map<string, AssetEntry>`. Built-in drawers register at startup; user assets load from `./terpix-assets/` or `~/.config/terpix/assets/`. Three formats: shape-json (data only), bitmap-png (requires `pngjs`), plugin-ts (gated behind `--allow-plugins`). See [docs/design-docs/asset-system.md](docs/design-docs/asset-system.md).

## Backends (frame-encoder)

| Mode | Char | Compat | Quality |
|---|---|---|---|
| ascii | density char | universal | low |
| block | `█▓▒░` | high | mid |
| braille | `⠿` 2×4 dots | high | mid |
| half | `▀` + truecolor fg/bg | high | high (default) |
| sixel | DCS sixel | medium | high |
| kitty | kitty graphics proto | low | very high |

Default `half`. See [docs/design-docs/encoder-strategy.md](docs/design-docs/encoder-strategy.md) and [docs/ref/terminal_pixel_renderer_notes.md](docs/ref/terminal_pixel_renderer_notes.md).

## Related

- [docs/DESIGN.md](docs/DESIGN.md) — philosophy
- [docs/SECURITY.md](docs/SECURITY.md) — secret handling
- [docs/design-docs/index.md](docs/design-docs/index.md) — deeper specs
