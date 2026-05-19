# Design philosophy

Optimize for:

- **Universal terminal reach** — default mode runs on any truecolor TTY; sixel/kitty are bonuses.
- **NL-first ergonomics** — one prompt → playable movie; flags are progressive disclosure.
- **Pure core, swappable IO** — LLM, image source, terminal backend, exporter are all adapters.
- **Determinism where it counts** — given same seed + plan, frame output is reproducible.

See [design-docs/index.md](design-docs/index.md) for deeper docs.
