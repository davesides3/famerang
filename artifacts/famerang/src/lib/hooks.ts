import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { downscaleImageFileToDataUrl, hashFile, readFileAsDataUrl } from './imaging';
import type {
  Booklet,
  Page,
  PageStickerWithSticker,
  PageWithStickers,
  Sticker,
  StickerPack,
  TextPlacement,
  TrimSizeKey,
} from './types';
import { DEFAULT_TRIM_SIZE_KEY, DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, getTrimSize } from './types';

const newId = () => crypto.randomUUID();

/** Thrown by `deleteSticker` when the sticker is still placed on at least one
 * page and the caller didn't pass `force: true`. The UI should catch this
 * and show a confirmation modal with `usageCount`. */
export class StickerInUseError extends Error {
  constructor(public usageCount: number) {
    super(`Sticker is used on ${usageCount} page(s)`);
    this.name = 'StickerInUseError';
  }
}

// ---------------------------------------------------------------------------
// Booklets
// ---------------------------------------------------------------------------

/** Live list of all booklets, most recently updated first. */
export function useBooklets(): Booklet[] | undefined {
  return useLiveQuery(
    () => db.booklets.orderBy('updatedAt').reverse().toArray(),
    [],
  );
}

export function useBooklet(id: string | undefined): Booklet | undefined {
  return useLiveQuery(
    () => (id ? db.booklets.get(id) : undefined),
    [id],
  );
}

export async function createBooklet(input: {
  title: string;
  canvasSize?: TrimSizeKey;
}): Promise<Booklet> {
  const now = Date.now();
  const booklet: Booklet = {
    id: newId(),
    title: input.title,
    canvasSize: input.canvasSize ?? DEFAULT_TRIM_SIZE_KEY,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: DEFAULT_FONT_SIZE,
    createdAt: now,
    updatedAt: now,
    lastBackedUpAt: null,
  };
  await db.booklets.add(booklet);
  return booklet;
}

export async function updateBooklet(
  id: string,
  patch: Partial<Pick<Booklet, 'title' | 'canvasSize' | 'fontFamily' | 'fontSize'>>,
): Promise<void> {
  await db.booklets.update(id, { ...patch, updatedAt: Date.now() });
}


export async function touchBooklet(id: string): Promise<void> {
  await db.booklets.update(id, { updatedAt: Date.now() });
}

