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
    `- \`text\` — uppercase ASCII (A-Z 0-9 .,!?). Styles: \`static\`,`,
    `  \`crawl\` (scrolls up over the full shot), \`typewriter\`, \`fade-in\`.`,
    `  Sizes: \`sm\`, \`md\`, \`lg\`. \`position\` is the *center* of the text.`,
    `- \`particles\` — kinds: snow, rain, sparks, thrust. Optional origin.`,
    ``,
    `## Available sprites (registry-derived; pick by exact name)`,
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
    `- Use **exact** asset names from the catalog. Do not invent names.`,
    `- Colors are \`#RRGGBB\`. Do not use named colors.`,
    `- Per shot: maximum **3 sprite layers** + 1 text + 1 particles.`,
    `  Char-cinema resolution is low — fewer elements read better.`,
    `- For prompts <= 6s, prefer a single shot. Longer prompts can use`,
    `  2–4 shots; the sum of shot durations should match the requested`,
    `  duration within ±5%.`,
    `- Choose high-contrast colors against the background.`,
    ``,
    `## Soft heuristics`,
    ``,
    `- Action verbs ("flying", "passing", "rising") usually mean a`,
    `  sprite with motion keyframes from one off-screen edge to another.`,
    `- "Slow", "calm", "still" — fewer keyframes, smaller deltas.`,
    `- "Fast", "intense", "chaos" — more keyframes, larger deltas, add`,
    `  particles where it fits.`,
    `- If the prompt mentions text or a slogan, add a text layer using`,
    `  \`fade-in\` (or \`crawl\` if it explicitly says "scrolling").`,
    `- Star Wars-style prompts: pick \`starwars\` style.`,
    FEW_SHOT_EXAMPLES,
  ].join('\n');
}
