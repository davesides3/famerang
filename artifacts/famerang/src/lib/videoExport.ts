import { canvasToBlob, renderPageToCanvas } from './compositing';
import { getTrimSize } from './types';
import type { Booklet, PageWithStickers } from './types';

export interface VideoExportOptions {
  secondsPerPage: number;
  crossfade: boolean;
  onProgress?: (percent: number) => void;
}

// Longest edge of the output video. 1080 gives a good quality/encode-time
// balance for a slideshow shared to a phone's Camera Roll.
const TARGET_LONG_EDGE = 1080;

// Frame rate used for crossfade transition animation.  Still sections use the
// concat-demuxer "duration" directive so only ONE frame is written per page
// instead of fps × duration frames — this keeps WASM memory usage low.
const TRANSITION_FPS = 24;

// Transition length in frames (12 frames @ 24 fps = 0.5 s).
const TRANSITION_FRAMES = 12;

/** Returns H.264-compatible video dimensions (both must be even). */
function getVideoSize(booklet: Booklet): { w: number; h: number } {
  const { widthPx, heightPx } = getTrimSize(booklet.canvasSize);
  const aspect = widthPx / heightPx;
  let w: number, h: number;
  if (aspect >= 1) {
    w = TARGET_LONG_EDGE;
    h = Math.round(TARGET_LONG_EDGE / aspect);
  } else {
    h = TARGET_LONG_EDGE;
    w = Math.round(TARGET_LONG_EDGE * aspect);
  }
  // H.264 yuv420p requires even dimensions.
  return { w: w % 2 === 0 ? w : w + 1, h: h % 2 === 0 ? h : h + 1 };
}

/** Composites two canvases at `alpha` (0 = all A, 1 = all B). */
function blendCanvases(
  a: HTMLCanvasElement,
  b: HTMLCanvasElement,
  alpha: number,
  w: number,
  h: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(a, 0, 0, w, h);
  ctx.globalAlpha = alpha;
  ctx.drawImage(b, 0, 0, w, h);
  ctx.globalAlpha = 1;
  return canvas;
}

/**
 * Generates an H.264 MP4 slideshow from the booklet's pages.
 *
 * Uses FFmpeg.wasm (single-threaded core, no SharedArrayBuffer / COOP-COEP
 * headers required).  The ~26 MB WASM core is loaded lazily from a CDN on
 * first call and is cached by the browser for subsequent exports.
 *
 * Output plays natively on iOS 11+ (Safari / Files / Photos) and all
 * Android browsers.
 */
export async function generateMp4(
  booklet: Booklet,
  pages: PageWithStickers[],
  options: VideoExportOptions,
): Promise<Blob> {
  if (pages.length === 0) throw new Error('No pages to export.');

  const { onProgress } = options;
  let pct = 0;
  const report = (p: number) => {
    pct = Math.max(pct, Math.min(99, Math.round(p)));
    onProgress?.(pct);
  };

  // ── 1. Lazy-load FFmpeg.wasm ──────────────────────────────────────────────
  // Dynamic imports keep the ~26 MB WASM out of the main app bundle.
  report(1);
  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
    import('@ffmpeg/ffmpeg'),
    import('@ffmpeg/util'),
  ]);

  const ff = new FFmpeg();

  // Single-threaded core loaded from CDN — no SharedArrayBuffer required.
  const CDN = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  await ff.load({
    coreURL: await toBlobURL(`${CDN}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CDN}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  report(10);

  // ── 2. Render each page to a canvas ──────────────────────────────────────
  const { w, h } = getVideoSize(booklet);
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 0; i < pages.length; i++) {
    canvases.push(await renderPageToCanvas(pages[i], booklet, w, h));
    report(10 + ((i + 1) / pages.length) * 35); // 10 → 45 %
  }

  // ── 3. Write frames to MEMFS + build concat list ─────────────────────────
  //
  // Strategy: write exactly one JPEG per still section (using the concat
  // demuxer's `duration` directive to hold it) plus transition blend-frames
  // when crossfade is enabled.  This avoids writing fps × duration frames
  // per page, keeping memory usage low even for large booklets.
  const concatLines: string[] = [];
  let fileIdx = 0;

  const writeJpeg = async (canvas: HTMLCanvasElement, name: string) => {
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95);
    await ff.writeFile(name, new Uint8Array(await blob.arrayBuffer()));
  };

  const transitionDuration =
    options.crossfade ? TRANSITION_FRAMES / TRANSITION_FPS : 0;

  for (let i = 0; i < canvases.length; i++) {
    const hasNext = i < canvases.length - 1;

    // Hold the still for (secondsPerPage − fade-out) so the total per-page
    // duration stays exactly `secondsPerPage`.
    const stillDuration =
      options.secondsPerPage - (hasNext ? transitionDuration : 0);

    const stillName = `f${String(fileIdx++).padStart(5, '0')}.jpg`;
    await writeJpeg(canvases[i], stillName);
    concatLines.push(`file '${stillName}'`);
    concatLines.push(`duration ${stillDuration.toFixed(4)}`);

    // Crossfade blend frames to the next page.
    if (options.crossfade && hasNext) {
      for (let t = 1; t <= TRANSITION_FRAMES; t++) {
        const alpha = t / (TRANSITION_FRAMES + 1);
        const blend = blendCanvases(canvases[i], canvases[i + 1], alpha, w, h);
        const blendName = `f${String(fileIdx++).padStart(5, '0')}.jpg`;
        await writeJpeg(blend, blendName);
        concatLines.push(`file '${blendName}'`);
        concatLines.push(`duration ${(1 / TRANSITION_FPS).toFixed(4)}`);
      }
    }

    report(45 + ((i + 1) / canvases.length) * 20); // 45 → 65 %
  }

  // The concat demuxer requires the last entry to be listed a second time
  // WITHOUT a `duration` line to correctly mark the final frame's end pts.
  const lastFileLine = [...concatLines].reverse().find((l) =>
    l.startsWith("file '"),
  )!;
  concatLines.push(lastFileLine);

  await ff.writeFile('concat.txt', concatLines.join('\n'));
  report(67);

  // ── 4. H.264 encode ───────────────────────────────────────────────────────
  ff.on('progress', ({ progress }) => {
    // `progress` from FFmpeg.wasm is 0–1 (or occasionally slightly negative/
    // >1 on variable-duration inputs); clamp it.
    const clamped = Math.max(0, Math.min(1, progress));
    report(67 + clamped * 32); // 67 → 99 %
  });

  await ff.exec([
    '-f', 'concat',
    '-safe', '0',
    '-i', 'concat.txt',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',    // broadest device compatibility (iOS, Android)
    '-preset', 'fast',
    '-movflags', '+faststart', // moov atom first → instant playback
    'output.mp4',
  ]);

  const data = await ff.readFile('output.mp4');
  // readFile returns Uint8Array | string. Normalise to an ArrayBuffer so the
  // Blob constructor accepts it regardless of whether the buffer is backed by
  // a regular ArrayBuffer or a SharedArrayBuffer (which some WASM builds use).
  const bytes: Uint8Array =
    typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'video/mp4' });
}
