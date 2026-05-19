# Product sense

## Personas

- **Terminal-native hacker** — wants ambient/demo art in tmux without a GUI.
- **CLI tool author** — embeds terpix to show animated intros / progress demos.
- **Live coder / streamer** — projects expressive visuals in pure text streams.

## What "good" looks like

- One-line prompt → watchable 10–30s scene without flag tuning.
- Default `half-block` renders cleanly on macOS Terminal, iTerm2, kitty, Alacritty, WezTerm, Windows Terminal.
- No GUI dependency; no X server; works over SSH.

## Non-goals

- Photoreal video playback (use mpv).
- Full-screen game engine.
- Real-time camera capture.

## UX principles

- Sensible defaults; flags are escape hatches.
- Fail loud on missing ffmpeg / LLM key with actionable hint.
- Restore terminal state on SIGINT (cursor visible, alt-screen exited, colors reset).
