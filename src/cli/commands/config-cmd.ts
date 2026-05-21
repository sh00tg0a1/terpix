import { createInterface } from 'node:readline';
import {
  configFileInfo,
  maskKey,
  readConfig,
  updateConfig,
  type ConfigT,
  type ProviderNameT,
} from '../../core/config.js';
import { activeProviderLabel } from '../../adapters/llm/provider.js';

const KNOWN_KEYS = new Set<keyof ConfigT>([
  'provider',
  'anthropic_api_key',
  'openai_api_key',
  'minimax_api_key',
  'qwen_api_key',
  'openai_compat_api_key',
  'openai_compat_base_url',
  'default_model',
  'default_style',
  'default_renderer',
]);

function isKnownKey(k: string): k is keyof ConfigT {
  return (KNOWN_KEYS as Set<string>).has(k);
}

export interface ConfigCmdOpts {
  subcommand: 'show' | 'get' | 'set' | 'unset' | 'path' | 'setup';
  key?: string;
  value?: string;
}

export async function configCmd(opts: ConfigCmdOpts): Promise<void> {
  switch (opts.subcommand) {
    case 'show':
      return show();
    case 'path':
      console.log(configFileInfo().path);
      return;
    case 'get':
      return get(opts.key);
    case 'set':
      return set(opts.key, opts.value);
    case 'unset':
      return unset(opts.key);
    case 'setup':
      return await setupWizard();
  }
}

function show(): void {
  const info = configFileInfo();
  const cfg = readConfig();
  console.log(`config: ${info.path}` + (info.exists ? ` (mode ${info.mode})` : ' (not yet created)'));

  // Provider & keys section
  console.log('provider:');
  console.log(`  provider = ${cfg.provider ?? 'anthropic'}`);

  console.log('api keys:');
  const apiKeys: (keyof ConfigT)[] = [
    'anthropic_api_key',
    'openai_api_key',
    'minimax_api_key',
    'qwen_api_key',
    'openai_compat_api_key',
    'openai_compat_base_url',
  ];
  for (const key of apiKeys) {
    const v = cfg[key];
    if (v === undefined) {
      console.log(`  ${key} = (unset)`);
    } else if (key.includes('api_key')) {
      console.log(`  ${key} = ${maskKey(v as string)}`);
    } else {
      console.log(`  ${key} = ${v}`);
    }
  }

  console.log('defaults:');
  for (const key of ['default_model', 'default_style', 'default_renderer'] as const) {
    const v = cfg[key];
    console.log(`  ${key} = ${v ?? '(unset)'}`);
  }

  console.log('');
  console.log('env overrides:');
  console.log(`  ANTHROPIC_API_KEY = ${maskKey(process.env['ANTHROPIC_API_KEY'])}`);
  console.log(`  OPENAI_API_KEY = ${maskKey(process.env['OPENAI_API_KEY'])}`);
  console.log(`  MINIMAX_API_KEY = ${maskKey(process.env['MINIMAX_API_KEY'])}`);
  console.log(`  QWEN_API_KEY = ${maskKey(process.env['QWEN_API_KEY'])}`);
  console.log(`  DASHSCOPE_API_KEY = ${maskKey(process.env['DASHSCOPE_API_KEY'])}`);
  console.log(`  OPENAI_COMPAT_API_KEY = ${maskKey(process.env['OPENAI_COMPAT_API_KEY'])}`);
  console.log(`  OPENAI_COMPAT_BASE_URL = ${process.env['OPENAI_COMPAT_BASE_URL'] ?? '(unset)'}`);
  console.log(`  TERPIX_PROVIDER = ${process.env['TERPIX_PROVIDER'] ?? '(unset)'}`);
  console.log(`  TERPIX_MODEL = ${process.env['TERPIX_MODEL'] ?? '(unset)'}`);
}

function get(key: string | undefined): void {
  if (!key) {
    console.error('terpix config get: missing key. Try: anthropic_api_key | default_model | default_style | default_renderer');
    process.exit(1);
  }
  if (!isKnownKey(key)) {
    console.error(`terpix config get: unknown key '${key}'.`);
    process.exit(1);
  }
  const v = readConfig()[key];
  if (v === undefined) {
    console.log('');
    return;
  }
  if ((key as string).includes('api_key')) {
    console.log(maskKey(v as string));
  } else {
    console.log(v);
  }
}

function set(key: string | undefined, value: string | undefined): void {
  if (!key) {
    console.error('terpix config set: missing key.');
    process.exit(1);
  }
  if (!isKnownKey(key)) {
    console.error(`terpix config set: unknown key '${key}'.`);
    process.exit(1);
  }
  // Async value capture: stdin prompt when omitted (or when stdin is a TTY and the user wants to hide the key).
  if (value === undefined) {
    promptValue(key).then((v) => writeAndReport(key, v)).catch((err) => {
      console.error('terpix config set: ' + (err as Error).message);
      process.exit(1);
    });
    return;
  }
  writeAndReport(key, value);
}

