import JSZip from 'jszip';
import { db } from './db';
import type { Booklet, Page, PageStamp, Stamp, StampPackage, TrimSizeKey } from './types';

const BOOKLET_MANIFEST_ENTRY = 'manifest.json';

// ─── v3 manifest shape ───────────────────────────────────────────────────────
//
// v1 (removed): single famerang-booklet-backup.json with all photos and stamp
//               images embedded as base64 data URLs.
// v2 (removed): manifest.json + page-<n>.<ext> binary entries; stamp images
//               still embedded as base64 in manifest.stamps.
// v3 (current): manifest.json + page-<n>.<ext> binary entries +
//               stamps/<name>.png binary entries; no base64 anywhere.

interface BookletManifestPage extends Omit<Page, 'photoDataUrl'> {
  /** Zip entry path for this page's photo, if it has one (e.g. `page-1.jpg`). */
  photoFilename?: string;
}

/** Stamp metadata as stored in the v3 manifest — no image data. */
interface ManifestStamp extends Omit<Stamp, 'pngDataUrl'> {
  /** Zip entry path for this stamp's image (e.g. `stamps/spinosaurus.png`). */
  filename: string;
}

interface BookletManifest {
  version: 3;
  exportedAt: number;
  kind: 'booklet';
  booklet: Booklet;
  pages: BookletManifestPage[];
  pageStamps: PageStamp[];
  stampPackages: StampPackage[];
  stamps: ManifestStamp[];
}

// ─── Helper utilities ─────────────────────────────────────────────────────────

function isValidSortOrder(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

function withNormalizedPackageOrder(packages: StampPackage[]): StampPackage[] {
  if (packages.every((p) => isValidSortOrder(p.sortOrder))) return packages;
  const orderById = new Map(
    [...packages]
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .map((p, index) => [p.id, index] as const),
  );
  return packages.map((p) =>
    isValidSortOrder(p.sortOrder) ? p : { ...p, sortOrder: orderById.get(p.id)! },
  );
}

async function withPreservedPackageOrder(packages: StampPackage[]): Promise<StampPackage[]> {
  if (!packages.length) return packages;
  const [existingById, allLocal] = await Promise.all([
    db.stampPackages.bulkGet(packages.map((p) => p.id)),
    db.stampPackages.toArray(),
  ]);
  let nextOrder = allLocal.reduce((m, p) => Math.max(m, p.sortOrder ?? -1), -1) + 1;
  return packages.map((pkg, i) => {
    const existing = existingById[i];
    if (existing) return { ...pkg, sortOrder: existing.sortOrder };
    return { ...pkg, sortOrder: nextOrder++ };
  });
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg': return 'jpg';
    case 'image/png':  return 'png';
    case 'image/webp': return 'webp';
    case 'image/gif':  return 'gif';
    default:           return 'bin';
  }
}

/** Decodes a base64 data URL to a Uint8Array of raw bytes. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return new Uint8Array(0);
  const bin = atob(parsed.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Converts a Uint8Array of image bytes back to a data URL. */
function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/** Derives a unique `stamps/<filename>.png` path for each stamp.
 * Uses the stamp name; appends the first 8 chars of the ID on collision. */
