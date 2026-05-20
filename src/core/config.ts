import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';

export const Config = z.object({
  anthropic_api_key: z.string().min(8).optional(),
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
  const cfg = readConfig();
  return cfg.anthropic_api_key;
}

export function getDefaultModel(): string {
  return process.env['TERPIX_MODEL'] ?? readConfig().default_model ?? 'claude-sonnet-4-6';
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
