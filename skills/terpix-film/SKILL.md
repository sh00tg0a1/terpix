---
name: terpix-film
description: Make short terminal-style films from natural language by driving the `terpix` CLI — also handles Chinese prompts. 用自然语言驱动 terpix CLI 制作终端字符流短片(中英文兼容)。Use when the user wants to generate / edit / render a video / animated scene / short film / opening sequence / character-stream movie / NL-to-mp4 / 视频 / 短片 / 动画 / 一段视频 / 拍片 / 中文视频 / 分镜叙事 / 自然语言生成视频 / NL 转 mp4. Covers project scaffolding, scene decomposition, sprite generation, iterating on bad frames via direct JSON edits, and rendering to a single mp4 (with optional audio). Also covers the Scene v2 relational DSL (regions / `on` / `repeat` / `motion` / `camera`) so the assistant can fix problems by editing files instead of always re-prompting the LLM.
---

# terpix-film — directing the terpix CLI

Bilingual skill. Read the section that matches the user's language.

- [`English`](#english) — full reference.
- [`中文`](#中文) — 完整参考.

Commands, JSON keys, and asset names stay in English in both sections (they're literal CLI / DSL).

---

## English

You are the director. terpix is the camera + crew + renderer. Your job is to turn a user's idea ("a 30s short about a koi pond at dawn") into an mp4 by calling four CLI subcommands and editing JSON when the output isn't right.

This skill never invents tools — every action is a `Bash`, `Read`, `Edit`, or `Write` call. The skill teaches **what** to call **when**.

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

1. **Each scene is an independent DSL file.** Its own background, style, camera, motion. The renderer concatenates them into one mp4 via a single ffmpeg process — heterogeneous looks "just work". You never need a giant monolithic plan; mix and match small scene files.
2. **`assets/` is project-local.** Generated sprites live with the project, so re-rendering is reproducible. Don't write to `~/.cache/terpix/assets/` from a project context.

The scene DSL is **Scene v2 relational**: nodes declare WHERE-RELATIVE ("inside the ground region", "on the table's surface"), and the compiler resolves coordinates. You almost never write absolute x/y.

## 2. The five commands

| Command | When to use |
|---|---|
| `terpix new <dir> [title]` | Start a new film. Scaffolds `project.json` + `scenes/` + `assets/`. |
| `terpix asset add <dir> <name> <description...>` | Explicitly generate one sprite the catalog lacks (e.g. "tent", "koi-fish"). Writes to `<dir>/assets/`. |
| `terpix scene add <dir> <prompt...> [--duration 6s] [--gen-assets]` | Plan ONE scene from NL. Writes `<dir>/scenes/NN-name.json` and appends to `project.json`. With `--gen-assets`, missing sprites are auto-generated into `<dir>/assets/`. |
| `terpix film <dir> <prompt...> [--duration 30s --scenes 3 --gen-assets]` | Director pass: one LLM call breaks the idea into N beats, then loops `scene add` per beat. Best-effort — a single bad beat doesn't kill the run. |
| `terpix render <dir> -o <path.mp4> [--size 1280x720] [--fps 24] [--audio bgm.mp3]` | Render the whole project to one mp4. Auto-detects a project dir. |

Other useful subcommands:
- `terpix asset list` — show the catalog (builtins + anything in `<dir>/assets/`).
- `terpix validate-plan <path>` — parse-check a single scene file.
- `terpix config show` — see which provider/model is active.

## 3. Default workflow (NL → mp4)

For "make me a 30s short about X":

```bash
terpix new MYFILM "title"
terpix film MYFILM "<the user's idea, kept concrete>" --duration 30s --scenes 3 --gen-assets
terpix render MYFILM -o MYFILM/out.mp4 --size 1280x720
```

Then **preview**: extract a frame from each clip and view it (see §6). If the user is happy, you're done. Otherwise iterate (see §5).

Tuning:

- **Scene count** ≈ `duration / 8s` (8s per clip is a comfortable pacing default). For < 12s prefer 1 scene; for > 1 minute prefer ≤ 6 (else decomposer hits the max cap of 8).
- **`--gen-assets`** — turn on whenever the prompt mentions objects beyond the builtin catalog (`terpix asset list` to check). The catalog covers people, generic animals, celestial bodies, landscapes — anything specific (lantern, tent, koi) needs generation.
- **`--size`** — default `1280x720`. Smaller (`640x360`) renders much faster for iteration; bump to 720p/1080p only for the final.

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

- **`background`** — `solid` | `gradient` | `starfield` | `nebula`. Sets mood. Dark for night/space, warm gradient for indoor/dining, light for day.
- **`style`** — `default` | `starwars` | `minimalist` | `silhouette` | `noir` | `lineart`. **NEVER use `minimalist` or `silhouette` for night scenes** — both force a light background and wash a dark sky white. For night use no style (or `noir`).
- **`camera.projection: "iso"`** + per-node `depth` (0 near → 1 far): gives a 3/4 / overhead feel (deeper nodes recede up-frame, shrink, dim). Omit `camera` for a head-on view.
- **`place`** — pick ONE of:
  - `{ "in": "<region>", "align": "<corner>" }` — regions: `frame`, `sky`, `ground`, `center`; aligns: `center | top | bottom | left | right` plus the 4 corners.
  - `{ "on": "<id>.<point>" }` — rest on another node's named point. Today `table` exposes `surface`. Give the target an `id`.
  - `{ "at": { "x": .., "y": .. } }` — absolute (escape hatch; rare).
  - `dx`/`dy` nudge as fraction of the frame.
- **`repeat` + `distribute`** — N copies along a row or column. Always prefer this over hand-writing N near-identical nodes.
- **`motion`** — `cross | enter | exit | rise | fall | drift` + `dir` (4 cardinals + 4 diagonals) + `ease`. **Action verbs ("flying", "walking across") require motion** — without it the subject freezes at one spot (often off-screen).
- **`shots: [{ background, durationMs, nodes }, …]`** — alternative to single-scene shorthand: multiple beats inside ONE file (rare; usually prefer separate scene files at project level).

Painting order is depth order — **first node = farthest back**. A big foreground prop drawn AFTER a person hides them.

## 5. Iteration loop (when the render looks wrong)

Extract a frame per clip and look at it first. Don't re-prompt the LLM blindly — most fixes are 2-line JSON edits.

```bash
ffmpeg -y -loglevel error -ss <seconds> -i <mp4> -frames:v 1 frame.png
```

Then read frames in order with the `Read` tool to spot what's off. Map the symptom to the fix:

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

**You can Edit a scenes/*.json directly.** Then re-render. No LLM call needed for the fix. If a fundamental rewrite is wanted, delete the file + re-run `terpix scene add`.

## 6. Previewing mp4 frames

terpix only produces mp4. Use ffmpeg to extract frames you can `Read`:

```bash
PROJ=MYFILM
node -e "const p=require('./$PROJ/project.json');p.scenes.forEach((s,i)=>{const sc=require('./$PROJ/'+s.file);const dur=sc.durationMs||sc.shots.reduce((a,b)=>a+b.durationMs,0);console.log(i+1, s.file, dur);})"
ffmpeg -y -loglevel error -ss 3 -i $PROJ/out.mp4 -frames:v 1 $PROJ/preview-01.png
```

Smallest iteration loop: edit → `terpix render PROJ -o PROJ/out.mp4 --size 640x360 --force` → extract → `Read`.

## 7. When to bypass terpix

Reach for `Bash` directly:

- **Audio mux** — `ffmpeg -i out.mp4 -i bgm.mp3 -c:v copy -c:a aac -shortest mixed.mp4`.
- **Frame extraction** — see §6.
- **Side-by-side compare** — `ffmpeg -i a.mp4 -i b.mp4 -filter_complex hstack=inputs=2 ab.mp4`.
- **Web/GIF export** — `ffmpeg -i out.mp4 -vf "fps=12,scale=480:-1:flags=lanczos" out.gif`.
- **Resizing assets/scenes** — `Edit` the JSON, never write a custom tool.

## 8. Worked example

User: "make me a 20s short of a koi swimming in a moonlit pond, then a frog jumping in."

```bash
terpix new koi "moonlit koi"
terpix asset list | grep -E "koi|frog" || true
terpix asset add koi koi "a long orange-and-white koi fish viewed from above"
terpix asset add koi frog "a small green frog with rounded body, viewed from the side"
terpix film koi "夜晚池塘里一只锦鲤缓慢游动；然后一只青蛙跃入水中" --duration 20s --scenes 2 --gen-assets
terpix render koi -o koi/out.mp4 --size 640x360 --force
ffmpeg -y -loglevel error -ss 4 -i koi/out.mp4 -frames:v 1 koi/p1.png
ffmpeg -y -loglevel error -ss 14 -i koi/out.mp4 -frames:v 1 koi/p2.png
```

If `p1` shows the koi frozen when the user said "swimming", `Edit` `koi/scenes/01-*.json` and add `"motion": { "kind": "drift", "dir": "right", "ease": "easeInOut" }` to the koi node. Re-render. Done.

For the final mp4, bump `--size 1280x720` (or 1920x1080) and drop `--force`.

## 9. Things NOT to do

- **Don't hand-write the v1 ScenePlan** (absolute x/y, `shots[]`, `layers[]`). Always emit / edit Scene v2 (relational).
- **Don't put generated assets in `~/.cache/terpix/assets/`** when working in a project. Project-local only.
- **Don't run `terpix render` at 1080p after every tiny edit** during iteration. Stay at 640x360 until the user signs off.
- **Don't append to `project.json` by hand** — `scene add` does it.
- **Don't pick `silhouette` or `minimalist` for any night / dark scene**.
- **Don't ask "should I do X"** for safe defaults (size, scene count, gen-assets on a clearly-missing object). Pick the obvious option and tell them.

## 10. Provider note

`terpix film` and `terpix asset add` ride on the OpenAI-compat chat-completions shape — qwen / minimax / openai / openai-compat. If the user's configured provider is `anthropic`, these subcommands error early. `terpix plan` and `terpix scene add` work on all providers (including anthropic).

Check with `terpix config show`. Switch with `terpix config set provider <name>`.

---

## 中文

你是**导演**,terpix 是**摄影机 + 工班 + 渲染器**。任务:把用户一句话("30 秒短片,清晨锦鲤池")变成 mp4,靠四个 CLI 子命令 + 必要时直接 Edit JSON。

这个 skill **不发明新工具**,所有动作都是 `Bash`、`Read`、`Edit`、`Write`。skill 教你**何时调哪个**。

## 1. 心智模型

terpix 围绕**项目目录**组织:

```text
myfilm/
  project.json     # title / fps / size / renderer / scenes[](时间线)
  scenes/          # 每个分镜一个 DSL 文件 —— 各自背景/风格/相机
    01-opening.json
    02-discovery.json
  assets/          # 项目本地的程序化 sprite(自动注册)
  out.mp4          # 渲染产物
```

两个关键事实:

1. **每个分镜是一个独立 DSL 文件。** 各自背景、风格、相机、动画。渲染器用**单个 ffmpeg 进程**把它们串成一条 mp4 —— 不同风格自然兼容。**不要塞一个大 plan**,小文件组合更好。
2. **`assets/` 是项目本地的。** 生成的 sprite 跟项目走,重渲可复现。**不要从项目上下文写到 `~/.cache/terpix/assets/`**。

分镜 DSL = **Scene v2 关系式**:节点声明**相对位置**("在 ground 区域"、"在桌子的 surface 点上"),编译器解算坐标。**几乎不需要写绝对 x/y。**

## 2. 五个命令

| 命令 | 何时用 |
|---|---|
| `terpix new <dir> [title]` | 开新片。脚手架建 `project.json` + `scenes/` + `assets/` |
| `terpix asset add <dir> <name> <description...>` | 显式生成 catalog 没有的 sprite(如 "tent"、"koi-fish")。写进 `<dir>/assets/` |
| `terpix scene add <dir> <prompt...> [--duration 6s] [--gen-assets]` | 规划**一个**分镜。写 `<dir>/scenes/NN-name.json`,自动追加到 `project.json`。加 `--gen-assets` 时缺的 sprite 自动生成 |
| `terpix film <dir> <prompt...> [--duration 30s --scenes 3 --gen-assets]` | 导演 pass:一次 LLM 调用把想法拆成 N 段,然后循环 `scene add`。**尽力而为** —— 单段失败不杀全片 |
| `terpix render <dir> -o <path.mp4> [--size 1280x720] [--fps 24] [--audio bgm.mp3]` | 整片渲染成一条 mp4。自动识别项目目录 |

其他常用:

- `terpix asset list` —— 列 catalog(builtin + `<dir>/assets/`)
- `terpix validate-plan <path>` —— 单分镜文件 parse 检查
- `terpix config show` —— 看当前 provider/model

## 3. 默认工作流(NL → mp4)

用户:"做个 30 秒短片,关于 X"

```bash
terpix new MYFILM "标题"
terpix film MYFILM "<用户的想法,保持具体>" --duration 30s --scenes 3 --gen-assets
terpix render MYFILM -o MYFILM/out.mp4 --size 1280x720
```

然后**预览**:每段抽一帧看(见 §6)。用户满意完事,否则迭代(见 §5)。

调参:

- **段数** ≈ `时长 / 8s`(每段 8 秒是舒服的默认)。< 12 秒用 1 段;> 1 分钟最多 ≤ 6 段(decomposer 上限 8)
- **`--gen-assets`** —— prompt 提到 catalog 外的具体物就开(`terpix asset list` 看)。builtin 有人、通用动物、天体、风景;具体物(灯笼/帐篷/锦鲤)需生成
- **`--size`** —— 默认 `1280x720`。**迭代用 `640x360`** 快;终稿再升 720p/1080p

## 4. Scene v2 DSL(为了改文件)

打开 `scenes/NN.json`:

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

各字段管啥:

- **`background`** —— `solid` | `gradient` | `starfield` | `nebula`。定氛围。夜/太空用暗,室内/餐用暖渐变,白天用亮,太空用 starfield
- **`style`** —— `default` | `starwars` | `minimalist` | `silhouette` | `noir` | `lineart`。**夜景**绝对**不能**用 `minimalist` 或 `silhouette` —— 两者强制亮背景,把暗夜刷白、亮月变黑。夜景**不设 style**(或 `noir`)
- **`camera.projection: "iso"`** + 节点 `depth`(0 近 → 1 远):3/4 俯视感。平视就**不设 camera**
- **`place`** —— 三选一:
  - `{ "in": "<region>", "align": "<corner>" }` —— region:`frame | sky | ground | center`;align:`center | top | bottom | left | right` + 4 角
  - `{ "on": "<id>.<point>" }` —— 落在另一节点的点上。当前 `table` 暴露 `surface`。目标要给 `id`
  - `{ "at": { "x": .., "y": .. } }` —— 绝对(逃生口,少用)
  - `dx`/`dy` 微调(frame 比例)
- **`repeat` + `distribute`** —— 沿行/列铺 N 份。**永远优先用**,不要手写 N 个几乎一样的节点
- **`motion`** —— `cross | enter | exit | rise | fall | drift` + `dir`(4 方向 + 4 对角)+ `ease`。**动作动词**("飞过""走过")**必须**配 motion —— 不然主体冻在原地(常在屏外)
- **`shots: [{ background, durationMs, nodes }, …]`** —— 单文件多段的简写。**少用**,通常每段单文件更好

**绘制顺序 = 深度顺序**:**第一个节点画在最后面**。大前景道具画在人之后会**挡住**人。

## 5. 迭代循环(画面不对时)

先**抽帧看**,别盲目重提示 LLM —— 大多数问题是 2 行 JSON 修改。

```bash
ffmpeg -y -loglevel error -ss <秒数> -i <mp4> -frames:v 1 frame.png
```

按顺序 `Read` 抽出的帧。**对症下药**:

| 症状 | 可能原因 | 修法 |
| --- | --- | --- |
| 人只剩头/被桌后遮 | 节点顺序 —— 人画在桌之前 | 把人节点**挪到桌之后**;或 `align: "left"`/`"right"` 让人**侧站**而非堆叠 |
| 人比家具小很多 | `human` 高瘦(aspect 0.45);scale 1 ≈ 屏高 20%(膝盖高) | `scale` 提到 ~2.5–3 |
| 主体挤在拇指大区域 | scale 太小;复数没用 repeat | 命名主体 `scale ≥ 0.9`;手写副本换成 `repeat + distribute` |
| "很多 X" 漏画 / 只出 1 个 | 覆盖率;模型漏了名词 | 加 `"repeat": 5+`;"在桌上"加 `place: {"on": "tbl.surface"}` 自动铺开 |
| 夜景渲成亮的 / 月亮看不见 | `style: "silhouette"` 或 `"minimalist"` 强制米白背景 | **去掉 style**(或设 `"noir"`);确保 `background.type` 是 `nebula` 或暗 gradient |
| "动作"主体冻在某处 / 半在屏外 | 没给 motion | 加 `motion: { kind: "cross", dir: "right" }`(或 `enter`/`drift` 看场景) |
| sprite 完全错 | 模型幻觉素材名,被安全网丢 | `terpix asset list` 查;选真实的,或 `terpix asset add <dir> <name> "<描述>"` |
| 碗悬空在桌上方 | `bowl` 放在 region 而非 `on: tbl.surface` | 改 `place` 为 `on` |
| 整屏一坨 | ascii 上 shape sprite 大 scale 走了 silhouette 填充 | 降 `scale`;或给 shape JSON 加手绘 `ascii` 字段 |
| 前景/背景融在一起(无对比) | 主体色和背景亮度太近 | 改 `color` 拉开亮度差 |

**可以直接 Edit `scenes/*.json`**,然后重渲,**不用调 LLM**。整段重写就删文件 + 重跑 `terpix scene add`。

## 6. 抽 mp4 帧预览

terpix 只出 mp4。用 ffmpeg 抽帧给 `Read` 看:

```bash
PROJ=MYFILM
node -e "const p=require('./$PROJ/project.json');p.scenes.forEach((s,i)=>{const sc=require('./$PROJ/'+s.file);const dur=sc.durationMs||sc.shots.reduce((a,b)=>a+b.durationMs,0);console.log(i+1, s.file, dur);})"
ffmpeg -y -loglevel error -ss 3 -i $PROJ/out.mp4 -frames:v 1 $PROJ/preview-01.png
```

最便宜的迭代循环:Edit → `terpix render PROJ -o PROJ/out.mp4 --size 640x360 --force` → 抽帧 → `Read`。

## 7. 何时绕开 terpix 直接调命令

直接用 `Bash`:

- **混音** —— `ffmpeg -i out.mp4 -i bgm.mp3 -c:v copy -c:a aac -shortest mixed.mp4`
- **抽帧** —— 见 §6
- **左右对比** —— `ffmpeg -i a.mp4 -i b.mp4 -filter_complex hstack=inputs=2 ab.mp4`
- **导 GIF** —— `ffmpeg -i out.mp4 -vf "fps=12,scale=480:-1:flags=lanczos" out.gif`
- **改素材/分镜** —— `Edit` JSON,**不要写自定义工具**

## 8. 完整例子

用户:"做个 20 秒短片,月光下池塘里一只锦鲤游,然后一只青蛙跳进水里。"

```bash
terpix new koi "月光锦鲤"
terpix asset list | grep -E "koi|frog" || true
terpix asset add koi koi "从俯视看的长条橙白锦鲤"
terpix asset add koi frog "圆身体的小绿青蛙,侧视"
terpix film koi "夜晚池塘里一只锦鲤缓慢游动；然后一只青蛙跃入水中" --duration 20s --scenes 2 --gen-assets
terpix render koi -o koi/out.mp4 --size 640x360 --force
ffmpeg -y -loglevel error -ss 4 -i koi/out.mp4 -frames:v 1 koi/p1.png
ffmpeg -y -loglevel error -ss 14 -i koi/out.mp4 -frames:v 1 koi/p2.png
```

若 p1 显示锦鲤**冻在原地**(用户说"游"),`Edit` `koi/scenes/01-*.json`,给锦鲤节点加:

```json
"motion": { "kind": "drift", "dir": "right", "ease": "easeInOut" }
```

重渲,搞定。

终稿升 `--size 1280x720`(或 1920x1080),去 `--force`。

## 9. 不要做的事

- **不要手写 v1 ScenePlan**(绝对 x/y、`shots[]`、`layers[]`)。总是写/改 Scene v2
- **项目模式下不要写全局 `~/.cache/terpix/assets/`**。只写项目本地
- **迭代时不要每次微调都 1080p 重渲**。停在 640x360,用户签字后再升
- **不要手改 `project.json`** —— `scene add` 自动追加,手改冲突
- **任何夜景/暗场景不要选 `silhouette` 或 `minimalist`**
- **明显默认值不要反问用户**(尺寸、段数、明显缺的物体要不要 gen-assets)。**选明显的那个,告诉用户即可**

## 10. Provider 说明

`terpix film` 和 `terpix asset add` 走 OpenAI-compat chat-completions —— qwen / minimax / openai / openai-compat。`anthropic` 这俩会**早期报错**。`terpix plan` 和 `terpix scene add` 所有 provider 都能用(含 anthropic)。

查:`terpix config show`。切:`terpix config set provider <name>`。