function stampZipPath(stamp: Stamp, usedPaths: Set<string>): string {
  const base = `stamps/${stamp.name}.png`;
  if (!usedPaths.has(base)) return base;
  return `stamps/${stamp.name}-${stamp.id.slice(0, 8)}.png`;
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Exports a single booklet as a v3 ZIP containing:
 *   - `manifest.json`      — booklet metadata, page records (no photoDataUrl),
 *                            stamp package metadata, stamp metadata (no pngDataUrl)
 *   - `page-<n>.<ext>`     — one binary image file per page that has a photo
 *   - `stamps/<name>.png`  — one binary PNG per stamp used in the booklet
 *
 * Image entries use STORE compression since JPEGs/PNGs are already compressed.
 */
export async function exportBookletZip(bookletId: string): Promise<Blob> {
  const booklet = await db.booklets.get(bookletId);
  if (!booklet) throw new Error('Booklet not found.');

  const pages = await db.pages.where('bookletId').equals(bookletId).sortBy('sortOrder');
  const pageIds = pages.map((p) => p.id);
  const pageStamps = pageIds.length
    ? await db.pageStamps.where('pageId').anyOf(pageIds).toArray()
    : [];

  const stampIds = Array.from(new Set(pageStamps.map((ps) => ps.stampId)));
  const stamps = stampIds.length ? await db.stamps.where('id').anyOf(stampIds).toArray() : [];
  const packageIds = Array.from(new Set(stamps.map((s) => s.packageId)));
  const stampPackages = packageIds.length
    ? await db.stampPackages.where('id').anyOf(packageIds).toArray()
    : [];

  const zip = new JSZip();

  // ── Page photos ────────────────────────────────────────────────────────────
  const manifestPages: BookletManifestPage[] = [];
  pages.forEach((page, index) => {
    const { photoDataUrl, ...pageWithoutPhoto } = page;
    let photoFilename: string | undefined;
    if (photoDataUrl) {
      const parsed = parseDataUrl(photoDataUrl);
      if (parsed) {
        photoFilename = `page-${index + 1}.${extensionForMimeType(parsed.mimeType)}`;
        const bin = atob(parsed.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        zip.file(photoFilename, bytes, { compression: 'STORE' });
      }
    }
    manifestPages.push({ ...pageWithoutPhoto, ...(photoFilename ? { photoFilename } : {}) });
  });

  // ── Stamp images ───────────────────────────────────────────────────────────
  const usedPaths = new Set<string>();
  const manifestStamps: ManifestStamp[] = stamps.map((stamp) => {
    const filename = stampZipPath(stamp, usedPaths);
    usedPaths.add(filename);
    zip.file(filename, dataUrlToBytes(stamp.pngDataUrl), { compression: 'STORE' });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pngDataUrl, ...stampMeta } = stamp;
    return { ...stampMeta, filename };
  });

  // ── Manifest ───────────────────────────────────────────────────────────────
  const manifest: BookletManifest = {
    version: 3,
    exportedAt: Date.now(),
    kind: 'booklet',
    booklet,
    pages: manifestPages,
    pageStamps,
    stampPackages,
    stamps: manifestStamps,
  };

  zip.file(BOOKLET_MANIFEST_ENTRY, JSON.stringify(manifest, null, 2));
  const blob = await zip.generateAsync({ type: 'blob' });

  await markBookletsBackedUp([bookletId]);

  return blob;
}

// ─── Restore ──────────────────────────────────────────────────────────────────

const newId = () => crypto.randomUUID();

/**
 * Restores a single booklet from a v3 ZIP produced by `exportBookletZip`,
 * overwriting the booklet identified by `targetBookletId`.
 *
 * Always replaces (never merges). Restored pages and page-stamps get fresh
 * IDs to avoid colliding with still-live rows from the original booklet.
 */
export async function restoreBookletZip(file: File, targetBookletId: string): Promise<Booklet> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This file is not a valid Famerang booklet backup.');
  }

  const manifestEntry = zip.file(BOOKLET_MANIFEST_ENTRY);
  if (!manifestEntry) throw new Error('This file is not a valid Famerang booklet backup.');

  let manifest: BookletManifest;
  try {
    manifest = JSON.parse(await manifestEntry.async('string')) as BookletManifest;
  } catch {
    throw new Error('This file is not a valid Famerang booklet backup.');
  }

  if (!manifest?.booklet) {
    throw new Error('This file is not a valid Famerang booklet backup.');
  }

  // Pre-v5 backups stored canvasSize as a number (2100/2400/2700). Coerce to
  // the current string key format so restored booklets open correctly.
  const numericToKey: Record<number, TrimSizeKey> = { 2100: '7x7', 2400: '8x8', 2700: '9x9' };
  if (typeof (manifest.booklet.canvasSize as unknown) === 'number') {
    manifest.booklet.canvasSize =
      numericToKey[manifest.booklet.canvasSize as unknown as number] ?? '7x7';
  }

  // ── Page photos ────────────────────────────────────────────────────────────
  const pagesWithPhotos: Page[] = await Promise.all(
    (manifest.pages ?? []).map(async (manifestPage) => {
      const { photoFilename, ...pageFields } = manifestPage;
      if (!photoFilename) return pageFields as Page;
      const imgEntry = zip.file(photoFilename);
      if (!imgEntry) return pageFields as Page;
      const bytes = await imgEntry.async('uint8array');
      const ext = photoFilename.split('.').pop()?.toLowerCase() ?? '';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png', webp: 'image/webp', gif: 'image/gif',
      };
      return { ...pageFields, photoDataUrl: bytesToDataUrl(bytes, mimeMap[ext] ?? 'application/octet-stream') } as Page;
    }),
  );

  // ── Stamps ─────────────────────────────────────────────────────────────────
  const stamps: Stamp[] = await Promise.all(
    (manifest.stamps ?? []).map(async (ms) => {
      const entry = zip.file(ms.filename);
      if (!entry) throw new Error(`Backup is missing stamp image: ${ms.filename}`);
      const bytes = await entry.async('uint8array');
      return { ...ms, pngDataUrl: bytesToDataUrl(bytes, 'image/png') };
    }),
  );

  return applyRestoredBooklet(
    manifest.booklet,
    pagesWithPhotos,
    manifest.pageStamps ?? [],
    manifest.stampPackages ?? [],
    stamps,
    targetBookletId,
  );
}

