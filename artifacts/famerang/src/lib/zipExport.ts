import JSZip from 'jszip';
import { canvasToBlob, renderPageToCanvas } from './compositing';
import type { Booklet, PageWithStamps } from './types';

/**
 * Renders every page in the booklet at full resolution and bundles them
 * into a single downloadable/shareable ZIP of images.
 */
export async function exportPageImagesZip(
  booklet: Booklet,
  pages: PageWithStamps[],
): Promise<Blob> {
  const zip = new JSZip();
  for (let i = 0; i < pages.length; i++) {
    const canvas = await renderPageToCanvas(pages[i], booklet, booklet.canvasSize);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    const filename = `page-${String(i + 1).padStart(2, '0')}.jpg`;
    zip.file(filename, blob);
  }
  return zip.generateAsync({ type: 'blob' });
}
