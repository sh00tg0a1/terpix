# exporter

## Goal

Save the movie instead of (or in addition to) playing it.

## Sub-modes

### mp4 (pixel-faithful)

```bash
terpix render "宇宙飞船穿越星云" -o out.mp4
```

Bypass terminal entirely. RGB frames from `scene-renderer` → ffmpeg encoder (`libx264`, yuv420p) → file. Resolution decoupled from terminal (`--size 1280x720`).

### cast (ANSI capture)

```bash
terpix record "宇宙飞船穿越星云" -o out.cast
```

Wrap the live `terminal-driver` output stream in asciinema v2 cast format. Records exactly what the terminal would display, replayable with `asciinema play` or convertible to gif via `agg`.

### Round-trip

`terpix render` produces a deterministic mp4 for a given plan + seed. Useful for sharing without requiring viewer to install terpix.

## Edge cases

- ffmpeg missing → exit with install hint.
- Output path exists → require `--force`.
- Disk full → kill ffmpeg child, surface error.
- `.cast` recording while ANSI mode is sixel/kitty → warn (players may not support).
