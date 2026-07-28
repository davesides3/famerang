import { canvasToBlob, renderPageToCanvas } from './compositing';
import { getTrimSize } from './types';
import type { Booklet, PageWithStickers } from './types';

/**
 * Set to true after the FFmpeg WASM core has been loaded at least once in
 * this browser session.  The browser caches the ~26 MB core after the first
 * load, so every subsequent load skips the CDN download entirely.
 */
let _encoderLoaded = false;

/** Returns true if the FFmpeg WASM core was already loaded (and therefore
 *  cached) earlier in this browser session. */
export function isEncoderCached(): boolean {
  return _encoderLoaded;
}

export interface VideoExportOptions {
  secondsPerPage: number;
  crossfade: boolean;
  onProgress?: (percent: number) => void;
  /** Called during the initial CDN download of the FFmpeg WASM core.
   *  `received` and `total` are in bytes; `total` may be 0 if the server
   *  does not send a Content-Length header. */
  onDownloadProgress?: (received: number, total: number) => void;
  /** Called as each page is processed during rendering (phase='rendering')
   *  and MEMFS frame-writing (phase='writing').
   *  `current` is 1-based; `total` is the total page count. */
  onPageProgress?: (current: number, total: number, phase: 'rendering' | 'writing') => void;
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

/** Debug logger — all video-export log lines are prefixed [VideoExport] so
 *  they are easy to filter in DevTools.  Includes a millisecond timestamp
 *  relative to the start of the export so you can spot hangs at a glance. */
let _exportStart = 0;
function dbg(msg: string, ...args: unknown[]) {
  const elapsed = _exportStart ? `+${Date.now() - _exportStart}ms` : '';
  // eslint-disable-next-line no-console
  console.log(`[VideoExport] ${elapsed} ${msg}`, ...args);
}

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
  _exportStart = Date.now();
  dbg('generateMp4 started', { pages: pages.length, secondsPerPage: options.secondsPerPage, crossfade: options.crossfade });

  if (pages.length === 0) throw new Error('No pages to export.');

  const { onProgress, onDownloadProgress, onPageProgress } = options;
  let pct = 0;
  const report = (p: number) => {
    pct = Math.max(pct, Math.min(99, Math.round(p)));
    onProgress?.(pct);
  };

