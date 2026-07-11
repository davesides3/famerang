import JSZip from 'jszip';
import { canvasToBlob, renderPageToCanvas } from './compositing';
import type { Booklet, PageWithStamps } from './types';

const EXPORT_QUALITY = 0.9;

/**
 * Renders every page as an individual full-resolution JPEG `Blob` (real
 * binary image data, not a base64 string) at the booklet's own trim size --
 * the same size the booklet is meant to be printed/viewed at. Used for
 * "Send Photos", which shares these straight into the device's photo
 * library rather than bundling them into the app's own backup format.
 */
export async function renderPagesAsJpegBlobs(
  booklet: Booklet,
  pages: PageWithStamps[],
): Promise<Blob[]> {
  const blobs: Blob[] = [];
  for (const page of pages) {
    const canvas = await renderPageToCanvas(page, booklet, booklet.canvasSize);
    blobs.push(await canvasToBlob(canvas, 'image/jpeg', EXPORT_QUALITY));
  }
  return blobs;
}

/**
 * Bundles already-rendered photo blobs into a zip of real JPEG files (not
 * base64 text) -- the fallback used when the browser/device can't do a
 * native multi-file share.
 */
export async function zipPhotoBlobs(blobs: Blob[], baseName: string): Promise<Blob> {
  const zip = new JSZip();
  blobs.forEach((blob, i) => {
    const num = String(i + 1).padStart(2, '0');
    zip.file(`${baseName}-page-${num}.jpg`, blob);
  });
  return zip.generateAsync({ type: 'blob' });
}
