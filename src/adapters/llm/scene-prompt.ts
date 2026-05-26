import { catalogMarkdown } from './asset-catalog.js';

export interface ScenePromptOpts {
  renderer?: 'half' | 'ascii';
}

// Few-shot: two deliberately different scenes (a dinner and a landscape) built
// from the SAME relational primitives, so the model learns the model, not a
// template. Both are valid Scene v2.
const FEW_SHOT = `
## Examples

### Prompt: "一家人围着桌子吃年夜饭" (a family eating dinner around a table)
Note: people listed FIRST so they sit BEHIND the table (heads/torsos show
above it); table kept at scale 3 so it doesn't swallow them; bowls rest ON the
table surface. Order = depth.
\`\`\`json
{
  "version": 2, "title": "family dinner", "fps": 24, "renderer": "half",
  "durationMs": 6000,
  "background": { "type": "gradient", "from": "#5a3220", "to": "#1c0f08", "direction": "vertical" },
  "nodes": [
    { "kind": "sprite", "asset": "human", "repeat": 4, "scale": 2.4,
      "place": { "in": "ground", "align": "center", "dy": -0.06 },
      "distribute": { "layout": "row", "gap": 0.22 } },
    { "kind": "sprite", "asset": "table", "id": "tbl", "color": "#8a5a2c", "scale": 3.0,
      "place": { "in": "ground", "align": "center" } },
    { "kind": "sprite", "asset": "bowl", "repeat": 5, "scale": 1.0,
      "place": { "on": "tbl.surface" } }
  ]
}
\`\`\`

### Prompt: "moonlit mountains with a row of pine trees"
\`\`\`json
{
  "version": 2, "title": "wild night", "fps": 24, "renderer": "half",
  "durationMs": 6000, "style": "silhouette",
  "background": { "type": "nebula", "colorA": "#0a0a2a", "colorB": "#2a1a4a", "scale": 0.02, "seed": 7 },
  "nodes": [
    { "kind": "sprite", "asset": "moon", "scale": 1.1, "color": "#f4f0e0",
      "place": { "in": "sky", "align": "top-right" } },
    { "kind": "sprite", "asset": "mountain", "repeat": 3, "scale": 2.6, "color": "#20283a",
      "place": { "in": "ground", "align": "center" }, "distribute": { "layout": "row", "gap": 0.3 } },
    { "kind": "sprite", "asset": "tree", "repeat": 4, "scale": 1.1, "color": "#101820",
      "place": { "in": "ground", "align": "bottom" }, "distribute": { "layout": "row", "gap": 0.22 } }
  ]
}
\`\`\`

### Prompt: "a spaceship flying past a red planet"
Note: "flying past" = motion. The planet is a static backdrop (no motion); the
ship gets \`motion: cross\` so it travels across the frame instead of freezing.
\`\`\`json
{
  "version": 2, "title": "fly-by", "fps": 24, "renderer": "half",
  "durationMs": 6000,
  "background": { "type": "starfield", "density": 0.012, "seed": 4 },
  "nodes": [
    { "kind": "sprite", "asset": "planet", "scale": 2.6, "color": "#cc3333",
      "place": { "in": "frame", "align": "right" } },
    { "kind": "sprite", "asset": "spaceship", "scale": 1.1, "color": "#dddddd",
      "place": { "in": "center" }, "motion": { "kind": "cross", "dir": "right" } }
  ]
}
\`\`\`
`;

