import { ScenePlan, type ScenePlanT } from '../dsl.js';
import { getAsset } from '../assets/registry.js';
import type { Scene2T, BeatT, NodeT, RectT } from './schema.js';

// Per-beat context the emitters need: how regions resolve and how long the
// beat runs (for motion end keyframes).
interface BeatCtx {
  regions?: Record<string, RectT>;
  durationMs: number;
}

// Drop sprite layers whose asset is not in the registry. A model may emit a
// hallucinated asset name despite the schema enum; without this the renderer
// throws on the unknown asset. Call AFTER compile, once assets are registered
// (so it stays out of the pure compiler and its tests). Shared by all planner
// adapters.
export function dropUnregisteredSprites(plan: ScenePlanT): number {
  let dropped = 0;
  for (const shot of plan.shots) {
    const before = shot.layers.length;
    shot.layers = shot.layers.filter((l) => l.type !== 'sprite' || getAsset(l.asset) !== undefined);
    dropped += before - shot.layers.length;
  }
  return dropped;
}

// Built-in regions (fractions of the frame). Custom regions from the scene
// override these by name.
const DEFAULT_REGIONS: Record<string, RectT> = {
  frame: { x0: 0, y0: 0, x1: 1, y1: 1 },
  sky: { x0: 0.05, y0: 0.06, x1: 0.95, y1: 0.42 },
  ground: { x0: 0.06, y0: 0.62, x1: 0.94, y1: 0.9 },
  center: { x0: 0.22, y0: 0.32, x1: 0.78, y1: 0.68 },
};

function regionRect(regions: Record<string, RectT> | undefined, name: string): RectT {
  return regions?.[name] ?? DEFAULT_REGIONS[name] ?? DEFAULT_REGIONS.frame!;
}

// A point inside a region for a given alignment, slightly inset from edges.
function alignPoint(r: RectT, align: string): { x: number; y: number } {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const cx = r.x0 + w / 2;
  const cy = r.y0 + h / 2;
  const left = r.x0 + w * 0.14;
  const right = r.x1 - w * 0.14;
  const top = r.y0 + h * 0.16;
  const bottom = r.y1 - h * 0.1;
  switch (align) {
    case 'top': return { x: cx, y: top };
    case 'bottom': return { x: cx, y: bottom };
    case 'left': return { x: left, y: cy };
    case 'right': return { x: right, y: cy };
    case 'top-left': return { x: left, y: top };
    case 'top-right': return { x: right, y: top };
    case 'bottom-left': return { x: left, y: bottom };
    case 'bottom-right': return { x: right, y: bottom };
    default: return { x: cx, y: cy };
  }
}

// "table.surface" -> { id: "table", at: "surface" }; "table" -> { id }
function parseOn(ref: string): { id: string; at?: string } {
  const dot = ref.indexOf('.');
  return dot < 0 ? { id: ref } : { id: ref.slice(0, dot), at: ref.slice(dot + 1) };
}

// Evenly-spaced offsets for `n` copies, centered on 0, total span ≈ step*(n-1).
function spread(n: number, step: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((i - (n - 1) / 2) * step);
  return out;
}

// A motion's travel as start/end points (0..1, off-frame allowed) around a
// base (bx, by). `perp` is the axis to spread `repeat` copies along (the one
// the motion does NOT primarily travel), so a row of movers fans out instead
// of stacking. Supports 4 cardinal + 4 diagonal directions.
type MotionKind = 'cross' | 'enter' | 'exit' | 'rise' | 'fall' | 'drift';
type MotionDir =
  | 'left' | 'right' | 'up' | 'down'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const LO = -0.2;
const HI = 1.2;

// A direction's "edge anchor" point: a midpoint on an edge for cardinals, a
// corner for diagonals. Used as the off-frame source/sink for enter/exit/cross.
function edgePoint(dir: MotionDir, bx: number, by: number): { x: number; y: number } {
  switch (dir) {
    case 'left': return { x: LO, y: by };
    case 'right': return { x: HI, y: by };
    case 'up': return { x: bx, y: LO };
    case 'down': return { x: bx, y: HI };
    case 'top-left': return { x: LO, y: LO };
    case 'top-right': return { x: HI, y: LO };
    case 'bottom-left': return { x: LO, y: HI };
    case 'bottom-right': return { x: HI, y: HI };
  }
}

