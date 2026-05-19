import { Command } from 'commander';
import { play } from './commands/play.js';

const program = new Command();

program
  .name('terpix')
  .description('NL-driven terminal character-stream movie renderer')
  .version('0.0.1');

program
  .command('play')
  .description('Decode a video and play it in the current terminal')
  .argument('<input>', 'path to a video file')
  .option('--fps <n>', 'target frames per second', (v) => parseInt(v, 10), 24)
  .action(async (input: string, opts: { fps: number }) => {
    await play(input, { fps: opts.fps });
  });

program
  .command('probe')
  .description('Print detected terminal capabilities')
  .action(async () => {
    const { probeCaps } = await import('../adapters/terminal/driver.js');
    console.log(JSON.stringify(probeCaps(), null, 2));
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
