import OpenAI from 'openai';
import type { ScenePlanT } from '../../core/dsl.js';
import { renderPreviewPng } from './render-preview.js';
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

const SYSTEM_PROMPT = `You are a strict art director reviewing a single frame
from a procedurally-rendered scene against the user's prompt. Tell the
artist what to fix.

Rules:
- The renderer is low-resolution (pixel-art style) — do not nitpick
  resolution, anti-aliasing, or fine detail.
- Focus on whether the rendered frame depicts what the prompt asks for:
    * Are all major nouns present and at sensible scale?
    * Is the composition coherent (no floating, no huge dead space)?
    * Does the background match the mood (indoor vs outdoor, day vs night)?
    * Is any text legible and meaningful, or pinyin gibberish / blank?
- Be specific and actionable. Bad: "the scene feels empty". Good: "the
  bowls are at scale ~0.5 and only cover the lower 30% of the frame; raise
  them to scale 0.9 or add more bowls across the table."
- If the frame is acceptable, respond with the single word PASS.
- Otherwise output a numbered list of at most 5 concrete fixes. Each fix
  starts with the failing aspect, then a concrete change. No prose.
`;

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
        { role: 'system', content: SYSTEM_PROMPT },
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