function oppositeDir(dir: MotionDir): MotionDir {
  switch (dir) {
    case 'left': return 'right';
    case 'right': return 'left';
    case 'up': return 'down';
    case 'down': return 'up';
    case 'top-left': return 'bottom-right';
    case 'top-right': return 'bottom-left';
    case 'bottom-left': return 'top-right';
    case 'bottom-right': return 'top-left';
  }
}

// Pick the perpendicular axis for fanning out `repeat` copies. Purely
// horizontal motion (left/right) → fan on y. Vertical motion → fan on x.
// Diagonals get whichever axis has the larger travel delta (or default x).
function perpAxis(dir: MotionDir): 'x' | 'y' {
  if (dir === 'left' || dir === 'right') return 'y';
  if (dir === 'up' || dir === 'down') return 'x';
  return 'x';
}

function motionPath(
  kind: MotionKind,
  dirRaw: MotionDir | undefined,
  bx: number,
  by: number,
): { sx: number; sy: number; ex: number; ey: number; perp: 'x' | 'y' } {
  switch (kind) {
    case 'cross': {
      const dir: MotionDir = dirRaw ?? 'right';
      // Travel FROM opposite edge/corner TO the dir's edge/corner (so dir
      // names where the sprite is GOING).
      const start = edgePoint(oppositeDir(dir), bx, by);
      const end = edgePoint(dir, bx, by);
      return { sx: start.x, sy: start.y, ex: end.x, ey: end.y, perp: perpAxis(dir) };
    }
    case 'enter': {
      // From the named edge/corner to the base position.
      const dir: MotionDir = dirRaw ?? 'left';
      const start = edgePoint(dir, bx, by);
      return { sx: start.x, sy: start.y, ex: bx, ey: by, perp: perpAxis(dir) };
    }
    case 'exit': {
      const dir: MotionDir = dirRaw ?? 'right';
      const end = edgePoint(dir, bx, by);
      return { sx: bx, sy: by, ex: end.x, ey: end.y, perp: perpAxis(dir) };
    }
    case 'rise':
      return { sx: bx, sy: by + 0.18, ex: bx, ey: by - 0.18, perp: 'x' };
    case 'fall':
      return { sx: bx, sy: by - 0.18, ex: bx, ey: by + 0.18, perp: 'x' };
    case 'drift': {
      const dir: MotionDir = dirRaw ?? 'right';
      const d = 0.12;
      // Nudge by a small step in the dir's vector.
      const e = edgePoint(dir, 0, 0); // unit-ish offset relative to (0,0)
      // Normalize: cardinals → (±1, 0) or (0, ±1); diagonals → (±1, ±1).
      // edgePoint returned in our LO/HI scale; reduce to sign.
      const sgnX = e.x > 0 ? 1 : e.x < 0 ? -1 : 0;
      const sgnY = e.y > 0 ? 1 : e.y < 0 ? -1 : 0;
      return { sx: bx, sy: by, ex: bx + sgnX * d, ey: by + sgnY * d, perp: perpAxis(dir) };
    }
  }
}

function emitSprite(node: Extract<NodeT, { kind: 'sprite' }>, ctx: BeatCtx): unknown[] {
  const n = node.repeat;
  const single = n === 1;

  if (node.place.on) {
    // On a target's named point; spread copies as dx across the surface
    // (dx is a fraction of the target half-width, so keep within ~[-0.85,0.85]).
    const { id, at } = parseOn(node.place.on);
    const step = n > 1 ? Math.min(1.7 / (n - 1), 0.42) : 0;
    return spread(n, step).map((d) => ({
      type: 'sprite',
      asset: node.asset,
      ...(node.color ? { color: node.color } : {}),
      ...(node.id && single ? { id: node.id } : {}),
      ease: 'linear',
      on: {
        layer: id,
        ...(at ? { at } : {}),
        dx: (node.place.dx ?? 0) + d,
        dy: node.place.dy ?? 0,
      },
      keyframes: [{ tMs: 0, scale: node.scale, ...depthKf(node) }],
    }));
  }

  // region / absolute -> concrete x,y, then distribute
  let bx: number;
  let by: number;
  if (node.place.at) {
    bx = node.place.at.x;
    by = node.place.at.y;
  } else {
    const p = alignPoint(regionRect(ctx.regions, node.place.in ?? 'frame'), node.place.align ?? 'center');
    bx = p.x;
    by = p.y;
  }
  bx += node.place.dx ?? 0;
  by += node.place.dy ?? 0;

  // Animated: travel from start→end (two keyframes). Copies fan out along the
  // axis the motion doesn't travel so a repeated mover doesn't stack.
  if (node.motion) {
    const p = motionPath(node.motion.kind, node.motion.dir, bx, by);
    const offs = spread(n, node.distribute?.gap ?? 0.16);
    return offs.map((o) => {
      const sx = p.perp === 'x' ? p.sx + o : p.sx;
      const sy = p.perp === 'y' ? p.sy + o : p.sy;
      const ex = p.perp === 'x' ? p.ex + o : p.ex;
      const ey = p.perp === 'y' ? p.ey + o : p.ey;
      return {
        type: 'sprite',
        asset: node.asset,
        ...(node.color ? { color: node.color } : {}),
        ...(node.id && single ? { id: node.id } : {}),
        ease: node.motion!.ease,
        keyframes: [
          { tMs: 0, x: sx, y: sy, scale: node.scale, ...depthKf(node) },
          { tMs: ctx.durationMs, x: ex, y: ey, scale: node.scale, ...depthKf(node) },
        ],
      };
    });
  }

  const layout = node.distribute?.layout ?? 'row';
  const offs = spread(n, node.distribute?.gap ?? 0.16);
  return offs.map((o) => ({
    type: 'sprite',
    asset: node.asset,
    ...(node.color ? { color: node.color } : {}),
    ...(node.id && single ? { id: node.id } : {}),
    ease: 'linear',
    keyframes: [
      {
        tMs: 0,
        x: layout === 'row' ? bx + o : bx,
        y: layout === 'column' ? by + o : by,
        scale: node.scale,
        ...depthKf(node),
      },
    ],
  }));
}

