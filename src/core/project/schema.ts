import { z } from 'zod';

// One entry in the timeline. Path is resolved relative to the project dir.
// `transition` is accepted but ignored in phase 1 (concat only); the field
// stays so the schema is forward-compatible with crossfade/cut handling.
export const SceneRef = z.object({
  file: z.string().min(1),
  transition: z
    .object({
      kind: z.enum(['cut', 'crossfade']).default('cut'),
      ms: z.number().nonnegative().default(0),
    })
    .optional(),
});

// A terpix project: a self-contained film. `project.json` lives at the dir
// root; `scenes/` holds the v1 / v2 DSL files (`SceneRef.file` paths); an
// optional `assets/` dir holds project-local shape sprites that the loader
// auto-registers (kept out of the global ~/.cache so re-renders are
// reproducible and portable — zip the dir, render anywhere, same result).
export const Project = z.object({
  title: z.string().default(''),
  fps: z.number().int().positive().default(24),
  size: z
    .string()
    .regex(/^\d+x\d+$/i, 'size must look like "1280x720"')
    .default('1280x720'),
  renderer: z.enum(['half', 'ascii']).default('half'),
  audio: z.string().optional(),
  // May be empty in a freshly scaffolded project — render-time errors with a
  // clear message instead of a schema rejection on read.
  scenes: z.array(SceneRef).default([]),
});

export type ProjectT = z.infer<typeof Project>;
export type SceneRefT = z.infer<typeof SceneRef>;