  // ── 1. Lazy-load FFmpeg.wasm ──────────────────────────────────────────────
  // Dynamic imports keep the ~26 MB WASM out of the main app bundle.
  report(1);
  dbg('dynamic import @ffmpeg/ffmpeg + @ffmpeg/util — start');
  let FFmpeg: any, toBlobURL: any;
  try {
    const [ffmpegMod, utilMod] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
    ]);
    FFmpeg = ffmpegMod.FFmpeg;
    toBlobURL = utilMod.toBlobURL;
    dbg('dynamic import — done');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[VideoExport] dynamic import failed', err);
    throw err;
  }

  const ff = new FFmpeg();

  // Total output duration — used to convert FFmpeg's `time=` timestamp into a
  // 0–1 encode-phase fraction.  Crossfade transitions are carved out of the
  // still duration, so total wall-clock time is always pages × secondsPerPage.
  const totalDurationMs = pages.length * options.secondsPerPage * 1000;
  // Flag flipped to true just before ff.exec() so the time parser only fires
  // during the encode phase, not during ff.load() warm-up.
  let encodePhaseActive = false;

  // Attach the FFmpeg log listener so WASM stderr is visible in DevTools.
  // During encoding, also parse the `time=HH:MM:SS.ss` field that FFmpeg
  // writes on every stats line — this gives per-frame progress updates that
  // are much more granular than the `progress` event (which can stall at the
  // start while the encoder pipeline fills up).
  ff.on('log', ({ type, message }: { type: string; message: string }) => {
    // eslint-disable-next-line no-console
    console.log(`[VideoExport][ffmpeg:${type}] ${message}`);
    if (!encodePhaseActive) return;
    // FFmpeg stats lines look like:
    //   frame=   12 fps= 8.1 q=28.0 size=    512kB time=00:00:00.50 bitrate=…
    const m = message.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return;
    const currentMs =
      (parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3])) * 1000;
    const fraction = Math.min(1, currentMs / totalDurationMs);
    report(67 + fraction * 32); // 67 → 99 %
  });

  // Single-threaded core loaded from CDN — no SharedArrayBuffer required.
  // On first use the browser (or Workbox runtime cache) fetches ~26 MB from
  // unpkg; subsequent calls are served from the local cache.
  const CDN = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  try {
    // Track combined byte progress for both CDN files (.js + .wasm).
    // The .js file is a few KB; the .wasm is ~26 MB, so the combined total
    // is effectively the WASM download.
    let jsReceived = 0, jsTotal = 0;
    let wasmReceived = 0, wasmTotal = 0;
    const reportDownload = () => {
      const total = jsTotal + wasmTotal;
      const received = jsReceived + wasmReceived;
      onDownloadProgress?.(received, total);
    };

    dbg('fetching ffmpeg-core.js + ffmpeg-core.wasm from CDN', CDN);

    // Helper: stream-fetch a URL while reporting byte progress.
    const streamFetch = async (
      url: string,
      onBytes: (received: number, total: number) => void,
    ): Promise<Uint8Array> => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
      const contentLength = res.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      const reader = res.body?.getReader();
      if (!reader) {
        // Fall back to arrayBuffer when streaming is unavailable.
        const buf = await res.arrayBuffer();
        onBytes(buf.byteLength, buf.byteLength);
        return new Uint8Array(buf);
      }
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        onBytes(received, total);
      }
      const merged = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
      return merged;
    };

    let lastJsLog = 0, lastWasmLog = 0;
    const [jsBytes, wasmBytes] = await Promise.all([
      streamFetch(`${CDN}/ffmpeg-core.js`, (r, t) => {
        jsReceived = r; jsTotal = t; reportDownload();
        const now = Date.now();
        if (now - lastJsLog > 2000) {
          dbg(`  ffmpeg-core.js  ${(r / 1024).toFixed(0)} KB / ${t > 0 ? (t / 1024).toFixed(0) + ' KB' : '?'}`);
          lastJsLog = now;
        }
      }),
      streamFetch(`${CDN}/ffmpeg-core.wasm`, (r, t) => {
        wasmReceived = r; wasmTotal = t; reportDownload();
        const now = Date.now();
        if (now - lastWasmLog > 2000) {
          dbg(`  ffmpeg-core.wasm ${(r / 1_048_576).toFixed(1)} MB / ${t > 0 ? (t / 1_048_576).toFixed(1) + ' MB' : '?'}`);
          lastWasmLog = now;
        }
      }),
    ]);

    // The @ffmpeg/ffmpeg ESM worker loads the core via dynamic import() in a
    // module-worker context.  The UMD build of ffmpeg-core.js declares
    // `var createFFmpegCore = ...` at top level — in an ES module that stays
    // module-scoped (it never reaches self/globalThis) and there is no
    // `.default` export, so the worker's fallback
    // `self.createFFmpegCore = (await import(url)).default` gets undefined and
    // throws "failed to import ffmpeg-core.js".
    // Fix: append an ESM default export of the module-scoped variable.
    const jsText = new TextDecoder().decode(jsBytes);
    const jsWithDefault = `${jsText}\nexport default createFFmpegCore;\n`;

    const coreURL = URL.createObjectURL(
      new Blob([jsWithDefault], { type: 'text/javascript' }),
    );
    const wasmURL = URL.createObjectURL(
      new Blob([wasmBytes], { type: 'application/wasm' }),
    );
    dbg('blob URLs ready');

    // Signal that the download phase is done; the next phase is WASM
    // instantiation (ff.load), which can take 5–20 s on mobile.
    // Reporting 2% lets the UI distinguish "downloading" from "instantiating".
    report(2);

    dbg('ff.load() — start (instantiating WASM module)');
    await ff.load({ coreURL, wasmURL });
    _encoderLoaded = true;
    dbg('ff.load() — done');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[VideoExport] encoder load failed', err);
    // Network errors here almost always mean the device is offline and the
    // encoder hasn't been cached yet from a previous export.
    const isNetworkError =
      err instanceof TypeError &&
      /fetch|network|failed to fetch/i.test((err as TypeError).message);
    if (isNetworkError || !navigator.onLine) {
      throw new Error(
        'Encoder not yet downloaded — connect to the internet for the first export (~26 MB one-time download).',
      );
    }
    throw err;
  }
  report(10);

  // ── 2. Render each page to a canvas ──────────────────────────────────────
  const { w, h } = getVideoSize(booklet);
  dbg(`rendering ${pages.length} pages at ${w}×${h}`);
  const canvases: HTMLCanvasElement[] = [];
  for (let i = 0; i < pages.length; i++) {
    dbg(`  render page ${i + 1}/${pages.length} — start`);
    try {
      canvases.push(await renderPageToCanvas(pages[i], booklet, w, h));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[VideoExport] renderPageToCanvas failed on page ${i + 1}`, err);
      throw err;
    }
    dbg(`  render page ${i + 1}/${pages.length} — done`);
    report(10 + ((i + 1) / pages.length) * 35); // 10 → 45 %
    onPageProgress?.(i + 1, pages.length, 'rendering');
  }
  dbg('all pages rendered');

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

  const totalFrames = options.crossfade
    ? pages.length + (pages.length - 1) * TRANSITION_FRAMES
    : pages.length;
  dbg(`writing ${totalFrames} frame(s) to MEMFS — start`);

  for (let i = 0; i < canvases.length; i++) {
    const hasNext = i < canvases.length - 1;

    // Hold the still for (secondsPerPage − fade-out) so the total per-page
    // duration stays exactly `secondsPerPage`.
    const stillDuration =
      options.secondsPerPage - (hasNext ? transitionDuration : 0);

    const stillName = `f${String(fileIdx++).padStart(5, '0')}.jpg`;
    try {
      await writeJpeg(canvases[i], stillName);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[VideoExport] writeJpeg failed for ${stillName}`, err);
      throw err;
    }
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
    onPageProgress?.(i + 1, canvases.length, 'writing');
  }
  dbg(`MEMFS write done — ${fileIdx} file(s) written`);

  // The concat demuxer requires the last entry to be listed a second time
  // WITHOUT a `duration` line to correctly mark the final frame's end pts.
  const lastFileLine = [...concatLines].reverse().find((l) =>
    l.startsWith("file '"),
  )!;
  concatLines.push(lastFileLine);

  await ff.writeFile('concat.txt', concatLines.join('\n'));
  report(67);
  dbg('concat.txt written');

  // ── 4. H.264 encode ───────────────────────────────────────────────────────
  // Activate the log-based time parser (registered above on the log listener).
  encodePhaseActive = true;

  dbg('ff.exec() (H.264 encode) — start');
  try {
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
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[VideoExport] ff.exec() failed', err);
    throw err;
  }
  dbg('ff.exec() — done');

  dbg('ff.readFile(output.mp4) — start');
  let data: Uint8Array | string;
  try {
    data = await ff.readFile('output.mp4');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[VideoExport] ff.readFile() failed', err);
    throw err;
  }
  dbg(`ff.readFile() — done, type=${typeof data}, byteLength=${typeof data !== 'string' ? (data as Uint8Array).byteLength : 'n/a (string)'}`);

  // readFile returns Uint8Array | string. Normalise to an ArrayBuffer so the
  // Blob constructor accepts it regardless of whether the buffer is backed by
  // a regular ArrayBuffer or a SharedArrayBuffer (which some WASM builds use).
  const bytes: Uint8Array =
    typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'video/mp4' });
  dbg(`blob ready — size=${(blob.size / 1_048_576).toFixed(2)} MB`);
  return blob;
}
