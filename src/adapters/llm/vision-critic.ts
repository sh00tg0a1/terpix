import OpenAI from 'openai';
import type { ScenePlanT } from '../../core/dsl.js';
import { renderPreviewPng } from './render-preview.js';
import { catalogMarkdown } from './asset-catalog.js';
import { friendlyApiError } from './errors.js';

export interface VisionCriticOpts {
  apiKey: string;
  baseURL?: string;
  model: string;
  /** Canvas size for the preview render. Smaller = cheaper. */
  previewSize?: { w: number; h: number };
}

export interface VisionCritique {
  ok: boolean;
  /** Empty when ok = true. */
  issues: string[];
  /** Raw model text, for diagnostics. */
  raw: string;
}

// The vision model is a generic art director by default — left unconstrained
// it asks for craters on the moon, motion blur, volumetric lighting, added
// props, etc. None of that is achievable: terpix composites a fixed set of
// flat sprites over a parametric background. We MUST hand it the capability
// surface so its critique stays inside the lever set the planner can act on.
function buildSystemPrompt(renderer: 'half' | 'ascii'): string {
  const assets = catalogMarkdown({ renderer });
  const textRule =
    renderer === 'ascii'
      ? 'Text renders real characters (CJK ok).'
      : 'Text uses an ASCII-only bitmap font (A-Z 0-9 space .,!?); anything else draws blank.';

  return `You are a strict art director reviewing a single frame from a
procedurally-rendered scene against the user's prompt. The renderer is NOT a
general illustration tool — it can only do the things listed below. Critique
ONLY using levers the artist can actually pull; never request anything in the
"Cannot do" list.

## What the renderer CAN do (the only levers)
- Place sprites chosen from this fixed catalog (no other objects exist):
${assets}
- Per sprite: set scale, x/y position (0..1), color tint, opacity. Tile/scatter
  copies of one sprite for a crowd.
- Background: one of solid color / vertical|horizontal gradient / starfield /
  nebula — and pick its colors.
- Particles: snow, rain, sparks, thrust.
- Text blocks: size sm/md/lg, position, color. ${textRule}

## Cannot do — NEVER suggest these
- Adding detail to a sprite (craters, fur, windows, panels, shingles, vents).
- New objects/props not in the catalog above.
- Lighting, glow, shadows, reflections, motion blur, depth-of-field, 3D, fog
  volumes, or gradient shading inside a shape.
- Photorealism of any kind. The look is flat symbolic pixel-art by design.

## What to judge
- Are the prompt's major nouns present, mapped to a sensible catalog sprite,
  and at sensible scale (main subject not tiny)?
- Composition: no unwanted floating, no huge accidental dead space — BUT vast
  empty space is correct for "space/sky/minimalist" prompts; do not flag it.
- Does the background type + colors match the mood (indoor/outdoor, day/night)?
- Is text legible and meaningful (not blank, not pinyin gibberish)?

## Output
- Acceptable → respond with the single word PASS. Prefer PASS — only list a
  fix when it materially improves how the frame matches the prompt.
- Otherwise → a numbered list of at most 3 concrete fixes, highest-impact
  first, each phrased as a lever above (e.g. "raise cat scale to 0.9", "switch
  background to nebula with pink+blue", "move text to y=0.1"). No prose, no
  impossible asks.`;
}

function buildUserMessage(prompt: string): string {
  return (
    `Original prompt:\n  "${prompt}"\n\n` +
    `Below is one frame from the current plan. Critique it.`
  );
}

function parseCritique(raw: string): VisionCritique {
  const trimmed = raw.trim();
  if (/^PASS\b/i.test(trimmed)) return { ok: true, issues: [], raw: trimmed };
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
  // Accept numbered or bulleted lists.
  const issues = lines
    .filter((l) => /^(\d+[.)]|[-*•])\s+/.test(l))
    .map((l) => l.replace(/^(\d+[.)]|[-*•])\s+/, ''));
  // Fall back to "every non-empty line is an issue" if no list markers.
  const final = issues.length > 0 ? issues : lines;
  return { ok: final.length === 0, issues: final, raw: trimmed };
}

export async function visionCritiquePlan(
  prompt: string,
  plan: ScenePlanT,
  cfg: VisionCriticOpts,
): Promise<VisionCritique | { error: string }> {
  let png: Buffer;
  try {
    png = await renderPreviewPng(plan, cfg.previewSize ?? { w: 640, h: 360 });
  } catch (err) {
    return { error: `render-preview failed: ${(err as Error).message}` };
  }
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

  const client = new OpenAI({
    apiKey: cfg.apiKey,
    ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}),
  });

  let resp: Awaited<ReturnType<typeof client.chat.completions.create>>;
  try {
    resp = await client.chat.completions.create({
      model: cfg.model,
      max_tokens: 600,
      messages: [
        { role: 'system', content: buildSystemPrompt(plan.renderer) },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildUserMessage(prompt) },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });
  } catch (err) {
    return { error: friendlyApiError(err) };
  }

  const text = resp.choices?.[0]?.message?.content;
  const raw = typeof text === 'string' ? text : JSON.stringify(text);
  return parseCritique(raw ?? '');
}

export function formatVisionIssuesForRetry(c: VisionCritique): string {
  if (c.ok) return '';
  return c.issues.map((s, i) => `(V${i + 1}) ${s}`).join('\n');
}
