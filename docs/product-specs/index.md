# Product specs

| Domain | Description |
|---|---|
| [nl-planner.md](nl-planner.md) | NL prompt → scene plan JSON |
| [scene-renderer.md](scene-renderer.md) | Scene plan → RGB frames (ffmpeg / image-gen) |
| [frame-encoder.md](frame-encoder.md) | RGB frame → terminal bytes (6 backends) |
| [terminal-driver.md](terminal-driver.md) | TTY output, cap probe, signal handling |
| [exporter.md](exporter.md) | Render to `.mp4` / record to `.cast` |
| [audio-sync.md](audio-sync.md) | Audio decode + frame clock |
| [cli.md](cli.md) | Command surface: play / render / record |
