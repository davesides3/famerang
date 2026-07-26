import JSZip from 'jszip';
import { db } from './db';
import type { Booklet, Page, PageStamp, Stamp, StampPackage } from './types';

const BOOKLET_MANIFEST_ENTRY = 'manifest.json';
// Legacy v1 entry name — kept only for backwards-compat detection
const BOOKLET_BACKUP_ENTRY_V1 = 'famerang-booklet-backup.json';

// ─── v2 manifest shape ───────────────────────────────────────────────────────

interface BookletManifestPage extends Omit<Page, 'photoDataUrl'> {
  /** Zip entry name for this page's photo, if it has one. */
  photoFilename?: string;
}

interface BookletManifest {
  version: 2;
  exportedAt: number;
  kind: 'booklet';
  booklet: Booklet;
  pages: BookletManifestPage[];
  pageStamps: PageStamp[];
  stampPackages: StampPackage[];
  stamps: Stamp[];
}

// ─── v1 (legacy) shape — used only for import backwards compat ───────────────

interface BookletBackupPayloadV1 {
  version: number;
  exportedAt: number;
  kind: 'booklet';
  booklet: Booklet;
  pages: Page[];
  pageStamps: PageStamp[];
  stampPackages: StampPackage[];
  stamps: Stamp[];
}

// ─── Helper utilities ─────────────────────────────────────────────────────────

/** Assigns sortOrder for a batch of restored stamp packages: packages that
 * already exist on this device keep their current position (so restore
 * never reshuffles the local list), while packages that don't exist yet are
 * appended after the current maximum, in the order they appear in the
 * backup -- landing at the bottom of the ordered list instead of the top or
 * an arbitrary position. */
function isValidSortOrder(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/** Backfills `sortOrder` for stamp packages that don't have a valid one --
 * e.g. a backup created before package ordering existed. Uses `createdAt`
 * to reconstruct a stable, sensible order rather than leaving `sortOrder`
 * missing/NaN (which would break `Math.max`-based append-to-bottom logic
 * for every package created afterward). */
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

/**
 * Extracts the MIME type and base64 data from a data URL.
 * Returns null if the string is not a valid data URL.
 */
function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

/**
 * Returns a file extension for common image MIME types.
 */
function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'bin';
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Exports a single booklet -- its own record, pages, stamp placements, and
 * whichever stamps/packages those placements reference -- as a v2 ZIP file.
 *
 * The ZIP contains:
 *   - `manifest.json`  — booklet metadata, page records (no photoDataUrl),
 *                        stamp package + stamp metadata
 *   - `page-<n>.<ext>` — one binary image file per page that has a photo
 *
 * Using STORE compression for image entries since JPEGs/PNGs are already
 * compressed; compressing them again wastes CPU for negligible gain.
 *
 * Marks just this booklet as backed-up as of now.
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
  const manifestPages: BookletManifestPage[] = [];

  pages.forEach((page, index) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { photoDataUrl, ...pageWithoutPhoto } = page;
    let photoFilename: string | undefined;

    if (photoDataUrl) {
      const parsed = parseDataUrl(photoDataUrl);
      if (parsed) {
        const ext = extensionForMimeType(parsed.mimeType);
        photoFilename = `page-${index + 1}.${ext}`;
        // Decode base64 → binary and store without re-compression
        const binary = atob(parsed.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        zip.file(photoFilename, bytes, { compression: 'STORE' });
      }
    }

    manifestPages.push({
      ...pageWithoutPhoto,
      ...(photoFilename ? { photoFilename } : {}),
    });
  });

  const manifest: BookletManifest = {
    version: 2,
    exportedAt: Date.now(),
    kind: 'booklet',
    booklet,
    pages: manifestPages,
    pageStamps,
    stampPackages,
    stamps,
  };

  zip.file(BOOKLET_MANIFEST_ENTRY, JSON.stringify(manifest));
  const blob = await zip.generateAsync({ type: 'blob' });

  await markBookletsBackedUp([bookletId]);

  return blob;
}

// ─── Restore ──────────────────────────────────────────────────────────────────

const newId = () => crypto.randomUUID();

