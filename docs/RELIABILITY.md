# Reliability

## Runtime expectations

- **Frame pacing**: target ≥24fps at terminal size ≤200×60. Drop frames (not block) when behind.
- **Backpressure**: stdout writes use cork/uncork; if `process.stdout.write` returns false, await `drain` before next frame.
- **SIGINT**: always restore cursor (`\x1b[?25h`), exit alt-screen (`\x1b[?1049l`), reset colors (`\x1b[0m`). Wrap in `process.on('SIGINT', cleanup)`.
- **SIGWINCH**: recompute target w/h; flush in-flight frame; restart pipeline at new size.

## Timeouts

- LLM planner call: 30s default, configurable `--llm-timeout`.
- ffmpeg child: no wall timeout (video can be long); kill on parent exit.

## Retries

- LLM 429/5xx: 3 retries with jitter. Plan generation is idempotent.
- ffmpeg: do not retry; surface error.

## Observability

- `--debug` → structured JSON logs to stderr (frame timings, drop counts, LLM latencies).
- No external telemetry by default.
