import OpenAI from 'openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { isProjectDir } from '../../core/project/loader.js';
import { resolveProvider } from '../../adapters/llm/provider.js';
import { friendlyApiError } from '../../adapters/llm/errors.js';
import { listAssets } from '../../core/assets/registry.js';
import { sceneAdd } from './scene-add.js';
import { parseDurationMs } from './plan.js';

export interface FilmOpts {
  dir: string;
  prompt: string;
  duration?: string;
  scenes?: number;
  model?: string;
  genAssets?: boolean;
}

const FilmPlan = z.object({
  scenes: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        prompt: z.string().min(3).max(300),
        durationMs: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(8),
});

function directorSystem(totalMs: number, target: number): string {
  const catalog = listAssets()
    .map((a) => `- ${a.name}: ${a.description}`)
    .join('\n');
  return `You are a film director. Break the user's high-level idea into ${target} short narrative beats; each beat becomes ONE rendered clip (the scene planner will turn each into a Scene v2 plan you do not have to write here).

Constraints:
- Output exactly ${target} (±1) scenes.
- Each scene's \`prompt\` is one concrete sentence the scene planner can act on (subjects, action, mood, time-of-day). DO NOT write layout coordinates or DSL — just the visual brief.
- \`name\` is a short kebab-case slug (a-z, 0-9, -).
- \`durationMs\` per scene; durations sum to ≈ ${totalMs} ms (±5%).
- Lean on the EXISTING assets when possible (no point inventing a "human" — it exists). If a scene needs something missing, it can still be mentioned by name; the scene planner / --gen-assets can supply it.
- Keep continuity: same characters across scenes share visual descriptions.

Existing assets:
${catalog}

Call submit_film once with the scene list.`;
}

async function planFilmScenes(
  client: OpenAI,
  model: string,
  prompt: string,
  totalMs: number,
  target: number,
): Promise<{ ok: true; scenes: Array<{ name: string; prompt: string; durationMs: number }> } | { ok: false; error: string }> {
  const schema = zodToJsonSchema(FilmPlan, { target: 'openApi3' }) as Record<string, unknown>;
  let resp;
  try {
    resp = await client.chat.completions.create({
      model,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: directorSystem(totalMs, target) },
        { role: 'user', content: `Idea: "${prompt}"\nTotal duration: ${totalMs} ms.` },
      ],
      tools: [
        { type: 'function', function: { name: 'submit_film', description: 'Submit the scene list.', parameters: schema } },
      ],
      tool_choice: { type: 'function', function: { name: 'submit_film' } },
    });
  } catch (err) {
    return { ok: false, error: friendlyApiError(err) };
  }
  const tc = resp.choices?.[0]?.message.tool_calls?.[0];
  const args = tc && tc.type === 'function' ? tc.function.arguments : undefined;
  if (!args) return { ok: false, error: 'director did not return a scene list' };
  let json: unknown;
  try {
    json = JSON.parse(args);
  } catch (err) {
    return { ok: false, error: `director output was not valid JSON: ${(err as Error).message}` };
  }
  const parsed = FilmPlan.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  return { ok: true, scenes: parsed.data.scenes };
}

// Top-down: one director call decomposes the NL idea into N beat briefs;
// each brief is then passed to sceneAdd (which writes scenes/NN-name.json
// and updates project.json). Asset generation per scene lands in the
// project's local assets/ via the scene-add path.
export async function film(opts: FilmOpts): Promise<void> {
  if (!isProjectDir(opts.dir)) {
    console.error(
      `terpix film: '${opts.dir}' is not a terpix project. Run: terpix new ${opts.dir}`,
    );
    process.exit(1);
  }
  const totalMs = opts.duration ? parseDurationMs(opts.duration) : 30000;
  const target = Math.max(1, Math.min(8, opts.scenes ?? Math.max(2, Math.round(totalMs / 8000))));

  const resolved = resolveProvider();
  if ('error' in resolved) {
    console.error('terpix film: ' + resolved.error);
    process.exit(1);
  }
  if (resolved.kind === 'anthropic') {
    console.error(
      `terpix film: anthropic provider isn't wired for the director pass; ` +
        `use an openai-compat provider (qwen / minimax / openai / openai-compat) ` +
        `via 'terpix config set provider <name>'.`,
    );
    process.exit(1);
  }
  const client = new OpenAI({
    apiKey: resolved.apiKey,
    ...(resolved.baseURL ? { baseURL: resolved.baseURL } : {}),
  });
  const model = opts.model ?? resolved.defaultModel;

  process.stderr.write(`terpix film: directing "${opts.prompt}" (${totalMs}ms, target ${target} scenes)...\n`);
  const r = await planFilmScenes(client, model, opts.prompt, totalMs, target);
  if (!r.ok) {
    console.error('terpix film: ' + r.error);
    process.exit(1);
  }
  process.stderr.write(`terpix film: ${r.scenes.length} scene(s):\n`);
  for (const s of r.scenes) process.stderr.write(`  - ${s.name} (${s.durationMs}ms): ${s.prompt}\n`);

  let ok = 0;
  const failed: Array<{ name: string; error: string }> = [];
  for (const s of r.scenes) {
    const res = await sceneAdd({
      dir: opts.dir,
      prompt: s.prompt,
      duration: `${s.durationMs}ms`,
      name: s.name,
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.genAssets !== undefined ? { genAssets: opts.genAssets } : {}),
    });
    if (res.ok) ok++;
    else {
      failed.push({ name: s.name, error: res.error });
      process.stderr.write(`terpix film: scene '${s.name}' failed: ${res.error}\n`);
    }
  }
  process.stderr.write(`terpix film: ${ok}/${r.scenes.length} scene(s) ok` + (failed.length ? `, ${failed.length} failed` : '') + `\n`);
  if (ok === 0) {
    console.error('terpix film: no scenes succeeded — nothing to render.');
    process.exit(1);
  }
  if (failed.length) {
    process.stderr.write(`terpix film: rendering succeeded scenes only. Re-run failed prompts with:\n`);
    for (const f of failed) process.stderr.write(`  terpix scene add ${opts.dir} "<refined prompt for ${f.name}>"\n`);
  }
  process.stderr.write(`terpix film: render with: terpix render ${opts.dir} -o ${opts.dir}/out.mp4\n`);
}
