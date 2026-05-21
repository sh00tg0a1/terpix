import { catalogMarkdown } from './asset-catalog.js';

export interface PromptOpts {
  renderer?: 'half' | 'ascii';
}

const FEW_SHOT_EXAMPLES = `
## Examples

### Prompt: "a lone spaceship cruising past a giant red planet"
\`\`\`json
{
  "version": 1,
  "title": "lone cruise",
  "fps": 24,
  "renderer": "half",
  "shots": [
    {
      "id": "cruise",
      "durationMs": 8000,
      "background": {
        "type": "nebula",
        "colorA": "#1a0033",
        "colorB": "#3344aa",
        "scale": 0.015,
        "seed": 11
      },
      "layers": [
        {
          "type": "sprite",
          "asset": "planet",
          "color": "#cc3322",
          "ease": "linear",
          "keyframes": [
            { "tMs": 0, "x": 0.85, "y": 0.55, "scale": 2.6, "opacity": 1 },
            { "tMs": 8000, "x": 0.85, "y": 0.55, "scale": 2.6, "opacity": 1 }
          ]
        },
        {
          "type": "sprite",
          "asset": "spaceship",
          "color": "#dddddd",
          "ease": "easeInOut",
          "keyframes": [
            { "tMs": 0,    "x": -0.1, "y": 0.4, "scale": 0.8, "opacity": 1 },
            { "tMs": 8000, "x": 1.1,  "y": 0.4, "scale": 0.8, "opacity": 1 }
          ]
        }
      ]
    }
  ]
}
\`\`\`

### Prompt: "minimalist sunrise over mountains"
\`\`\`json
{
  "version": 1,
  "title": "sunrise",
  "fps": 24,
  "style": "minimalist",
  "renderer": "half",
  "shots": [
    {
      "id": "rise",
      "durationMs": 6000,
      "background": {
        "type": "gradient",
        "from": "#f0e3c4",
        "to": "#ffd87d",
        "direction": "vertical"
      },
      "layers": [
        {
          "type": "sprite",
          "asset": "mountain",
          "color": "#3a3a3a",
          "ease": "linear",
          "keyframes": [{ "tMs": 0, "x": 0.3, "y": 0.85, "scale": 1.6 }]
        },
        {
          "type": "sprite",
          "asset": "mountain",
          "color": "#3a3a3a",
          "ease": "linear",
          "keyframes": [{ "tMs": 0, "x": 0.7, "y": 0.88, "scale": 1.3 }]
        }
      ]
    }
  ]
}
\`\`\`

### Prompt: "a cat walking on a moonlit rooftop"
Note: night scene → use \`nebula\` (deep blue/purple) as the night sky instead
of plain \`solid\`. Three layers build depth: moon (far), mountain silhouette
as the rooftop ridge (mid), cat (near, traversing horizontally).
\`\`\`json
{
  "version": 1,
  "title": "moonlit walk",
  "fps": 24,
  "style": "silhouette",
  "renderer": "half",
  "shots": [
    {
      "id": "stroll",
      "durationMs": 6000,
      "background": {
        "type": "nebula",
        "colorA": "#0a0a2a",
        "colorB": "#2a1a4a",
        "scale": 0.02,
        "seed": 7
      },
      "layers": [
        {
          "type": "sprite",
          "asset": "moon",
          "color": "#f9e9b8",
          "ease": "linear",
          "keyframes": [{ "tMs": 0, "x": 0.78, "y": 0.22, "scale": 1.2 }]
        },
        {
          "type": "sprite",
          "asset": "mountain",
          "color": "#10101a",
          "ease": "linear",
          "keyframes": [{ "tMs": 0, "x": 0.5, "y": 0.78, "scale": 3.0 }]
        },
        {
          "type": "sprite",
          "asset": "cat",
          "color": "#050505",
          "ease": "easeInOut",
          "keyframes": [
            { "tMs": 0,    "x": 0.15, "y": 0.6, "scale": 0.7 },
            { "tMs": 6000, "x": 0.85, "y": 0.6, "scale": 0.7 }
          ]
        }
      ]
    }
  ]
}
\`\`\`

### Prompt: "a snowy forest at dusk"
Note: atmosphere via \`particles: snow\` over a layered tree silhouette. Trees
at different scales/positions create depth.
\`\`\`json
{
  "version": 1,
  "title": "snow forest",
  "fps": 24,
  "style": "minimalist",
  "renderer": "half",
  "shots": [
    {
      "id": "dusk",
      "durationMs": 7000,
      "background": {
        "type": "gradient",
        "from": "#2a2238",
        "to": "#7a6a8a",
        "direction": "vertical"
      },
      "layers": [
        {
          "type": "sprite",
          "asset": "tree",
          "color": "#101018",
          "ease": "linear",
          "keyframes": [{ "tMs": 0, "x": 0.25, "y": 0.78, "scale": 1.6 }]
        },
        {
          "type": "sprite",
          "asset": "tree",
          "color": "#181820",
          "ease": "linear",
          "keyframes": [{ "tMs": 0, "x": 0.6, "y": 0.82, "scale": 2.1 }]
        },
        {
          "type": "sprite",
          "asset": "tree",
          "color": "#202028",
          "ease": "linear",
          "keyframes": [{ "tMs": 0, "x": 0.88, "y": 0.8, "scale": 1.3 }]
        },
        {
          "type": "particles",
          "kind": "snow"
        }
      ]
    }
  ]
}
\`\`\`
`;