/**
 * Restores a single booklet from a file produced by `exportBookletZip`,
 * overwriting the booklet identified by `targetBookletId`.
 *
 * Detects format automatically:
 *   - v2 ZIP: contains `manifest.json`; page photos are individual zip entries.
 *   - v1 ZIP (legacy): contains `famerang-booklet-backup.json`; page photos
 *     are embedded as base64 data URLs in the JSON.
 *
 * This always replaces (never merges): the target booklet's existing pages
 * and page-stamp placements are deleted first, then the backup's booklet
 * record, pages, and stamp placements are written in under the target id so
 * the caller stays on the same booklet/route it was viewing. Referenced
 * stamps/packages are upserted alongside so the restored pages still render.
 *
 * Restored pages and page-stamps are given brand-new ids rather than reusing
 * the ids captured in the backup. The original booklet the backup came from
 * may still exist on this device (e.g. restoring into a *different* booklet
 * than the one that was exported) -- reusing the old page/page-stamp ids
 * would make `bulkPut` overwrite those still-live rows in place, silently
 * stealing pages away from the original booklet instead of copying them.
 */
export async function restoreBookletZip(file: File, targetBookletId: string): Promise<Booklet> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This file is not a valid Famerang booklet backup.');
  }

  // ── Format detection ──────────────────────────────────────────────────────
  const manifestEntry = zip.file(BOOKLET_MANIFEST_ENTRY);
  const v1Entry = zip.file(BOOKLET_BACKUP_ENTRY_V1);

  if (manifestEntry) {
    return restoreV2(zip, manifestEntry, targetBookletId);
  } else if (v1Entry) {
    return restoreV1(v1Entry, targetBookletId);
  } else {
    throw new Error('This file is not a valid Famerang booklet backup.');
  }
}

/** Restores a v2 booklet backup (manifest.json + image entries). */
async function restoreV2(
  zip: JSZip,
  manifestEntry: JSZip.JSZipObject,
  targetBookletId: string,
): Promise<Booklet> {
  let manifest: BookletManifest;
  try {
    manifest = JSON.parse(await manifestEntry.async('string')) as BookletManifest;
  } catch {
    throw new Error('This file is not a valid Famerang booklet backup.');
  }

  if (!manifest || manifest.version !== 2 || !manifest.booklet) {
    throw new Error('This file is not a valid Famerang booklet backup.');
  }

  // Read each page's photo from its zip entry and reconstruct the data URL
  const pagesWithPhotos: Page[] = await Promise.all(
    (manifest.pages ?? []).map(async (manifestPage) => {
      const { photoFilename, ...pageFields } = manifestPage;
      if (!photoFilename) return pageFields as Page;

      const imgEntry = zip.file(photoFilename);
      if (!imgEntry) return pageFields as Page;

      const bytes = await imgEntry.async('uint8array');
      // Derive MIME type from the filename extension
      const ext = photoFilename.split('.').pop()?.toLowerCase() ?? '';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
      };
      const mimeType = mimeMap[ext] ?? 'application/octet-stream';

      // Convert Uint8Array → base64 in a way that handles large buffers
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const photoDataUrl = `data:${mimeType};base64,${btoa(binary)}`;

      return { ...pageFields, photoDataUrl } as Page;
    }),
  );

  return applyRestoredBooklet(
    manifest.booklet,
    pagesWithPhotos,
    manifest.pageStamps ?? [],
    manifest.stampPackages ?? [],
    manifest.stamps ?? [],
    targetBookletId,
  );
}

/** Restores a v1 booklet backup (single JSON with embedded base64 photos). */
async function restoreV1(
  entry: JSZip.JSZipObject,
  targetBookletId: string,
): Promise<Booklet> {
  let payload: BookletBackupPayloadV1;
  try {
    payload = JSON.parse(await entry.async('string')) as BookletBackupPayloadV1;
  } catch {
    throw new Error('This file is not a valid Famerang booklet backup.');
  }

  if (!payload || typeof payload.version !== 'number' || !payload.booklet) {
    throw new Error('This file is not a valid Famerang booklet backup.');
  }

  return applyRestoredBooklet(
    payload.booklet,
    payload.pages ?? [],
    payload.pageStamps ?? [],
    payload.stampPackages ?? [],
    payload.stamps ?? [],
    targetBookletId,
  );
}

/**
 * Shared logic: writes the restored booklet data into IndexedDB under
 * `targetBookletId`, assigning fresh ids to pages and page-stamps to avoid
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

  // Fresh ids for every restored page, keyed by the page's original id so
  // page-stamps (which reference pages by id) can be remapped to match.
  const pageIdMap = new Map<string, string>();
  const restoredPages = pages.map((p) => {
    const freshId = newId();
    pageIdMap.set(p.id, freshId);
    return { ...p, id: freshId, bookletId: targetBookletId };
  });

  // Fresh ids for every restored page-stamp too, since its id could also
  // collide with a still-live row from the original booklet.
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
