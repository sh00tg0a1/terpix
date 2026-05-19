import type { CellRatio } from '../core/types.js';
import { probeCaps } from '../adapters/terminal/driver.js';

export interface RenderSize {
  w: number;
  h: number;
  cols: number;
  rows: number;
}

export function computeRenderSize(cellRatio: CellRatio, override?: { w: number; h: number }): RenderSize {
  const caps = probeCaps();
  const cols = caps.cols;
  const rows = Math.max(2, caps.rows - 1);
  const max = parseInt(process.env['TERPIX_MAX_COLS'] ?? '160', 10);
  const effCols = override ? override.w : Math.min(cols, max);
  const effRows = override ? override.h : rows;
  const w = effCols * cellRatio.w;
  const hRaw = effRows * cellRatio.h;
  const h = hRaw % 2 === 0 ? hRaw : hRaw - 1;
  return { w, h, cols: effCols, rows: effRows };
}
