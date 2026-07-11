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
  }
}

export const db = new FamerangDB();
