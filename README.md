# terpix

NL-driven terminal character-stream movie renderer.

## Install

```bash
npm install
npm run build
```

Requires `ffmpeg` on PATH and Node 20+.

## Run

```bash
node dist/index.js play sample.mp4
node dist/index.js play sample.mp4 --fps 30
node dist/index.js probe
```

`COLORTERM=truecolor` recommended for accurate color (iTerm2, kitty, Alacritty, WezTerm, modern Terminal.app set this).

## Status

Phase 2 MVP — half-block + truecolor playback of local video files. NL planner, multi-mode encoders, export, audio: in roadmap. See [docs/PLANS.md](docs/PLANS.md).

## Develop

```bash
npm run dev -- play sample.mp4
npm test
npm run typecheck
npm run lint
```

## Docs

Agent + human entry point: [AGENTS.md](AGENTS.md). Architecture: [ARCHITECTURE.md](ARCHITECTURE.md).
