import JSZip from 'jszip';

/**
 * Reads the JSON payload out of a file produced by one of Famerang's export
 * flows (full backup, booklet backup, or stamp pack export). All of these
 * are normally a .zip with a single named JSON entry, but real-world file
 * handling can hand back something slightly different than what we wrote:
 *
 * - Some browsers/OSes auto-extract a downloaded .zip that contains a
 *   single file, so the user ends up picking the bare .json file instead.
 * - A file shared/re-saved through the OS share sheet can lose its original
 *   internal entry name if it's rezipped by another app.
 *
 * This helper accepts a raw JSON file directly, and otherwise falls back
 * from an exact entry-name match to the first .json entry found in the
 * zip, so a genuine Famerang export is always recognized.
 */
export async function readJsonPayloadFromFile(
  file: File,
  preferredEntryName: string,
): Promise<string> {
  const looksLikeJson =
    file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';
  if (looksLikeJson) {
    return file.text();
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    // Not a zip either. It might still be JSON without a matching name/type
    // (e.g. renamed by hand), so make one last attempt before giving up.
    const text = await file.text();
    if (text.trim().startsWith('{')) return text;
    throw new Error('This file is not a valid Famerang export.');
  }

  const exact = zip.file(preferredEntryName);
  if (exact) return exact.async('string');

  const jsonEntries = zip.file(/\.json$/i);
  if (jsonEntries.length > 0) {
    return jsonEntries[0].async('string');
  }

  throw new Error('This file is not a valid Famerang export.');
}
