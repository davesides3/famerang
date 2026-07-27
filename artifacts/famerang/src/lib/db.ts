import Dexie, { type EntityTable } from 'dexie';
import type { Booklet, Page, PageSticker, Sticker, StickerPack } from './types';

// A single local IndexedDB database. Everything -- booklets, pages, sticker
// packs, stickers, and sticker placements -- lives entirely on this device.
// There is no server and no sync.
class FamerangDB extends Dexie {
  booklets!: EntityTable<Booklet, 'id'>;
  pages!: EntityTable<Page, 'id'>;
  stickerPacks!: EntityTable<StickerPack, 'id'>;
  stickers!: EntityTable<Sticker, 'id'>;
  pageStickers!: EntityTable<PageSticker, 'id'>;

  constructor() {
    super('famerang');
    this.version(6).stores({
      booklets: 'id, updatedAt',
      pages: 'id, bookletId, sortOrder',
      stickerPacks: 'id, createdAt, sortOrder',
      stickers: 'id, packageId, contentHash',
      pageStickers: 'id, pageId, stickerId',
    });
  }
}

export const db = new FamerangDB();
