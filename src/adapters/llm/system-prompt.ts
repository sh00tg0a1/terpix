import { catalogMarkdown } from './asset-catalog.js';

export interface PromptOpts {
  renderer?: 'half' | 'ascii';
  /**
   * The user's NL prompt. When provided, the builder injects only the
   * scene-specific rule blocks that match (night, indoor, crowd, text, …)
   * instead of dumping every rule every time — keeps the prompt focused so
   * weaker models attend to what matters. Omit to get all blocks.
   */
  prompt?: string;
}

interface SceneFlags {
  night: boolean;
  indoor: boolean;
  day: boolean;
  crowd: boolean;
  text: boolean;
}

function detectScene(prompt: string | undefined): SceneFlags {
  // No prompt → include everything (all flags true) so nothing is lost.
  if (!prompt) return { night: true, indoor: true, day: true, crowd: true, text: true };
  return {
    night: /\b(night|moonlit|starlit|evening|dusk|midnight)\b|夜|月|星|晚/i.test(prompt),
    indoor:
      /\b(indoor|interior|kitchen|restaurant|dining|feast|eat|eating|dinner|lunch|breakfast|room|cafe|bar|table)\b|桌|餐|厨房|饭店|家|屋|室内|吃/i.test(
        prompt,
      ),
    day: /\b(day|sunlit|bright|sunrise|sunset|noon|morning|afternoon|daylight)\b|白天|阳光|日出|日落|早晨|中午/i.test(
      prompt,
    ),
    crowd:
      /\b(many|several|crowd|group|flock|fleet|forest|bunch|row of|pile of|lots of|set of|two|three|four|five|\d+)\b|桌|群|众|排|堆|一桌|一片|一群|一排|两|三|四|五|多/i.test(
        prompt,
      ),
    // quotes, speech verbs, or explicit text/title/slogan asks
    text: /["'“”「」『』]|说|喊|写|字|标题|slogan|title|caption|says?\b|text\b|sign\b|label\b/i.test(
      prompt,
    ),
  };
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
  const scene = detectScene(opts.prompt);
  const blocks: string[] = [];

  // ---- CORE (always present) -------------------------------------------
  blocks.push(
    [
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
      `- Negative or >1 coordinates are allowed for off-screen entry/exit.`,
      `- All times are integer milliseconds. \`tMs\` in keyframes is relative`,
      `  to the start of its enclosing shot.`,
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
      `- \`text\` — **uppercase ASCII only** (A-Z 0-9 space \`.,!?\`); other`,
      `  characters render blank. Styles: static, crawl, typewriter, fade-in.`,
      `  Sizes: sm, md, lg. (See text rules below if your scene has text.)`,
      `- \`particles\` — kinds: snow, rain, sparks, thrust. Optional origin.`,
      ``,
      `## Sprite scale, aspect, and anchor (math for layout)`,
      ``,
      `\`size = scale × 0.20 × min(canvas_w, canvas_h)\` is the sprite's`,
      `**LONGER edge** in pixels. shorter edge = size × min(aspect, 1/aspect).`,
      `If aspect>1 the longer edge is width; if aspect<1 it is height.`,
      `On 16:9 (min=720): scale=1.0 → longer edge ≈ 144px ≈ **20% of frame**.`,
      `- Square sprite (aspect 1) @ scale 1.0 ≈ 11% width × 20% height.`,
      `- **TALL sprites are short at scale 1.** \`human\` (aspect 0.45) @`,
      `  scale 1.0 is only ~20% of frame HEIGHT — knee-high. A person at a`,
      `  table should be **scale ~2.5–3** (≈45–55% height). NEVER leave`,
      `  people at scale ~1; they shrink to nothing next to furniture.`,
      `- To fill ~60% width, tile 4–6 instances at scale ~1 rather than`,
      `  scaling one sprite past 3 (big single sprites look blocky).`,
      `- Keep related subjects proportionate: a person (\`human\`) should be`,
      `  clearly taller than a \`bowl\` or \`table\` it stands beside — give`,
      `  the human ~2× the prop's scale.`,
      ``,
      `**Anchor**: \`center\` → y is the sprite's middle (planets, ships).`,
      `\`bottom\` → ground-resting; place near the horizon (y≈0.72..0.8), not`,
      `floating in the sky.`,
      ``,
      `## Available sprites (pick by exact name; aspect = W:H at scale=1)`,
      ``,
      catalogMarkdown({ renderer }),
      ``,
      `## Visual style (optional top-level \`style\`)`,
      `- \`default\` — full color. Vivid space, fantasy.`,
      `- \`starwars\` — duotone black + yellow, forces black bg. Sci-fi epic.`,
      `- \`minimalist\` — duotone cream + dark-grey. Calm, contemplative.`,
      `- \`silhouette\` — duotone dusk-yellow + ink-black. Poster-like.`,
      `- \`noir\` — full color with dark bg override. Moody.`,
      ``,
      `## Hard rules`,
      `- \`version\` is always \`1\`. \`renderer\` should be "${renderer}".`,
      `- Use **exact** asset names from the catalog. Do not invent names or`,
      `  use names absent from it (e.g. \`droid\` is ascii-only).`,
      `- For people / a crowd, use the \`human\` sprite — not \`cat\` (unless`,
      `  the prompt actually mentions a cat).`,
      `- Colors are \`#RRGGBB\`. No named colors.`,
      `- For prompts ≤ 6s prefer one shot; longer can use 2–4 shots summing`,
      `  to the requested duration ±5%.`,
      ``,
      `## Coverage principle (sprite count, scale, asset choice)`,
      `Parse the prompt into a noun list with quantifiers:`,
      `- Count each subject. "一桌子菜" → many dishes (≥5). "两个人" → 2.`,
      `  "一群鸟" → ≥6. "a forest" → many trees.`,
      `- Map each noun to the closest catalog asset; prefer a matching custom`,
      `  shape asset (e.g. \`bowl\`) over substitution.`,
      `- **Emit ≥ one sprite per counted unit.** Fewer = dropping the prompt.`,
      `- Named primary subjects get \`scale ≥ 0.9\` unless the prompt says`,
      `  small/tiny/far/小/远.`,
      `- Subjects together fill ≥ 60% of frame width; never cluster into a`,
      `  thumb-sized region with empty background.`,
      `- The plan should be *readable back* into the prompt — a viewer should`,
      `  point at each noun.`,
      ``,
      `## Composition (layered depth)`,
      `- **Background first**: \`nebula\` for night/space, \`gradient\` for`,
      `  sky/dusk, \`starfield\` for space, \`solid\` only for minimal scenes.`,
      `- **Far** (scale 1.5–3.0, low y): moon, planet, distant mountain.`,
      `- **Mid** (scale 1.0–2.0, y≈0.6-0.8): trees, mountain silhouettes.`,
      `- **Near** (scale 0.9–1.5, y≈0.6-0.8): the main subject; often animated.`,
      `- **Particles** add atmosphere: snow/rain/sparks/thrust. One is plenty.`,
      `- **Contrast**: subject 30%+ luminance from its background.`,
    ].join('\n'),
  );

  // ---- CONDITIONAL blocks (only when the scene needs them) -------------
  if (scene.text) {
    blocks.push(
      [
        `## Text rules (this prompt involves text)`,
        `- For non-English text, **TRANSLATE to natural English, do NOT`,
        `  transliterate to pinyin** (e.g. "真好吃" → "SO GOOD", NOT "ZHEN HAO`,
        `  CHI"). Pinyin helps no one. If you cannot translate, omit it.`,
        `- \`position\` is the *center* of the block; block height is`,
        `  SIZE_FRAC × bufferH (sm=10%, md=20%, lg=32%). Keep on-screen with`,
        `  margin ≥ half block: lg → y ∈ [0.18,0.82], md → [0.12,0.88],`,
        `  sm → [0.06,0.94].`,
        `- A title alongside ≥2 sprite subjects should be size \`sm\` (\`md\``,
        `  at most) — a big title swallows the frame.`,
        `- \`crawl\` needs a long shot (≥12000 ms, ~1.5 s/line); lines ≤32`,
        `  chars, block ≤8 lines. Otherwise use \`fade-in\`.`,
      ].join('\n'),
    );
  }
  if (scene.night) {
    blocks.push(
      [
        `## Night scene (this prompt is night/dark)`,
        `- Background MUST be dark: \`nebula\` (deep blues/purples), \`gradient\``,
        `  between #00–#30 luminance, or \`starfield\`.`,
        `- Style MUST NOT be \`minimalist\`. Prefer \`silhouette\`, \`noir\`, or`,
        `  omit style.`,
        `- Moon/star sprites use bright colors (#f9e9b8, #ffffff) to pop.`,
      ].join('\n'),
    );
  }
  if (scene.indoor) {
    blocks.push(
      [
        `## Indoor / dining scene (this prompt is interior)`,
        `- Background MUST be a warm \`gradient\` (dim interior #3a2218→#180c08,`,
        `  or sunlit room #f4d9a8→#d8a368). Warm \`solid\` is OK.`,
        `- Style MUST NOT be \`minimalist\` (cream reads as empty studio). Use`,
        `  no style, \`default\`, or \`noir\` for moody dinners.`,
        `- For "around a table" scenes, add a \`table\` sprite (wide, scale`,
        `  ~3, y≈0.78) as the centerpiece, rest food (\`bowl\`) just above its`,
        `  top edge (y≈0.7), and place people (\`human\`) flanking it.`,
      ].join('\n'),
    );
  }
  if (scene.day && !scene.night) {
    blocks.push(
      [
        `## Day / bright scene`,
        `- Use \`gradient\` from light tones or warm \`solid\`. \`minimalist\``,
        `  works well. Avoid dark backgrounds.`,
      ].join('\n'),
    );
  }
  if (scene.crowd) {
    blocks.push(
      [
        `## Crowd / spread (this prompt has multiple subjects)`,
        `- Tile the repeated asset across x ∈ [0.12, 0.88] with small y (±0.05)`,
        `  and scale (±0.15) variation so the group looks natural.`,
        `- 5–8 instances is typical for "many / 群 / 一桌". Do NOT emit a single`,
        `  small instance for a plural prompt.`,
      ].join('\n'),
    );
  }

  // ---- Always-on fallbacks + few-shot ----------------------------------
  blocks.push(
    [
      `## When the catalog has no good match`,
      `Some prompts name objects the catalog cannot render (food, furniture,`,
      `vehicles, faces). Do not force a wildly wrong sprite (\`planet\` is not`,
      `a bowl). Either use a matching custom shape asset if one is in the`,
      `catalog, or reframe as a suggestive scene with the closest shapes:`,
      `\`mountain\` for ridges/roofs/hills, \`tree\` for forests/parks, \`star\``,
      `for sparks/lights, \`moon\`/\`planet\` only for celestial bodies.`,
      ``,
      `## Faking missing particle kinds`,
      `Only snow/rain/sparks/thrust exist. For steam/smoke/fog/clouds, fake`,
      `it with 2–3 round sprites (\`moon\`/\`planet\`/\`star\`) tinted right,`,
      `stacked at varied x/y, opacity keyframes staggered (peaks at tMs`,
      `1500/3000/4500), with a slow y-decrease (rising) or y-increase (falling).`,
    ].join('\n'),
  );
  blocks.push(FEW_SHOT_EXAMPLES);

  return blocks.join('\n\n');
}
