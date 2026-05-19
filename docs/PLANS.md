# Roadmap

## Phase 1 — Scaffold (current)
Harness + skeleton TS project + half-block renderer on static image.

## Phase 2 — MVP (video v0: 3–5s, single shot)

**Core scenario**: direct character byte-stream playback in the current TTY.
The pipeline produces ANSI/Unicode bytes per frame and writes them to stdout
in real time — no GUI, no file output, no remote process. This is the
defining experience of terpix and must be exercised by every path.

- `terpix demo` — procedural in-process frame source → encoder → TTY (zero deps beyond Node; smoke-test for the byte-stream path)
- `terpix play <video.mp4>` — ffmpeg → RGB frames → half-block → TTY
- terminal cap probe + SIGWINCH
- Plan schema v0: one shot, Ken-Burns via 2 keyframes

## Phase 3 — Procedural pipeline (video v1: ~15s, multi-shot, current)

### 3.0 — DSL + compositor + built-in assets ✅
- DSL (zod): ScenePlan, Shot, Layer (sprite / text / particles), Background (solid / gradient / starfield / nebula), keyframes.
- Procedural compositor: layered RGBA buffer, alpha blend, keyframe interpolation, 5×7 bitmap font, simplex-noise nebula.
- Built-in sprites: spaceship, planet, moon, star, mountain, tree.
- `terpix render-plan <path>` plays a hand-written JSON plan.
- See [design-docs/procedural-compositor.md](design-docs/procedural-compositor.md).

### 3.1 — Asset registry refactor
- Move `SPRITE_DRAWERS` into `ASSET_REGISTRY` with `name + description + draw + source`.
- Relax `SpriteAsset` zod to `z.string()` + runtime registry check at compositor entry.
- `asset-catalog.ts` derives the LLM enum and markdown from the registry.
- No user formats yet — just the skeleton so user assets can land in 3.5 without further refactor.

### 3.2 — LLM planner
- Anthropic SDK + `tool_use` + zod-to-json-schema; `cache_control: ephemeral` on system prompt.
- `terpix plan "<prompt>"` and `terpix play "<prompt>"` (NL inline).
- Retry up to 3 with appended zod error.
- Plan output cached on disk.
- See [design-docs/llm-integration.md](design-docs/llm-integration.md).

### 3.5 — User assets (shape-json)
- Loader for `~/.config/terpix/assets/*.json` declarative shapes.
- `terpix asset list / preview / add / remove` CLI.
- LLM registry auto-extends.

## Phase 4 — User assets continued + encoder modes

### 4.1 — Encoder modes
ascii, block, braille, half (default complete). Mode selection CLI flag. Cap auto-probe.

### 4.2 — User assets (bitmap-png)
- `pngjs` loader; sidecar JSON for anchor + transparent-color key.
- Nearest-neighbor scaling.

### 4.3 — Primitive composition layer (`shape` layer type)
- DSL gains a `shape` layer that LLM can compose ad-hoc from triangles / circles / lines.
- Bridges the gap between built-in sprites and image-gen — unlimited shapes, no API costs.

## Phase 5 — Export + user plugin assets

### 5.1 — Export
- `terpix render … -o out.mp4` (ffmpeg encode bypass; resolution decoupled from terminal).
- `terpix record … -o out.cast` (asciinema ANSI capture).

### 5.2 — User assets (plugin-ts, gated)
- `--allow-plugins` flag enables `*.ts` dynamic import.
- Warning printed for each plugin loaded.

## Phase 6 — Video v2: scenes + transitions (~30s)
- Schema v2: shots nested under scenes
- Transitions between scenes (dissolve, fade)
- Planner groups shots into narrative scenes
- Asset packs distributable via npm (`terpix install <pkg>`)

## Phase 7 — Audio sync + sequences (video v3, ~1 min)
- Audio track decode + clock-driven frame pacing
- Schema v3: scenes grouped into sequences; beats annotate shots

## Phase 8 — Advanced backends
sixel, kitty graphics protocol.

## Phase 9 — Tracks + FX (video v4)
- Multi-track timeline (video / audio / subtitle / FX overlay)
- Parametric FX with keyframes (color grade, blur)
- Subtitle track rendered as bottom-row Unicode

## Phase 10 — Evals hill-climb
Promote saturated capability tasks to regression suite.

Video vocabulary and per-version schema rationale: [design-docs/video-vocabulary.md](design-docs/video-vocabulary.md).

## Workflows

### Tech debt
Triage `docs/exec-plans/tech-debt-tracker.md` weekly. Small payments per PR, not big-bang rewrites.

### Doc freshness
Every PR touching `src/adapters/` or CLI flags updates the relevant `docs/product-specs/<domain>.md`. Reviewers reject PRs with stale docs.

### Eval cadence
New encoder mode or planner prompt change → add capability task. Saturated capability task → graduate to regression. See [evals/index.md](evals/index.md).

### Task-level plans
Live in `docs/superpowers/plans/` (design-led work) or `docs/exec-plans/active/` (ad-hoc).
