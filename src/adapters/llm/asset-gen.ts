import type OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  ShapeAssetFile,
  parseShapeJson,
  makeShapeDrawer,
  makeShapeAsciiDrawer,
  type ShapeAssetFileT,
} from '../../core/assets/formats/shape.js';
import { registerAsset } from '../../core/assets/registry.js';
import { ScenePlan, type ScenePlanT } from '../../core/dsl.js';
import { renderPreviewPng } from './render-preview.js';
import { friendlyApiError } from './errors.js';

const GEN_SYSTEM = `You draw ONE small sprite as SHAPE-JSON: filled primitives in
a viewBox, low-resolution symbolic pixel-art. Call submit_asset exactly once.

Format:
- viewBox {w,h}: canvas; coords in this space, (0,0) top-left.
- primitives, back-to-front (later = on top). kinds: rect{x,y,w,h},
  circle{cx,cy,r}, ellipse{cx,cy,rx,ry}, triangle{points:[3]}, polygon{points:[>=3]},
  line{from,to,thickness}.
- color: "#RRGGBB" literal, OR scene-tone tokens "@main"/"@light"/"@dark".

CRITICAL for recognizability:
1. SILHOUETTE FIRST. Start with ONE polygon for the overall outline — INCLUDING
   defining parts (a fish's TAIL/FINS, a teapot's spout). Elongated/organic
   things MUST use a polygon body, not a bare circle.
2. INTRINSIC COLOR = LITERAL HEX. Hard-code real-world colors (dumpling pale
   "#f0e6d0", koi "#ff7a1a"+"#ffffff", leaf green). Use @main/@dark/@light ONLY
   for parts meant to recolor with the scene.
3. Light from upper-left -> lighter up-left, darker down-right, for volume.
4. Add the 1-2 features that MAKE it that object. 10-22 primitives, fill ~85%.
5. VIEW = SIDE PROFILE by default. Animals, furniture, vehicles, vessels, tools
   are most recognizable from the side (a cat in profile shows ear, eye-line,
   tail; a teapot in profile shows spout + handle). Pick top-down or front-on
   ONLY when the description explicitly says so. Side profile = one ear / one
   eye-line / tail or limbs ON ONE SIDE — never symmetric front-facing.
6. ORGANIC SUBJECTS need ALL of: a distinct HEAD shape attached to but
   separate from the body, AT LEAST ONE visible appendage (ear, tail, paw,
   fin, wing), and AT LEAST ONE eye marker (a line, dot, or arc — even
   closed). Without these the sprite reads as a featureless blob.
7. ANTI-PATTERN: a single rounded shape with no head / no tail / no ears is
   not "an animal" — it is a pebble. Build the structural parts FIRST, then
   surface detail (stripes, highlights). Never submit a sprite whose only
   identifying feature is its color.
- anchor: "bottom" if it rests on a surface, else "center".

## Two side-view examples (study the structure, do not copy literally)

A curled sleeping cat — note the separate head ellipse, visible ear triangle,
tail polygon curling back to the front, closed-eye line, body stripe:
{ "name":"ex-cat", "description":"side profile of a curled sleeping cat",
  "viewBox":{"w":100,"h":60}, "anchor":"bottom",
  "primitives":[
    {"kind":"ellipse","cx":52,"cy":40,"rx":36,"ry":14,"color":"#e8852a"},
    {"kind":"ellipse","cx":22,"cy":32,"rx":13,"ry":11,"color":"#e8852a"},
    {"kind":"triangle","points":[[10,18],[20,22],[14,12]],"color":"#e8852a"},
    {"kind":"polygon","points":[[80,42],[96,30],[88,52],[60,44]],"color":"#e8852a"},
    {"kind":"ellipse","cx":52,"cy":46,"rx":28,"ry":7,"color":"#ffd9b0"},
    {"kind":"rect","x":36,"y":36,"w":22,"h":3,"color":"#ffffff"},
    {"kind":"line","from":[14,29],"to":[24,29],"color":"#3a1f10","thickness":1},
    {"kind":"circle","cx":12,"cy":33,"r":1.5,"color":"#ff80a0"}
  ] }

A teapot — note the spout polygon on the right and the handle cutout on the
left make the silhouette read as a teapot, not a bag:
{ "name":"ex-teapot", "description":"side profile of a teapot",
  "viewBox":{"w":100,"h":80}, "anchor":"bottom",
  "primitives":[
    {"kind":"polygon","points":[[20,66],[80,66],[86,30],[14,30]],"color":"#c4a060"},
    {"kind":"polygon","points":[[85,40],[100,34],[95,56]],"color":"#c4a060"},
    {"kind":"polygon","points":[[14,40],[2,46],[2,56],[14,56]],"color":"#c4a060"},
    {"kind":"polygon","points":[[12,43],[6,48],[6,54],[12,54]],"color":"#3a1f10"},
    {"kind":"ellipse","cx":50,"cy":28,"rx":18,"ry":5,"color":"#c4a060"},
    {"kind":"circle","cx":50,"cy":22,"r":4,"color":"#c4a060"},
    {"kind":"rect","x":25,"y":50,"w":50,"h":3,"color":"#f0e0a0"}
  ] }
`;

