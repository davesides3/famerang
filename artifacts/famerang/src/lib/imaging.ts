// Client-side image utilities. Photos are always center-cropped and
// downscaled to the booklet's square canvas size BEFORE being written to
// local storage, so we never keep a full-resolution phone photo around.

/** Loads a File/Blob into an HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Reads a user-selected photo file, center-crops it to a square, and
 * downscales it to `targetSize` x `targetSize`. Returns a JPEG data URL.
 * This keeps on-device storage bounded regardless of the source photo's
 * resolution.
 */
export async function downscaleImageFileToDataUrl(
  file: File,
  targetSize: number,
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);

    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Reads a transparent PNG stamp file as-is (no resizing -- stamps are
 * typically small, pre-cropped assets), returning a data URL. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** SHA-256 content hash of a file, used to de-duplicate stamps. */
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
