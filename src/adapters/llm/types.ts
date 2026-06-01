import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import type { ScenePlanT } from '../../core/dsl.js';

export interface PlanReq {
  prompt: string;
  durationMs: number;
  size?: { w: number; h: number };
  fps?: number;
  renderer?: 'half' | 'ascii';
  style?: string;
  model?: string;
  maxRetries?: number;
  /**
   * Optional vision-in-loop critic. When set, after each plan candidate
   * passes schema + semantic-critic, render a preview frame and ask the
   * vision model for fixes. Failed visions feed back into the retry loop
   * up to {@link visionRounds} times.
   */
  vision?: {
    apiKey: string;
    baseURL?: string;
    model: string;
    rounds?: number;
  };
  /**
   * When true, prepend rendered reference frames + their JSON to the prompt
   * so a vision-capable planner learns the visual→DSL mapping before
   * generating. Requires the planner model to accept image inputs
   * (qwen-plus, qwen-vl-*, gpt-4o, etc.).
   */
  visualFewShot?: boolean;
  /**
   * When true, run the asset-generation pipeline first: plan the scene's
   * elements, generate (+ vision-gate, if a vision model is set) any not in
   * the registry as procedural shape sprites, cache them, then compose. Lets
   * scenes depict objects beyond the fixed builtin catalog.
   */
  genAssets?: boolean;
  /**
   * How `genAssets` produces sprites:
   * - 'shape' (default): LLM emits shape-json primitives (cheap, recolors).
   * - 'image': Qwen-Image generates a small PNG, white-keyed and downsampled
   *   into a bitmap sprite (better identity, fixed colors, no recolor).
   */
  assetMode?: 'shape' | 'image';
  /** Image-mode generation config; required when assetMode = 'image'. */
  imageGen?: {
    apiKey: string;
    model?: string;
    baseURL?: string;
    size?: string;
    maxSide?: number;
  };
  /**
   * When set, generated shape assets are written here instead of the global
   * ~/.cache/terpix/assets/ dir. Project mode points this at <proj>/assets/
   * so a project's custom sprites travel with it (reproducible re-renders).
   */
  assetWriteDir?: string;
  // Test injection points.
  client?: Anthropic;
  openaiClient?: OpenAI;
}

export interface PlanOk {
  ok: true;
  plan: ScenePlanT;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  attempts: number;
}

export interface PlanErr {
  ok: false;
  error: string;
  attempts: number;
}