export interface AssetGenCfg {
  client: OpenAI;
  genModel: string;
  /** Vision model for the recognizability gate. Omit to accept the first valid parse. */
  visionModel?: string;
  /** Max generate attempts (including vision-driven retries). Default 3. */
  rounds?: number;
}

/** Register a shape spec as a live asset (half + ascii drawers, metrics). */
export function registerShape(spec: ShapeAssetFileT, origin = '<generated>'): void {
  registerAsset({
    name: spec.name,
    description: spec.description,
    source: 'shape',
    origin,
    metrics: { aspect: spec.viewBox.w / spec.viewBox.h, anchor: spec.anchor },
    draw: makeShapeDrawer(spec),
    drawAscii: makeShapeAsciiDrawer(spec),
  });
}

function previewPlan(spec: ShapeAssetFileT): ScenePlanT {
  return ScenePlan.parse({
    version: 1, title: 'asset', fps: 24, renderer: 'half',
    shots: [{
      id: 's', durationMs: 100, background: { type: 'solid', color: '#9a9a9a' },
      layers: [{ type: 'sprite', asset: spec.name, color: '#bdbdbd', ease: 'linear', keyframes: [{ tMs: 0, x: 0.5, y: 0.5, scale: 3.0 }] }],
    }],
  });
}

async function recognizable(
  cfg: AssetGenCfg,
  label: string,
  spec: ShapeAssetFileT,
): Promise<{ ok: boolean; fixes: string }> {
  registerShape(spec); // needed so the compositor can draw it for the check
  const png = await renderPreviewPng(previewPlan(spec), { w: 320, h: 320 });
  const r = await cfg.client.chat.completions.create({
    model: cfg.visionModel!,
    max_tokens: 300,
    messages: [
      {
        role: 'system',
        content:
          `You judge whether a low-res flat-shape sprite is recognizable as a named object. ` +
          `Pixel-art style — ignore resolution/detail. If a viewer would name it correctly at a ` +
          `glance, reply exactly "PASS". Otherwise give at most 3 concrete fixes in terms of ` +
          `SHAPES/COLORS (e.g. "add a triangular tail on the right", "body should be pale cream"). No prose.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `This sprite should depict: ${label}. Recognizable?` },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
        ],
      },
    ],
  });
  const raw = ((r.choices?.[0]?.message.content as string) ?? '').trim();
  return { ok: /^PASS\b/i.test(raw), fixes: raw };
}

/**
 * Generate one procedural sprite (shape-json) for `name` from its description.
 * When `visionModel` is set, each attempt is rendered and checked for
 * recognizability; failures are fed back and regenerated (up to `rounds`).
 * Returns the accepted spec (already registered) or an error.
 */
export async function generateAsset(
  name: string,
  description: string,
  cfg: AssetGenCfg,
): Promise<{ spec: ShapeAssetFileT } | { error: string }> {
  const schema = zodToJsonSchema(ShapeAssetFile, { target: 'openApi3' }) as Record<string, unknown>;
  const rounds = cfg.rounds ?? 3;
  const label = `${name} (${description})`;
  let fixes = '';
  let lastErr = 'no attempts';

  for (let round = 1; round <= rounds; round++) {
    const user =
      round === 1 || !fixes
        ? `Draw: ${label}. Use the asset name "${name}".`
        : `Draw: ${label}. Use the asset name "${name}".\n\nThe previous attempt was NOT recognizable. Fixes:\n${fixes}\nRe-draw addressing each.`;
    let resp;
    try {
      resp = await cfg.client.chat.completions.create({
        model: cfg.genModel,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: GEN_SYSTEM },
          { role: 'user', content: user },
        ],
        tools: [{ type: 'function', function: { name: 'submit_asset', description: 'Submit the shape-json sprite.', parameters: schema } }],
        tool_choice: { type: 'function', function: { name: 'submit_asset' } },
      });
    } catch (err) {
      return { error: friendlyApiError(err) };
    }
    const tc = resp.choices?.[0]?.message.tool_calls?.[0];
    const args = tc && tc.type === 'function' ? tc.function.arguments : undefined;
    if (!args) {
      lastErr = 'model did not call submit_asset';
      continue;
    }
    const parsed = parseShapeJson(args, name);
    if (!parsed.ok) {
      lastErr = parsed.errors[0] ?? 'invalid shape-json';
      fixes = `the JSON was invalid (${lastErr}); emit complete, valid shape-json.`;
      continue;
    }
    // Force the requested name so the composer can reference it deterministically.
    const spec: ShapeAssetFileT = { ...parsed.spec, name };
    if (!cfg.visionModel) {
      registerShape(spec);
      return { spec };
    }
    const v = await recognizable(cfg, label, spec);
    if (v.ok) return { spec };
    fixes = v.fixes;
    lastErr = `not recognizable: ${v.fixes}`;
  }
  return { error: lastErr };
}
