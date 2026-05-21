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
