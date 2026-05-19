# Core beliefs

1. **Pure core.** `src/core/` has zero IO. All side effects live in adapters.
2. **Parse at boundaries.** Validate scene plan JSON, video metadata, terminal cap probes at the edge with zod; trust internal shapes.
3. **Names over comments.** `encodeHalfBlock(frame)` beats `encode(f) // half-block mode`. Comments only for non-obvious why.
4. **Fail loud, recover late.** Missing ffmpeg / API key → exit 1 with actionable message. Mid-stream errors → drain, restore terminal, exit.
5. **Default that works.** `half-block + truecolor` is the default everywhere. Other modes are opt-in flags.
6. **Tests at the seams.** Adapter contract tests (fakes for LLM/ffmpeg). Snapshot tests for encoder output. No end-to-end LLM calls in CI.
7. **No premature abstraction.** Three encoder backends is fine as three files; do not introduce a `EncoderFactory` until N≥5 and pattern is clear.
8. **Terminal is sacred.** Always restore state on exit. A crashed terpix never leaves an invisible cursor or stuck alt-screen.
