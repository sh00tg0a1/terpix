import { z } from 'zod';

export const HexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

export const Vec2 = z.object({ x: z.number(), y: z.number() });

export const Keyframe = z.object({
  tMs: z.number().nonnegative(),
  x: z.number().optional(),
  y: z.number().optional(),
  scale: z.number().optional(),
  rotation: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  // Position into the scene's depth, 0 = nearest (front), 1 = farthest
  // (back). Only meaningful when the plan's `camera.projection` is "iso":
  // deeper sprites recede up the frame, shrink, and dim. Ignored in flat
  // projection, so omitting it preserves classic 2D behavior.
  depth: z.number().min(0).max(1).optional(),
});

export const Ease = z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']).default('linear');

export const Background = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solid'), color: HexColor }),
  z.object({
    type: z.literal('gradient'),
    from: HexColor,
    to: HexColor,
    direction: z.enum(['vertical', 'horizontal']).default('vertical'),
  }),
  z.object({
    type: z.literal('starfield'),
    density: z.number().min(0).max(1).default(0.01),
    seed: z.number().int().default(1),
  }),
  z.object({
    type: z.literal('nebula'),
    colorA: HexColor.default('#220044'),
    colorB: HexColor.default('#aa44ff'),
    scale: z.number().positive().default(0.02),
    seed: z.number().int().default(1),
  }),
]);

export const SpriteAsset = z.string().min(1);

export const Layer = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('sprite'),
    asset: SpriteAsset,
    color: HexColor.optional(),
    keyframes: z.array(Keyframe).min(1),
    ease: Ease,
  }),
  z.object({
    type: z.literal('text'),
    content: z.string().min(1).max(500),
    style: z.enum(['static', 'crawl', 'typewriter', 'fade-in']).default('static'),
    color: HexColor.default('#ffdd44'),
    size: z.enum(['sm', 'md', 'lg']).default('md'),
    position: Vec2.default({ x: 0.5, y: 0.5 }),
  }),
  z.object({
    type: z.literal('particles'),
    kind: z.enum(['snow', 'rain', 'sparks', 'thrust']),
    count: z.number().int().positive().default(60),
    origin: Vec2.optional(),
    seed: z.number().int().default(1),
  }),
  // Emit `count` copies of one asset tiled along the line from
  // (area.x0,area.y0) to (area.x1,area.y1), with deterministic jitter.
  // One node guarantees the count instead of relying on the LLM to hand-
  // write N near-identical sprite layers (the cause of dropped subjects).
  z.object({
    type: z.literal('scatter'),
    asset: SpriteAsset,
    color: HexColor.optional(),
    count: z.number().int().min(1).max(64),
    area: z
      .object({
        x0: z.number().default(0.12),
        y0: z.number().default(0.7),
        x1: z.number().default(0.88),
        y1: z.number().default(0.7),
      })
      .default({ x0: 0.12, y0: 0.7, x1: 0.88, y1: 0.7 }),
    scale: z.number().positive().default(1),
    scaleJitter: z.number().min(0).max(1).default(0.15),
    // Floor depth at the two ends of `area`; instances interpolate between
    // them. With an iso camera this tilts the scattered row into the frame
    // (front dishes lower+bigger, back dishes higher+smaller). Flat: ignored.
    depth0: z.number().min(0).max(1).default(0),
    depth1: z.number().min(0).max(1).default(0),
    seed: z.number().int().default(1),
  }),
]);

// Optional camera. `iso` turns on a pseudo-isometric (3/4) depth projection:
// a layer's `depth` lifts it up the frame, scales it down, and dims it, so
// scenes read with front-to-back recession. `tilt` controls how strong the
// recession is. Default (absent / flat) keeps the classic 2D compositor.
export const Camera = z.object({
  projection: z.enum(['flat', 'iso']).default('flat'),
  tilt: z.number().min(0).max(1).default(0.5),
});

export const Shot = z.object({
  id: z.string().min(1),
  durationMs: z.number().positive(),
  background: Background,
  layers: z.array(Layer).default([]),
});

export const StylePresetName = z.enum([
  'default',
  'starwars',
  'minimalist',
  'silhouette',
  'noir',
  'lineart',
]);

export const Renderer = z.enum(['half', 'ascii']).default('half');

export const ScenePlan = z.object({
  version: z.literal(1),
  title: z.string().default(''),
  fps: z.number().int().positive().default(24),
  size: z
    .object({ w: z.number().int().positive(), h: z.number().int().positive() })
    .optional(),
  style: StylePresetName.optional(),
  camera: Camera.optional(),
  renderer: Renderer,
  shots: z.array(Shot).min(1),
});

export type ScenePlanT = z.infer<typeof ScenePlan>;
export type ShotT = z.infer<typeof Shot>;
export type LayerT = z.infer<typeof Layer>;
export type KeyframeT = z.infer<typeof Keyframe>;
export type BackgroundT = z.infer<typeof Background>;
export type CameraT = z.infer<typeof Camera>;
