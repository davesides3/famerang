import { jsPDF } from 'jspdf';
import { renderPageToCanvas } from './compositing';
import { getTrimSize } from './types';
import type { Booklet, PageWithStamps } from './types';

// Draft renders are capped at this many pixels on the long edge, regardless
// of trim size, so the PDF stays small even for large booklets.
const DRAFT_LONG_EDGE = 900;
const BYTES_PER_PIXEL_ESTIMATE = 0.09;

/** Anything estimated above this is flagged as a large export (matches the
 * threshold used for photo exports). */
export const LARGE_PDF_EXPORT_BYTES = 25 * 1024 * 1024;

export function estimateDraftPdfBytes(pageCount: number): number {
  // Conservative square estimate -- portrait pages are slightly smaller,
  // but DRAFT_LONG_EDGE^2 keeps the warning threshold safe for all sizes.
  return pageCount * DRAFT_LONG_EDGE * DRAFT_LONG_EDGE * BYTES_PER_PIXEL_ESTIMATE;
}

export function isLargeDraftPdf(pageCount: number): boolean {
  return estimateDraftPdfBytes(pageCount) > LARGE_PDF_EXPORT_BYTES;
}

/**
 * Generates a fast 1-up draft PDF: one portrait sheet per page, with the
 * composited page image scaled to fill the available area while preserving
 * the booklet's trim aspect ratio. Rendered at a reduced resolution so it
 * stays quick to generate and share, even on a phone.
 */
export async function generateDraftPdf(
  booklet: Booklet,
  pages: PageWithStamps[],
): Promise<Blob> {
  const { widthPx, heightPx } = getTrimSize(booklet.canvasSize);
  const trimAspect = widthPx / heightPx;

  // Draft render dimensions: scale so the long edge equals DRAFT_LONG_EDGE.
  const draftW = trimAspect >= 1
    ? DRAFT_LONG_EDGE
    : Math.round(DRAFT_LONG_EDGE * trimAspect);
  const draftH = trimAspect >= 1
    ? Math.round(DRAFT_LONG_EDGE / trimAspect)
    : DRAFT_LONG_EDGE;

  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36; // 0.5 inch in points

  // Fit the trim rectangle inside the available letter area, preserving ratio.
  const availW = pageWidth  - margin * 2;
  const availH = pageHeight - margin * 2;
  let boxW: number, boxH: number;
  if (trimAspect >= availW / availH) {
    // Wider than the available slot — constrain to available width.
    boxW = availW;
    boxH = boxW / trimAspect;
  } else {
    // Taller than the available slot — constrain to available height.
    boxH = availH;
    boxW = boxH * trimAspect;
  }
  const x = (pageWidth  - boxW) / 2;
  const y = (pageHeight - boxH) / 2;

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const canvas = await renderPageToCanvas(pages[i], booklet, draftW, draftH);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    pdf.addImage(dataUrl, 'JPEG', x, y, boxW, boxH);
  }

  return pdf.output('blob');
}
