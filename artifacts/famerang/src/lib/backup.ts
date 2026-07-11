import JSZip from 'jszip';
import { db } from './db';
import type { Booklet, Page, PageStamp, Stamp, StampPackage } from './types';

const BACKUP_VERSION = 1;
const BACKUP_ENTRY = 'famerang-backup.json';

interface BackupPayload {
  version: number;
  exportedAt: number;
  booklets: Booklet[];
  pages: Page[];
  stampPackages: StampPackage[];
  stamps: Stamp[];
  pageStamps: PageStamp[];
}

/**
 * Exports the entire local dataset -- every booklet, page, stamp package,
 * stamp, and stamp placement -- as a single ZIP file. Photos and stamp PNGs
 * are already stored as base64 data URLs, so they travel inline inside the
 * JSON payload; nothing else needs to be attached separately.
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
  return zip.generateAsync({ type: 'blob' });
}

export type RestoreMode = 'replace' | 'merge';

/**
 * Restores a dataset previously produced by `exportBackupZip`. In "replace"
 * mode all local data is wiped first; in "merge" mode restored records are
 * upserted alongside whatever already exists on this device.
 */
export async function restoreBackupZip(file: File, mode: RestoreMode): Promise<void> {
  const zip = await JSZip.loadAsync(file);
  const entry = zip.file(BACKUP_ENTRY);
  if (!entry) {
    throw new Error('This file is not a valid Famerang backup.');
  }
  const text = await entry.async('string');
  const payload = JSON.parse(text) as BackupPayload;

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
      await db.stampPackages.bulkPut(payload.stampPackages);
      await db.stamps.bulkPut(payload.stamps);
      await db.pageStamps.bulkPut(payload.pageStamps);
    },
  );
}
