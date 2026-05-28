import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface NewProjectOpts {
  dir: string;
  title?: string;
  fps?: number;
  size?: string;
  renderer?: 'half' | 'ascii';
  force?: boolean;
}

// Scaffold an empty terpix project. Writes a project.json skeleton + creates
// scenes/ and assets/ subdirs. Refuses to clobber an existing project unless
// --force.
export async function newProject(opts: NewProjectOpts): Promise<void> {
  const projPath = join(opts.dir, 'project.json');
  if (existsSync(projPath) && !opts.force) {
    console.error(`terpix new: '${opts.dir}' already has project.json (use --force to overwrite)`);
    process.exit(1);
  }
  mkdirSync(join(opts.dir, 'scenes'), { recursive: true });
  mkdirSync(join(opts.dir, 'assets'), { recursive: true });
  const project = {
    title: opts.title ?? '',
    fps: opts.fps ?? 24,
    size: opts.size ?? '1280x720',
    renderer: opts.renderer ?? 'half',
    scenes: [],
  };
  writeFileSync(projPath, JSON.stringify(project, null, 2) + '\n', 'utf8');
  process.stderr.write(
    `terpix new: scaffolded ${opts.dir}/{project.json, scenes/, assets/}\n` +
      `  next: terpix scene add ${opts.dir} "<prompt>"\n`,
  );
}
