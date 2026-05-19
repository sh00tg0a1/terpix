# audio-sync

## Goal

Play audio in sync with terminal frame output (and bake into `.mp4` exports).

## Strategy

- Audio decode via ffmpeg sub-process; PCM piped to system audio (`speaker` npm pkg or `afplay`/`aplay` fallback).
- **Clock authority**: audio output drives the wall clock. Frame scheduler reads audio PTS each tick and selects the matching video frame (dropping or holding as needed).
- For `terpix render -o out.mp4`: ffmpeg muxes audio + video natively; no runtime sync needed.

## Inputs

- Plan's `audio.trackPath` (optional local file).
- Future: generated TTS or BGM per shot.

## Edge cases

- No audio specified → silent playback, frame scheduler uses `Date.now()`.
- Audio shorter than video → loop or freeze on last frame per `--audio-end loop|hold`.
- Audio device unavailable → degrade to silent, warn once.

## Phase

Phase 6. Skipped in MVP (silent playback).
