import type OpenAI from 'openai';
import {
  BitmapMeta,
  type BitmapAsset,
  type BitmapMetaT,
  cookSprite,
  decodePng,
  encodePng,
  makeBitmapAsciiDrawer,
  makeBitmapDrawer,
} from '../../core/assets/formats/bitmap.js';
import { registerAsset } from '../../core/assets/registry.js';
import { friendlyApiError } from './errors.js';
import { qwenGenerateImage, type QwenImageCfg } from './qwen-image.js';

// Style wrapper: tell the model we want a sticker / die-cut icon, NOT a
// beautiful illustration. "Sticker" / "icon" framings naturally cut the
// model's instinct to bring in context (a lotus on water, a fish in a pond)
// because stickers are by definition isolated. Line-art keeps the sprite
// small and recognizable after downsample.
//
// The "head/front faces RIGHT" rule is load-bearing for animation: the
// runtime mirrors via `flipX` when a sprite travels left, so the planner
// can safely assume every sprite's default facing is +x. Without this
// invariant, a leftward-flipped sprite that was already drawn facing left
// ends up facing RIGHT while moving LEFT — i.e. swimming backward.
const PROMPT_PREFIX =
  '极简扁平插画风格 flat icon style，粗黑色线稿轮廓，' +
  '2-3 种平涂色块（实色，无渐变，无网点，无纹理，无肌理），' +
  '单一主体居中占满画面，纯白色背景 #ffffff，模切贴纸 die-cut sticker 样式，' +
  '无任何场景或环境元素，无阴影，无地面，无水，无水面，无云，无文字，无水印，' +
  '无装饰边框，无写实细节，无毛发，无鳞片，无羽毛纹理。' +
  '严格禁止拟人化：植物、物体、食物本身没有五官，绝对不要给花朵 / 水果 / 物体' +
  '添加眼睛、嘴巴、笑脸或任何表情；只有真实有脸的动物/人物才画五官。' +
  '若主体有明确的头/正面方向（动物、车辆、人物等），头部必须朝向画面右侧，' +
  '正面朝右；对称主体（花、球、星）正面朝前。';

function buildPrompt(description: string): string {
  return `${PROMPT_PREFIX}。\n主体: ${description}`;
}

export interface ImageAssetGenCfg {
  qwen: QwenImageCfg;
  /** Vision-critic client (OpenAI-compat). Omit to accept the first cooked sprite. */
  visionClient?: OpenAI;
  visionModel?: string;
  /** Generate attempts (including vision-driven retries). Default 2 — image gen is expensive. */
  rounds?: number;
  /** Stored sprite max side (px). Default 96 — terpix is small, terminal output. */
  maxSide?: number;
}

export function registerBitmap(asset: BitmapAsset, origin: string): void {
  registerAsset({
    name: asset.meta.name,
    description: asset.meta.description,
    source: 'bitmap',
    origin,
    metrics: { aspect: asset.w / asset.h, anchor: asset.meta.anchor },
    draw: makeBitmapDrawer(asset),
    drawAscii: makeBitmapAsciiDrawer(asset),
  });
}

/** Decode an already-cooked PNG (from cache or disk) into a bitmap asset. */
export function bitmapFromCookedPng(meta: BitmapMetaT, bytes: Buffer): BitmapAsset {
  const { w, h, rgba } = decodePng(bytes);
  return { meta, w, h, rgba };
}

/** Decode raw model output and produce (small) sprite + the cooked PNG to cache. */
export function cookFromRawPng(
  meta: BitmapMetaT,
  raw: Buffer,
  maxSide = 96,
): { asset: BitmapAsset; png: Buffer } {
  const decoded = decodePng(raw);
  const cooked = cookSprite(decoded.w, decoded.h, decoded.rgba, { maxSide });
  const asset: BitmapAsset = { meta, ...cooked };
  return { asset, png: encodePng(cooked.w, cooked.h, cooked.rgba) };
}

async function recognizable(
  client: OpenAI,
  model: string,
  label: string,
  asset: BitmapAsset,
): Promise<{ ok: boolean; fixes: string }> {
  const png = encodePng(asset.w, asset.h, asset.rgba);
  const r = await client.chat.completions.create({
    model,
    max_tokens: 200,
    messages: [
      {
        role: 'system',
        content:
          `Judge whether a small 2D flat sprite (transparent background) is recognizable as a named object. ` +
          `If a viewer at a glance would name it correctly, reply exactly "PASS". Otherwise give at most 2 concrete prompt fixes (shape/style/color/orientation). No prose.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Should depict: ${label}. Recognizable?` },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${png.toString('base64')}` },
          },
        ],
      },
    ],
  });
  const raw = ((r.choices?.[0]?.message.content as string) ?? '').trim();
  return { ok: /^PASS\b/i.test(raw), fixes: raw };
}

/**
 * Generate one bitmap sprite for `name`. Calls Qwen-Image, white-keys, crops,
 * downsamples to a small fixed-side sprite, optionally vision-gates, registers.
 */
export async function generateImageAsset(
  name: string,
  description: string,
  cfg: ImageAssetGenCfg,
): Promise<{ asset: BitmapAsset; png: Buffer } | { error: string }> {
  const rounds = cfg.rounds ?? 2;
  const maxSide = cfg.maxSide ?? 96;
  const label = `${name} (${description})`;
  let fixes = '';
  let lastErr = 'no attempts';

  for (let round = 1; round <= rounds; round++) {
    const prompt =
      round === 1 || !fixes
        ? buildPrompt(description)
        : `${buildPrompt(description)}\n上一版不达标，请修正：${fixes}`;
    let raw: Buffer;
    try {
      raw = await qwenGenerateImage(prompt, cfg.qwen);
    } catch (err) {
      lastErr = (err as Error).message;
      if (round === rounds) return { error: friendlyApiError(err) };
      continue;
    }
    const meta: BitmapMetaT = BitmapMeta.parse({ name, description, anchor: 'center' });
    let made: { asset: BitmapAsset; png: Buffer };
    try {
      made = cookFromRawPng(meta, raw, maxSide);
    } catch (err) {
      lastErr = `decode failed: ${(err as Error).message}`;
      continue;
    }
    if (!cfg.visionClient || !cfg.visionModel) {
      registerBitmap(made.asset, '<generated>');
      return made;
    }
    let v: { ok: boolean; fixes: string };
    try {
      v = await recognizable(cfg.visionClient, cfg.visionModel, label, made.asset);
    } catch {
      // If the critic itself fails, accept the sprite — we already paid for it.
      registerBitmap(made.asset, '<generated>');
      return made;
    }
    if (v.ok) {
      registerBitmap(made.asset, '<generated>');
      return made;
    }
    fixes = v.fixes;
    lastErr = `not recognizable: ${v.fixes}`;
  }
  return { error: lastErr };
}
