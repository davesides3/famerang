import type { Booklet, PageStampWithStamp, PageWithStamps } from './types';

/** Wraps `text` to fit within `maxWidth` on the given canvas context,
 * splitting on whitespace and breaking any single word that is itself too
 * long to fit on one line. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

function loadImageCached(
  cache: Map<string, HTMLImageElement>,
  src: string,
): Promise<HTMLImageElement> {
  const existing = cache.get(src);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

const imageCache = new Map<string, HTMLImageElement>();

// Web fonts (Baloo 2, Patrick Hand) are only fetched by the browser once
// something actually renders with them -- a plain <canvas> draw does not
// trigger that download, so `ctx.fillText` can silently substitute the
// fallback font on first use even though `booklet.fontFamily` is correct.
// Explicitly requesting the font here (idempotent, cached by the browser)
// and awaiting `document.fonts.ready` ensures the glyphs are actually
// available before we draw with them.
const requestedFonts = new Set<string>();
async function ensureFontLoaded(fontFamily: string, fontSizePx: number): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const key = fontFamily;
  if (!requestedFonts.has(key)) {
    requestedFonts.add(key);
    try {
      await document.fonts.load(`${Math.max(fontSizePx, 16)}px "${fontFamily}"`);
    } catch {
      // Font may be a system font with no matching @font-face (e.g. Verdana,
      // Georgia, Comic Sans MS) -- nothing to load, that's fine.
    }
  }
  await document.fonts.ready;
}

/**
 * Composites one storybook page (photo + caption + stamps) onto a canvas.
 * This is the single source of truth for page layout -- the live page
 * editor preview, the draft PDF, and the page-image export all render
 * through this function so what the user sees while editing is exactly
 * what gets exported.
 *
 * @param renderSize Pixel size of the square canvas to render at. Pass the
 *   booklet's full `canvasSize` for export, or a smaller size for fast
 *   on-screen previews.
 */
export async function renderPageToCanvas(
  page: PageWithStamps,
  booklet: Booklet,
  renderSize: number = booklet.canvasSize,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = renderSize;
  canvas.height = renderSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, renderSize, renderSize);

  const scale = renderSize / booklet.canvasSize;
  const fontSize = booklet.fontSize * scale;
  const margin = renderSize * 0.06;
  const lineHeight = fontSize * 1.25;

  await ensureFontLoaded(booklet.fontFamily, fontSize);

  ctx.font = `${fontSize}px "${booklet.fontFamily}", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1a1a1a';
  const textLines = page.textContent
    ? wrapText(ctx, page.textContent, renderSize - margin * 2)
    : [];
  const textBlockHeight = textLines.length
    ? textLines.length * lineHeight + margin
    : 0;

  const photoBoxSize = renderSize - margin * 2 - textBlockHeight;
  const photoBoxTop =
    page.textPlacement === 'above'
      ? margin + textBlockHeight
      : margin;
  const photoBoxLeft = margin;

  // Photo (center-cropped square, already downscaled on upload)
  if (page.photoDataUrl) {
    const img = await loadImageCached(imageCache, page.photoDataUrl);
    ctx.drawImage(
      img,
      photoBoxLeft,
      photoBoxTop,
      photoBoxSize,
      photoBoxSize,
    );
  } else {
    ctx.fillStyle = '#e8e4dc';
    ctx.fillRect(photoBoxLeft, photoBoxTop, photoBoxSize, photoBoxSize);
  }

  // Caption text
  if (textLines.length) {
    const textTop =
      page.textPlacement === 'above'
        ? margin
        : photoBoxTop + photoBoxSize + margin * 0.5;
    ctx.font = `${fontSize}px "${booklet.fontFamily}", sans-serif`;
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'center';
    textLines.forEach((line, i) => {
      ctx.fillText(line, renderSize / 2, textTop + i * lineHeight);
    });
    ctx.textAlign = 'left';
  }

  // Stamps, drawn in stacking order, centered on their relative position.
  const sortedStamps = [...page.stamps].sort(
    (a, b) => a.stackOrder - b.stackOrder,
  );
  for (const placement of sortedStamps as PageStampWithStamp[]) {
    const stampImg = await loadImageCached(
      imageCache,
      placement.stamp.pngDataUrl,
    );
    const stampSize = renderSize * 0.22;
    const cx = placement.xRatio * renderSize;
    const cy = placement.yRatio * renderSize;
    const aspect = stampImg.naturalWidth / stampImg.naturalHeight || 1;
    const w = aspect >= 1 ? stampSize : stampSize * aspect;
    const h = aspect >= 1 ? stampSize / aspect : stampSize;
    ctx.drawImage(stampImg, cx - w / 2, cy - h / 2, w, h);
  }

  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/jpeg',
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      type,
      quality,
    );
  });
}
