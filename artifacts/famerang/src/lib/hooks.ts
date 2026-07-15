import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { downscaleImageFileToDataUrl, hashFile, readFileAsDataUrl } from './imaging';
import type {
  Booklet,
  CanvasSize,
  Page,
  PageStampWithStamp,
  PageWithStamps,
  Stamp,
  StampPackage,
  TextPlacement,
} from './types';
import { DEFAULT_CANVAS_SIZE, DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from './types';

const newId = () => crypto.randomUUID();

/** Thrown by `deleteStamp` when the stamp is still placed on at least one
 * page and the caller didn't pass `force: true`. The UI should catch this
 * and show a confirmation modal with `usageCount`. */
export class StampInUseError extends Error {
  constructor(public usageCount: number) {
    super(`Stamp is used on ${usageCount} page(s)`);
    this.name = 'StampInUseError';
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
  canvasSize?: CanvasSize;
}): Promise<Booklet> {
  const now = Date.now();
  const booklet: Booklet = {
    id: newId(),
    title: input.title,
    canvasSize: input.canvasSize ?? DEFAULT_CANVAS_SIZE,
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
  await db.transaction('rw', db.booklets, db.pages, db.pageStamps, async () => {
    const pages = await db.pages.where('bookletId').equals(id).toArray();
    const pageIds = pages.map((p) => p.id);
    if (pageIds.length) {
      await db.pageStamps.where('pageId').anyOf(pageIds).delete();
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

/** Live page + its resolved stamp placements, ready for compositing. */
export function usePageWithStamps(
  pageId: string | undefined,
): PageWithStamps | undefined {
  return useLiveQuery(async () => {
    if (!pageId) return undefined;
    const page = await db.pages.get(pageId);
    if (!page) return undefined;
    const placements = await db.pageStamps.where('pageId').equals(pageId).toArray();
    const stamps: PageStampWithStamp[] = [];
    for (const placement of placements) {
      const stamp = await db.stamps.get(placement.stampId);
      if (stamp) stamps.push({ ...placement, stamp });
    }
    return { ...page, stamps };
  }, [pageId]);
}

/** Live list of every page in a booklet with resolved stamp placements,
 * used for full booklet compositing (export, ordering thumbnails). */
export function usePagesWithStamps(
  bookletId: string | undefined,
): PageWithStamps[] | undefined {
  return useLiveQuery(async () => {
    if (!bookletId) return undefined;
    const pages = await db.pages
      .where('bookletId')
      .equals(bookletId)
      .sortBy('sortOrder');
    const result: PageWithStamps[] = [];
    for (const page of pages) {
      const placements = await db.pageStamps.where('pageId').equals(page.id).toArray();
      const stamps: PageStampWithStamp[] = [];
      for (const placement of placements) {
        const stamp = await db.stamps.get(placement.stampId);
        if (stamp) stamps.push({ ...placement, stamp });
      }
      result.push({ ...page, stamps });
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

export async function setPagePhoto(pageId: string, file: File, canvasSize: number) {
  const dataUrl = await downscaleImageFileToDataUrl(file, canvasSize);
  await db.pages.update(pageId, { photoDataUrl: dataUrl });
  const page = await db.pages.get(pageId);
  if (page) await touchBooklet(page.bookletId);
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
  await db.transaction('rw', db.pages, db.pageStamps, async () => {
    await db.pageStamps.where('pageId').equals(pageId).delete();
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
// Stamp packages
// ---------------------------------------------------------------------------

/** Live list of stamp packages in user-defined display order. */
export function useStampPackages(): StampPackage[] | undefined {
  return useLiveQuery(
    () => db.stampPackages.orderBy('sortOrder').toArray(),
    [],
  );
}

export async function createStampPackage(name: string): Promise<StampPackage> {
  const existing = await db.stampPackages.toArray();
  const maxOrder = existing.reduce((m, p) => Math.max(m, p.sortOrder ?? -1), -1);
  const pkg: StampPackage = { id: newId(), name, createdAt: Date.now(), sortOrder: maxOrder + 1 };
  await db.stampPackages.add(pkg);
  return pkg;
}

export async function renameStampPackage(id: string, name: string): Promise<void> {
  await db.stampPackages.update(id, { name });
}

/** Atomically re-numbers stamp packages to match `orderedPackageIds`,
 * mirroring `reorderPages` for booklet pages. */
export async function reorderStampPackages(orderedPackageIds: string[]): Promise<void> {
  await db.transaction('rw', db.stampPackages, async () => {
    await Promise.all(
      orderedPackageIds.map((id, index) => db.stampPackages.update(id, { sortOrder: index })),
    );
  });
}

/** Throws StampInUseError (aggregate count) if any stamp in the package is
 * still placed on a page and `force` is not passed. */
export async function deleteStampPackage(
  id: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const stamps = await db.stamps.where('packageId').equals(id).toArray();
  const stampIds = stamps.map((s) => s.id);
  const usageCount = stampIds.length
    ? await db.pageStamps.where('stampId').anyOf(stampIds).count()
    : 0;
  if (usageCount > 0 && !opts.force) {
    throw new StampInUseError(usageCount);
  }
  await db.transaction('rw', db.stampPackages, db.stamps, db.pageStamps, async () => {
    if (stampIds.length) {
      await db.pageStamps.where('stampId').anyOf(stampIds).delete();
      await db.stamps.where('packageId').equals(id).delete();
    }
    await db.stampPackages.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Stamps
// ---------------------------------------------------------------------------

export function useStamps(packageId: string | undefined): Stamp[] | undefined {
  return useLiveQuery<Stamp[]>(
    () => (packageId ? db.stamps.where('packageId').equals(packageId).toArray() : Promise.resolve([])),
    [packageId],
  );
}

/** How many page placements reference this stamp. Drives the delete-warning
 * dependency check in the stamp library UI. */
export function useStampUsageCount(stampId: string | undefined): number | undefined {
  return useLiveQuery(
    () => (stampId ? db.pageStamps.where('stampId').equals(stampId).count() : Promise.resolve(0)),
    [stampId],
  );
}

export async function addStamp(packageId: string, file: File, name: string): Promise<Stamp> {
  const [pngDataUrl, contentHash] = await Promise.all([
    readFileAsDataUrl(file),
    hashFile(file),
  ]);
  const stamp: Stamp = { id: newId(), packageId, name, pngDataUrl, contentHash };
  await db.stamps.add(stamp);
  return stamp;
}

export async function renameStamp(stampId: string, name: string): Promise<void> {
  await db.stamps.update(stampId, { name });
}

/** Throws StampInUseError unless `force` is passed, per the spec's
 * dependency-protection requirement. */
export async function deleteStamp(
  stampId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const usageCount = await db.pageStamps.where('stampId').equals(stampId).count();
  if (usageCount > 0 && !opts.force) {
    throw new StampInUseError(usageCount);
  }
  await db.transaction('rw', db.stamps, db.pageStamps, async () => {
    await db.pageStamps.where('stampId').equals(stampId).delete();
    await db.stamps.delete(stampId);
  });
}

// ---------------------------------------------------------------------------
// Page stamp placements
// ---------------------------------------------------------------------------

export function usePageStamps(pageId: string | undefined): PageStampWithStamp[] | undefined {
  return useLiveQuery(async () => {
    if (!pageId) return undefined;
    const placements = await db.pageStamps.where('pageId').equals(pageId).toArray();
    const result: PageStampWithStamp[] = [];
    for (const placement of placements) {
      const stamp = await db.stamps.get(placement.stampId);
      if (stamp) result.push({ ...placement, stamp });
    }
    return result;
  }, [pageId]);
}

/** Places a new stamp instance on the grid at (xRatio, yRatio), stacking on
 * top of any stamps already placed. */
/** Looks up which booklet a page belongs to and bumps its `updatedAt`, so
 * booklet-level mutations that only touch `pageStamps` (placing, moving, or
 * removing a stamp) still register as "unbacked-up changes" -- the same
 * contract `touchBooklet` provides for direct page edits. */
async function touchBookletForPage(pageId: string): Promise<void> {
  const page = await db.pages.get(pageId);
  if (page) await touchBooklet(page.bookletId);
}

/** Max number of stamps a single page can hold. */
export const MAX_STAMPS_PER_PAGE = 5;

export async function placeStamp(
  pageId: string,
  stampId: string,
  xRatio: number,
  yRatio: number,
): Promise<PageStampWithStamp> {
  const existingCount = await db.pageStamps.where('pageId').equals(pageId).count();
  if (existingCount >= MAX_STAMPS_PER_PAGE) {
    throw new Error(`A page can only hold up to ${MAX_STAMPS_PER_PAGE} stamps.`);
  }
  const id = newId();
  const placement = { id, pageId, stampId, xRatio, yRatio, stackOrder: existingCount };
  await db.pageStamps.add(placement);
  const stamp = await db.stamps.get(stampId);
  if (!stamp) throw new Error('Stamp not found');
  await touchBookletForPage(pageId);
  return { ...placement, stamp };
}

export async function movePageStamp(
  pageStampId: string,
  xRatio: number,
  yRatio: number,
): Promise<void> {
  const placement = await db.pageStamps.get(pageStampId);
  await db.pageStamps.update(pageStampId, { xRatio, yRatio });
  if (placement) await touchBookletForPage(placement.pageId);
}

export async function removePageStamp(pageStampId: string): Promise<void> {
  const placement = await db.pageStamps.get(pageStampId);
  await db.pageStamps.delete(pageStampId);
  if (placement) await touchBookletForPage(placement.pageId);
}
