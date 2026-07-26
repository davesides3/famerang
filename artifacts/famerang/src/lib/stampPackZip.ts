import JSZip from 'jszip';
import { db } from './db';
import type { Stamp, StampPackage } from './types';

// ─── Format ───────────────────────────────────────────────────────────────────
//
// v1 (removed): single `famerang-stamp-pack.json` with pngDataUrl fields
//               embedded in each stamp object.
// v2 (current): `manifest.json` + one `<stamp-name>.png` binary entry per stamp.

const STAMP_PACK_VERSION = 2;
const MANIFEST_ENTRY = 'manifest.json';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Stamp row as it appears inside the v2 manifest (no image data). */
interface ManifestStamp {
  id: string;
  name: string;
  contentHash: string;
  /** Path of the PNG entry inside the zip, e.g. `"my-stamp.png"`. */
  filename: string;
}

interface StampPackManifestV2 {
  version: 2;
  exportedAt: number;
  kind: 'stampPack';
  package: StampPackage;
  stamps: ManifestStamp[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const newId = () => crypto.randomUUID();

/** Derives a unique filename for a stamp within the zip.
 * Uses the stamp name (already a clean label like "dinosaur-1") plus `.png`.
 * Appends the first 8 chars of the stamp id when there is a name collision. */
function stampFilename(stamp: Stamp, usedFilenames: Set<string>): string {
  const base = `${stamp.name}.png`;
  if (!usedFilenames.has(base)) return base;
  return `${stamp.name}-${stamp.id.slice(0, 8)}.png`;
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
 * Exports a stamp pack as a v2 ZIP containing:
 *   - `manifest.json`  — package metadata + stamp list (no image data)
 *   - `<name>.png`     — one raw PNG binary entry per stamp
 *
 * PNG entries use STORE compression since PNG is already compressed.
 */
export async function exportStampPackageZip(packageId: string): Promise<Blob> {
  const pkg = await db.stampPackages.get(packageId);
  if (!pkg) throw new Error('Stamp pack not found.');
  const stamps = await db.stamps.where('packageId').equals(packageId).toArray();

  const zip = new JSZip();
  const usedFilenames = new Set<string>();
  const manifestStamps: ManifestStamp[] = [];

  for (const stamp of stamps) {
    const filename = stampFilename(stamp, usedFilenames);
    usedFilenames.add(filename);
    manifestStamps.push({ id: stamp.id, name: stamp.name, contentHash: stamp.contentHash, filename });
    zip.file(filename, dataUrlToBytes(stamp.pngDataUrl), { compression: 'STORE' });
  }

  const manifest: StampPackManifestV2 = {
    version: STAMP_PACK_VERSION,
    exportedAt: Date.now(),
    kind: 'stampPack',
    package: pkg,
    stamps: manifestStamps,
  };

  zip.file(MANIFEST_ENTRY, JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: 'blob' });
}

// ─── Import ───────────────────────────────────────────────────────────────────

export type StampPackImportTarget =
  | { mode: 'new' }
  | { mode: 'merge'; packageId: string };

/**
 * Imports a v2 stamp pack ZIP (`manifest.json` + individual `.png` entries).
 * Stamps always get fresh IDs on import to avoid collisions with existing data.
 */
export async function importStampPackageZip(
  file: File,
  target: StampPackImportTarget,
): Promise<StampPackage> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This file is not a valid Famerang stamp pack.');
  }

  const manifestEntry = zip.file(MANIFEST_ENTRY);
  if (!manifestEntry) throw new Error('This file is not a valid Famerang stamp pack.');

  let manifest: StampPackManifestV2;
  try {
    manifest = JSON.parse(await manifestEntry.async('string')) as StampPackManifestV2;
  } catch {
    throw new Error('This file is not a valid Famerang stamp pack.');
  }

  if (!manifest?.package || !Array.isArray(manifest.stamps)) {
    throw new Error('This file is not a valid Famerang stamp pack.');
  }

  const stamps: Stamp[] = await Promise.all(
    manifest.stamps.map(async (ms) => {
      const entry = zip.file(ms.filename);
      if (!entry) throw new Error(`Stamp pack is missing image file: ${ms.filename}`);
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

  return db.transaction('rw', db.stampPackages, db.stamps, async () => {
    let targetPackage: StampPackage;

    if (target.mode === 'merge') {
      const existing = await db.stampPackages.get(target.packageId);
      if (!existing) throw new Error('Target stamp pack no longer exists.');
      targetPackage = existing;
    } else {
      const existing = await db.stampPackages.toArray();
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
      await db.stampPackages.add(targetPackage);
    }

    const importedStamps: Stamp[] = stamps.map((s) => ({
      ...s,
      id: newId(),
      packageId: targetPackage.id,
    }));
    if (importedStamps.length) await db.stamps.bulkAdd(importedStamps);

    return targetPackage;
  });
}