export function buildScenePrompt(opts: ScenePromptOpts = {}): string {
  const renderer = opts.renderer ?? 'half';
  return [
    `# terpix scene planner (relational)`,
    ``,
    `Convert the user's prompt into a **Scene v2** JSON for terpix, a terminal`,
    `movie renderer. Call submit_plan exactly once. No prose. Schema is in the`,
    `tool's input_schema; notes below give intent.`,
    ``,
    `## The big idea: describe RELATIONS, not coordinates`,
    `You do NOT compute x/y. You say where things go RELATIVE to regions and to`,
    `each other; the engine resolves exact positions. This is the whole point —`,
    `never hand-place pixels when a relation says it better.`,
    ``,
    `## A scene is \`nodes\` (painted back-to-front = first is behind)`,
    `Each node:`,
    `- \`kind\`: "sprite" | "text" | "particles".`,
    `- sprite: \`asset\` (exact catalog name), \`scale\` (1 ≈ 20% of frame;`,
    `  a person ~2.3, a wide table ~3 — bigger and it hides people behind it),`,
    `  \`color\` (#RRGGBB, optional).`,
    `- text: \`content\` (UPPERCASE ASCII A-Z 0-9 space .,!? only${renderer === 'ascii' ? '; ascii renderer also draws CJK natively — keep原文' : '; TRANSLATE non-English to English, never pinyin'}), \`size\` sm|md|lg.`,
    `- particles: \`particle\` snow|rain|sparks|thrust, \`count\`.`,
    ``,
    `## Placement — every node has \`place\` (pick ONE anchor)`,
    `- \`{ "in": <region>, "align": <align> }\` — inside a region at an anchor.`,
    `    regions: **frame** (whole), **sky** (upper), **ground** (lower band),`,
    `    **center**. align: center | top | bottom | left | right | top-left |`,
    `    top-right | bottom-left | bottom-right.`,
    `- \`{ "on": "<id>.<point>" }\` — REST this node on another node's named`,
    `    point. Give the target node an \`id\`. Points today: a \`table\` exposes`,
    `    \`surface\`. So food on a table = \`{ "on": "tbl.surface" }\`. This is how`,
    `    you keep things from floating — put bowls/plates ON the table, never at`,
    `    a guessed y.`,
    `- \`{ "at": { "x": .., "y": .. } }\` — absolute escape hatch (0..1). Rare.`,
    `- Optional \`dx\`,\`dy\` nudge any of the above (fraction of frame/target).`,
    ``,
    `## Plurals: use \`repeat\` + \`distribute\`, never copy-paste nodes`,
    `\`"repeat": 5, "distribute": { "layout": "row", "gap": 0.17 }\` lays out 5`,
    `evenly spaced copies. A row of trees, a table of bowls, a crowd of people —`,
    `one node with \`repeat\`. \`gap\` is spacing as a fraction (row: of the frame;`,
    `on a target: of the surface). Use \`column\` for vertical stacks.`,
    ``,
    `## Motion — animate a node with \`motion\` (action verbs need this!)`,
    `\`place\` is the RESTING spot; \`motion\` makes the node travel. Without it a`,
    `"flying / walking / crossing / falling" subject is FROZEN at one spot (often`,
    `half off-screen). Map action verbs to a \`motion\`:`,
    `- \`{ "kind": "cross", "dir": "right" }\` — flies/walks ALL the way across`,
    `  (off one edge to the other). "a ship flying past" → cross.`,
    `- \`{ "kind": "enter", "dir": "left" }\` — comes in from an edge, stops at`,
    `  \`place\`. \`exit\` — leaves from \`place\` toward an edge.`,
    `- \`{ "kind": "rise" | "fall" }\` — drifts up / down (smoke, balloons, snow`,
    `  feel). \`{ "kind": "drift", "dir": "right" }\` — gentle ambient nudge.`,
    `- \`dir\`: left|right|up|down. Optional \`ease\` (default easeInOut).`,
    `Use motion on the SUBJECT that moves; leave static backdrops without it.`,
    ``,
    `## Overhead / tilted view — top-level \`camera\` + node \`depth\``,
    `When the prompt asks for a bird's-eye / overhead / 45° / 俯视 / 斜视角 view,`,
    `set \`"camera": { "projection": "iso", "tilt": 0.5 }\` and give nodes a`,
    `\`depth\` (0 = near/front, 1 = far/back). Deeper nodes recede UP the frame,`,
    `shrink, and dim — so a table seen from above = near diners depth ~0, the`,
    `table ~0.3, far diners ~0.6. Omit \`camera\` for a normal head-on view.`,
    `(Sprites stay front-facing art; this fakes depth by stacking, not true 3D.)`,
    ``,
    `## Composition guidance`,
    `- Background sets mood: \`nebula\`/dark \`gradient\` for night/space,`,
    `  warm \`gradient\` for indoor/dining, light for day, \`starfield\` for space.`,
    `- Put ground-resting things (table, tree, mountain, human) \`in: "ground"\`;`,
    `  celestial things (moon, planet, star) \`in: "sky"\`.`,
    `- Food/props that belong on furniture go \`on\` it, not in a region.`,
    `- People should read clearly larger than props beside them (human scale ~2–3).`,
    `- Cover the frame: a lone small subject on empty background reads as a mistake.`,
    ``,
    `## Occlusion — node order is depth, and a big prop HIDES what's behind it`,
    `Nodes paint back-to-front: the FIRST node is furthest back, the LAST is in`,
    `front. A large foreground prop drawn AFTER a subject will cover it. Two ways`,
    `to keep subjects visible:`,
    `- **Behind + taller**: list people BEFORE the table (people behind it) and`,
    `  keep the table modest (scale ~3, not 4–5) so heads/torsos show above it.`,
    `- **To the sides**: place people with \`align: "left"\`/\`"right"\` (or dx`,
    `  ±0.3) so a centered prop never sits on top of them.`,
    `Never stack a person at the same spot as a big table at similar scale — the`,
    `person vanishes. This is the #1 dining-scene mistake.`,
    ``,
    `## Available sprites (exact names; aspect = W:H at scale 1)`,
    ``,
    catalogMarkdown({ renderer }),
    ``,
    `## Style (optional top-level \`style\`)`,
    `default | starwars | minimalist | silhouette | noir | lineart.`,
    `\`minimalist\` and \`silhouette\` FORCE a light (cream) background and flatten`,
    `everything to two tones — so for **night / moonlit / dark** scenes do NOT`,
    `use either (the dark sky turns cream and a bright moon turns black /`,
    `invisible). For night use no style (or \`noir\`) with a dark \`nebula\` /`,
    `\`gradient\` background and bright moon/stars. Indoor must NOT be minimalist.`,
    ``,
    `## Hard rules`,
    `- \`version\` is 2. \`renderer\` is "${renderer}".`,
    `- Use EXACT asset names from the catalog. People → \`human\`, not \`cat\`.`,
    `- Map every noun in the prompt to a node; counts come from \`repeat\`.`,
    FEW_SHOT,
  ].join('\n');
}
