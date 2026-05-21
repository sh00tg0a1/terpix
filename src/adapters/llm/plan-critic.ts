import type { ScenePlanT, LayerT } from '../../core/dsl.js';
import { getAsset } from '../../core/assets/registry.js';

export interface CriticIssue {
  rule: string;
  detail: string;
}

export interface CriticResult {
  ok: boolean;
  issues: CriticIssue[];
}

// Crude multilingual noun + quantifier extraction. The goal is not perfect
// NLP — it is to catch the obvious "user asked for a crowd, model gave one
// thing" failure mode and feed the LLM a concrete complaint.
//
// `count` is the implied lower bound on sprites needed for that noun:
//   1 — single subject ("a cat", "the ship")
//   2 — explicit pair ("two people", "两个")
//   5 — crowd / spread ("a table of", "a group", "桌", "群")
interface NounSignal {
  /** noun token as it appears in the prompt (for diagnostics) */
  token: string;
  /** assets the noun most likely maps to */
  candidates: string[];
  /** lower bound on instances expected */
  count: number;
}

interface CountWord {
  pattern: RegExp;
  count: number;
}

const QUANTIFIERS: CountWord[] = [
  { pattern: /\b(two|2)\b|两个|二/, count: 2 },
  { pattern: /\b(three|3)\b|三个|三/, count: 3 },
  { pattern: /\b(four|4)\b|四个|四/, count: 4 },
  { pattern: /\b(five|5)\b|五个|五/, count: 5 },
  {
    pattern:
      /\b(many|several|crowd|group|flock|fleet|forest|bunch|row of|pile of|lots of|set of)\b|桌|群|众|排|堆|一桌|一片|一群|一排/i,
    count: 5,
  },
];

// noun-token → asset candidate list. Pure heuristic; if a token is absent
// the noun is just ignored. Coverage is intentionally narrow — we only
// claim a miss when the mapping is confident.
const NOUN_MAP: Array<{ pattern: RegExp; candidates: string[] }> = [
  { pattern: /\b(cat|kitten|kitty)\b|猫/i, candidates: ['cat'] },
  { pattern: /\b(person|people|human|man|woman|guy|girl|boy)\b|人/i, candidates: ['human', 'cat'] },
  { pattern: /\b(tree|forest|pine|fir)\b|树|林/i, candidates: ['tree'] },
  { pattern: /\b(mountain|peak|hill|ridge)\b|山|岭/i, candidates: ['mountain'] },
  { pattern: /\b(moon)\b|月/i, candidates: ['moon'] },
  { pattern: /\b(planet)\b|行星/i, candidates: ['planet'] },
  { pattern: /\b(star|sparkle|firefly)\b|星/i, candidates: ['star'] },
  { pattern: /\b(spaceship|rocket|ship)\b|飞船/i, candidates: ['spaceship'] },
  { pattern: /\b(superhero|superman)\b|超人/i, candidates: ['superman'] },
  { pattern: /\b(bowl|dish|plate|noodle|ramen|soup|food)\b|碗|菜|面|饭/i, candidates: ['bowl'] },
  { pattern: /\b(steam|smoke|cloud|fog|breath)\b|蒸气|烟|雾/i, candidates: ['steam'] },
];

function quantifierFor(prompt: string, nounIndex: number): number {
  // Look backward up to 20 chars from the noun for a quantifier.
  const window = prompt.slice(Math.max(0, nounIndex - 20), nounIndex);
  for (const q of QUANTIFIERS) {
    if (q.pattern.test(window)) return q.count;
  }
  // No quantifier near the noun — but if the *whole prompt* contains a crowd
  // word that lexically owns this noun (一桌子菜, 一群鸟), treat the noun
  // as the crowd. We approximate by checking the whole prompt.
  for (const q of QUANTIFIERS) {
    if (q.count >= 5 && q.pattern.test(prompt)) return q.count;
  }
  return 1;
}

export function extractNouns(prompt: string): NounSignal[] {
  const found: NounSignal[] = [];
  for (const entry of NOUN_MAP) {
    const m = entry.pattern.exec(prompt);
    if (!m) continue;
    found.push({
      token: m[0],
      candidates: entry.candidates,
      count: quantifierFor(prompt, m.index),
    });
  }
  return found;
}

