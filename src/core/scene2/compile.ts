import { ScenePlan, type ScenePlanT } from '../dsl.js';
import type { Scene2T, NodeT, RectT } from './schema.js';

// Built-in regions (fractions of the frame). Custom regions from the scene
// override these by name.
const DEFAULT_REGIONS: Record<string, RectT> = {
  frame: { x0: 0, y0: 0, x1: 1, y1: 1 },
  sky: { x0: 0.05, y0: 0.06, x1: 0.95, y1: 0.42 },
  ground: { x0: 0.06, y0: 0.62, x1: 0.94, y1: 0.9 },
  center: { x0: 0.22, y0: 0.32, x1: 0.78, y1: 0.68 },
};

function regionRect(scene: Scene2T, name: string): RectT {
  return scene.regions?.[name] ?? DEFAULT_REGIONS[name] ?? DEFAULT_REGIONS.frame!;
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

function emitSprite(node: Extract<NodeT, { kind: 'sprite' }>, scene: Scene2T): unknown[] {
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
      keyframes: [{ tMs: 0, scale: node.scale }],
    }));
  }

  // region / absolute -> concrete x,y, then distribute
  let bx: number;
  let by: number;
  if (node.place.at) {
    bx = node.place.at.x;
    by = node.place.at.y;
  } else {
    const p = alignPoint(regionRect(scene, node.place.in ?? 'frame'), node.place.align ?? 'center');
    bx = p.x;
    by = p.y;
  }
  bx += node.place.dx ?? 0;
  by += node.place.dy ?? 0;

  const layout = node.distribute?.layout ?? 'row';
  const offs = spread(n, node.distribute?.gap ?? 0.16);
  return offs.map((o) => ({
    type: 'sprite',
    asset: node.asset,
    ...(node.color ? { color: node.color } : {}),
    ...(node.id && single ? { id: node.id } : {}),
    ease: 'linear',
    keyframes: [
      { tMs: 0, x: layout === 'row' ? bx + o : bx, y: layout === 'column' ? by + o : by, scale: node.scale },
    ],
  }));
}

function pointFor(node: NodeT, scene: Scene2T): { x: number; y: number } {
  if (node.place.at) return { x: node.place.at.x + node.place.dx, y: node.place.at.y + node.place.dy };
  const p = alignPoint(regionRect(scene, node.place.in ?? 'frame'), node.place.align ?? 'center');
  return { x: p.x + node.place.dx, y: p.y + node.place.dy };
}

function emitText(node: Extract<NodeT, { kind: 'text' }>, scene: Scene2T): unknown[] {
  const { x, y } = pointFor(node, scene);
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

function emitParticles(node: Extract<NodeT, { kind: 'particles' }>, scene: Scene2T): unknown[] {
  const { x, y } = pointFor(node, scene);
  return [{ type: 'particles', kind: node.particle, count: node.count, origin: { x, y }, seed: 1 }];
}

/**
 * Compile a relational Scene v2 into a v1 ScenePlan. Regions / alignment /
 * distribution become absolute coordinates; `on` relations pass through to the
 * renderer's relational placement. The renderer is untouched. The result is
 * validated through the v1 ScenePlan schema, so a compiler bug surfaces here.
 */
export function compileScene(scene: Scene2T): ScenePlanT {
  const layers: unknown[] = [];
  for (const node of scene.nodes) {
    if (node.kind === 'sprite') layers.push(...emitSprite(node, scene));
    else if (node.kind === 'text') layers.push(...emitText(node, scene));
    else layers.push(...emitParticles(node, scene));
  }
  return ScenePlan.parse({
    version: 1,
    title: scene.title,
    fps: scene.fps,
    renderer: scene.renderer,
    ...(scene.style ? { style: scene.style } : {}),
    shots: [{ id: 'scene', durationMs: scene.durationMs, background: scene.background, layers }],
  });
}
