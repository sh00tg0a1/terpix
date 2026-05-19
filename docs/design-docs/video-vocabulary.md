# Video vocabulary & progression

Borrow film/NLE (non-linear editor) terms so the data model scales from a 3-second toy to a multi-minute composition. Vocabulary is informed by Premiere/Resolve/Final Cut conventions but stays minimal — only adopt a concept when terpix actually needs it.

## Concept ladder (smallest to largest)

| Term | Definition | When terpix needs it |
|---|---|---|
| **Frame** | One image at a PTS (presentation timestamp). | Always — the renderer's atom. |
| **Clip** | A range `[in, out]` on a media source (video file, image, generated still). | When a shot reuses a media source with trimming. |
| **Shot** | One continuous camera "take": single source, single motion intent, single mood. | v0 — even a 3-sec video is one shot. |
| **Beat** | A sub-shot timing marker (e.g. "drum hit at 0.8s into the shot"). | When audio sync or action accents matter (v3+). |
| **Keyframe** | Time-stamped parameter value (`{ tMs, camera: {x,y,zoom} }`). Renderer interpolates between keyframes. | When motion is parametric (Ken-Burns, dolly) — v1+. |
| **Transition** | How shot N ends and shot N+1 begins (cut, dissolve, wipe, fade). | When >1 shot exists — v1+. |
| **Scene** | Group of shots sharing location/time/narrative unit. | When the planner outputs >3 shots and grouping aids prompt fidelity — v2. |
| **Sequence** | Ordered group of scenes forming an "act". | When videos exceed ~1 min and need narrative structure — v3+. |
| **Track** | A parallel timeline layered over the video timeline (audio, subtitles, FX overlays, picture-in-picture). | Audio = v3; FX overlays = v4+. |
| **Project** | Top-level container holding the whole plan + assets + metadata. | Always — even MVP wraps a single shot in a project. |

## Progression plan

### v0 — toy (3–5 seconds)

- Project → one Shot → one Clip from one generated still
- Implicit Ken-Burns motion via 2 keyframes (start zoom, end zoom)
- No transitions, no scenes, no audio
- Plan JSON has `shots: [{...}]` length 1; `scenes` and `sequences` omitted

### v1 — multi-shot (~15 seconds)

- 3–8 shots, hard cuts only
- Per-shot motion via keyframes (`pan-left | zoom-in | static`)
- Still no scene grouping; flat shot list
- Audio: silent

### v2 — scenes (~30 seconds)

- Planner groups shots into `scenes: [{ shots: [...] }]`
- Optional transitions between scenes (dissolve, fade-to-black)
- Hard cuts remain within a scene
- Prompts can be scene-level ("nebula approach") with per-shot refinement

### v3 — audio + sequences (~1 minute)

- `sequences: [{ scenes: [...] }]` becomes available; planner picks 1–3 sequences
- Audio track on its own track type; PTS-locked to video
- Beats annotated on shots for sync ("drop on shot 4 @ 0.5s")

### v4 — tracks + parametric FX

- Multiple video tracks for picture-in-picture / overlays
- Subtitle track (rendered as bottom-row Unicode in terminal)
- FX as parameterized filters with keyframes (color grade, blur, glitch)

### v5 — professional editing primitives

- Trim/ripple/roll edits (when interactive editor exists)
- Markers, chapters
- Color correction nodes

## Data model (target shape, evolves with phases)

```ts
// v0 — minimal
interface Project {
  version: 1;
  title: string;
  fps: number;
  size: { w: number; h: number };
  shots: Shot[];          // flat list at v0..v1
}

// v2+
interface ProjectV2 extends Omit<Project, 'shots'> {
  version: 2;
  scenes: Scene[];        // shots nested under scenes
}

interface Scene {
  id: string;
  startMs: number;
  durationMs: number;
  shots: Shot[];
  transitionIn?: Transition;
}

interface Shot {
  id: string;
  startMs: number;
  durationMs: number;
  source: Source;         // image-gen prompt | video file clip
  motion?: Keyframe[];    // camera params over time
  beats?: Beat[];
  transitionIn?: Transition;
}

interface Keyframe { tMs: number; camera: { x: number; y: number; zoom: number }; ease?: 'linear'|'easeIn'|'easeOut'|'easeInOut'; }
interface Beat { tMs: number; label: string; }
interface Transition { kind: 'cut'|'dissolve'|'fade'|'wipe'; durationMs: number; }
interface Source = { kind: 'imagegen'; prompt: string; seed?: number } | { kind: 'video'; path: string; inMs: number; outMs: number };
```

Plan JSON `version` field gates which features the renderer accepts. Older plans always playable.

## Why this matters for terpix

- **Terminal pixel rendering** is the *output* layer; the *composition* layer should look like any other NLE so users can think in familiar terms.
- Letting the model emit `scenes` and `transitions` early (even if v0 ignores them) means LLM-generated plans stay forward-compatible.
- Keyframes generalize Ken-Burns and let v4 add filters without redesigning the schema.

## References

- Premiere Pro: project → sequence → clip
- DaVinci Resolve: project → timeline → track → clip
- OpenTimelineIO: open-source NLE interchange — worth studying when v3 lands.

## Open decisions

- Use OpenTimelineIO JSON instead of a custom schema once v3 hits? (Pro: interop with Resolve/Premiere. Con: heavyweight for terminal use.)
- Per-cell or per-pixel motion blur on fast pans?
- Subtitle track: top-line vs bottom-line; bidi support?
