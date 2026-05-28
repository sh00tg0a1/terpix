import { composite, type ComposeOpts } from '../compositor.js';
import type { RGBFrame } from '../types.js';
import type { ScenePlanT } from '../dsl.js';

// Chain multiple plans into one continuous frame stream. Each plan is
// composited with ITS OWN style/camera/background — heterogeneous looks just
// work because the plan-level settings live with the plan. ptsMs is offset
// per plan by the cumulative prior duration so the timeline stays monotonic
// for the encoder. One sequencer → one ffmpeg process → one mp4 (no re-
// encode / no `ffmpeg concat`).
export async function* sequence(
  plans: ScenePlanT[],
  opts: ComposeOpts,
): AsyncGenerator<RGBFrame> {
  let offset = 0;
  for (const plan of plans) {
    for await (const frame of composite(plan, opts)) {
      yield { ...frame, ptsMs: frame.ptsMs + offset };
    }
    offset += plan.shots.reduce((s, sh) => s + sh.durationMs, 0);
  }
}

export function totalDurationMs(plans: ScenePlanT[]): number {
  let n = 0;
  for (const plan of plans) for (const shot of plan.shots) n += shot.durationMs;
  return n;
}