export async function deleteBooklet(id: string): Promise<void> {
  await db.transaction('rw', db.booklets, db.pages, db.pageStickers, async () => {
    const pages = await db.pages.where('bookletId').equals(id).toArray();
    const pageIds = pages.map((p) => p.id);
    if (pageIds.length) {
      await db.pageStickers.where('pageId').anyOf(pageIds).delete();
    }
    await db.pages.where('bookletId').equals(id).delete();
    await db.booklets.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** Live list of a booklet's pages in display order. */
export function usePages(bookletId: string | undefined): Page[] | undefined {
  return useLiveQuery<Page[]>(
    () =>
      bookletId
        ? db.pages.where('bookletId').equals(bookletId).sortBy('sortOrder')
        : Promise.resolve([]),
    [bookletId],
  );
}

export function usePage(pageId: string | undefined): Page | undefined {
  return useLiveQuery(() => (pageId ? db.pages.get(pageId) : undefined), [pageId]);
}

/** Live page + its resolved sticker placements, ready for compositing. */
export function usePageWithStickers(
  pageId: string | undefined,
): PageWithStickers | undefined {
  return useLiveQuery(async () => {
    if (!pageId) return undefined;
    const page = await db.pages.get(pageId);
    if (!page) return undefined;
    const placements = await db.pageStickers.where('pageId').equals(pageId).toArray();
    const stickers: PageStickerWithSticker[] = [];
    for (const placement of placements) {
      const sticker = await db.stickers.get(placement.stickerId);
      if (sticker) stickers.push({ ...placement, sticker });
    }
    return { ...page, stickers };
  }, [pageId]);
}

/** Live list of every page in a booklet with resolved sticker placements,
 * used for full booklet compositing (export, ordering thumbnails). */
export function usePagesWithStickers(
  bookletId: string | undefined,
): PageWithStickers[] | undefined {
  return useLiveQuery(async () => {
    if (!bookletId) return undefined;
    const pages = await db.pages
      .where('bookletId')
      .equals(bookletId)
      .sortBy('sortOrder');
    const result: PageWithStickers[] = [];
    for (const page of pages) {
      const placements = await db.pageStickers.where('pageId').equals(page.id).toArray();
      const stickers: PageStickerWithSticker[] = [];
      for (const placement of placements) {
        const sticker = await db.stickers.get(placement.stickerId);
        if (sticker) stickers.push({ ...placement, sticker });
      }
      result.push({ ...page, stickers });
    }
    return result;
  }, [bookletId]);
}

export async function createPage(bookletId: string): Promise<Page> {
  const existing = await db.pages.where('bookletId').equals(bookletId).toArray();
  const maxOrder = existing.reduce((m, p) => Math.max(m, p.sortOrder), -1);
  const page: Page = {
    id: newId(),
    bookletId,
    photoDataUrl: null,
    textContent: '',
    textPlacement: 'below',
    sortOrder: maxOrder + 1,
  };
  await db.pages.add(page);
  await touchBooklet(bookletId);
  return page;
}

export async function setPagePhoto(pageId: string, file: File, booklet: Booklet) {
  const { widthPx, heightPx } = getTrimSize(booklet.canvasSize);
  const dataUrl = await downscaleImageFileToDataUrl(file, widthPx, heightPx);
  await db.pages.update(pageId, { photoDataUrl: dataUrl });
  await touchBooklet(booklet.id);
}

export async function updatePageText(
  pageId: string,
  textContent: string,
  textPlacement: TextPlacement,
): Promise<void> {
  await db.pages.update(pageId, { textContent, textPlacement });
  const page = await db.pages.get(pageId);
  if (page) await touchBooklet(page.bookletId);
}

export async function deletePage(pageId: string): Promise<void> {
  const page = await db.pages.get(pageId);
  await db.transaction('rw', db.pages, db.pageStickers, async () => {
    await db.pageStickers.where('pageId').equals(pageId).delete();
    await db.pages.delete(pageId);
  });
  if (page) await touchBooklet(page.bookletId);
}

/** Atomically re-numbers a booklet's pages to match `orderedPageIds`. */
export async function reorderPages(
  bookletId: string,
  orderedPageIds: string[],
): Promise<void> {
  await db.transaction('rw', db.pages, db.booklets, async () => {
    await Promise.all(
      orderedPageIds.map((id, index) => db.pages.update(id, { sortOrder: index })),
    );
    await touchBooklet(bookletId);
  });
}

// ---------------------------------------------------------------------------
// Sticker packages
// ---------------------------------------------------------------------------

/** Live list of sticker packages in user-defined display order. */
export function useStickerPacks(): StickerPack[] | undefined {
  return useLiveQuery(
    () => db.stickerPacks.orderBy('sortOrder').toArray(),
    [],
  );
}

export async function createStickerPack(name: string): Promise<StickerPack> {
  const existing = await db.stickerPacks.toArray();
  const maxOrder = existing.reduce((m, p) => Math.max(m, p.sortOrder ?? -1), -1);
  const pkg: StickerPack = { id: newId(), name, createdAt: Date.now(), sortOrder: maxOrder + 1 };
  await db.stickerPacks.add(pkg);
  return pkg;
}

export async function renameStickerPack(id: string, name: string): Promise<void> {
  await db.stickerPacks.update(id, { name });
}

/** Updates the artist credit fields on a sticker package. All fields are
 * optional — pass only the keys you want to change. */
export async function updateStickerPackCredits(
  id: string,
  patch: { artist?: string; creditsUrl?: string; creditsLocked?: boolean },
): Promise<void> {
  await db.stickerPacks.update(id, patch);
}

/** Atomically re-numbers sticker packages to match `orderedPackageIds`,
 * mirroring `reorderPages` for booklet pages. */
export async function reorderStickerPacks(orderedPackageIds: string[]): Promise<void> {
  await db.transaction('rw', db.stickerPacks, async () => {
    await Promise.all(
      orderedPackageIds.map((id, index) => db.stickerPacks.update(id, { sortOrder: index })),
    );
  });
}

/** Usage summary for a sticker package, used to warn before deletion: how many
 * of its stickers are placed somewhere, and across how many distinct pages. */
export async function getStickerPackUsage(
  id: string,
): Promise<{ stickerCount: number; pageCount: number }> {
  const stickers = await db.stickers.where('packageId').equals(id).toArray();
  const stickerIds = stickers.map((s) => s.id);
  if (!stickerIds.length) return { stickerCount: 0, pageCount: 0 };
  const placements = await db.pageStickers.where('stickerId').anyOf(stickerIds).toArray();
  const usedStickerIds = new Set(placements.map((p) => p.stickerId));
  const pageIds = new Set(placements.map((p) => p.pageId));
  return { stickerCount: usedStickerIds.size, pageCount: pageIds.size };
}

/** Throws StickerInUseError (aggregate count) if any sticker in the package is
 * still placed on a page and `force` is not passed. */
export async function deleteStickerPack(
  id: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const stickers = await db.stickers.where('packageId').equals(id).toArray();
  const stickerIds = stickers.map((s) => s.id);
  const usageCount = stickerIds.length
    ? await db.pageStickers.where('stickerId').anyOf(stickerIds).count()
    : 0;
  if (usageCount > 0 && !opts.force) {
    throw new StickerInUseError(usageCount);
  }
  await db.transaction('rw', db.stickerPacks, db.stickers, db.pageStickers, async () => {
    if (stickerIds.length) {
      await db.pageStickers.where('stickerId').anyOf(stickerIds).delete();
      await db.stickers.where('packageId').equals(id).delete();
    }
    await db.stickerPacks.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Stickers
// ---------------------------------------------------------------------------

/** Returns a map of packageId → first sticker's pngDataUrl (alphabetical order).
 *  Used to show thumbnails in the pack selector dropdown. */
export function useFirstStickerUrls(
  packageIds: string[],
): Record<string, string | undefined> | undefined {
  const key = packageIds.join(',');
  return useLiveQuery(async () => {
    if (!packageIds.length) return {};
    const result: Record<string, string | undefined> = {};
    for (const id of packageIds) {
      const stickers = await db.stickers.where('packageId').equals(id).toArray();
      stickers.sort((a, b) => a.name.localeCompare(b.name));
      result[id] = stickers[0]?.pngDataUrl;
    }
    return result;
  }, [key]);
}

export function useStickers(packageId: string | undefined): Sticker[] | undefined {
  return useLiveQuery<Sticker[]>(
    () => (packageId
      ? db.stickers.where('packageId').equals(packageId).toArray()
          .then(rows => rows.sort((a, b) => a.name.localeCompare(b.name)))
      : Promise.resolve([])),
    [packageId],
  );
}

/** How many page placements reference this sticker. Drives the delete-warning
 * dependency check in the sticker library UI. */
export function useStickerUsageCount(stickerId: string | undefined): number | undefined {
  return useLiveQuery(
    () => (stickerId ? db.pageStickers.where('stickerId').equals(stickerId).count() : Promise.resolve(0)),
    [stickerId],
  );
}

export async function addSticker(packageId: string, file: File, name: string): Promise<Sticker> {
  const [pngDataUrl, contentHash] = await Promise.all([
    readFileAsDataUrl(file),
    hashFile(file),
  ]);
  const sticker: Sticker = { id: newId(), packageId, name, pngDataUrl, contentHash };
  await db.stickers.add(sticker);
  return sticker;
}

export async function renameSticker(stickerId: string, name: string): Promise<void> {
  await db.stickers.update(stickerId, { name });
}

/** Returns how many page placements reference this sticker, so callers can
 * show an accurate confirmation message before deleting. */
export async function getStickerUsage(stickerId: string): Promise<number> {
  return db.pageStickers.where('stickerId').equals(stickerId).count();
}

/** Throws StickerInUseError unless `force` is passed, per the spec's
 * dependency-protection requirement. */
export async function deleteSticker(
  stickerId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const usageCount = await db.pageStickers.where('stickerId').equals(stickerId).count();
  if (usageCount > 0 && !opts.force) {
    throw new StickerInUseError(usageCount);
  }
  await db.transaction('rw', db.stickers, db.pageStickers, async () => {
    await db.pageStickers.where('stickerId').equals(stickerId).delete();
    await db.stickers.delete(stickerId);
  });
}

// ---------------------------------------------------------------------------
// Page sticker placements
// ---------------------------------------------------------------------------

export function usePageStickers(pageId: string | undefined): PageStickerWithSticker[] | undefined {
  return useLiveQuery(async () => {
    if (!pageId) return undefined;
    const placements = await db.pageStickers.where('pageId').equals(pageId).toArray();
    const result: PageStickerWithSticker[] = [];
    for (const placement of placements) {
      const sticker = await db.stickers.get(placement.stickerId);
      if (sticker) result.push({ ...placement, sticker });
    }
    return result;
  }, [pageId]);
}

/** Places a new sticker instance on the grid at (xRatio, yRatio), stacking on
 * top of any stickers already placed. */
/** Looks up which booklet a page belongs to and bumps its `updatedAt`, so
 * booklet-level mutations that only touch `pageStickers` (placing, moving, or
 * removing a sticker) still register as "unbacked-up changes" -- the same
 * contract `touchBooklet` provides for direct page edits. */
async function touchBookletForPage(pageId: string): Promise<void> {
  const page = await db.pages.get(pageId);
  if (page) await touchBooklet(page.bookletId);
}

/** Max number of stickers a single page can hold. */
export const MAX_STICKERS_PER_PAGE = 5;

export async function placeSticker(
  pageId: string,
  stickerId: string,
  xRatio: number,
  yRatio: number,
): Promise<PageStickerWithSticker> {
  const existingCount = await db.pageStickers.where('pageId').equals(pageId).count();
  if (existingCount >= MAX_STICKERS_PER_PAGE) {
    throw new Error(`A page can only hold up to ${MAX_STICKERS_PER_PAGE} stickers.`);
  }
  const id = newId();
  const placement = { id, pageId, stickerId, xRatio, yRatio, stackOrder: existingCount };
  await db.pageStickers.add(placement);
  const sticker = await db.stickers.get(stickerId);
  if (!sticker) throw new Error('Sticker not found');
  await touchBookletForPage(pageId);
  return { ...placement, sticker };
}

export async function movePageSticker(
  pageStickerId: string,
  xRatio: number,
  yRatio: number,
): Promise<void> {
  const placement = await db.pageStickers.get(pageStickerId);
  await db.pageStickers.update(pageStickerId, { xRatio, yRatio });
  if (placement) await touchBookletForPage(placement.pageId);
}

export async function removePageSticker(pageStickerId: string): Promise<void> {
  const placement = await db.pageStickers.get(pageStickerId);
  await db.pageStickers.delete(pageStickerId);
  if (placement) await touchBookletForPage(placement.pageId);
}
