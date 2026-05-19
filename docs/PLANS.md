# Roadmap

## Phase 1 — Scaffold (current)
Harness + skeleton TS project + half-block renderer on static image.

## Phase 2 — MVP (video v0: 3–5s, single shot)
- ffmpeg pipe → RGB frames → half-block → stdout
- CLI: `terpix play <video.mp4>`
- terminal cap probe + SIGWINCH
- Plan schema v0: one shot, Ken-Burns via 2 keyframes

## Phase 3 — NL planner (video v1: ~15s, multi-shot)
- LLM adapter (Anthropic SDK with prompt caching)
- Prompt → scene plan JSON (schema v1: flat shot list, hard cuts only)
- Per-shot motion keyframes (pan / zoom)
- Scene → image (placeholder image-gen adapter or static slide)

## Phase 4 — Encoder modes
ascii, block, braille, half (default complete). Mode selection CLI flag.

## Phase 5 — Export
- `terpix render … -o out.mp4` (ffmpeg encode bypass)
- `terpix record … -o out.cast` (asciinema ANSI capture)

## Phase 6 — Video v2: scenes + transitions (~30s)
- Schema v2: shots nested under scenes
- Transitions between scenes (dissolve, fade)
- Planner groups shots into narrative scenes

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
