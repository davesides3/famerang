import { getTrimSize } from './types';
import type { Booklet, PageStickerWithSticker, PageWithStickers } from './types';

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
 * Composites one storybook page (photo + caption + stickers) onto a canvas.
 * This is the single source of truth for page layout -- the live page
 * editor preview, the draft PDF, and the page-image export all render
 * through this function so what the user sees while editing is exactly
 * what gets exported.
 *
 * For square booklets `renderWidth === renderHeight`; for portrait booklets
 * (e.g. 7.5"×10") they differ. Both default to the booklet's full pixel
 * dimensions. Pass smaller values for fast on-screen previews -- the
 * function scales all measurements proportionally.
 *
 * @param renderWidth  Pixel width of the canvas to render at.
 * @param renderHeight Pixel height of the canvas to render at.
 */
export async function renderPageToCanvas(
  page: PageWithStickers,
  booklet: Booklet,
  renderWidth?: number,
  renderHeight?: number,
): Promise<HTMLCanvasElement> {
  const trimSize = getTrimSize(booklet.canvasSize);
  const rw = renderWidth  ?? trimSize.widthPx;
  const rh = renderHeight ?? trimSize.heightPx;

  const canvas = document.createElement('canvas');
  canvas.width  = rw;
  canvas.height = rh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Background — intentionally always white for print fidelity.
  // The exported page must look the same on paper as it does on screen, so
  // this must never be changed to a theme-aware colour.  Caption text is
  // correspondingly always dark (#1a1a1a below) so it stays legible on the
  // white background regardless of the app's current colour scheme.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, rw, rh);

  // Scale factor is based on width so font size and margins stay
  // proportional to the page's horizontal dimension for both square and
  // portrait layouts.
  const scale = rw / trimSize.widthPx;
  const fontSize = booklet.fontSize * scale;
  const margin = rw * 0.06;
  const lineHeight = fontSize * 1.25;

  await ensureFontLoaded(booklet.fontFamily, fontSize);

  ctx.font = `${fontSize}px "${booklet.fontFamily}", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1a1a1a';
  const textLines = page.textContent
    ? wrapText(ctx, page.textContent, rw - margin * 2)
    : [];
  const textBlockHeight = textLines.length
    ? textLines.length * lineHeight + margin
    : 0;

  // Photo box fills the full available width and the remaining height after
  // reserving space for the text block and margins. For square booklets
  // with no caption, photoBoxWidth === photoBoxHeight (square box). For
  // portrait booklets or pages with captions, the box is rectangular -- the
  // stored photo is already cropped to this aspect ratio by imaging.ts.
  const photoBoxWidth  = rw - margin * 2;
  const photoBoxHeight = rh - margin * 2 - textBlockHeight;
  const photoBoxTop =
    page.textPlacement === 'above'
      ? margin + textBlockHeight
      : margin;
  const photoBoxLeft = margin;

  // Photo (center-cropped to the booklet's aspect ratio, already downscaled
  // on upload -- draw it to fill the photo box exactly)
  if (page.photoDataUrl) {
    const img = await loadImageCached(imageCache, page.photoDataUrl);
    ctx.drawImage(img, photoBoxLeft, photoBoxTop, photoBoxWidth, photoBoxHeight);
  } else {
    ctx.fillStyle = '#e8e4dc';
    ctx.fillRect(photoBoxLeft, photoBoxTop, photoBoxWidth, photoBoxHeight);
  }

  // Caption text
  if (textLines.length) {
    const textTop =
      page.textPlacement === 'above'
        ? margin
        : photoBoxTop + photoBoxHeight + margin * 0.5;
    ctx.font = `${fontSize}px "${booklet.fontFamily}", sans-serif`;
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'center';
    textLines.forEach((line, i) => {
      ctx.fillText(line, rw / 2, textTop + i * lineHeight);
    });
    ctx.textAlign = 'left';
  }

  // Stickers, drawn in stacking order, centered on their relative position.
  // xRatio and yRatio are fractions of the page width/height respectively,
  // so they work correctly for both square and portrait pages.
  const sortedStickers = [...page.stickers].sort(
    (a, b) => a.stackOrder - b.stackOrder,
  );
  for (const placement of sortedStickers as PageStickerWithSticker[]) {
    const stickerImg = await loadImageCached(
      imageCache,
      placement.sticker.pngDataUrl,
    );
    // Use page width as the reference for sticker sizing so a sticker appears
    // the same visual weight regardless of portrait vs. square layout.
    const stickerSize = rw * 0.22;
    const cx = placement.xRatio * rw;
    const cy = placement.yRatio * rh;
    const aspect = stickerImg.naturalWidth / stickerImg.naturalHeight || 1;
    const w = aspect >= 1 ? stickerSize : stickerSize * aspect;
    const h = aspect >= 1 ? stickerSize / aspect : stickerSize;
    ctx.drawImage(stickerImg, cx - w / 2, cy - h / 2, w, h);
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
