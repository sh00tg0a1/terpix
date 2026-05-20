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
