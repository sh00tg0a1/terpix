import {
  getAnthropicApiKey,
  getDefaultModel,
  getMinimaxApiKey,
  getOpenAIApiKey,
  getOpenAICompatConfig,
  getProvider,
  getQwenApiKey,
  type ProviderNameT,
} from '../../core/config.js';
import { planFromNLAnthropic } from './anthropic.js';
import { planFromNLOpenAICompat } from './openai-compat.js';
import { planScenePipeline } from './pipeline.js';
import type { PlanReq, PlanOk, PlanErr } from './types.js';

const MINIMAX_BASE_URL = 'https://api.minimax.io/v1';
const QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export interface ResolvedProvider {
  kind: ProviderNameT;
  apiKey: string;
  baseURL?: string;
  defaultModel: string;
}

export function resolveProvider(overrideProvider?: ProviderNameT): ResolvedProvider | { error: string } {
  const provider: ProviderNameT = overrideProvider ?? getProvider();
  const defaultModel = getDefaultModel(provider);

  switch (provider) {
    case 'anthropic': {
      const k = getAnthropicApiKey();
      if (!k) {
        return {
          error:
            "no Anthropic API key. Set with: terpix config set anthropic_api_key sk-ant-...",
        };
      }
      return { kind: provider, apiKey: k, defaultModel };
    }
    case 'openai': {
      const k = getOpenAIApiKey();
      if (!k) {
        return {
          error: "no OpenAI API key. Set with: terpix config set openai_api_key sk-...",
        };
      }
      return { kind: provider, apiKey: k, defaultModel };
    }
    case 'minimax': {
      const k = getMinimaxApiKey();
      if (!k) {
        return {
          error:
            "no MiniMax API key. Set with: terpix config set minimax_api_key <key>",
        };
      }
      return { kind: provider, apiKey: k, baseURL: MINIMAX_BASE_URL, defaultModel };
    }
    case 'qwen': {
      const k = getQwenApiKey();
      if (!k) {
        return {
          error:
            'no Qwen API key. Set with: terpix config set qwen_api_key sk-... (or env QWEN_API_KEY / DASHSCOPE_API_KEY)',
        };
      }
      return { kind: provider, apiKey: k, baseURL: QWEN_BASE_URL, defaultModel };
    }
    case 'openai-compat': {
      const { key, baseURL } = getOpenAICompatConfig();
      if (!key || !baseURL) {
        return {
          error:
            'openai-compat requires both openai_compat_api_key and openai_compat_base_url. Set with: terpix config set openai_compat_api_key ... and terpix config set openai_compat_base_url https://...',
        };
      }
      return { kind: provider, apiKey: key, baseURL, defaultModel };
    }
  }
}

export function hasLLMKey(overrideProvider?: ProviderNameT): boolean {
  const r = resolveProvider(overrideProvider);
  return !('error' in r);
}

export async function planFromNL(req: PlanReq & { provider?: ProviderNameT }): Promise<PlanOk | PlanErr> {
  const resolved = resolveProvider(req.provider);
  if ('error' in resolved) return { ok: false, error: resolved.error, attempts: 0 };

  switch (resolved.kind) {
    case 'anthropic':
      return planFromNLAnthropic(req, { apiKey: resolved.apiKey, defaultModel: resolved.defaultModel });
    case 'openai':
    case 'minimax':
    case 'qwen':
    case 'openai-compat': {
      const compatCfg = {
        apiKey: resolved.apiKey,
        defaultModel: resolved.defaultModel,
        ...(resolved.baseURL ? { baseURL: resolved.baseURL } : {}),
      };
      return req.genAssets
        ? planScenePipeline(req, compatCfg)
        : planFromNLOpenAICompat(req, compatCfg);
    }
  }
}

// Image-mode (Qwen-Image) needs a DashScope API key independent of the scene-
// LLM provider — the user might run Anthropic/OpenAI as the planner while
// generating sprites on Qwen. Returns the resolved imageGen config or a
// human-readable error.
export function resolveImageGen(opts: {
  model?: string;
  size?: string;
  maxSide?: number;
} = {}): NonNullable<PlanReq['imageGen']> | { error: string } {
  const k = getQwenApiKey();
  if (!k) {
    return {
      error:
        'image asset mode requires a DashScope key. ' +
        'Set with: terpix config set qwen_api_key sk-... (or env DASHSCOPE_API_KEY)',
    };
  }
  return {
    apiKey: k,
    model: opts.model ?? 'qwen-image-2.0-pro',
    size: opts.size ?? '1328*1328',
    ...(opts.maxSide ? { maxSide: opts.maxSide } : {}),
  };
}

export function activeProviderLabel(): string {
  const p = getProvider();
  const r = resolveProvider(p);
  if ('error' in r) return `${p} (no key)`;
  return `${p} (model: ${r.defaultModel}${r.baseURL ? `, baseURL: ${r.baseURL}` : ''})`;
}
