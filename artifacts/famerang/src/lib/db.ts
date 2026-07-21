import Dexie, { type EntityTable } from 'dexie';
import type { Booklet, Page, PageStamp, Stamp, StampPackage } from './types';

// A single local IndexedDB database. Everything -- booklets, pages, stamp
// packages, stamps, and stamp placements -- lives entirely on this device.
// There is no server and no sync.
class FamerangDB extends Dexie {
  booklets!: EntityTable<Booklet, 'id'>;
  pages!: EntityTable<Page, 'id'>;
  stampPackages!: EntityTable<StampPackage, 'id'>;
  stamps!: EntityTable<Stamp, 'id'>;
  pageStamps!: EntityTable<PageStamp, 'id'>;

  constructor() {
    super('famerang');
    this.version(1).stores({
      booklets: 'id, updatedAt',
      pages: 'id, bookletId, sortOrder',
      stampPackages: 'id, createdAt',
      stamps: 'id, packageId, contentHash',
      pageStamps: 'id, pageId, stampId',
    });
    // v2: track when each booklet was last backed up so the UI can show a
    // "not backed up" indicator (added alongside booklet-level backups).
    this.version(2)
      .stores({
        booklets: 'id, updatedAt',
        pages: 'id, bookletId, sortOrder',
        stampPackages: 'id, createdAt',
        stamps: 'id, packageId, contentHash',
        pageStamps: 'id, pageId, stampId',
      })
      .upgrade((tx) =>
        tx
          .table('booklets')
          .toCollection()
          .modify((booklet) => {
            booklet.lastBackedUpAt = null;
          }),
      );
    // v3: stamp packages become user-orderable (like booklet pages), so the
    // Stamp Library can show them as a drag-to-reorder vertical list instead
    // of a horizontal row. Backfill sortOrder from createdAt (oldest first)
    // so existing packages land in a stable, sensible order.
    this.version(3)
      .stores({
        booklets: 'id, updatedAt',
        pages: 'id, bookletId, sortOrder',
        stampPackages: 'id, createdAt, sortOrder',
        stamps: 'id, packageId, contentHash',
        pageStamps: 'id, pageId, stampId',
      })
      .upgrade(async (tx) => {
        const packages = await tx.table('stampPackages').toCollection().sortBy('createdAt');
        await Promise.all(
          packages.map((pkg: StampPackage, index: number) =>
            tx.table('stampPackages').update(pkg.id, { sortOrder: index }),
          ),
        );
      });
    // v4: stamp packages gain optional artist credit fields (artist, creditsUrl,
    // creditsLocked). All three are optional so existing records need no
    // backfill — Dexie simply leaves them absent on old rows.
    this.version(4).stores({
      booklets: 'id, updatedAt',
      pages: 'id, bookletId, sortOrder',
      stampPackages: 'id, createdAt, sortOrder',
      stamps: 'id, packageId, contentHash',
      pageStamps: 'id, pageId, stampId',
    });
  }
}

export const db = new FamerangDB();
