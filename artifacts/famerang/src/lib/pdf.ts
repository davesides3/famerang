 import { jsPDF } from 'jspdf';
import { renderPageToCanvas } from './compositing';
import { getTrimSize } from './types';
import type { Booklet, PageWithStickers } from './types';

// Trim sizes are authored at 300 DPI. Scale factor for other DPI targets:
//   150 DPI → 0.5 × native pixels
//   300 DPI → 1.0 × native pixels
const NATIVE_DPI = 300;
const DRAFT_DPI  = 150;
const PRINT_DPI  = 300;

const BYTES_PER_PIXEL_ESTIMATE = 0.09;

/** Anything estimated above this is flagged as a large export (matches the
 * threshold used for photo exports). */
export const LARGE_PDF_EXPORT_BYTES = 25 * 1024 * 1024;

// Conservative per-page pixel area at each DPI, using the largest trim (9×9).
// widthPx = 2700 at 300 DPI → 1350 at 150 DPI.
const DRAFT_PIXELS_PER_PAGE = 1350 * 1350; // 150 DPI, 9×9 upper bound
const PRINT_PIXELS_PER_PAGE = 2700 * 2700; // 300 DPI, 9×9 upper bound

export function estimateDraftPdfBytes(pageCount: number): number {
  return pageCount * DRAFT_PIXELS_PER_PAGE * BYTES_PER_PIXEL_ESTIMATE;
}

export function isLargeDraftPdf(pageCount: number): boolean {
  return estimateDraftPdfBytes(pageCount) > LARGE_PDF_EXPORT_BYTES;
}

export function estimatePrintPdfBytes(pageCount: number): number {
  return pageCount * PRINT_PIXELS_PER_PAGE * BYTES_PER_PIXEL_ESTIMATE;
}

export function isLargePrintPdf(pageCount: number): boolean {
  return estimatePrintPdfBytes(pageCount) > LARGE_PDF_EXPORT_BYTES;
}

/**
 * Core PDF generator. Renders every page at the given DPI and packs them
 * into a 1-up portrait PDF, one sheet per page.
 */
async function generatePdfAtDpi(
  booklet: Booklet,
  pages: PageWithStickers[],
  targetDpi: number,
  jpegQuality: number,
): Promise<Blob> {
  const { widthPx, heightPx } = getTrimSize(booklet.canvasSize);
  const trimAspect = widthPx / heightPx;

  // Scale render dimensions from native (300 DPI) to the target DPI.
  const scale   = targetDpi / NATIVE_DPI;
  const renderW = Math.round(widthPx  * scale);
  const renderH = Math.round(heightPx * scale);

  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36; // 0.5 inch in points

  // Fit the trim rectangle inside the available letter area, preserving ratio.
  const availW = pageWidth  - margin * 2;
  const availH = pageHeight - margin * 2;
  let boxW: number, boxH: number;
  if (trimAspect >= availW / availH) {
    boxW = availW;
    boxH = boxW / trimAspect;
  } else {
    boxH = availH;
    boxW = boxH * trimAspect;
  }
  const x = (pageWidth  - boxW) / 2;
  const y = (pageHeight - boxH) / 2;

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const canvas  = await renderPageToCanvas(pages[i], booklet, renderW, renderH);
    const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    pdf.addImage(dataUrl, 'JPEG', x, y, boxW, boxH);
  }

  return pdf.output('blob');
}

/**
 * Draft PDF — 150 DPI images, optimised for screen viewing and sharing.
 * Smaller file, fast to generate on a phone.
 */
export async function generateDraftPdf(
  booklet: Booklet,
  pages: PageWithStickers[],
): Promise<Blob> {
  return generatePdfAtDpi(booklet, pages, DRAFT_DPI, 0.82);
}

/**
 * Print PDF — 300 DPI images (full trim resolution), suitable for home
 * printing or uploading to an online print service.
 */
export async function generatePrintPdf(
  booklet: Booklet,
  pages: PageWithStickers[],
): Promise<Blob> {
  return generatePdfAtDpi(booklet, pages, PRINT_DPI, 0.92);
}
