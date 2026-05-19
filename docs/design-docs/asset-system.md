# Asset system

## Goal

Sprites are extensible. Users add their own without rebuilding terpix. The LLM planner automatically discovers all registered assets — built-in and user — without hand-edited prompts.

## Decision

A single **runtime asset registry** holds drawers, keyed by name. Built-in drawers register at startup. User assets load from disk into the same registry. Both feed the LLM context and the compositor identically.

```text
ASSET_REGISTRY: Map<string, AssetEntry>

AssetEntry {
  name: string;
  description: string;          // shown to LLM
  draw(ctx: DrawCtx): void;
  source: 'builtin' | 'shape' | 'bitmap' | 'plugin';
  origin?: string;              // file path for user assets
}
```

## Three user-asset formats

| Format | File | Loader | Power | Security |
|---|---|---|---|---|
| **shape-json** | `cat.json` | `formats/shape.ts` | Declarative primitive composition (triangle / circle / rect / ellipse / line) with `viewBox` + `@main` color placeholder | ✅ Fully sandboxed — pure data |
| **bitmap-png** | `bird.png` + `bird.json` sidecar | `formats/bitmap.ts` (uses `pngjs`) | Pixel-art images blit-scaled into the frame buffer | ✅ Only reads pixels |
| **plugin-ts** | `dragon.ts` | `formats/plugin.ts` (dynamic `import()`) | Full procedural code — same API as built-ins | ⚠️ Arbitrary code; gated behind `--allow-plugins` |

## Asset directories (search order)

1. Project: `./terpix-assets/`
2. Env: each colon-separated path in `TERPIX_ASSET_DIRS`
3. User config: `$XDG_CONFIG_HOME/terpix/assets/` or `~/.config/terpix/assets/`
4. Built-in: `src/core/assets/builtin/` (compiled into the binary)

User assets override built-ins by name; warning logged.

Example: load extra assets without touching install paths:

```bash
TERPIX_ASSET_DIRS=./my-assets:./vendor/assets terpix render-plan plan.json
```

## Schema interaction

`SpriteAsset` in [dsl.ts](../../src/core/dsl.ts) is **`z.string()`** at the type level — compositor validates against registry at render time. This avoids ahead-of-time enum baking and lets user assets be referenced in plans the same way as built-ins.

For LLM tool_use, the **JSON Schema sent to the model** is rebuilt per request with the current registry's names as an `enum`. The LLM never proposes an unknown sprite.

## LLM context derivation

[`asset-catalog.ts`](../../src/adapters/llm/asset-catalog.ts) — planned — exports:

- `assetEnum(): string[]` — sorted names from `ASSET_REGISTRY` for JSON Schema
- `assetCatalogMarkdown(): string` — `- name: description (source)` lines for the system prompt

Every change to registry (built-in added, user dropped a `.json`) is visible to the next LLM call without any prompt edit.

## Shape-json grammar (sketch)

```json
{
  "name": "cat",
  "description": "a sitting cat from the side",
  "viewBox": { "w": 100, "h": 80 },
  "primitives": [
    { "kind": "ellipse", "cx": 50, "cy": 50, "rx": 30, "ry": 20, "color": "@main" },
    { "kind": "circle", "cx": 25, "cy": 25, "r": 12, "color": "@main" },
    { "kind": "triangle", "points": [[15,15],[20,5],[28,15]], "color": "@main" },
    { "kind": "circle", "cx": 22, "cy": 25, "r": 2, "color": "#000" }
  ]
}
```

- Coordinates live in `viewBox` space; loader scales to the requested `size`.
- `@main` resolves to `layer.color` at draw time (fallback `#cccccc`).
- Any other `#RRGGBB` value renders literally.
- Loader validates against a zod schema before registration.

## Bitmap-png sidecar (sketch)

```json
{
  "name": "bird",
  "description": "a small bird",
  "anchor": { "x": 0.5, "y": 0.5 },
  "transparentColor": "#ff00ff"
}
```

- Anchor: where in the image the sprite "centers" (0..1 normalized).
- `transparentColor` (optional): RGB key value treated as fully transparent on load (handy when source has no alpha).
- Scaling: nearest-neighbor (preserves pixel-art feel).

## Plugin-ts contract (sketch)

```ts
// dragon.ts
import type { DrawCtx, AssetModule } from 'terpix/asset-api';

export const asset: AssetModule = {
  name: 'dragon',
  description: 'a serpentine dragon coiling in the sky',
  draw(ctx: DrawCtx) { /* arbitrary procedural code */ },
};
```

- Module **must** match `AssetModule` shape; loader validates at registration.
- Loaded only with `--allow-plugins`; CLI prints the list of plugin files being loaded.
- Long-term: optional Node `vm` sandbox or worker-thread isolation.

## CLI surface (planned)

```bash
terpix asset list                         # show all registered, grouped by source
terpix asset preview <name>               # render single sprite to TTY
terpix asset add <path> [--global]        # copy into ./terpix-assets or ~/.config/...
terpix asset remove <name>
```

## Progression

| Phase | Capability | Status |
|---|---|---|
| 3.0 | Hard-coded `SPRITE_DRAWERS` | shipped |
| 3.1 | `ASSET_REGISTRY` + builtin loader; per-asset file under `builtin/` | shipped |
| 3.5 | shape-json loader (rect / circle / ellipse / triangle / line / polygon) | shipped |
| 4 | bitmap-png loader (`pngjs`) | planned |
| 5 | plugin-ts loader (gated by `--allow-plugins`) | planned |
| 6 | `terpix asset add/remove/preview` CLI (currently only `list`) | planned |
| 7 | Asset packs distributable via npm | future |

## Anti-patterns

- **Dual source of truth** — hand-edited LLM prompt listing assets while code has a separate list. Always derive from registry.
- **Static enum baked into build** — would force a rebuild when users add an asset; defeats the point.
- **Eager loading plugin code without `--allow-plugins`** — supply-chain risk; loading must be opt-in and logged.
- **Mixing render and persistence concerns** — drawers never touch disk; loaders never touch the frame buffer.

## Related

- [procedural-compositor.md](procedural-compositor.md)
- [llm-integration.md](llm-integration.md)
- [/docs/product-specs/assets.md](../product-specs/assets.md) — product surface
- [/src/core/assets/](../../src/core/assets/) — implementation
