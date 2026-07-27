import JSZip from 'jszip';
import { db } from './db';
import type { Sticker, StickerPack } from './types';

// ─── Format ───────────────────────────────────────────────────────────────────
//
// v1 (removed): single `famerang-sticker-pack.json` with pngDataUrl fields
//               embedded in each sticker object.
// v2 (current): `manifest.json` + one `<sticker-name>.png` binary entry per sticker.

const STAMP_PACK_VERSION = 2;
const MANIFEST_ENTRY = 'manifest.json';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Sticker row as it appears inside the v2 manifest (no image data). */
interface ManifestSticker {
  id: string;
  name: string;
  contentHash: string;
  /** Path of the PNG entry inside the zip, e.g. `"my-sticker.png"`. */
  filename: string;
}

interface StickerPackManifestV2 {
  version: 2;
  exportedAt: number;
  kind: 'stickerPack';
  package: StickerPack;
  stickers: ManifestSticker[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const newId = () => crypto.randomUUID();

/** Derives a unique filename for a sticker within the zip.
 * Uses the sticker name (already a clean label like "dinosaur-1") plus `.png`.
 * Appends the first 8 chars of the sticker id when there is a name collision. */
function stickerFilename(sticker: Sticker, usedFilenames: Set<string>): string {
  const base = `${sticker.name}.png`;
  if (!usedFilenames.has(base)) return base;
  return `${sticker.name}-${sticker.id.slice(0, 8)}.png`;
}

/** Converts a base64 data URL to a Uint8Array of raw bytes. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Converts a Uint8Array (raw PNG bytes) to a data URL. */
function bytesToDataUrl(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:image/png;base64,${btoa(bin)}`;
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Exports a sticker pack as a v2 ZIP containing:
 *   - `manifest.json`  — package metadata + sticker list (no image data)
 *   - `<name>.png`     — one raw PNG binary entry per sticker
 *
 * PNG entries use STORE compression since PNG is already compressed.
 */
export async function exportStickerPackZip(packageId: string): Promise<Blob> {
  const pkg = await db.stickerPacks.get(packageId);
  if (!pkg) throw new Error('Sticker pack not found.');
  const stickers = await db.stickers.where('packageId').equals(packageId).toArray();

  const zip = new JSZip();
  const usedFilenames = new Set<string>();
  const manifestStickers: ManifestSticker[] = [];

  for (const sticker of stickers) {
    const filename = stickerFilename(sticker, usedFilenames);
    usedFilenames.add(filename);
    manifestStickers.push({ id: sticker.id, name: sticker.name, contentHash: sticker.contentHash, filename });
    zip.file(filename, dataUrlToBytes(sticker.pngDataUrl), { compression: 'STORE' });
  }

  const manifest: StickerPackManifestV2 = {
    version: STAMP_PACK_VERSION,
    exportedAt: Date.now(),
    kind: 'stickerPack',
    package: pkg,
    stickers: manifestStickers,
  };

  zip.file(MANIFEST_ENTRY, JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: 'blob' });
}

// ─── Import ───────────────────────────────────────────────────────────────────

export type StickerPackImportTarget =
  | { mode: 'new' }
  | { mode: 'merge'; packageId: string };

/**
 * Imports a v2 sticker pack ZIP (`manifest.json` + individual `.png` entries).
 * Stickers always get fresh IDs on import to avoid collisions with existing data.
 */
export async function importStickerPackZip(
  file: File,
  target: StickerPackImportTarget,
): Promise<StickerPack> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This file is not a valid Famerang sticker pack.');
  }

  const manifestEntry = zip.file(MANIFEST_ENTRY);
  if (!manifestEntry) throw new Error('This file is not a valid Famerang sticker pack.');

  let manifest: StickerPackManifestV2;
  try {
    manifest = JSON.parse(await manifestEntry.async('string')) as StickerPackManifestV2;
  } catch {
    throw new Error('This file is not a valid Famerang sticker pack.');
  }

  if (!manifest?.package || !Array.isArray(manifest.stickers)) {
    throw new Error('This file is not a valid Famerang sticker pack.');
  }

  const stickers: Sticker[] = await Promise.all(
    manifest.stickers.map(async (ms) => {
      const entry = zip.file(ms.filename);
      if (!entry) throw new Error(`Sticker pack is missing image file: ${ms.filename}`);
      const bytes = await entry.async('uint8array');
      return {
        id: ms.id,
        packageId: manifest.package.id,
        name: ms.name,
        contentHash: ms.contentHash,
        pngDataUrl: bytesToDataUrl(bytes),
      };
    }),
  );

  return db.transaction('rw', db.stickerPacks, db.stickers, async () => {
    let targetPackage: StickerPack;

    if (target.mode === 'merge') {
      const existing = await db.stickerPacks.get(target.packageId);
      if (!existing) throw new Error('Target sticker pack no longer exists.');
      targetPackage = existing;
    } else {
      const existing = await db.stickerPacks.toArray();
      const maxOrder = existing.reduce((m, p) => Math.max(m, p.sortOrder ?? -1), -1);
      targetPackage = {
        id: newId(),
        name: manifest.package.name,
        createdAt: Date.now(),
        sortOrder: maxOrder + 1,
        ...(manifest.package.artist !== undefined && { artist: manifest.package.artist }),
        ...(manifest.package.creditsUrl !== undefined && { creditsUrl: manifest.package.creditsUrl }),
        ...(manifest.package.creditsLocked !== undefined && { creditsLocked: manifest.package.creditsLocked }),
      };
      await db.stickerPacks.add(targetPackage);
    }

    const importedStickers: Sticker[] = stickers.map((s) => ({
      ...s,
      id: newId(),
      packageId: targetPackage.id,
    }));
    if (importedStickers.length) await db.stickers.bulkAdd(importedStickers);

    return targetPackage;
  });
}