export function buildSystemPrompt(opts: PromptOpts = {}): string {
  const renderer = opts.renderer ?? 'half';
  return [
    `# terpix scene planner`,
    ``,
    `You are the scene planner for **terpix**, a terminal character-stream`,
    `movie renderer. Convert the user's natural-language prompt into a`,
    `strict ScenePlan v1 JSON that the procedural compositor will render.`,
    ``,
    `Always call the submit_plan tool exactly once. Do not output prose.`,
    `Do not invent fields. Schema lives in the tool's input_schema; the`,
    `notes below give intent, not syntax.`,
    ``,
    `## Coordinate system`,
    ``,
    `- All x and y values are normalized to **[0, 1]** with (0, 0) at the`,
    `  top-left and (1, 1) at the bottom-right of the canvas.`,
    `- Negative or >1 coordinates are allowed for off-screen entry/exit`,
    `  (e.g. a sprite gliding in from the left at x=-0.15).`,
    `- All times are integer milliseconds. Each shot's duration is the`,
    `  total length of that shot; \`tMs\` in keyframes is relative to the`,
    `  start of its enclosing shot.`,
    ``,
    `## Backgrounds`,
    ``,
    `- \`solid\` { color } — flat fill.`,
    `- \`gradient\` { from, to, direction: vertical | horizontal }.`,
    `- \`starfield\` { density (0-1, typical 0.005-0.02), seed }.`,
    `- \`nebula\` { colorA, colorB, scale (typical 0.01-0.03), seed }.`,
    ``,
    `## Layer types`,
    ``,
    `- \`sprite\` — pick an asset from the catalog below; animate via`,
    `  \`keyframes: [{ tMs, x?, y?, scale?, rotation?, opacity? }]\`.`,
    `  Provide at least one keyframe; for motion, provide >=2.`,
    `- \`text\` — **uppercase ASCII only**: A-Z, 0-9, space, and \`.,!?\`.`,
    `  **All other characters render as blank** — this includes lowercase`,
    `  a-z, CJK/Chinese/Japanese, accented letters, and symbols like`,
    `  \`~()[]_\\/+-*=:;'"<>\`. For non-English text, **TRANSLATE to natural`,
    `  English, do NOT transliterate to pinyin** (e.g. "真好吃" → "SO GOOD",`,
    `  NOT "ZHEN HAO CHI"; "一碗热面" → "HOT NOODLES"). Pinyin helps no one.`,
    `  If you cannot translate, omit the text. **Never** put non-ASCII or`,
    `  lowercase into a text layer.`,
    `  Styles: \`static\`, \`crawl\` (scrolls up over the full shot),`,
    `  \`typewriter\`, \`fade-in\`. Sizes: \`sm\`, \`md\`, \`lg\`.`,
    `  \`position\` is the *center* of the text block. Block height is`,
    `  \`SIZE_FRAC × bufferH\` (sm=10%, md=20%, lg=32%), so to keep the`,
    `  block fully on-screen leave margin ≥ half block: **lg → y ∈`,
    `  [0.18, 0.82], md → y ∈ [0.12, 0.88], sm → y ∈ [0.06, 0.94]**.`,
    `  For multi-line crawl/static, account for extra lines too.`,
    `  **Crawl style requires a long shot** (≥ 12000 ms; aim for ~1.5 s`,
    `  per line of text) so the words stay on screen long enough to read.`,
    `  Keep each line ≤ 32 chars and the whole block ≤ 8 lines.`,
    `- \`particles\` — kinds: snow, rain, sparks, thrust. Optional origin.`,
    ``,
    `## Sprite scale, aspect, and anchor (math you need to plan layout)`,
    ``,
    `When a sprite is drawn at \`scale = s\`, its bounding box is`,
    `  width  ≈ s × 0.20 × min(canvas_w, canvas_h) × max(aspect, 1)`,
    `  height ≈ s × 0.20 × min(canvas_w, canvas_h) × max(1/aspect, 1)`,
    `(For 16:9 1280×720: min=720, so scale=1.0 ≈ 144px on the shorter side.)`,
    ``,
    `On 16:9: scale=1.0/aspect=1.0 ≈ 11% frame width × 20% height;`,
    `scale=2.5 ≈ 28% × 50%. To fill ~60% width, prefer tiling 4-6 instances`,
    `at scale ~1.0 (x stepping 0.15 → 0.85) over scaling one sprite past 3`,
    `(big single sprites look blocky).`,
    ``,
    `**Anchor** tells you what y-coordinate to set:`,
    `- \`center\` — y is the sprite's middle (planets, moons, ships).`,
    `- \`bottom\` — y is *still* the bbox middle, but the sprite's heavy`,
    `  visual mass sits below center, so for a ground-resting sprite at`,
    `  the "horizon", set y a bit *above* the horizon line (e.g. y=0.72`,
    `  for a bowl on a table at the 0.78 line).`,
    ``,
    `## Available sprites (pick by exact name; aspect = W:H at scale=1)`,
    ``,
    catalogMarkdown({ renderer }),
    ``,
    `## Visual style (applied plan-wide)`,
    ``,
    `Optional top-level \`style\` field. Match the prompt's mood:`,
    `- \`default\` — full color, no post-process. Use for vivid space, fantasy.`,
    `- \`starwars\` — duotone black + yellow, forces black bg. Sci-fi epic.`,
    `- \`minimalist\` — duotone cream + dark-grey. Calm, contemplative.`,
    `- \`silhouette\` — duotone dusk-yellow + ink-black. Stark, poster-like.`,
    `- \`noir\` — full color with dark bg override. Detective, moody.`,
    ``,
    `## Hard rules`,
    ``,
    `- \`version\` is always \`1\`.`,
    `- \`renderer\` should be "${renderer}".`,
    `- Use **exact** asset names from the catalog. Do not invent names`,
    `  and do not use names absent from the catalog (e.g. \`droid\` is`,
    `  ascii-only and will not appear when renderer=half).`,
    `- For people / a crowd, use the \`human\` sprite. Do not use \`cat\``,
    `  unless the prompt actually mentions a cat.`,
    `- Colors are \`#RRGGBB\`. Do not use named colors.`,

    ``,
    `## Coverage principle (drives sprite count, scale, and asset choice)`,
    ``,
    `Before emitting layers, **parse the prompt into a noun list with`,
    `quantifiers**:`,
    `- Count each subject. "一桌子菜" implies one table + many dishes (≥5).`,
    `  "两个人" → 2. "一群鸟" → ≥6. "a forest" → many trees.`,
    `- Map each noun to the closest catalog asset; if a custom shape asset`,
    `  matches (e.g. \`bowl\` for dishes), prefer it over substitution.`,
    `- **Emit ≥ one sprite per counted unit**. If you would emit fewer`,
    `  sprites than the noun count, you are dropping the prompt.`,
    `- Named primary subjects get \`scale ≥ 0.9\` unless the prompt says`,
    `  "small", "tiny", "far", "distant", "小", "远".`,
    `- Subjects together fill ≥ 60% of the frame width; do not cluster`,
    `  everything in a thumb-sized region with empty background.`,
    `- The final plan should be *readable back* into the prompt: a viewer`,
    `  should be able to point at each noun.`,
    `- For prompts <= 6s, prefer a single shot. Longer prompts can use`,
    `  2–4 shots; the sum of shot durations should match the requested`,
    `  duration within ±5%.`,
    `- Choose high-contrast colors against the background.`,
    `- **Night scenes are dark scenes.** If the prompt contains "night",`,
    `  "moonlit", "starlit", "evening", "dusk", "夜", "月", "星", "晚":`,
    `    - Background MUST be dark (\`nebula\` with deep blues/purples, or`,
    `      \`gradient\` between #00–#30 luminance, or \`starfield\`).`,
    `    - Style MUST NOT be \`minimalist\` (cream palette breaks the mood).`,
    `      Prefer \`silhouette\`, \`noir\`, or omit \`style\` and use \`default\`.`,
    `    - Moon/star sprites use **bright** colors (#f9e9b8, #ffffff) to`,
    `      pop against the dark sky.`,
    `- **Day / sunlit / bright** scenes: use \`gradient\` from light tones`,
    `  or \`solid\` with warm color. \`minimalist\` works well here.`,
    `- **Indoor / interior / dining scenes**: if the prompt contains`,
    `  "indoor", "interior", "kitchen", "restaurant", "dining", "feast",`,
    `  "eat", "eating", "dinner", "lunch", "breakfast", "room", "桌", "餐",`,
    `  "厨房", "饭店", "家", "屋", "室内", "吃":`,
    `    - Background MUST be a warm \`gradient\` (e.g. from #3a2218 to`,
    `      #180c08 for dim warm interior, or from #f4d9a8 to #d8a368 for`,
    `      sunlit room). \`solid\` with a warm tone is also acceptable.`,
    `    - Style MUST NOT be \`minimalist\` (cream emptiness reads as`,
    `      "missing wall", not "cozy interior"). Prefer no style or`,
    `      \`default\`. \`noir\` works for moody dinner scenes.`,
    `    - Avoid bright pastel/cream backgrounds — the indoor mood is`,
    `      lost when the bg looks like an empty studio.`,
    ``,
    `## Composition (read carefully — this drives visual quality)`,
    ``,
    `Aim for **layered depth**: a typical good scene has 2–3 sprite layers`,
    `at different scales/y-positions to suggest near/mid/far. A single`,
    `sprite on a flat background looks barren — almost always add at least`,
    `one supporting element (a moon, mountain ridge, tree silhouette) plus`,
    `the main subject.`,
    ``,
    `- **Background first**: prefer \`nebula\` for night/space, \`gradient\``,
    `  for sky/sunset/dusk, \`starfield\` for outer space, \`solid\` only for`,
    `  truly minimal scenes. Avoid plain \`#000000\` solid unless prompt is`,
    `  explicitly void/empty.`,
    `- **Far layer** (large scale 1.5–3.0, low contrast color, low y):`,
    `  moon, planet, distant mountain. Sets the mood.`,
    `- **Mid layer** (scale 1.0–2.0, mid-ground y≈0.6-0.8):`,
    `  trees, mountain silhouettes for terrain/architecture stand-ins.`,
    `- **Near layer** (scale 0.5–1.0, foreground y≈0.5-0.7):`,
    `  the main subject (cat, spaceship, human). Usually animated.`,
    `- **Particles** add atmosphere cheaply — use \`snow\` for cold/winter,`,
    `  \`rain\` for melancholy/storm, \`sparks\` for fire/action, \`thrust\``,
    `  for rockets. Particles cover the whole shot; one is plenty.`,
    `- **Color contrast**: subject should be 30%+ luminance different from`,
    `  its background layer. Dark subject on bright bg or vice versa.`,
    ``,
    `## Soft heuristics`,
    ``,
    `- Action verbs ("flying", "passing", "rising", "walking") usually mean`,
    `  a sprite with motion keyframes from one off-screen edge to another,`,
    `  or across the frame.`,
    `- "Slow", "calm", "still" — fewer keyframes, smaller deltas.`,
    `- "Fast", "intense", "chaos" — more keyframes, larger deltas, add`,
    `  particles where it fits.`,
    `- Night / moonlit / starlit → \`silhouette\` or \`noir\` style + nebula`,
    `  background works well.`,
    `- Animals or characters (cat, human, superman) read best as dark`,
    `  silhouettes against a softer background.`,
    `- If the prompt mentions text or a slogan, add a text layer using`,
    `  \`fade-in\` (or \`crawl\` if it explicitly says "scrolling").`,
    `- Star Wars-style prompts: pick \`starwars\` style.`,
    `- When the catalog lacks an exact match (e.g., no "house" sprite for a`,
    `  rooftop), substitute the closest *visually similar* shape:`,
    `    - \`mountain\` for ridges, roofs, hills, pyramids.`,
    `    - \`tree\` for forests, parks, gardens.`,
    `    - \`star\` for sparks, fireflies, tiny lights.`,
    `    - \`moon\`/\`planet\` ONLY for actual celestial bodies.`,
    `  Never invent asset names.`,
    ``,
    `## When the catalog has no good match`,
    ``,
    `Some prompts describe specific objects the catalog cannot render`,
    `(food, furniture, vehicles, indoor scenes, faces, hands). **Do not**`,
    `force inappropriate sprites — \`planet\` is not a bowl, \`moon\` is not`,
    `a dumpling, \`spaceship\` is not a car. That looks broken, not stylized.`,
    ``,
    `Instead, reframe the prompt as a **suggestive outdoor/landscape**`,
    `scene that evokes the same mood with available sprites:`,
    `- "a bowl of hot noodles" → night street stall vibe: dark sky +`,
    `  silhouettes of trees + a warm-glow \`star\` (lantern stand-in) +`,
    `  optional \`cat\`. Title hints at the original intent.`,
    `- "a cup of coffee on a desk" → cozy dawn gradient + tree silhouette +`,
    `  warm color palette.`,
    `- "a car driving through the city" → road-trip silhouette: mountain`,
    `  range + moving \`star\` (headlight) across the frame.`,
    `Pick mood (warm/cozy, cold/lonely, vast/epic) and build with the`,
    `closest available shapes plus particles. The result will read as`,
    `atmospheric, not broken.`,
    ``,
    `If the operator has dropped a custom shape JSON into \`terpix-assets/\``,
    `(see README "shape assets"), its \`name\` appears in the catalog above;`,
    `prefer it over substitutions. Do not invent shape-asset names that are`,
    `not in the catalog — they will fail validation.`,
    ``,
    `## Faking missing particle kinds`,
    ``,
    `The only particle kinds are \`snow | rain | sparks | thrust\`. For`,
    `effects with no matching kind (steam, smoke, fog, breath, clouds,`,
    `bubbles, fire glow), do not pick a wrong kind — fake it with 2–3`,
    `instances of a round sprite (\`moon\`, \`planet\`, or \`star\`) tinted`,
    `to the right color, stacked at slightly different x/y, with opacity`,
    `keyframes staggered (e.g. peaks at tMs=1500, 3000, 4500) so the`,
    `cluster reads as continuous motion. Pair with a slow y-decrease for`,
    `rising (steam/smoke) or y-increase for falling (drips).`,
    FEW_SHOT_EXAMPLES,
  ].join('\n');
}
