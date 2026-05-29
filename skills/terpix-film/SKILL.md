---
name: terpix-film
description: Make short terminal-style films from natural language by driving the `terpix` CLI. Use when the user wants to generate, edit, or render a video / animated scene / short film / opening sequence / character-stream movie / NL-to-mp4. Covers scaffolding a project, decomposing an idea into scenes, generating procedural sprites, iterating on bad frames via direct JSON edits, and rendering the project to a single mp4 (with optional audio). Also covers the Scene v2 relational DSL (regions / `on` / `repeat` / `motion` / `camera`) so the assistant can fix problems by editing files instead of always re-prompting the LLM.
---

# terpix-film — directing the terpix CLI

You are the director. terpix is the camera + crew + renderer. Your job is to
turn a user's idea ("a 30s short about a koi pond at dawn") into an mp4 by
calling four CLI subcommands and editing JSON when the output isn't right.

This skill never invents tools — every action is a `Bash`, `Read`, `Edit`, or
`Write` call. The skill teaches **what** to call **when**.

---

## 1. Mental model

terpix is organized around a **project directory**:

```
myfilm/
  project.json     # title, fps, size, renderer, scenes[] (timeline)
  scenes/          # one DSL file per clip — each its own bg/style/camera
    01-opening.json
    02-discovery.json
  assets/          # project-local procedural sprites (auto-registered)
  out.mp4          # rendered output (your choice of path)
```

Two key facts:

1. **Each scene is an independent DSL file.** Its own background, style,
   camera, motion. The renderer concatenates them into one mp4 via a single
   ffmpeg process — heterogeneous looks "just work". You never need a giant
   monolithic plan; mix and match small scene files.
2. **`assets/` is project-local.** Generated sprites live with the project, so
   re-rendering is reproducible. Don't write to `~/.cache/terpix/assets/`
   from a project context.

The scene DSL is **Scene v2 relational**: nodes declare WHERE-RELATIVE
("inside the ground region", "on the table's surface"), and the compiler
resolves coordinates. You almost never write absolute x/y.

---

## 2. The five commands

| Command | When to use |
|---|---|
| `terpix new <dir> [title]` | Start a new film. Scaffolds `project.json` + `scenes/` + `assets/`. |
| `terpix asset add <dir> <name> <description...>` | Explicitly generate one sprite the catalog lacks (e.g. "tent", "koi-fish"). Writes to `<dir>/assets/`. |
| `terpix scene add <dir> <prompt...> [--duration 6s] [--gen-assets]` | Plan ONE scene from NL. Writes `<dir>/scenes/NN-name.json` and appends to `project.json`. With `--gen-assets`, missing sprites are auto-generated into `<dir>/assets/`. |
| `terpix film <dir> <prompt...> [--duration 30s --scenes 3 --gen-assets]` | Director pass: one LLM call breaks the idea into N beats, then loops `scene add` per beat. Best-effort — a single bad beat doesn't kill the run. |
| `terpix render <dir> -o <path.mp4> [--size 1280x720] [--fps 24] [--audio bgm.mp3]` | Render the whole project to one mp4. Auto-detects a project dir. |

Other useful subcommands you'll already know:
- `terpix asset list` — show the catalog (builtins + anything in `<dir>/assets/`).
- `terpix validate-plan <path>` — parse-check a single scene file.
- `terpix config show` — see which provider/model is active.

---

## 3. Default workflow (NL → mp4)

For "make me a 30s short about X":

```bash
terpix new MYFILM "title"
terpix film MYFILM "<the user's idea, kept concrete>" --duration 30s --scenes 3 --gen-assets
terpix render MYFILM -o MYFILM/out.mp4 --size 1280x720
```

Then **preview**: extract a frame from each clip and view it (see §6). If the
user is happy, you're done. Otherwise iterate (see §5).

Tuning:
- **Scene count** ≈ `duration / 8s` (8s per clip is a comfortable pacing
  default). For < 12s prefer 1 scene; for > 1 minute prefer ≤ 6 (else
  decomposer hits the max cap of 8).
- **`--gen-assets`** — turn on whenever the prompt mentions objects beyond the
  builtin catalog (`terpix asset list` to check). The catalog covers people,
  generic animals, celestial bodies, landscapes — anything specific
  (lantern, tent, koi) needs generation.
- **`--size`** — default `1280x720`. Smaller (`640x360`) renders much faster
  for iteration; bump to 720p/1080p only for the final.

---

## 4. The Scene v2 DSL (so you can edit files)

When you open a `scenes/NN.json`, here's the structure:

```json
{
  "version": 2,
  "fps": 24,
  "renderer": "half",
  "durationMs": 6000,
  "style": "noir",
  "camera": { "projection": "iso", "tilt": 0.5 },
  "background": { "type": "gradient", "from": "#5a3220", "to": "#1c0f08", "direction": "vertical" },
  "nodes": [
    { "kind": "sprite", "asset": "human", "id": "p1", "scale": 2.4, "color": "#c75b39",
      "place": { "in": "ground", "align": "left" }, "depth": 0.1 },
    { "kind": "sprite", "asset": "table", "id": "tbl", "scale": 3,
      "place": { "in": "ground", "align": "center" }, "depth": 0.3 },
    { "kind": "sprite", "asset": "bowl", "repeat": 5, "scale": 1,
      "place": { "on": "tbl.surface" }, "depth": 0.4 },
    { "kind": "sprite", "asset": "spaceship", "scale": 1,
      "place": { "in": "center" },
      "motion": { "kind": "cross", "dir": "right", "ease": "easeInOut" } }
  ]
}
```

What each field controls — pick the one that matches the problem:

- **`background`** — `solid` | `gradient` | `starfield` | `nebula`. Sets mood.
  Dark for night/space, warm gradient for indoor/dining, light for day.
- **`style`** — `default` | `starwars` | `minimalist` | `silhouette` | `noir`
  | `lineart`. **NEVER use `minimalist` or `silhouette` for night scenes** —
  both force a light background and wash a dark sky white. For night use no
  style (or `noir`).
- **`camera.projection: "iso"`** + per-node `depth` (0 near → 1 far): gives a
  3/4 / overhead feel (deeper nodes recede up-frame, shrink, dim). Omit
  `camera` for a head-on view.
- **`place`** — pick ONE of:
  - `{ "in": "<region>", "align": "<corner>" }` — regions: `frame`, `sky`,
    `ground`, `center`; aligns: `center | top | bottom | left | right` plus
    the 4 corners.
  - `{ "on": "<id>.<point>" }` — rest on another node's named point. Today
    `table` exposes `surface`. Give the target an `id`.
  - `{ "at": { "x": .., "y": .. } }` — absolute (escape hatch; rare).
  - `dx`/`dy` nudge as fraction of the frame.
- **`repeat` + `distribute`** — N copies along a row or column. Always prefer
  this over hand-writing N near-identical nodes (the model used to
  miscount).
