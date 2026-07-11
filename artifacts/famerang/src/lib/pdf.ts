import { jsPDF } from 'jspdf';
import { renderPageToCanvas } from './compositing';
import type { Booklet, PageWithStamps } from './types';

const DRAFT_RENDER_SIZE = 900;
// Draft pages are downsampled to DRAFT_RENDER_SIZE regardless of trim size,
// so the draft PDF stays small even for the largest booklets -- page count
// is what drives its size, not trim size.
const BYTES_PER_PIXEL_ESTIMATE = 0.09;

/** Anything estimated above this is flagged as a large export (matches the
 * threshold used for photo exports). */
export const LARGE_PDF_EXPORT_BYTES = 25 * 1024 * 1024;

export function estimateDraftPdfBytes(pageCount: number): number {
  return pageCount * DRAFT_RENDER_SIZE * DRAFT_RENDER_SIZE * BYTES_PER_PIXEL_ESTIMATE;
}

export function isLargeDraftPdf(pageCount: number): boolean {
  return estimateDraftPdfBytes(pageCount) > LARGE_PDF_EXPORT_BYTES;
}

/**
 * Generates a fast 1-up draft PDF: one portrait sheet per page, with the
 * composited square page centered on the sheet. Rendered at a reduced
 * resolution so it stays quick to generate and share, even on a phone.
 */
export async function generateDraftPdf(
  booklet: Booklet,
  pages: PageWithStamps[],
  draftRenderSize = DRAFT_RENDER_SIZE,
): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const boxSize = Math.min(pageWidth, pageHeight) - margin * 2;
  const x = (pageWidth - boxSize) / 2;
  const y = (pageHeight - boxSize) / 2;

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const canvas = await renderPageToCanvas(pages[i], booklet, draftRenderSize);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    pdf.addImage(dataUrl, 'JPEG', x, y, boxSize, boxSize);
  }

  return pdf.output('blob');
}