function spriteLayers(plan: ScenePlanT): Array<Extract<LayerT, { type: 'sprite' }>> {
  const out: Array<Extract<LayerT, { type: 'sprite' }>> = [];
  for (const shot of plan.shots) {
    for (const layer of shot.layers) {
      if (layer.type === 'sprite') out.push(layer);
    }
  }
  return out;
}

function maxScale(layer: Extract<LayerT, { type: 'sprite' }>): number {
  let m = 0;
  for (const kf of layer.keyframes) {
    if (kf.scale !== undefined && kf.scale > m) m = kf.scale;
  }
  return m || 1;
}

// A flattened "one asset instance" view across BOTH sprite and scatter
// layers. A scatter with count=5 contributes 5 units, so coverage and
// frame-fill checks see the instances the renderer will actually draw.
interface CoverUnit {
  asset: string;
  scale: number;
  y: number | undefined;
}

function coverageUnits(plan: ScenePlanT): CoverUnit[] {
  const out: CoverUnit[] = [];
  for (const shot of plan.shots) {
    for (const layer of shot.layers) {
      if (layer.type === 'sprite') {
        out.push({ asset: layer.asset, scale: maxScale(layer), y: layer.keyframes[0]?.y });
      } else if (layer.type === 'scatter') {
        const midY = (layer.area.y0 + layer.area.y1) / 2;
        for (let i = 0; i < layer.count; i++) {
          out.push({ asset: layer.asset, scale: layer.scale, y: midY });
        }
      }
    }
  }
  return out;
}

