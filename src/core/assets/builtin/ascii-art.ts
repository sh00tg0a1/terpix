import { setCell, drawString, type CharBuffer } from '../../char-grid.js';
import type { AsciiDrawCtx } from '../registry.js';

// Draws a multi-line ASCII art string centered at (cx, cy), color = fg.
// '@' in art = transparent (skip). Other chars drawn opaque in `color`.
function blit(buf: CharBuffer, art: string[], cx: number, cy: number, color: [number, number, number]): void {
  const h = art.length;
  const w = art.reduce((m, l) => Math.max(m, l.length), 0);
  const x0 = Math.floor(cx - w / 2);
  const y0 = Math.floor(cy - h / 2);
  for (let y = 0; y < h; y++) {
    const line = art[y]!;
    for (let x = 0; x < line.length; x++) {
      const ch = line.charCodeAt(x);
      if (ch === 0x40 || ch === 0x20) continue; // '@' or ' ' = transparent
      setCell(buf, x0 + x, y0 + y, ch, color[0], color[1], color[2]);
    }
  }
}

const STAR_ART: string[] = [
  '  *  ',
  ' *** ',
  '*****',
  ' *** ',
  '  *  ',
];

export function drawStarAscii(ctx: AsciiDrawCtx): void {
  blit(ctx.buf, STAR_ART, ctx.cx, ctx.cy, ctx.color);
}

const DROID_ART: string[] = [
  ' ___ ',
  '|o o|',
  '|_+_|',
  '|| ||',
  '|| ||',
  "/_\\_\\",
];

export function drawDroidAscii(ctx: AsciiDrawCtx): void {
  blit(ctx.buf, DROID_ART, ctx.cx, ctx.cy, ctx.color);
}

const HUMAN_ART: string[] = [
  ' ___ ',
  '|. .|',
  '\\_-_/',
  '/|_|\\',
  ' | | ',
  ' | | ',
  '/   \\',
];

export function drawHumanAscii(ctx: AsciiDrawCtx): void {
  blit(ctx.buf, HUMAN_ART, ctx.cx, ctx.cy, ctx.color);
}

// Banner: draws a centered single-line label below an art block. Used as
// helper for ascii intros that want title cards without using the text layer.
export function drawAsciiLabel(
  buf: CharBuffer,
  label: string,
  cx: number,
  cy: number,
  color: [number, number, number],
): void {
  const x = Math.floor(cx - label.length / 2);
  drawString(buf, label, x, Math.floor(cy), color[0], color[1], color[2]);
}
