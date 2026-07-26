import JSZip from 'jszip';
import { db } from './db';
import type { Stamp, StampPackage } from './types';

// ─── Format constants ─────────────────────────────────────────────────────────

// v1 (legacy): a single `famerang-stamp-pack.json` entry with pngDataUrl
//              fields embedded in each stamp object.
// v2 (current): a `manifest.json` entry with metadata only, plus one
//              `<stamp-name>.png` binary entry per stamp.
const STAMP_PACK_VERSION = 2;
const MANIFEST_ENTRY = 'manifest.json';
const LEGACY_ENTRY = 'famerang-stamp-pack.json';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Stamp row as it appears inside the v2 manifest (no image data). */
interface ManifestStamp {
  id: string;
  name: string;
  contentHash: string;
  /** Path of the PNG entry inside the zip, e.g. `"my-stamp.png"`. */
  filename: string;
}

/** The v2 manifest.json shape. */
interface StampPackManifestV2 {
  version: 2;
  exportedAt: number;
  kind: 'stampPack';
  package: StampPackage;
  stamps: ManifestStamp[];
}

/** Legacy v1 payload shape (single JSON with base64 images). */
interface StampPackPayloadV1 {
  version: 1 | number; // older exports may have version: 1 or be unversioned
  exportedAt: number;
  kind: 'stampPack';
  package: StampPackage;
  stamps: Stamp[]; // stamps have pngDataUrl
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const newId = () => crypto.randomUUID();

/** Derive a unique filename for a stamp within the zip.
 * Uses the stamp name (already a clean label like "dinosaur-1") plus `.png`.
 * Appends the first 8 chars of the stamp id when there is a name collision. */
function stampFilename(stamp: Stamp, usedFilenames: Set<string>): string {
  const base = `${stamp.name}.png`;
  if (!usedFilenames.has(base)) return base;
  return `${stamp.name}-${stamp.id.slice(0, 8)}.png`;
}

/** Convert a base64 data URL to a Uint8Array of raw bytes. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Convert a Uint8Array (raw PNG bytes) to a data URL. */
function bytesToDataUrl(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:image/png;base64,${btoa(bin)}`;
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Exports a stamp pack as a ZIP containing:
 *   - `manifest.json`   — package metadata + stamp list (no image data)
 *   - `<name>.png`      — one raw PNG binary entry per stamp
 *
 * PNG entries use STORE compression (no-op) since PNG is already compressed.
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
 * Imports a stamp pack ZIP, supporting both:
 *   - **v2** (current): `manifest.json` + individual `.png` entries
 *   - **v1** (legacy): a single `famerang-stamp-pack.json` with base64 images
 *
 * Also accepts a bare `.json` file (v1 format exported without the zip wrapper,
 * e.g. auto-extracted by an OS on download).
 *
 * Stamps always get fresh IDs on import to avoid collisions with existing data.
 */
export async function importStampPackageZip(
  file: File,
  target: StampPackImportTarget,
): Promise<StampPackage> {
  // ── Detect format ────────────────────────────────────────────────────────

  const looksLikeJson =
    file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';

  let stamps: Stamp[];
  let packageMeta: StampPackage;

  if (looksLikeJson) {
    // Bare JSON file — must be v1 format.
    const text = await file.text();
    ({ stamps, packageMeta } = await parseV1Json(text));
  } else {
    // Attempt to load as zip.
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch {
      // Last-ditch: might be a JSON file with a non-JSON extension.
      const text = await file.text();
      if (text.trim().startsWith('{')) {
        ({ stamps, packageMeta } = await parseV1Json(text));
      } else {
        throw new Error('This file is not a valid Famerang stamp pack.');
      }
    }

    const manifestEntry = zip!.file(MANIFEST_ENTRY);
    if (manifestEntry) {
      ({ stamps, packageMeta } = await parseV2Zip(zip!, manifestEntry));
    } else {
      // Fall back to v1 (legacy single-JSON zip).
      const legacyEntry = zip!.file(LEGACY_ENTRY) ?? zip!.file(/\.json$/i)[0];
      if (!legacyEntry) throw new Error('This file is not a valid Famerang stamp pack.');
      ({ stamps, packageMeta } = await parseV1Json(await legacyEntry.async('string')));
    }
  }

  // ── Write to DB ──────────────────────────────────────────────────────────

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
        name: packageMeta.name,
        createdAt: Date.now(),
        sortOrder: maxOrder + 1,
        // Carry over optional credit fields so packs shipped with artist info
        // import faithfully.
        ...(packageMeta.artist !== undefined && { artist: packageMeta.artist }),
        ...(packageMeta.creditsUrl !== undefined && { creditsUrl: packageMeta.creditsUrl }),
        ...(packageMeta.creditsLocked !== undefined && { creditsLocked: packageMeta.creditsLocked }),
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

// ─── Format parsers ───────────────────────────────────────────────────────────

async function parseV2Zip(
  zip: JSZip,
  manifestEntry: JSZip.JSZipObject,
): Promise<{ stamps: Stamp[]; packageMeta: StampPackage }> {
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

  return { stamps, packageMeta: manifest.package };
}

async function parseV1Json(
  text: string,
): Promise<{ stamps: Stamp[]; packageMeta: StampPackage }> {
  let payload: StampPackPayloadV1;
  try {
    payload = JSON.parse(text) as StampPackPayloadV1;
  } catch {
    throw new Error('This file is not a valid Famerang stamp pack.');
  }

  if (!payload?.package || !Array.isArray(payload.stamps)) {
    throw new Error('This file is not a valid Famerang stamp pack.');
  }

  return { stamps: payload.stamps, packageMeta: payload.package };
}
