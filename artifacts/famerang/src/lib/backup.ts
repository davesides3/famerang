import JSZip from 'jszip';
import { db } from './db';
import type { Booklet, Page, PageStamp, Stamp, StampPackage } from './types';
import { readJsonPayloadFromFile } from './zipUtil';

const BACKUP_VERSION = 1;
const BACKUP_ENTRY = 'famerang-backup.json';
const BOOKLET_BACKUP_ENTRY = 'famerang-booklet-backup.json';

interface BackupPayload {
  version: number;
  exportedAt: number;
  booklets: Booklet[];
  pages: Page[];
  stampPackages: StampPackage[];
  stamps: Stamp[];
  pageStamps: PageStamp[];
}

interface BookletBackupPayload {
  version: number;
  exportedAt: number;
  kind: 'booklet';
  booklet: Booklet;
  pages: Page[];
  pageStamps: PageStamp[];
  // Stamps/packages referenced by this booklet's pages, included so the
  // stamps still render correctly after restoring onto a fresh device.
  stampPackages: StampPackage[];
  stamps: Stamp[];
}

/**
 * Exports the entire local dataset -- every booklet, page, stamp package,
 * stamp, and stamp placement -- as a single ZIP file. Photos and stamp PNGs
 * are already stored as base64 data URLs, so they travel inline inside the
 * JSON payload; nothing else needs to be attached separately.
 *
 * Marks every booklet as backed-up as of now, since a full export covers
 * all of them.
 */
export async function exportBackupZip(): Promise<Blob> {
  const [booklets, pages, stampPackages, stamps, pageStamps] = await Promise.all([
    db.booklets.toArray(),
    db.pages.toArray(),
    db.stampPackages.toArray(),
    db.stamps.toArray(),
    db.pageStamps.toArray(),
  ]);

  const payload: BackupPayload = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    booklets,
    pages,
    stampPackages,
    stamps,
    pageStamps,
  };

  const zip = new JSZip();
  zip.file(BACKUP_ENTRY, JSON.stringify(payload));
  const blob = await zip.generateAsync({ type: 'blob' });

  await markBookletsBackedUp(booklets.map((b) => b.id));

  return blob;
}

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

export type RestoreMode = 'replace' | 'merge';

/**
 * Restores a dataset previously produced by `exportBackupZip`. In "replace"
 * mode all local data is wiped first; in "merge" mode restored records are
 * upserted alongside whatever already exists on this device.
 */
export async function restoreBackupZip(file: File, mode: RestoreMode): Promise<void> {
  const text = await readJsonPayloadFromFile(file, BACKUP_ENTRY);
  let payload: BackupPayload;
  try {
    payload = JSON.parse(text) as BackupPayload;
  } catch {
    throw new Error('This file is not a valid Famerang backup.');
  }

  if (!payload || typeof payload.version !== 'number' || !Array.isArray(payload.booklets)) {
    throw new Error('This file is not a valid Famerang backup.');
  }

  await db.transaction(
    'rw',
    db.booklets,
    db.pages,
    db.stampPackages,
    db.stamps,
    db.pageStamps,
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.booklets.clear(),
          db.pages.clear(),
          db.stampPackages.clear(),
          db.stamps.clear(),
          db.pageStamps.clear(),
        ]);
      }
      await db.booklets.bulkPut(payload.booklets);
      await db.pages.bulkPut(payload.pages);
      // In "replace" mode the table was just cleared, so every package is
      // new and the backup's own order (already encoded in sortOrder) is
      // used as-is. In "merge" mode, packages already on this device keep
      // their current position and only genuinely new ones are appended.
      const stampPackages =
        mode === 'replace'
          ? withNormalizedPackageOrder(payload.stampPackages)
          : await withPreservedPackageOrder(payload.stampPackages);
      await db.stampPackages.bulkPut(stampPackages);
      await db.stamps.bulkPut(payload.stamps);
      await db.pageStamps.bulkPut(payload.pageStamps);
    },
  );
}

/**
 * Exports a single booklet -- its own record, pages, stamp placements, and
 * whichever stamps/packages those placements reference -- as a standalone
 * ZIP file, reusing the same JSON-in-zip shape as the full backup.
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

  const payload: BookletBackupPayload = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    kind: 'booklet',
    booklet,
    pages,
    pageStamps,
    stampPackages,
    stamps,
  };

  const zip = new JSZip();
  zip.file(BOOKLET_BACKUP_ENTRY, JSON.stringify(payload));
  const blob = await zip.generateAsync({ type: 'blob' });

  await markBookletsBackedUp([bookletId]);

  return blob;
}

const newId = () => crypto.randomUUID();

/**
 * Restores a single booklet from a file produced by `exportBookletZip`,
 * overwriting the booklet identified by `targetBookletId`.
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
  const text = await readJsonPayloadFromFile(file, BOOKLET_BACKUP_ENTRY);
  let payload: BookletBackupPayload;
  try {
    payload = JSON.parse(text) as BookletBackupPayload;
  } catch {
    throw new Error('This file is not a valid Famerang booklet backup.');
  }

  if (!payload || typeof payload.version !== 'number' || !payload.booklet) {
    throw new Error('This file is not a valid Famerang booklet backup.');
  }

  const restoredBooklet: Booklet = { ...payload.booklet, id: targetBookletId };

  // Fresh ids for every restored page, keyed by the page's original id so
  // page-stamps (which reference pages by id) can be remapped to match.
  const pageIdMap = new Map<string, string>();
  const restoredPages = (payload.pages ?? []).map((p) => {
    const freshId = newId();
    pageIdMap.set(p.id, freshId);
    return { ...p, id: freshId, bookletId: targetBookletId };
  });

  // Fresh ids for every restored page-stamp too, since its id could also
  // collide with a still-live row from the original booklet.
  const restoredPageStamps = (payload.pageStamps ?? [])
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
      if (payload.stampPackages?.length) {
        const stampPackages = await withPreservedPackageOrder(payload.stampPackages);
        await db.stampPackages.bulkPut(stampPackages);
      }
      if (payload.stamps?.length) await db.stamps.bulkPut(payload.stamps);
      if (restoredPageStamps.length) await db.pageStamps.bulkPut(restoredPageStamps);
    },
  );

  await markBookletsBackedUp([targetBookletId]);

  return restoredBooklet;
}

async function markBookletsBackedUp(bookletIds: string[]): Promise<void> {
  if (!bookletIds.length) return;
  const now = Date.now();
  await db.transaction('rw', db.booklets, async () => {
    await Promise.all(bookletIds.map((id) => db.booklets.update(id, { lastBackedUpAt: now })));
  });
}
