import { z } from 'zod';
import { HexColor, Background, Renderer, StylePresetName } from '../dsl.js';

/**
 * Scene v2 — a RELATIONAL scene description. Instead of pinning every element
 * to an absolute (x, y), a node declares WHERE-RELATIVE: inside a region,
 * on another node's named point, or (escape hatch) at an absolute spot.
 * `compileScene` resolves this to a v1 ScenePlan (absolute layers / `on`),
 * which the existing renderer draws unchanged. Relations are the primitive;
 * coordinates are an output, not an input.
 */

export const Align = z
  .enum([
    'center', 'top', 'bottom', 'left', 'right',
    'top-left', 'top-right', 'bottom-left', 'bottom-right',
  ])
  .default('center');

// How a node is positioned. Pick ONE anchor mode (in / on / at); dx,dy nudge
// it as a fraction of the frame. Unknown/empty → centered in the frame.
export const Place = z
  .object({
    // Place inside a named region (frame, ground, sky, center, or a custom one
    // from scene.regions), at an alignment within it.
    in: z.string().optional(),
    align: Align.optional(),
    // Place ON another node's named point: "nodeId" or "nodeId.point"
    // (e.g. "table.surface", "mountain.peak"). Resolved by the renderer's
    // relational placement, so the child rests on the target wherever it lands.
    on: z.string().optional(),
    // Absolute escape hatch (0..1 of the frame).
    at: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
    dx: z.number().default(0),
    dy: z.number().default(0),
  })
  .default({});

// Lay `repeat` copies out. `row`/`column` evenly space them; `gap` is the
// spacing as a fraction of the frame (row) or of the surface (when on a target).
export const Distribute = z
  .object({
    layout: z.enum(['row', 'column']).default('row'),
    gap: z.number().min(0).max(1).default(0.16),
  })
  .optional();

const base = {
  id: z.string().min(1).optional(),
  scale: z.number().positive().default(1),
  color: HexColor.optional(),
  place: Place,
  repeat: z.number().int().min(1).max(64).default(1),
  distribute: Distribute,
};

export const Node = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sprite'), asset: z.string().min(1), ...base }),
  z.object({
    kind: z.literal('text'),
    content: z.string().min(1).max(500),
    size: z.enum(['sm', 'md', 'lg']).default('md'),
    ...base,
  }),
  z.object({
    kind: z.literal('particles'),
    particle: z.enum(['snow', 'rain', 'sparks', 'thrust']),
    count: z.number().int().positive().default(60),
    ...base,
  }),
]);

export const Rect = z.object({
  x0: z.number().min(0).max(1),
  y0: z.number().min(0).max(1),
  x1: z.number().min(0).max(1),
  y1: z.number().min(0).max(1),
});

export const Scene2 = z.object({
  version: z.literal(2),
  title: z.string().default(''),
  fps: z.number().int().positive().default(24),
  durationMs: z.number().positive().default(5000),
  renderer: Renderer,
  style: StylePresetName.optional(),
  background: Background,
  // Optional custom regions, merged over the built-in frame/ground/sky/center.
  regions: z.record(z.string(), Rect).optional(),
  // Painted in order = back-to-front (z-order), same as v1 layers.
  nodes: z.array(Node).min(1),
});

export type Scene2T = z.infer<typeof Scene2>;
export type NodeT = z.infer<typeof Node>;
export type PlaceT = z.infer<typeof Place>;
export type RectT = z.infer<typeof Rect>;