/**
 * Shared logic: writes the restored booklet data into IndexedDB under
 * `targetBookletId`, assigning fresh IDs to pages and page-stamps to avoid
 * colliding with still-live rows from the original booklet.
 */
async function applyRestoredBooklet(
  booklet: Booklet,
  pages: Page[],
  pageStamps: PageStamp[],
  stampPackages: StampPackage[],
  stamps: Stamp[],
  targetBookletId: string,
): Promise<Booklet> {
  const restoredBooklet: Booklet = { ...booklet, id: targetBookletId };

  const pageIdMap = new Map<string, string>();
  const restoredPages = pages.map((p) => {
    const freshId = newId();
    pageIdMap.set(p.id, freshId);
    return { ...p, id: freshId, bookletId: targetBookletId };
  });

  const restoredPageStamps = pageStamps
    .filter((ps) => pageIdMap.has(ps.pageId))
    .map((ps) => ({ ...ps, id: newId(), pageId: pageIdMap.get(ps.pageId)! }));

  await db.transaction(
    'rw',
    db.booklets,
    db.pages,
    db.stampPackages,
    db.stamps,
    db.pageStamps,
    async () => {
      const existingPages = await db.pages.where('bookletId').equals(targetBookletId).toArray();
      const existingPageIds = existingPages.map((p) => p.id);
      if (existingPageIds.length) {
        await db.pageStamps.where('pageId').anyOf(existingPageIds).delete();
        await db.pages.bulkDelete(existingPageIds);
      }

      await db.booklets.put(restoredBooklet);
      if (restoredPages.length) await db.pages.bulkPut(restoredPages);
      if (stampPackages.length) {
        const orderedPackages = await withPreservedPackageOrder(
          withNormalizedPackageOrder(stampPackages),
        );
        await db.stampPackages.bulkPut(orderedPackages);
      }
      if (stamps.length) await db.stamps.bulkPut(stamps);
      if (restoredPageStamps.length) await db.pageStamps.bulkPut(restoredPageStamps);
    },
  );

  await markBookletsBackedUp([targetBookletId]);

  return restoredBooklet;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function markBookletsBackedUp(bookletIds: string[]): Promise<void> {
  if (!bookletIds.length) return;
  const now = Date.now();
  await db.transaction('rw', db.booklets, async () => {
    await Promise.all(bookletIds.map((id) => db.booklets.update(id, { lastBackedUpAt: now })));
  });
}
