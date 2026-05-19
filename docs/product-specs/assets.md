# assets

## Goal

A pluggable library of sprites available to the procedural compositor and the LLM planner. Built-in assets ship with terpix; users add their own without rebuilding.

## User-visible behavior

```bash
terpix asset list                 # all registered, grouped by source (builtin / user)
terpix asset preview spaceship    # render the asset alone in the terminal
terpix asset add ./cat.json       # copy into ~/.config/terpix/assets/
terpix asset add ./bird.png       # copy bitmap + write a default sidecar
terpix asset remove cat
terpix --allow-plugins play ...   # enable .ts plugin assets for this run
```

## Locations (search order)

1. `./terpix-assets/` (per-project; checked into git for shared assets)
2. Each colon-separated path in `TERPIX_ASSET_DIRS` (ad-hoc, scriptable)
3. `$XDG_CONFIG_HOME/terpix/assets/` or `~/.config/terpix/assets/` (per-user)
4. Built-in (compiled into the binary)

User-defined names override built-ins; CLI logs a warning.

Example:

```bash
TERPIX_ASSET_DIRS=examples/assets terpix render-plan examples/cat-on-roof.plan.json
```

## Supported formats

### shape-json (default user format)

Declarative primitive composition. Pure data — completely sandboxed. Best for icons, simple characters, vehicles, foliage.

```json
{
  "name": "cat",
  "description": "a sitting cat from the side",
  "viewBox": { "w": 100, "h": 80 },
  "primitives": [
    { "kind": "ellipse", "cx": 50, "cy": 50, "rx": 30, "ry": 20, "color": "@main" },
    { "kind": "circle", "cx": 25, "cy": 25, "r": 12, "color": "@main" }
  ]
}
```

Primitive kinds: `rect`, `circle`, `ellipse`, `triangle`, `line`, `polygon`.
`@main` is a placeholder for `layer.color` at draw time.

### bitmap-png

`bird.png` (RGBA or RGB + transparent color) + `bird.json` sidecar:

```json
{
  "name": "bird",
  "description": "a small bird in flight",
  "anchor": { "x": 0.5, "y": 0.5 },
  "transparentColor": "#ff00ff"
}
```

Nearest-neighbor scaling — preserves pixel-art aesthetic.

### plugin-ts (gated)

Full procedural code. Requires `--allow-plugins` on every run.

```ts
export const asset = {
  name: 'dragon',
  description: 'a serpentine dragon',
  draw(ctx) { /* arbitrary code with DrawCtx API */ },
};
```

## Built-in catalog (Phase 3.0)

| Name | Description |
|---|---|
| spaceship | Sleek triangular spacecraft with thrust trail |
| planet | Colored sphere with shading |
| moon | Pale-grey sphere with craters |
| star | Compact glow with radiating cross |
| mountain | Triangle with snow cap |
| tree | Triangular foliage on rectangular trunk |

Catalog grows over phases. All discovered programmatically — no hand list.

## Edge cases

- Asset name collision (user overrides built-in) → warning to stderr; user wins.
- Bad shape-json (zod fails) → load skipped, error logged, terpix continues with the rest.
- Bad bitmap (corrupt PNG) → load skipped, error logged.
- Plugin without `--allow-plugins` → loader sees the file, prints "skipped (gated)"; no execution.
- Asset referenced by plan but not in registry → compositor exits 1 with the unknown name + nearest-name suggestion.

## Reference

- [docs/design-docs/asset-system.md](../design-docs/asset-system.md) — architecture
- `src/core/assets/` — implementation (Phase 3.1 onward)
- `src/adapters/llm/asset-catalog.ts` — LLM-facing derivation (planned)
