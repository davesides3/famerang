// Client-side image utilities. Photos are always center-cropped and
// downscaled to the booklet's page dimensions BEFORE being written to
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
 * Reads a user-selected photo file, center-crops it to the target aspect
 * ratio, and downscales it to `targetWidth` × `targetHeight`. Returns a
 * JPEG data URL. This keeps on-device storage bounded regardless of the
 * source photo's resolution.
 *
 * For square booklets `targetWidth === targetHeight` (behaviour unchanged
 * from the original square-only implementation). For portrait booklets
 * (e.g. 7.5"×10") the crop window matches the page's 3:4 ratio.
 */
export async function downscaleImageFileToDataUrl(
  file: File,
  targetWidth: number,
  targetHeight: number,
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const targetAspect = targetWidth / targetHeight;
    const imgAspect    = img.naturalWidth / img.naturalHeight;

    let srcWidth: number, srcHeight: number, sx: number, sy: number;
    if (imgAspect > targetAspect) {
      // Source image is wider than target ratio — crop the sides.
      srcHeight = img.naturalHeight;
      srcWidth  = img.naturalHeight * targetAspect;
      sx = (img.naturalWidth - srcWidth) / 2;
      sy = 0;
    } else {
      // Source image is taller than target ratio — crop top/bottom.
      srcWidth  = img.naturalWidth;
      srcHeight = img.naturalWidth / targetAspect;
      sx = 0;
      sy = (img.naturalHeight - srcHeight) / 2;
    }

    const canvas = document.createElement('canvas');
    canvas.width  = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, srcWidth, srcHeight, 0, 0, targetWidth, targetHeight);

    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Reads a transparent PNG sticker file as-is (no resizing -- stickers are
 * typically small, pre-cropped assets), returning a data URL. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** SHA-256 content hash of a file, used to de-duplicate stickers. */
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
