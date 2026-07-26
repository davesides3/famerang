import Dexie, { type EntityTable } from 'dexie';
import type { Booklet, Page, PageStamp, Stamp, StampPackage, TrimSizeKey } from './types';

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
    // v5: booklet.canvasSize changes from a numeric pixel size (2100/2400/2700)
    // to a string trim-size key ('7x7'/'8x8'/'9x9'). This enables non-square
    // trim sizes (e.g. '7.5x10'). Existing numeric values are mapped here so
    // old booklets open correctly without any data loss.
    this.version(5)
      .stores({
        booklets: 'id, updatedAt',
        pages: 'id, bookletId, sortOrder',
        stampPackages: 'id, createdAt, sortOrder',
        stamps: 'id, packageId, contentHash',
        pageStamps: 'id, pageId, stampId',
      })
      .upgrade((tx) => {
        const numericToKey: Record<number, TrimSizeKey> = {
          2100: '7x7',
          2400: '8x8',
          2700: '9x9',
        };
        return tx
          .table('booklets')
          .toCollection()
          .modify((booklet) => {
            if (typeof booklet.canvasSize === 'number') {
              booklet.canvasSize = numericToKey[booklet.canvasSize as number] ?? '7x7';
            }
          });
      });
  }
}

export const db = new FamerangDB();
