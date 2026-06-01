import { writeFile } from 'node:fs/promises';
import { planFromNL, hasLLMKey, resolveImageGen, resolveProvider } from '../../adapters/llm/provider.js';

export interface PlanCommandOpts {
  prompt: string;
  durationMs: number;
  out?: string;
  model?: string;
  renderer?: 'half' | 'ascii';
  style?: string;
  visionModel?: string;
  visionRounds?: number;
  visualFewShot?: boolean;
  genAssets?: boolean;
  assetMode?: 'shape' | 'image';
  imageModel?: string;
  imageSize?: string;
  imageMaxSide?: number;
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
  if (!hasLLMKey()) {
    console.error(
      'terpix plan: no LLM API key configured.\n' +
        '  Run: terpix config show\n' +
        '  Run: terpix config set <provider>_api_key ...  (anthropic | openai | minimax | qwen | openai_compat)',
    );
    process.exit(2);
  }
  if (!opts.prompt || opts.prompt.trim() === '') {
    console.error('terpix plan: prompt is empty.');
    process.exit(1);
  }
  // If --vision-model is set, route the vision critic through the same
  // provider (its endpoint + key) so it works out-of-the-box for qwen,
  // openai, etc. The vision model must be vision-capable (qwen-vl-plus,
  // gpt-4o, etc.).
  let vision: { apiKey: string; baseURL?: string; model: string; rounds: number } | undefined;
  if (opts.visionModel) {
    const r = resolveProvider();
    if ('error' in r) {
      console.error(`terpix plan: vision critic disabled: ${r.error}`);
    } else {
      vision = {
        apiKey: r.apiKey,
        ...(r.baseURL ? { baseURL: r.baseURL } : {}),
        model: opts.visionModel,
        rounds: opts.visionRounds ?? 1,
      };
      process.stderr.write(
        `terpix plan: vision critic enabled (model=${vision.model}, rounds=${vision.rounds})\n`,
      );
    }
  }

  // Image-mode genAssets requires a DashScope key. Resolve it up front so we
  // fail with a clear message rather than partway through scene composition.
  let imageGen: { apiKey: string; model?: string; baseURL?: string; size?: string; maxSide?: number } | undefined;
  if (opts.genAssets && opts.assetMode === 'image') {
    const r = resolveImageGen({
      ...(opts.imageModel ? { model: opts.imageModel } : {}),
      ...(opts.imageSize ? { size: opts.imageSize } : {}),
      ...(opts.imageMaxSide !== undefined ? { maxSide: opts.imageMaxSide } : {}),
    });
    if ('error' in r) {
      console.error('terpix plan: ' + r.error);
      process.exit(2);
    }
    imageGen = r;
    process.stderr.write(
      `terpix plan: image asset mode (model=${imageGen.model}, size=${imageGen.size})\n`,
    );
  }

  process.stderr.write('terpix plan: calling LLM...\n');
  const result = await planFromNL({
    prompt: opts.prompt,
    durationMs: opts.durationMs,
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.renderer ? { renderer: opts.renderer } : {}),
    ...(opts.style ? { style: opts.style } : {}),
    ...(vision ? { vision } : {}),
    ...(opts.visualFewShot ? { visualFewShot: true } : {}),
    ...(opts.genAssets ? { genAssets: true } : {}),
    ...(opts.assetMode ? { assetMode: opts.assetMode } : {}),
    ...(imageGen ? { imageGen } : {}),
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
