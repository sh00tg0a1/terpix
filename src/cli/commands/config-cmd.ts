import { createInterface } from 'node:readline';
import {
  configFileInfo,
  maskKey,
  readConfig,
  updateConfig,
  type ConfigT,
} from '../../core/config.js';

const KNOWN_KEYS = new Set<keyof ConfigT>([
  'anthropic_api_key',
  'default_model',
  'default_style',
  'default_renderer',
]);

function isKnownKey(k: string): k is keyof ConfigT {
  return (KNOWN_KEYS as Set<string>).has(k);
}

export interface ConfigCmdOpts {
  subcommand: 'show' | 'get' | 'set' | 'unset' | 'path';
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
  }
}

function show(): void {
  const info = configFileInfo();
  const cfg = readConfig();
  console.log(`config: ${info.path}` + (info.exists ? ` (mode ${info.mode})` : ' (not yet created)'));
  for (const key of KNOWN_KEYS) {
    const v = cfg[key];
    if (v === undefined) {
      console.log(`  ${key} = (unset)`);
    } else if (key === 'anthropic_api_key') {
      console.log(`  ${key} = ${maskKey(v)}`);
    } else {
      console.log(`  ${key} = ${v}`);
    }
  }
  console.log('');
  console.log('overrides:');
  console.log(`  ANTHROPIC_API_KEY env = ${maskKey(process.env['ANTHROPIC_API_KEY'])}`);
  console.log(`  TERPIX_MODEL env      = ${process.env['TERPIX_MODEL'] ?? '(unset)'}`);
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
  if (key === 'anthropic_api_key') {
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
    if (key === 'anthropic_api_key') {
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

async function promptValue(key: keyof ConfigT): Promise<string> {
  const isSecret = key === 'anthropic_api_key';
  const prompt = isSecret ? `${key} (input hidden): ` : `${key}: `;
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
      process.stdout.write(prompt);
    }
    rl.question(isSecret && stdin.isTTY ? '' : prompt, (line) => {
      rl.close();
      const value = (line ?? '').trim();
      if (!value) return reject(new Error('empty value'));
      resolve(value);
    });
  });
}
