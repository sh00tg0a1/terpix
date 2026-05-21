import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';

export const ProviderName = z.enum(['anthropic', 'openai', 'minimax', 'qwen', 'openai-compat']);
export type ProviderNameT = z.infer<typeof ProviderName>;

export const Config = z.object({
  // LLM provider selection. Defaults to 'anthropic' if unset.
  provider: ProviderName.optional(),
  // Per-provider keys. The active one is picked by `provider`.
  anthropic_api_key: z.string().min(8).optional(),
  openai_api_key: z.string().min(8).optional(),
  minimax_api_key: z.string().min(8).optional(),
  qwen_api_key: z.string().min(8).optional(),
  // For self-hosted / proxied OpenAI-compatible deployments.
  openai_compat_api_key: z.string().min(8).optional(),
  openai_compat_base_url: z.string().url().optional(),
  // Rendering defaults.
  default_model: z.string().min(1).optional(),
  default_style: z.string().min(1).optional(),
  default_renderer: z.enum(['half', 'ascii']).optional(),
});
export type ConfigT = z.infer<typeof Config>;

export function configPath(): string {
  if (process.env['TERPIX_CONFIG']) return process.env['TERPIX_CONFIG'];
  const xdg = process.env['XDG_CONFIG_HOME'];
  if (xdg) return join(xdg, 'terpix', 'config.json');
  return join(homedir(), '.config', 'terpix', 'config.json');
}

// Read all known config locations (xdg first, then ~/.terpix legacy).
export function readConfig(): ConfigT {
  const candidates = [configPath(), join(homedir(), '.terpix', 'config.json')];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const raw = readFileSync(path, 'utf8');
      const json = JSON.parse(raw) as unknown;
      const parsed = Config.safeParse(json);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ');
        throw new Error(`config at ${path} is invalid: ${issues}`);
      }
      return parsed.data;
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`config at ${path} is not valid JSON: ${err.message}`);
      }
      throw err;
    }
  }
  return {};
}

export function writeConfig(cfg: ConfigT): string {
  const path = configPath();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on non-posix
  }
  return path;
}

export function updateConfig(patch: Partial<ConfigT>): { path: string; config: ConfigT } {
  const current = readConfig();
  const next: ConfigT = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === '') {
      delete (next as Record<string, unknown>)[k];
    } else {
      (next as Record<string, unknown>)[k] = v;
    }
  }
  const validated = Config.parse(next);
  const path = writeConfig(validated);
  return { path, config: validated };
}

// Precedence: env vars > config file. Centralized so adapters do not poke env.
export function getAnthropicApiKey(): string | undefined {
  const env = process.env['ANTHROPIC_API_KEY'];
  if (env && env.length > 0) return env;
  return readConfig().anthropic_api_key;
}

export function getOpenAIApiKey(): string | undefined {
  const env = process.env['OPENAI_API_KEY'];
  if (env && env.length > 0) return env;
  return readConfig().openai_api_key;
}

export function getMinimaxApiKey(): string | undefined {
  const env = process.env['MINIMAX_API_KEY'];
  if (env && env.length > 0) return env;
  return readConfig().minimax_api_key;
}

export function getQwenApiKey(): string | undefined {
  const env = process.env['QWEN_API_KEY'] ?? process.env['DASHSCOPE_API_KEY'];
  if (env && env.length > 0) return env;
  return readConfig().qwen_api_key;
}

export function getOpenAICompatConfig(): { key?: string; baseURL?: string } {
  const cfg = readConfig();
  return {
    key: process.env['OPENAI_COMPAT_API_KEY'] ?? cfg.openai_compat_api_key,
    baseURL: process.env['OPENAI_COMPAT_BASE_URL'] ?? cfg.openai_compat_base_url,
  };
}

export function getProvider(): ProviderNameT {
  const env = process.env['TERPIX_PROVIDER'];
  if (env) {
    const parsed = ProviderName.safeParse(env);
    if (parsed.success) return parsed.data;
  }
  return readConfig().provider ?? 'anthropic';
}

// Model default depends on which provider is active.
const PROVIDER_DEFAULT_MODELS: Record<ProviderNameT, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  minimax: 'MiniMax-M2.7',
  qwen: 'qwen-plus',
  'openai-compat': 'gpt-4o',
};

export function getDefaultModel(provider?: ProviderNameT): string {
  const envOverride = process.env['TERPIX_MODEL'];
  if (envOverride) return envOverride;
  const cfg = readConfig();
  if (cfg.default_model) return cfg.default_model;
  return PROVIDER_DEFAULT_MODELS[provider ?? getProvider()];
}

export function maskKey(key: string | undefined): string {
  if (!key) return '(unset)';
  if (key.length <= 12) return '*'.repeat(key.length);
  return key.slice(0, 8) + '...' + key.slice(-4);
}

// Useful for sanity-checking permissions on the file.
export function configFileInfo(): { path: string; exists: boolean; mode?: string } {
  const path = configPath();
  if (!existsSync(path)) return { path, exists: false };
  const s = statSync(path);
  return { path, exists: true, mode: (s.mode & 0o777).toString(8) };
}
