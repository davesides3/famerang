/**
 * Generates a print-ready sticker sheet (7" × 10.5" at 300 DPI) as both PNG
 * blob(s) and a multi-page PDF blob.  Each sticker is drawn in a 4-column grid
 * with its filename (minus the .png extension) as a caption below.
 */
import { jsPDF } from 'jspdf';
import type { Sticker, StickerPack } from './types';

// ── Page geometry (300 DPI) ────────────────────────────────────────────────
const DPI      = 300;
const PT_TO_PX = DPI / 72;           // 4.1667 — convert point sizes to canvas px

const PAGE_W_IN = 7;
const PAGE_H_IN = 10.5;
const PAGE_W_PX = Math.round(PAGE_W_IN * DPI);   // 2100
const PAGE_H_PX = Math.round(PAGE_H_IN * DPI);   // 3150

const MARGIN_PX = Math.round(0.5  * DPI);         // 150  — half-inch margin
const COLS      = 4;

// Typography
const TITLE_PT     = 28;
const CAPTION_PT   = 8;
const CREDIT_PT    = 7;
const TITLE_PX     = Math.round(TITLE_PT   * PT_TO_PX);   // 117
const CAPTION_PX   = Math.round(CAPTION_PT * PT_TO_PX);   // 33
const CREDIT_PX    = Math.round(CREDIT_PT  * PT_TO_PX);   // 29

// Grid layout
const GRID_W     = PAGE_W_PX - 2 * MARGIN_PX;             // 1800
const CELL_W     = Math.floor(GRID_W / COLS);              // 450
const STICKER_SIZE = Math.round(CELL_W * 0.78);              // 351
const CAPTION_H  = Math.round(0.3 * DPI);                  // 90  — text + padding
const CELL_H     = STICKER_SIZE + CAPTION_H;                 // 441

// How far down the grid starts (after header)
const HEADER_BLOCK_H = MARGIN_PX + TITLE_PX + Math.round(0.15 * DPI); // 150+117+45 ≈ 312
const GRID_Y         = HEADER_BLOCK_H;
const GRID_AVAIL_H   = PAGE_H_PX - GRID_Y - MARGIN_PX;   // 3150 - 312 - 150 = 2688
const ROWS_PER_PAGE  = Math.floor(GRID_AVAIL_H / CELL_H); // 6
const PER_PAGE       = COLS * ROWS_PER_PAGE;               // 24

// ── Helpers ────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

// ── Per-page renderer ──────────────────────────────────────────────────────

function renderPage(
  canvas: HTMLCanvasElement,
  pkg: StickerPack,
  stickers: Sticker[],
  images: (HTMLImageElement | null)[],
  pageIndex: number,
  totalPages: number,
): void {
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W_PX, PAGE_H_PX);

  // Pack name
  ctx.fillStyle = '#1a1a1a';
  ctx.font      = `bold ${TITLE_PX}px sans-serif`;
  ctx.textAlign = 'center';
  const titleText = totalPages > 1 ? `${pkg.name}  (${pageIndex + 1} / ${totalPages})` : pkg.name;
  ctx.fillText(titleText, PAGE_W_PX / 2, MARGIN_PX + TITLE_PX);

  // Stickers
  const base = pageIndex * PER_PAGE;
  const slice = stickers.slice(base, base + PER_PAGE);

  slice.forEach((sticker, i) => {
    const col  = i % COLS;
    const row  = Math.floor(i / COLS);
    const cellX = MARGIN_PX + col * CELL_W;
    const cellY = GRID_Y     + row * CELL_H;

    // Sticker image — centred in cell width, flush to cell top
    const img = images[base + i];
    if (img) {
      const imgX = cellX + (CELL_W - STICKER_SIZE) / 2;
      ctx.drawImage(img, imgX, cellY, STICKER_SIZE, STICKER_SIZE);
    }

    // Caption
    const caption = sticker.name.replace(/\.png$/i, '');
    ctx.fillStyle = '#444444';
    ctx.font      = `${CAPTION_PX}px sans-serif`;
    ctx.textAlign = 'center';
    const maxW   = CELL_W - Math.round(0.1 * DPI);
    const label  = ellipsize(ctx, caption, maxW);
    const captionY = cellY + STICKER_SIZE + Math.round(CAPTION_H * 0.55);
    ctx.fillText(label, cellX + CELL_W / 2, captionY);
  });

  // Artist credit footer
  if (pkg.artist) {
    ctx.fillStyle  = '#999999';
    ctx.font       = `${CREDIT_PX}px sans-serif`;
    ctx.textAlign  = 'center';
    const credit   = pkg.creditsUrl ? `${pkg.artist} — ${pkg.creditsUrl}` : pkg.artist;
    ctx.fillText(credit, PAGE_W_PX / 2, PAGE_H_PX - Math.round(0.3 * DPI));
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface StickerSheetAssets {
  /** One PNG blob per sheet page — single file if stickers fit on one page. */
  pngBlobs: { name: string; blob: Blob }[];
  /** Single PDF containing all sheet pages. */
  pdfBlob: Blob;
}

export async function generateStickerSheetAssets(
  pkg: StickerPack,
  stickers: Sticker[],
): Promise<StickerSheetAssets> {
  const totalPages = Math.max(1, Math.ceil(stickers.length / PER_PAGE));

  // Load all sticker images in parallel
  const images = await Promise.all(stickers.map(s => loadImage(s.pngDataUrl)));

  const canvas     = document.createElement('canvas');
  canvas.width     = PAGE_W_PX;
  canvas.height    = PAGE_H_PX;

  const pngBlobs: { name: string; blob: Blob }[] = [];
  const pageDataUrls: string[] = [];

  for (let p = 0; p < totalPages; p++) {
    renderPage(canvas, pkg, stickers, images, p, totalPages);

    const dataUrl = canvas.toDataURL('image/png');
    pageDataUrls.push(dataUrl);

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas.toBlob failed')), 'image/png'),
    );
    const name = totalPages === 1 ? 'sticker-sheet.png' : `sticker-sheet-${p + 1}.png`;
    pngBlobs.push({ name, blob });
  }

  // PDF — one page per sheet page, sized exactly to the sheet
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: [PAGE_W_IN, PAGE_H_IN],
  });

  pageDataUrls.forEach((dataUrl, i) => {
    if (i > 0) pdf.addPage([PAGE_W_IN, PAGE_H_IN], 'portrait');
    pdf.addImage(dataUrl, 'PNG', 0, 0, PAGE_W_IN, PAGE_H_IN);
  });

  return { pngBlobs, pdfBlob: pdf.output('blob') };
}
