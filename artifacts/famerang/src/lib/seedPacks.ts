import JSZip from 'jszip';
import { db } from './db';
import type { Sticker, StickerPack } from './types';

// ─── Versioning ──────────────────────────────────────────────────────────────
//
// Bump SEED_VERSION whenever you:
//   • add a new default pack, OR
//   • update an existing one (new/changed stickers, updated metadata).
//
// Any device whose stored seed version is lower than this will re-seed on
// the next app launch.  User-created packs are never touched.
//
const SEED_VERSION = 5;
const SEED_VERSION_KEY = 'famerang-seed-v';

// ─── Pack manifest ────────────────────────────────────────────────────────────
//
// Each entry:
//   id    – stable UUID that identifies this pack in the DB forever.
//           Must match the `id` field inside the corresponding zip's manifest.json
//           so that re-seeds update the correct record.
//   asset – path under /public that Vite serves at build time.
//
const DEFAULT_PACKS: Array<{ id: string; asset: string }> = [
  {
    id: '6d9c0177-9dea-472a-8f83-ab3966620650',
    asset: 'seed-packs/animals-barnyard.zip',
  },
  {
    id: 'd3205c9b-b825-4e46-af19-e19c2626ca49',
    asset: 'seed-packs/animals-wild.zip',
  },
  {
    id: '3afdbfa1-98a5-4765-8483-abdb5065b0c6',
    asset: 'seed-packs/birds-backyard.zip',
  },
  {
    id: '1afdb7f2-974e-49ab-a75d-f46a3c8efd28',
    asset: 'seed-packs/birds-wild.zip',
  },
  {
    id: '6ebed676-a391-481f-bcc1-d8c6aaec5b97',
    asset: 'seed-packs/cats.zip',
  },
  {
    id: 'b4d38491-d500-4348-afc0-7f2c7c061280',
    asset: 'seed-packs/construction-vehicles.zip',
  },
  {
    id: 'baf7d89a-4e90-4ca7-888c-68fc3a4caa3f',
    asset: 'seed-packs/dinosaurs.zip',
  },
  {
    id: 'c3de15b6-4aab-48fe-8dc4-68c075c08f61',
    asset: 'seed-packs/dogs.zip',
  },
  {
    id: '3fd25cac-f078-418d-8367-33875237f74e',
    asset: 'seed-packs/insects.zip',
  },
  {
    id: '87d37eb6-2d43-4e91-8ad4-d68a965962ea',
    asset: 'seed-packs/sloths.zip',
  },
  {
    id: '912a1184-eb3f-4075-ae01-536595683d0b',
    asset: 'seed-packs/sloths-cartoon.zip',
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManifestSticker {
  id: string;
  name: string;
  contentHash: string;
  filename: string;
}

interface StickerPackManifestV2 {
  version: 2;
  package: StickerPack;
  stickers: ManifestSticker[];
}

/** Reconstructed payload after parsing either format. */
interface SeedPayload {
  package: StickerPack;
  stickers: Sticker[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a Uint8Array (raw PNG bytes) to a data URL. */
function bytesToDataUrl(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:image/png;base64,${btoa(bin)}`;
}

async function fetchPayload(assetPath: string): Promise<SeedPayload> {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  const url = `${base}/${assetPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());

  // ── v2 format: manifest.json + individual PNG entries ──────────────────
  const manifestEntry = zip.file('manifest.json');
  if (manifestEntry) {
    const manifest = JSON.parse(await manifestEntry.async('string')) as StickerPackManifestV2;
    const stickers: Sticker[] = await Promise.all(
      manifest.stickers.map(async (ms) => {
        const entry = zip.file(ms.filename);
        if (!entry) throw new Error(`${assetPath}: missing image entry "${ms.filename}"`);
        const bytes = await entry.async('uint8array');
        return {
          id: ms.id,
          packageId: manifest.package.id,
          name: ms.name,
          contentHash: ms.contentHash,
          pngDataUrl: bytesToDataUrl(bytes),
        };
      }),
    );
    return { package: manifest.package, stickers };
  }

  // ── v1 legacy format: single famerang-sticker-pack.json with base64 ──────
  const legacyEntry =
    zip.file('famerang-sticker-pack.json') ?? zip.file(/\.json$/i)[0] ?? null;
  if (!legacyEntry) throw new Error(`${assetPath}: unrecognised zip format`);
  const payload = JSON.parse(await legacyEntry.async('string')) as {
    package: StickerPack;
    stickers: Sticker[];
  };
  return { package: payload.package, stickers: payload.stickers };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Seeds the default sticker packages into the local IndexedDB.
 *
 * Behaviour:
 *  • First run  – inserts every default pack with its fixed ID and stickers.
 *  • Re-seed    – when SEED_VERSION is bumped, replaces the stickers of any pack
 *                 that already exists (preserving the pack name + sortOrder the
 *                 user may have changed) and inserts packs that are new.
 *  • No-op      – returns immediately if the stored seed version is current.
 *  • Never      – touches user-created packs (those with IDs not in DEFAULT_PACKS).
 *
 * Errors inside individual pack fetches are caught and logged so a single
 * broken asset never blocks the remaining packs or the app startup.
 */
export async function seedDefaultPacks(): Promise<void> {
  const stored = parseInt(localStorage.getItem(SEED_VERSION_KEY) ?? '0', 10);
  if (stored >= SEED_VERSION) return;

  const existingPackages = await db.stickerPacks.toArray();
  const existingIds = new Set(existingPackages.map((p) => p.id));
  const maxOrder = existingPackages.reduce((m, p) => Math.max(m, p.sortOrder ?? -1), -1);
  let nextOrder = maxOrder + 1;

  // Remove any old default packs that are no longer in DEFAULT_PACKS.
  const currentDefaultIds = new Set(DEFAULT_PACKS.map((p) => p.id));
  const oldDefaultIds = [
    '59d9b72c-f951-49c7-a0e4-6ce588d3aa11', // old dinosaurs
    '35cebe5f-d2c7-4a34-ae90-b7058004c493', // old black-cats
    '82763403-65d8-4a34-af80-7abe5636eb19', // old construction-vehicles
  ].filter((id) => !currentDefaultIds.has(id));
  for (const id of oldDefaultIds) {
    if (existingIds.has(id)) {
      await db.transaction('rw', db.stickerPacks, db.stickers, db.pageStickers, async () => {
        const stickerIds = (await db.stickers.where('packageId').equals(id).toArray()).map((s) => s.id);
        if (stickerIds.length) await db.pageStickers.where('stickerId').anyOf(stickerIds).delete();
        await db.stickers.where('packageId').equals(id).delete();
        await db.stickerPacks.delete(id);
      });
    }
  }

  for (const { id, asset } of DEFAULT_PACKS) {
    try {
      const payload = await fetchPayload(asset);

      if (existingIds.has(id)) {
        // Pack already in DB (from a previous seed).  Replace its stickers so
        // any updates you made to the zip are reflected, but leave the pack
        // record itself alone so the user's renamed/reordered version is kept.
        await db.transaction('rw', db.stickers, async () => {
          await db.stickers.where('packageId').equals(id).delete();
          const stickers: Sticker[] = payload.stickers.map((s) => ({ ...s, packageId: id }));
          if (stickers.length) await db.stickers.bulkAdd(stickers);
        });
      } else {
        // Brand-new pack: insert at the bottom of the current list.
        const pkg: StickerPack = {
          ...payload.package,
          id,
          sortOrder: nextOrder++,
          createdAt: payload.package.createdAt ?? Date.now(),
        };
        const stickers: Sticker[] = payload.stickers.map((s) => ({ ...s, packageId: id }));
        await db.transaction('rw', db.stickerPacks, db.stickers, async () => {
          await db.stickerPacks.add(pkg);
          if (stickers.length) await db.stickers.bulkAdd(stickers);
        });
      }
    } catch (err) {
      console.warn(`[seedPacks] Could not seed "${asset}":`, err);
    }
  }

  localStorage.setItem(SEED_VERSION_KEY, String(SEED_VERSION));
}
