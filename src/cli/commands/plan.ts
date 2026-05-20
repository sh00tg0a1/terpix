import { writeFile } from 'node:fs/promises';
import { planFromNL } from '../../adapters/llm/anthropic.js';

export interface PlanCommandOpts {
  prompt: string;
  durationMs: number;
  out?: string;
  model?: string;
  renderer?: 'half' | 'ascii';
  style?: string;
}

export function parseDurationMs(raw: string): number {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(raw.trim());
  if (!m) throw new Error(`bad duration '${raw}' (try 15s, 1m30s, 500ms)`);
  const n = parseFloat(m[1]!);
  const unit = m[2] ?? 's';
  if (unit === 'ms') return Math.round(n);
  if (unit === 's') return Math.round(n * 1000);
  return Math.round(n * 60 * 1000);
}

export async function planCmd(opts: PlanCommandOpts): Promise<void> {
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error('terpix plan: ANTHROPIC_API_KEY env var is required.');
    process.exit(2);
  }
  if (!opts.prompt || opts.prompt.trim() === '') {
    console.error('terpix plan: prompt is empty.');
    process.exit(1);
  }
  process.stderr.write('terpix plan: calling LLM...\n');
  const result = await planFromNL({
    prompt: opts.prompt,
    durationMs: opts.durationMs,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.renderer ? { renderer: opts.renderer } : {}),
    ...(opts.style ? { style: opts.style } : {}),
  });

  if (!result.ok) {
    console.error(`terpix plan: ${result.error}`);
    process.exit(1);
  }

  process.stderr.write(
    `terpix plan: ok in ${result.attempts} attempt(s) — ` +
      `tokens in=${result.inputTokens} out=${result.outputTokens} ` +
      `cache_read=${result.cacheReadTokens} cache_create=${result.cacheCreateTokens}\n`,
  );

  const json = JSON.stringify(result.plan, null, 2);
  if (opts.out && opts.out !== '-') {
    await writeFile(opts.out, json + '\n', 'utf8');
    process.stderr.write(`terpix plan: wrote ${opts.out}\n`);
  } else {
    process.stdout.write(json + '\n');
  }
}