export function critiquePlan(prompt: string, plan: ScenePlanT): CriticResult {
  const issues: CriticIssue[] = [];
  const sprites = spriteLayers(plan);
  const units = coverageUnits(plan);
  const nouns = extractNouns(prompt);

  // Coverage: each noun must have ≥ count instances whose asset is in
  // candidates. Counts sprite layers AND scatter instances. Each unit
  // satisfies at most one noun (greedy).
  const used = new Set<number>();
  for (const noun of nouns) {
    let matched = 0;
    for (let i = 0; i < units.length; i++) {
      if (used.has(i)) continue;
      if (noun.candidates.includes(units[i]!.asset)) {
        used.add(i);
        matched++;
        if (matched >= noun.count) break;
      }
    }
    if (matched < noun.count) {
      const wanted = noun.candidates.join('|');
      issues.push({
        rule: 'coverage',
        detail:
          `prompt mentions "${noun.token}" with implied count ${noun.count}, ` +
          `but the plan has only ${matched} sprite layer(s) using {${wanted}}. ` +
          `Add ${noun.count - matched} more sprite layer(s) with asset in {${wanted}}, ` +
          `spread across x ∈ [0.15, 0.85] at varied y/scale.`,
      });
    }
  }

  // Wrong-substitute: if the prompt mentions "human/人" and the model emitted
  // cat sprites without the prompt mentioning a cat, flag it.
  const mentionsHuman = /\b(person|people|human|man|woman|guy|girl|boy)\b|人/i.test(prompt);
  const mentionsCat = /\b(cat|kitten|kitty)\b|猫/i.test(prompt);
  if (mentionsHuman && !mentionsCat) {
    const cats = sprites.filter((s) => s.asset === 'cat').length;
    if (cats > 0) {
      issues.push({
        rule: 'wrong-substitute',
        detail:
          `prompt mentions "人/people" but no cat, yet the plan uses ${cats} ` +
          `cat sprite(s). Use the 'human' sprite (a standing person silhouette) ` +
          `for people, not 'cat'.`,
      });
    }
  }

  // Main-subject scale floor: any sprite that corresponds to a named noun
  // should be at scale ≥ 0.9 unless the prompt says "small/tiny/far/远/小".
  const tinyHint = /\b(tiny|small|distant|far|miniature)\b|小|远|微/i.test(prompt);
  if (!tinyHint) {
    const tinyMains: string[] = [];
    for (const layer of sprites) {
      const isNamed = nouns.some((n) => n.candidates.includes(layer.asset));
      if (!isNamed) continue;
      if (maxScale(layer) < 0.9) tinyMains.push(layer.asset);
    }
    if (tinyMains.length > 0) {
      issues.push({
        rule: 'subject-scale',
        detail:
          `these named subjects are below scale 0.9: ${tinyMains.join(', ')}. ` +
          `The prompt does not say "small/tiny/far/小/远", so raise their scale ` +
          `to ≥ 0.9 (or tile multiple instances) so they read as the focus.`,
      });
    }
  }

  // Human proportion: `human` is a tall sprite (aspect ~0.45), so its
  // rendered HEIGHT = size = scale × 0.20 × min(canvas). At scale 1.0 that
  // is only ~20% of the frame — knee-high. When a person shares the scene
  // with a large prop (table, or any sprite at scale ≥ 2), they look like
  // dolls unless scaled up. Require human scale ≥ ~2 in that case.
  const humans = sprites.filter((s) => s.asset === 'human');
  if (humans.length > 0) {
    const bigProp = sprites.some(
      (s) => s.asset !== 'human' && (s.asset === 'table' || maxScale(s) >= 2),
    );
    if (bigProp) {
      const small = humans.filter((h) => maxScale(h) < 1.8);
      if (small.length > 0) {
        const scales = small.map((h) => maxScale(h)).join(', ');
        issues.push({
          rule: 'human-scale',
          detail:
            `the scene has a large prop (table or scale≥2 sprite) but ${small.length} ` +
            `human sprite(s) are at scale ${scales}. \`human\` is a TALL sprite — ` +
            `at scale 1 it is only ~20% of frame height. Raise people to scale ` +
            `~2.5–3 so they read at human proportions beside the furniture.`,
        });
      }
    }
  }

  // Frame coverage: if total scaled width-fraction (rough) of all sprites is
  // < 0.3, the scene reads as empty. Approximate width per sprite as
  // 0.11 × scale × max(aspect, 1).
  let totalWidthFrac = 0;
  for (const unit of units) {
    const entry = getAsset(unit.asset);
    const aspect = entry?.metrics?.aspect ?? 1;
    totalWidthFrac += 0.11 * unit.scale * Math.max(aspect, 1);
  }
  if (units.length > 0 && totalWidthFrac < 0.3) {
    issues.push({
      rule: 'empty-frame',
      detail:
        `combined sprite width is ~${Math.round(totalWidthFrac * 100)}% of ` +
        `frame width; the scene will read as nearly empty. Either scale up ` +
        `main subjects, add more layers, or tile instances of supporting ` +
        `assets to fill at least 60% of the frame.`,
    });
  }

  // Anchor check: bottom-anchored sprites should sit in the lower portion
  // of the frame (y ∈ [0.55, 0.88]). A bowl floating at y=0.3 is a giveaway
  // the model did not understand the anchor.
  const floatingGround: string[] = [];
  for (const layer of sprites) {
    const entry = getAsset(layer.asset);
    if (entry?.metrics?.anchor !== 'bottom') continue;
    const firstY = layer.keyframes[0]?.y;
    if (firstY === undefined) continue;
    if (firstY < 0.65 || firstY > 0.85) floatingGround.push(`${layer.asset}@y=${firstY}`);
  }
  if (floatingGround.length > 0) {
    issues.push({
      rule: 'anchor',
      detail:
        `these bottom-anchored sprites sit outside the ground band ` +
        `[y=0.65..0.85]: ${floatingGround.join(', ')}. Ground-resting ` +
        `assets (bowl, mountain, tree, human) should rest near the horizon ` +
        `line (y≈0.72..0.8), not float in the sky.`,
    });
  }

  // Oversized title: a size="lg" text block is ~32% of frame height. When
  // the shot also has subjects to show, a giant title swallows the frame.
  // Titles/captions should be sm (or md only if they ARE the focal point).
  for (const shot of plan.shots) {
    const spritesInShot = shot.layers.filter((l) => l.type === 'sprite').length;
    for (const layer of shot.layers) {
      if (layer.type !== 'text') continue;
      if (layer.size === 'lg' && spritesInShot >= 2) {
        issues.push({
          rule: 'text-oversized',
          detail:
            `text "${layer.content.slice(0, 20)}" uses size="lg" (~32% of ` +
            `frame height) while the shot has ${spritesInShot} sprite ` +
            `subjects. A large title crowds them out — use size="sm" for a ` +
            `caption/subtitle, "md" at most.`,
        });
        break;
      }
    }
  }

  // Indoor/dinner scene should not use minimalist style or a pastel-cream bg.
  const indoor =
    /\b(indoor|interior|kitchen|restaurant|dining|feast|eat|eating|dinner|lunch|breakfast|room)\b|桌|餐|厨房|饭店|家|屋|室内|吃/i.test(
      prompt,
    );
  if (indoor) {
    if (plan.style === 'minimalist') {
      issues.push({
        rule: 'style-mismatch',
        detail:
          `prompt is an indoor / dining scene but style="minimalist" — ` +
          `the cream palette reads as empty studio, not interior. Drop the ` +
          `style field (or use "noir") and use a warm gradient background ` +
          `like { from: "#3a2218", to: "#180c08" }.`,
      });
    }
    const bg = plan.shots[0]?.background;
    if (bg && bg.type === 'solid') {
      const c = bg.color.toLowerCase();
      if (/^#[ef][0-9a-f]/.test(c) || /^#[d-f][d-f][d-f]/.test(c)) {
        issues.push({
          rule: 'bg-too-light',
          detail:
            `prompt is an indoor scene but background is a near-white solid ` +
            `(${bg.color}). Use a warm gradient (dim interior) or a saturated ` +
            `warm color instead — empty cream background looks like a missing wall.`,
        });
      }
    }
  }

  // Text content must be renderable. The `half` renderer rasterizes text with
  // an ASCII-only bitmap font (A-Z, 0-9, space, `.,!?`), so anything else
  // draws blank. The `ascii` renderer emits real characters to the terminal,
  // which renders CJK natively — so this restriction only applies to `half`.
  const TEXT_OK = /^[A-Z0-9 .,!?]+$/;
  for (const shot of plan.shots) {
    if (plan.renderer === 'ascii') break;
    for (const layer of shot.layers) {
      if (layer.type !== 'text') continue;
      if (!TEXT_OK.test(layer.content)) {
        const bad = layer.content
          .split('')
          .filter((ch) => !/[A-Z0-9 .,!?]/.test(ch))
          .slice(0, 8)
          .join('');
        issues.push({
          rule: 'text-charset',
          detail:
            `text layer content "${layer.content.slice(0, 30)}" contains ` +
            `characters that DO NOT RENDER ("${bad}"...). The font supports ` +
            `only A-Z, 0-9, space and \`.,!?\`. Translate Chinese phrases to ` +
            `natural English (e.g. "真好吃" → "SO GOOD"), do not transliterate ` +
            `to pinyin, and never put lowercase letters in a text layer.`,
        });
      }
    }
  }

  // Text-vs-subject overlap: a text layer collides with a sprite only when
  // their bounding boxes overlap in BOTH y and x. (A centered title above
  // edge-placed subjects shares no x-extent, so it does not collide.)
  for (const shot of plan.shots) {
    const textLayers = shot.layers.filter((l) => l.type === 'text') as Array<
      Extract<LayerT, { type: 'text' }>
    >;
    const spriteLayersInShot = shot.layers.filter((l) => l.type === 'sprite') as Array<
      Extract<LayerT, { type: 'sprite' }>
    >;
    for (const text of textLayers) {
      // Half-extents as fraction of frame. Text height ≈ SIZE_FRAC; width ≈
      // chars × ~3% (rough, capped at full width). Sprite from metrics.
      const textHalfH = ({ sm: 0.05, md: 0.1, lg: 0.16 }[text.size]) + 0.02;
      const textHalfW = Math.min(0.46, text.content.length * 0.018);
      for (const sp of spriteLayersInShot) {
        const spY = sp.keyframes[0]?.y;
        const spX = sp.keyframes[0]?.x;
        if (spY === undefined || spX === undefined) continue;
        const spScale = maxScale(sp);
        if (spScale < 0.8) continue;
        const aspect = getAsset(sp.asset)?.metrics?.aspect ?? 1;
        const spHalfH = 0.1 * spScale * Math.max(1 / aspect, 1);
        const spHalfW = 0.055 * spScale * Math.max(aspect, 1);
        const overlapY = Math.abs(text.position.y - spY) < textHalfH + spHalfH;
        const overlapX = Math.abs(text.position.x - spX) < textHalfW + spHalfW;
        if (overlapY && overlapX) {
          issues.push({
            rule: 'text-collision',
            detail:
              `text "${text.content.slice(0, 20)}" at (${text.position.x},` +
              `${text.position.y}) overlaps sprite "${sp.asset}" at (${spX},` +
              `${spY}). Move text to a clear band (y=0.1 top, y=0.92 bottom).`,
          });
          break;
        }
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

export function formatIssuesForRetry(result: CriticResult): string {
  if (result.ok) return '';
  return result.issues
    .map((i, n) => `(${n + 1}) [${i.rule}] ${i.detail}`)
    .join('\n');
}
