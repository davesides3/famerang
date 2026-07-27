import Dexie, { type EntityTable } from 'dexie';
import type { Booklet, Page, PageSticker, Sticker, StickerPack } from './types';

// A single local IndexedDB database. Everything -- booklets, pages, sticker
// packages, stickers, and sticker placements -- lives entirely on this device.
// There is no server and no sync.
class FamerangDB extends Dexie {
  booklets!: EntityTable<Booklet, 'id'>;
  pages!: EntityTable<Page, 'id'>;
  stickerPacks!: EntityTable<StickerPack, 'id'>;
  stickers!: EntityTable<Sticker, 'id'>;
  pageStickers!: EntityTable<PageSticker, 'id'>;

  constructor() {
    super('famerang');
    this.version(1).stores({
      booklets: 'id, updatedAt',
      pages: 'id, bookletId, sortOrder',
      stickerPacks: 'id, createdAt',
      stickers: 'id, packageId, contentHash',
      pageStickers: 'id, pageId, stickerId',
    });
    // v2: track when each booklet was last backed up so the UI can show a
    // "not backed up" indicator (added alongside booklet-level backups).
    this.version(2)
      .stores({
        booklets: 'id, updatedAt',
        pages: 'id, bookletId, sortOrder',
        stickerPacks: 'id, createdAt',
        stickers: 'id, packageId, contentHash',
        pageStickers: 'id, pageId, stickerId',
      })
      .upgrade((tx) =>
        tx
          .table('booklets')
          .toCollection()
          .modify((booklet) => {
            booklet.lastBackedUpAt = null;
          }),
      );
    // v3: sticker packages become user-orderable (like booklet pages), so the
    // Sticker Library can show them as a drag-to-reorder vertical list instead
    // of a horizontal row. Backfill sortOrder from createdAt (oldest first)
    // so existing packages land in a stable, sensible order.
    this.version(3)
      .stores({
        booklets: 'id, updatedAt',
        pages: 'id, bookletId, sortOrder',
        stickerPacks: 'id, createdAt, sortOrder',
        stickers: 'id, packageId, contentHash',
        pageStickers: 'id, pageId, stickerId',
      })
      .upgrade(async (tx) => {
        const packages = await tx.table('stickerPacks').toCollection().sortBy('createdAt');
        await Promise.all(
          packages.map((pkg: StickerPack, index: number) =>
            tx.table('stickerPacks').update(pkg.id, { sortOrder: index }),
          ),
        );
      });
    // v4: sticker packages gain optional artist credit fields (artist, creditsUrl,
    // creditsLocked). All three are optional so existing records need no
    // backfill — Dexie simply leaves them absent on old rows.
    this.version(4).stores({
      booklets: 'id, updatedAt',
      pages: 'id, bookletId, sortOrder',
      stickerPacks: 'id, createdAt, sortOrder',
      stickers: 'id, packageId, contentHash',
      pageStickers: 'id, pageId, stickerId',
    });
    // v5: booklet.canvasSize changes from a numeric pixel size (2100/2400/2700)
    // to a string trim-size key ('7x7'/'8x8'/'9x9'). No upgrade needed —
    // there are no booklets in the wild with the old numeric format.
    this.version(5).stores({
      booklets: 'id, updatedAt',
      pages: 'id, bookletId, sortOrder',
      stampPackages: 'id, createdAt, sortOrder',
      stamps: 'id, packageId, contentHash',
      pageStamps: 'id, pageId, stampId',
    });
    // v6: rename tables — stampPackages → stickerPacks, stamps → stickers,
    // pageStamps → pageStickers — to match updated product terminology.
    // Data is copied from old tables; old tables are dropped (null schema).
    this.version(6)
      .stores({
        booklets: 'id, updatedAt',
        pages: 'id, bookletId, sortOrder',
        stampPackages: null,
        stamps: null,
        pageStamps: null,
        stickerPacks: 'id, createdAt, sortOrder',
        stickers: 'id, packageId, contentHash',
        pageStickers: 'id, pageId, stickerId',
      })
      .upgrade(async (tx) => {
        const packs = await tx.table('stampPackages').toArray();
        if (packs.length) await tx.table('stickerPacks').bulkAdd(packs);
        const stickers = await tx.table('stamps').toArray();
        if (stickers.length) await tx.table('stickers').bulkAdd(stickers);
        const placements = await tx.table('pageStamps').toArray();
        if (placements.length) {
          // pageStamps had a stampId field; rename to stickerId
          const migrated = placements.map((p: Record<string, unknown>) => {
            const { stampId, ...rest } = p as { stampId: string; [k: string]: unknown };
            return { ...rest, stickerId: stampId };
          });
          await tx.table('pageStickers').bulkAdd(migrated);
        }
      });
  }
}

export const db = new FamerangDB();