- **`motion`** — `cross | enter | exit | rise | fall | drift` + `dir` (4
  cardinals + 4 diagonals) + `ease`. **Action verbs ("flying", "walking
  across") require motion** — without it the subject freezes at one spot
  (often off-screen).
- **`shots: [{ background, durationMs, nodes }, …]`** — alternative to
  single-scene shorthand: multiple beats inside ONE file (rare; usually
  prefer separate scene files at project level).

Painting order is depth order — **first node = farthest back**. A big
foreground prop drawn AFTER a person hides them.

---

## 5. Iteration loop (when the render looks wrong)

Extract a frame per clip and look at it first. Don't re-prompt the LLM
blindly — most fixes are 2-line JSON edits.

```bash
# extract the middle frame of clip N from a finished mp4
ffmpeg -y -loglevel error -ss <seconds> -i <mp4> -frames:v 1 frame.png
# or render just one clip's preview during iteration:
# (single-scene render isn't built in; render the whole project, then extract)
```

Then read frames in order with the `Read` tool to spot what's off. Map the
symptom to the fix:

| Symptom | Likely cause | Fix |
|---|---|---|
| Person reduced to a head/blob behind a table | Node order — person painted before table | Move the person node AFTER the table, OR `align: "left"`/`"right"` so they flank instead of stack |
| Person too small vs furniture | `human` is a TALL sprite (aspect 0.45); scale 1 ≈ 20% frame-height (knee-high) | Raise `scale` to ~2.5–3 |
| Subjects clustered in a thumb-sized region | Scales too low; no `repeat` for plurals | Bump `scale` ≥ 0.9 for named subjects; convert handwritten copies to `repeat + distribute` |
| "Many X" missing or only 1 emitted | Coverage; model dropped the noun | Add `"repeat": 5+`; or for "on a table" add `place: {"on": "tbl.surface"}` and the spread happens automatically |
| Night scene rendered light / moon invisible | `style: "silhouette"` or `"minimalist"` forces cream bg | Remove `style` (or set to `"noir"`); ensure `background.type` is `nebula` or dark gradient |
| Subject is frozen / half off-screen for an "action" prompt | No `motion` for a verb that implies movement | Add `motion: { kind: "cross", dir: "right" }` (or `enter`/`drift` as fits) |
| Sprite is the wrong shape entirely | Hallucinated asset name dropped by safety net | Check `terpix asset list`; either pick a real one or `terpix asset add <dir> <name> "<desc>"` |
| Floating bowl above the table | `bowl` placed in a region instead of `on: tbl.surface` | Switch `place` to `on` |
| Whole frame is one giant blob | Silhouette fallback on a shape asset at huge `scale` (ascii only) | Lower `scale`, or write a hand `ascii` field on the JSON shape asset |
| Foreground/background blend (no contrast) | Subject color too close to background | Edit `color` to a high-luma-delta hex |

**You can Edit a scenes/*.json directly.** Then re-render. No LLM call
needed for the fix. If a fundamental rewrite is wanted, delete the file +
re-run `terpix scene add`.

---

## 6. Previewing mp4 frames

terpix only produces mp4. Use ffmpeg to extract frames you can `Read`:

```bash
PROJ=MYFILM
# clip durations in order:
node -e "const p=require('./$PROJ/project.json');p.scenes.forEach((s,i)=>{const sc=require('./$PROJ/'+s.file);const dur=sc.durationMs||sc.shots.reduce((a,b)=>a+b.durationMs,0);console.log(i+1, s.file, dur);})"
# pick a midpoint timestamp per clip, extract:
ffmpeg -y -loglevel error -ss 3 -i $PROJ/out.mp4 -frames:v 1 $PROJ/preview-01.png
# then Read each preview-NN.png
```

For static visual feedback during single-scene iteration the smallest cheap
loop is: edit → `terpix render PROJ -o PROJ/out.mp4 --size 640x360 --force`
→ extract → `Read`.

---

## 7. When to bypass terpix

Reach for `Bash` directly:
- **Audio mux** — `terpix render` accepts `--audio`, but for swapping tracks
  or trimming use `ffmpeg -i out.mp4 -i bgm.mp3 -c:v copy -c:a aac -shortest mixed.mp4`.
- **Frame extraction** — see §6.
- **Side-by-side compare** — `ffmpeg -i a.mp4 -i b.mp4 -filter_complex hstack=inputs=2 ab.mp4`.
- **Web/GIF export** — `ffmpeg -i out.mp4 -vf "fps=12,scale=480:-1:flags=lanczos" out.gif`.
- **Resizing assets/scenes** — `Edit` the JSON, never write a custom tool.

---

## 8. Worked example

User: "make me a 20s short of a koi swimming in a moonlit pond, then a frog
jumping in."

```bash
# 1. Scaffold
terpix new koi "moonlit koi"

# 2. Asset gap check: koi + frog aren't in the builtin catalog.
terpix asset list | grep -E "koi|frog" || true   # confirms missing

# 3. Generate the two missing sprites into the project's assets/
terpix asset add koi koi "a long orange-and-white koi fish viewed from above"
terpix asset add koi frog "a small green frog with rounded body, viewed from the side"

# 4. Two beats via director
terpix film koi "夜晚池塘里一只锦鲤缓慢游动；然后一只青蛙跃入水中" \
  --duration 20s --scenes 2 --gen-assets

# 5. Quick preview render
terpix render koi -o koi/out.mp4 --size 640x360 --force

# 6. Eyeball
ffmpeg -y -loglevel error -ss 4 -i koi/out.mp4 -frames:v 1 koi/p1.png
ffmpeg -y -loglevel error -ss 14 -i koi/out.mp4 -frames:v 1 koi/p2.png
# Read koi/p1.png, koi/p2.png
```

If `p1` shows the koi frozen in one spot when the user said "swimming",
`Edit` `koi/scenes/01-*.json` and add `"motion": { "kind": "drift", "dir":
"right", "ease": "easeInOut" }` to the koi node. Re-render. Done.

For the final mp4, bump `--size 1280x720` (or 1920x1080) and drop `--force`.

---

## 9. Things NOT to do

- **Don't hand-write the v1 ScenePlan** (absolute x/y, `shots[]`, `layers[]`).
  Always emit / edit Scene v2 (relational). v1 is the compile target.
- **Don't put generated assets in `~/.cache/terpix/assets/`** when working in
  a project. Project-local only (`scene add` and `asset add` already do this
  correctly).
- **Don't run `terpix render` then re-render after every tiny edit at 1080p**
  during iteration. Stay at 640x360 until the user signs off, then bump.
- **Don't append to `project.json` by hand** — `scene add` does it. Editing
  by hand fights the writers.
- **Don't pick `silhouette` or `minimalist` for any night / dark scene** —
  forces a cream background and silences bright accents.
- **Don't ask the user "should I do X"** for safe defaults (size, scene
  count, gen-assets on a clearly-missing object). Pick the obvious option
  and tell them.

---

## 10. Provider note

`terpix film` and `terpix asset add` ride on the OpenAI-compat chat-
completions shape — qwen / minimax / openai / openai-compat. If the user's
configured provider is `anthropic`, these subcommands error early. `terpix
plan` and `terpix scene add` work on all providers (including anthropic).

Check with `terpix config show`. Switch with `terpix config set provider
<name>`.