function writeAndReport(key: keyof ConfigT, value: string): void {
  try {
    const { path } = updateConfig({ [key]: value } as Partial<ConfigT>);
    if ((key as string).includes('api_key')) {
      console.log(`saved ${key} = ${maskKey(value)} to ${path}`);
    } else {
      console.log(`saved ${key} = ${value} to ${path}`);
    }
  } catch (err) {
    console.error('terpix config set: ' + (err as Error).message);
    process.exit(1);
  }
}

function unset(key: string | undefined): void {
  if (!key) {
    console.error('terpix config unset: missing key.');
    process.exit(1);
  }
  if (!isKnownKey(key)) {
    console.error(`terpix config unset: unknown key '${key}'.`);
    process.exit(1);
  }
  const { path } = updateConfig({ [key]: undefined } as Partial<ConfigT>);
  console.log(`removed ${key} from ${path}`);
}

function promptValueInternal(promptText: string, isSecret: boolean = false): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const stdout = process.stdout as unknown as { write: (s: string) => boolean };
    const stdin = process.stdin as unknown as { isTTY?: boolean };
    if (isSecret && stdin.isTTY) {
      // Hide input by intercepting the writer (rl injects what the user types).
      // Note: this works on most TTYs; output of typed chars is suppressed.
      const muted = Object.create(process.stdout, {
        write: { value: (s: string) => (typeof s === 'string' && s.includes('\n') ? stdout.write('\n') : true) },
      });
      (rl as unknown as { output: NodeJS.WritableStream }).output = muted;
      process.stdout.write(promptText);
    }
    rl.question(isSecret && stdin.isTTY ? '' : promptText, (line) => {
      rl.close();
      const value = (line ?? '').trim();
      if (!value) return reject(new Error('empty value'));
      resolve(value);
    });
  });
}

async function promptValue(key: keyof ConfigT): Promise<string> {
  const isSecret = (key as string).includes('api_key');
  const prompt = isSecret ? `${key} (input hidden): ` : `${key}: `;
  return promptValueInternal(prompt, isSecret);
}

async function setupWizard(): Promise<void> {
  console.log('\nterpix config setup wizard\n');

  // Step 1: Choose provider
  console.log('Which LLM provider?');
  console.log('  [1] anthropic   (Claude 3.5 Sonnet, etc.)');
  console.log('  [2] openai      (GPT-4o, etc.)');
  console.log('  [3] minimax     (MiniMax-M2.7, etc.)');
  console.log('  [4] qwen        (Alibaba DashScope: qwen-plus, qwen-max, qwen-turbo, etc.)');
  console.log('  [5] openai-compat (self-hosted / proxied / any custom OpenAI-compatible endpoint)');

  let providerNum: string;
  try {
    providerNum = await promptValueInternal('Enter choice [1-5]: ', false);
  } catch (err) {
    console.error('setup cancelled.');
    process.exit(1);
  }

  const providerMap: Record<string, ProviderNameT> = {
    '1': 'anthropic',
    '2': 'openai',
    '3': 'minimax',
    '4': 'qwen',
    '5': 'openai-compat',
  };

  const provider = providerMap[providerNum];
  if (!provider) {
    console.error('Invalid choice. Exiting.');
    process.exit(1);
  }

  // Step 2: API key
  const apiKeyField = `${provider === 'openai-compat' ? 'openai_compat' : provider}_api_key` as keyof ConfigT;
  let apiKey: string;
  try {
    apiKey = await promptValueInternal(`Enter ${provider} API key (input hidden): `, true);
  } catch (err) {
    console.error('setup cancelled.');
    process.exit(1);
  }

  const updates: Partial<ConfigT> = {
    provider,
    [apiKeyField]: apiKey,
  };

  // Step 3: openai-compat base URL
  if (provider === 'openai-compat') {
    try {
      const baseURL = await promptValueInternal('Base URL (e.g., https://api.example.com/v1): ', false);
      updates.openai_compat_base_url = baseURL;
    } catch (err) {
      console.error('setup cancelled.');
      process.exit(1);
    }
  }

  // Step 4: optional default model
  const PROVIDER_DEFAULT_MODELS: Record<ProviderNameT, string> = {
    anthropic: 'claude-sonnet-4-6',
    openai: 'gpt-4o',
    minimax: 'MiniMax-M2.7',
    qwen: 'qwen-plus',
    'openai-compat': 'gpt-4o',
  };
  const defaultModel = PROVIDER_DEFAULT_MODELS[provider];
  let modelInput: string;
  try {
    modelInput = await promptValueInternal(
      `Default model (Enter to use '${defaultModel}'): `,
      false,
    );
    if (modelInput) {
      updates.default_model = modelInput;
    }
  } catch (err) {
    // Empty input (cancel) is ok for optional field
  }

  // Save all changes at once
  try {
    const { path } = updateConfig(updates);
    console.log('');
    console.log(`✓ Saved to ${path}`);
    console.log(`Active: ${activeProviderLabel()}`);
  } catch (err) {
    console.error('Failed to save: ' + (err as Error).message);
    process.exit(1);
  }
}
