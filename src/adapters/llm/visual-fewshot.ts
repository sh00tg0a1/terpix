import type { ScenePlanT } from '../../core/dsl.js';
import { renderPreviewPng } from './render-preview.js';

// Reference scenes shown to a vision-capable planner BEFORE it generates.
// Each pairs a rendered frame with the JSON that produced it so the model
// learns the visual→DSL mapping (scale, spread, layered depth) instead of
// guessing. Plans use ONLY built-in assets so the references render
// identically in any install (no dependency on user shape assets).
interface Reference {
  caption: string;
  plan: ScenePlanT;
}

const REFERENCES: Reference[] = [
  {
    caption:
      'GOOD multi-subject / spread scene. Note: 5 trees TILED across the ' +
      'full width at varied x (0.12→0.88), scale ~1.6-2.2, all resting near ' +
      'the horizon (y≈0.8); the scene fills the frame instead of clustering ' +
      'in the center. This is how to handle "a forest", "a crowd", "many X".',
    plan: {
      version: 1,
      title: 'forest',
      fps: 12,
      renderer: 'half',
      shots: [
        {
          id: 's',
          durationMs: 1000,
          background: { type: 'gradient', from: '#2a2238', to: '#7a6a8a', direction: 'vertical' },
          layers: [
            { type: 'sprite', asset: 'tree', color: '#101018', ease: 'linear', keyframes: [{ tMs: 0, x: 0.12, y: 0.82, scale: 1.6 }] },
            { type: 'sprite', asset: 'tree', color: '#181820', ease: 'linear', keyframes: [{ tMs: 0, x: 0.33, y: 0.84, scale: 2.1 }] },
            { type: 'sprite', asset: 'tree', color: '#15151c', ease: 'linear', keyframes: [{ tMs: 0, x: 0.52, y: 0.8, scale: 1.8 }] },
            { type: 'sprite', asset: 'tree', color: '#202028', ease: 'linear', keyframes: [{ tMs: 0, x: 0.7, y: 0.85, scale: 2.2 }] },
            { type: 'sprite', asset: 'tree', color: '#12121a', ease: 'linear', keyframes: [{ tMs: 0, x: 0.88, y: 0.81, scale: 1.7 }] },
          ],
        },
      ],
    },
  },
  {
    caption:
      'GOOD single-subject scene with layered depth. Note: a large backdrop ' +
      '(planet, scale 2.6, low y) sets the mood, the main subject (spaceship, ' +
      'scale 0.8) crosses in front. Two layers, not one; subject is large ' +
      'enough to read. This is how to handle "a lone X", "one Y".',
    plan: {
      version: 1,
      title: 'cruise',
      fps: 12,
      renderer: 'half',
      shots: [
        {
          id: 's',
          durationMs: 1000,
          background: { type: 'nebula', colorA: '#1a0033', colorB: '#3344aa', scale: 0.015, seed: 11 },
          layers: [
            { type: 'sprite', asset: 'planet', color: '#cc3322', ease: 'linear', keyframes: [{ tMs: 0, x: 0.78, y: 0.5, scale: 2.6 }] },
            { type: 'sprite', asset: 'spaceship', color: '#dddddd', ease: 'linear', keyframes: [{ tMs: 0, x: 0.4, y: 0.45, scale: 0.9 }] },
          ],
        },
      ],
    },
  },
];

// OpenAI chat content-part shape (text or image). Kept local to avoid a hard
// dependency on the SDK's exported types.
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

let cached: ContentPart[] | undefined;

/**
 * Build the multimodal few-shot content parts (rendered reference frames +
 * their JSON). Cached for the process lifetime — the references are static.
 * Returns [] if rendering fails (degrade gracefully to text-only prompting).
 */
export async function buildVisualFewShot(): Promise<ContentPart[]> {
  if (cached) return cached;
  const parts: ContentPart[] = [
    {
      type: 'text',
      text:
        'Before the real task, study these reference frames. Each image is a ' +
        'rendered frame and the JSON below it is the plan that produced it. ' +
        'Match this level of scale, spread, and layered depth in your output.',
    },
  ];
  try {
    for (const ref of REFERENCES) {
      const png = await renderPreviewPng(ref.plan, { w: 480, h: 270, shotFraction: 0.5 });
      const url = `data:image/png;base64,${png.toString('base64')}`;
      parts.push({ type: 'image_url', image_url: { url } });
      parts.push({
        type: 'text',
        text: `${ref.caption}\nJSON:\n${JSON.stringify(ref.plan)}`,
      });
    }
  } catch {
    return [];
  }
  cached = parts;
  return parts;
}