// Pass a node's depth onto its compiled keyframes (only when set, so flat
// scenes keep clean keyframes).
function depthKf(node: NodeT): { depth?: number } {
  return node.kind === 'sprite' && node.depth !== undefined ? { depth: node.depth } : {};
}

function pointFor(node: NodeT, ctx: BeatCtx): { x: number; y: number } {
  if (node.place.at) return { x: node.place.at.x + node.place.dx, y: node.place.at.y + node.place.dy };
  const p = alignPoint(regionRect(ctx.regions, node.place.in ?? 'frame'), node.place.align ?? 'center');
  return { x: p.x + node.place.dx, y: p.y + node.place.dy };
}

function emitText(node: Extract<NodeT, { kind: 'text' }>, ctx: BeatCtx): unknown[] {
  const { x, y } = pointFor(node, ctx);
  return [
    {
      type: 'text',
      content: node.content,
      size: node.size,
      style: 'static',
      ...(node.color ? { color: node.color } : {}),
      position: { x, y },
    },
  ];
}

function emitParticles(node: Extract<NodeT, { kind: 'particles' }>, ctx: BeatCtx): unknown[] {
  const { x, y } = pointFor(node, ctx);
  return [{ type: 'particles', kind: node.particle, count: node.count, origin: { x, y }, seed: 1 }];
}

/**
 * Compile a relational Scene v2 into a v1 ScenePlan. Regions / alignment /
 * distribution become absolute coordinates; `on` relations pass through to the
 * renderer's relational placement. The renderer is untouched. The result is
 * validated through the v1 ScenePlan schema, so a compiler bug surfaces here.
 */
// Compile one beat's nodes into v1 layers.
function compileBeat(beat: BeatT): unknown[] {
  const ctx: BeatCtx = { durationMs: beat.durationMs, ...(beat.regions ? { regions: beat.regions } : {}) };
  const layers: unknown[] = [];
  for (const node of beat.nodes) {
    if (node.kind === 'sprite') layers.push(...emitSprite(node, ctx));
    else if (node.kind === 'text') layers.push(...emitText(node, ctx));
    else layers.push(...emitParticles(node, ctx));
  }
  return layers;
}

export function compileScene(scene: Scene2T): ScenePlanT {
  // Normalize to a beat list: explicit `shots`, or the single-shot shorthand.
  // (The schema refine guarantees one of the two is present.)
  const beats: BeatT[] = scene.shots ?? [
    { durationMs: scene.durationMs, background: scene.background!, nodes: scene.nodes!, ...(scene.regions ? { regions: scene.regions } : {}) },
  ];
  return ScenePlan.parse({
    version: 1,
    title: scene.title,
    fps: scene.fps,
    renderer: scene.renderer,
    ...(scene.style ? { style: scene.style } : {}),
    ...(scene.camera ? { camera: scene.camera } : {}),
    shots: beats.map((beat, i) => ({
      id: `scene${i === 0 ? '' : i + 1}`,
      durationMs: beat.durationMs,
      background: beat.background,
      layers: compileBeat(beat),
    })),
  });
}
