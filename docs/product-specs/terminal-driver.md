# terminal-driver

## Goal

Own everything that touches the TTY: cap probing, output, signal handling, state restoration.

## Capability probe

On startup, send query escapes and parse responses:

- truecolor: `COLORTERM=truecolor` env, or query DA2.
- sixel: `\x1b[c` device attrs response contains `;4;`.
- kitty graphics: query `\x1b_Gi=1,a=q;\x1b\\` and parse OK/error.
- size: `process.stdout.columns / rows`.

Timeout 200ms per probe. Cache result for session.

## Output loop

- Enter alt screen `\x1b[?1049h`, hide cursor `\x1b[?25l`.
- Per frame: cursor home `\x1b[H` + encoder bytes.
- Honor `process.stdout.write` backpressure.

## Signals

| Signal | Action |
|---|---|
| SIGINT / SIGTERM | Restore (cursor, alt-screen, colors), exit 130. |
| SIGWINCH | Recompute size, signal pipeline restart. |
| `process.exit` hook | Always restore. |

## Edge cases

- stdout not a TTY (piped) → refuse `play`; suggest `render` or `record`.
- TERM=dumb → exit with hint.
- Background process (no controlling tty) → exit 1.

## Compat matrix (target)

macOS Terminal, iTerm2, kitty, Alacritty, WezTerm, Windows Terminal, gnome-terminal, tmux/screen passthrough.
