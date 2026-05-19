# MVP: half-block video playback (Phase 2)

**Created**: 2026-05-20
**Owner**: cx
**Domain**: scene-renderer + frame-encoder + terminal-driver + cli

## Goal

Pipe a local `.mp4` through ffmpeg, decode to RGB, encode as half-block + truecolor, write to TTY at 24fps. No NL, no scenes — just prove the rendering chain end-to-end.

`terpix play sample.mp4` should fill the terminal with a watchable color video.

## Scope

In:

- TypeScript project scaffold (tsconfig strict, vitest, eslint, tsup)
- `src/core/encoder.ts` — `Encoder` interface + types (`RGBFrame`, `EncodeOpts`, `EncoderMode`)
- `src/adapters/terminal/half-block.ts` — half-block encoder (no diff yet, full repaint)
- `src/adapters/terminal/driver.ts` — alt-screen enter/exit, cursor hide/show, SIGINT/SIGWINCH, cap probe (truecolor only for now)
- `src/adapters/ffmpeg/decoder.ts` — spawn ffmpeg → rawvideo rgba pipe → async iterator of frames
- `src/cli/index.ts` + `src/cli/commands/play.ts` — `terpix play <path>`
- One vitest snapshot test on half-block encoder
- README updated with install + first run

Out (deferred):

- NL planner / LLM adapter
- Other encoder modes (ascii, block, braille, sixel, kitty)
- Per-cell diff
- Export / record
- Audio
- Cap probe via DA2 (only env-based for now)

## Steps

- [ ] `npm init -y`; add deps: typescript@^5, vitest@^2, eslint@^9, prettier@^3, tsup@^8, zod@^3, commander@^12, @types/node
- [ ] `tsconfig.json` strict; `vitest.config.ts`; `.eslintrc.json`; `.prettierrc`; `.gitignore` (node_modules, dist, .env)
- [ ] `src/core/types.ts` — `RGBFrame { w, h, ptsMs, rgba: Uint8Array }`; `EncoderMode` union
- [ ] `src/core/encoder.ts` — `Encoder` interface
- [ ] `src/adapters/terminal/half-block.ts` — encode one frame to `Uint8Array` ANSI bytes. Map (px[y*2], px[y*2+1]) → `\x1b[38;2;..m\x1b[48;2;..m▀`
- [ ] `src/adapters/terminal/driver.ts` — class with `start()`, `writeFrame(bytes)`, `stop()`. SIGINT cleanup.
- [ ] `src/adapters/ffmpeg/decoder.ts` — spawn `ffmpeg -i <path> -f rawvideo -pix_fmt rgba -vf scale=W:H -r FPS pipe:1`; parse fixed-size frames from stdout
- [ ] `src/cli/commands/play.ts` — wire decoder → encoder → driver; default size from `process.stdout.columns/rows` (rows×2 for half-block cellRatio)
- [ ] `src/cli/index.ts` — commander setup
- [ ] `tests/half-block.test.ts` — feed fixed 2×2 RGBA frame, snapshot output bytes
- [ ] `package.json` scripts: `build`, `dev`, `test`, `lint`, `start`
- [ ] Manual test: `node dist/cli/index.js play test.mp4` in iTerm2
- [ ] Update `docs/QUALITY_SCORE.md` — flip rows that now have signals (typecheck, vitest, lint)
- [ ] Move this plan to `docs/exec-plans/completed/`

## Verification

- `npm run test` green (≥1 test).
- `npm run build` produces `dist/cli/index.js` runnable as `node dist/cli/index.js play <file>`.
- Manual: video plays in iTerm2 + Terminal.app, SIGINT restores terminal cleanly.
- `terpix play` on non-TTY exits 2 with hint.

## Risks

- ffmpeg pixel format mismatch → wrong colors. Mitigate: hardcode `rgba` and assert frame byte length = `w*h*4`.
- stdout backpressure on slow terminals → frame drops. Mitigate: await `drain` event, skip frames whose PTS already passed.
- SIGWINCH mid-stream → mid-frame size change. Mitigate: kill ffmpeg child on resize, restart pipeline (good enough for MVP).

## Open questions

- Default fps: source fps vs fixed 24? → use source fps via ffprobe; fallback 24.
- Letterbox vs crop on aspect mismatch → letterbox (contain) by default.
