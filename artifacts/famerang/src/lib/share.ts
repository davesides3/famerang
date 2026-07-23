/**
 * Returns true when the primary pointing device is touch (phone/tablet).
 * On Windows/Mac/Linux desktops the pointer is always "fine" (mouse), so
 * this returns false and we skip the OS share sheet in favour of a direct
 * browser download.
 */
function isTouchDevice(): boolean {
  return typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Shares a file through the OS share sheet (text/email/AirDrop/etc.) when
 * the Web Share API supports file sharing AND we are on a touch device,
 * otherwise falls back to triggering a normal browser download. There is no
 * server in this app, so this is the only way exported files leave the device.
 */
export async function shareOrDownloadFile(
  blob: Blob,
  filename: string,
  mimeType: string,
  shareText?: string,
): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: mimeType });

  if (
    isTouchDevice() &&
    typeof navigator !== 'undefined' &&
    'canShare' in navigator &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: filename,
        text: shareText,
      });
      return 'shared';
    } catch (err) {
      // AbortError means the user dismissed the share sheet -- not a real
      // failure, so don't fall through to a surprise download.
      if (err instanceof Error && err.name === 'AbortError') {
        return 'shared';
      }
      // Any other failure (e.g. unsupported in this context) falls through
      // to the download fallback below.
    }
  }

  downloadBlob(blob, filename);
  return 'downloaded';
}

/**
 * Shares multiple files at once through the OS share sheet when the Web
 * Share API supports multi-file sharing -- this is what lets photo apps
 * like Google Photos (Android) or "Save Image(s)" (iOS) appear as targets,
 * since they only register for image files, never for archives. Falls back
 * to downloading a zip (built lazily via `buildFallbackZip`, only when
 * actually needed) when multi-file sharing isn't supported.
 */
export async function shareOrDownloadFiles(
  files: File[],
  buildFallbackZip: () => Promise<Blob>,
  zipFilename: string,
  shareTitle?: string,
  shareText?: string,
): Promise<'shared' | 'downloaded'> {
  if (
    isTouchDevice() &&
    typeof navigator !== 'undefined' &&
    'canShare' in navigator &&
    navigator.canShare({ files })
  ) {
    try {
      await navigator.share({ files, title: shareTitle, text: shareText });
      return 'shared';
    } catch (err) {
      // AbortError means the user dismissed the share sheet -- not a real
      // failure, so don't fall through to a surprise download.
      if (err instanceof Error && err.name === 'AbortError') {
        return 'shared';
      }
      // Any other failure (e.g. unsupported in this context) falls through
      // to the zip download fallback below.
    }
  }

  const zipBlob = await buildFallbackZip();
  downloadBlob(zipBlob, zipFilename);
  return 'downloaded';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
