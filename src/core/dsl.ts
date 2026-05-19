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

export const SpriteAsset = z.enum(['spaceship', 'planet', 'moon', 'star', 'mountain', 'tree']);

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
]);

export const Shot = z.object({
  id: z.string().min(1),
  durationMs: z.number().positive(),
  background: Background,
  layers: z.array(Layer).default([]),
});

export const ScenePlan = z.object({
  version: z.literal(1),
  title: z.string().default(''),
  fps: z.number().int().positive().default(24),
  size: z
    .object({ w: z.number().int().positive(), h: z.number().int().positive() })
    .optional(),
  shots: z.array(Shot).min(1),
});

export type ScenePlanT = z.infer<typeof ScenePlan>;
export type ShotT = z.infer<typeof Shot>;
export type LayerT = z.infer<typeof Layer>;
export type KeyframeT = z.infer<typeof Keyframe>;
export type BackgroundT = z.infer<typeof Background>;
