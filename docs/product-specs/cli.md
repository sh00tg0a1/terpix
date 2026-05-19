# cli

## Surface

```bash
terpix play   <prompt|video>                # render and display in current TTY
terpix render <prompt|video> -o out.mp4     # render to mp4 (no TTY needed)
terpix record <prompt|video> -o out.cast    # play and capture ANSI to asciinema
terpix plan   <prompt> --out plan.json      # NL → scene plan, no render
terpix probe                                # print detected terminal caps
terpix cache clear                          # wipe ~/.cache/terpix
```

## Shared flags

| Flag | Default | Description |
|---|---|---|
| `--mode <m>` | `half` | encoder: ascii\|block\|braille\|half\|sixel\|kitty |
| `--auto-mode` | off | probe and pick best |
| `--size <WxH>` | TTY size (or 1280x720 for render) | output dims |
| `--fps <n>` | 24 | target fps |
| `--duration <t>` | 15s | for NL prompt input |
| `--seed <n>` | random | reproducibility |
| `--model <id>` | claude-sonnet-4-6 | LLM for planner |
| `--debug` | off | structured logs to stderr |

## Error contract

- Exit 0: success.
- Exit 1: user error (bad flag, missing file).
- Exit 2: env error (no ffmpeg, no API key, no TTY).
- Exit 130: SIGINT (clean exit).

## Reference

- entry: `src/cli/index.ts`
- per-command: `src/cli/commands/{play,render,record,plan,probe,cache}.ts`
