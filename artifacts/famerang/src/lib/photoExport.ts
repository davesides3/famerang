import JSZip from 'jszip';
import { canvasToBlob, renderPageToCanvas } from './compositing';
import type { Booklet, CanvasSize, PageWithStamps } from './types';

const EXPORT_QUALITY = 0.9;

// Rough average bytes-per-pixel for a photo+text composite JPEG at
// EXPORT_QUALITY. Real output varies with image content, but this is close
// enough to decide whether to show a "this export is large" heads-up.
const BYTES_PER_PIXEL_ESTIMATE = 0.12;

/** Anything estimated above this is flagged as a large export (common email
 * attachment limits sit around 25MB, and it's slow to send over cellular). */
export const LARGE_PHOTO_EXPORT_BYTES = 25 * 1024 * 1024;

/** Estimates the total size of a full-resolution "Send Photos" export
 * without actually rendering anything, so the UI can warn before the
 * (potentially slow) compositing work starts. */
export function estimatePhotoExportBytes(canvasSize: CanvasSize, pageCount: number): number {
  return canvasSize * canvasSize * BYTES_PER_PIXEL_ESTIMATE * pageCount;
}

export function isLargePhotoExport(canvasSize: CanvasSize, pageCount: number): boolean {
  return estimatePhotoExportBytes(canvasSize, pageCount) > LARGE_PHOTO_EXPORT_BYTES;
}

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
