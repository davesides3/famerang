import { jsPDF } from 'jspdf';
import { renderPageToCanvas } from './compositing';
import type { Booklet, PageWithStamps } from './types';

/**
 * Generates a fast 1-up draft PDF: one portrait sheet per page, with the
 * composited square page centered on the sheet. Rendered at a reduced
 * resolution so it stays quick to generate and share, even on a phone.
 */
export async function generateDraftPdf(
  booklet: Booklet,
  pages: PageWithStamps[],
  draftRenderSize = 900,
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
