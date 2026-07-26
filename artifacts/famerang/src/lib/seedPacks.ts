import JSZip from 'jszip';
import { db } from './db';
import type { Stamp, StampPackage } from './types';

// ─── Versioning ──────────────────────────────────────────────────────────────
//
// Bump SEED_VERSION whenever you:
//   • add a new default pack, OR
//   • update an existing one (new/changed stamps, updated metadata).
//
// Any device whose stored seed version is lower than this will re-seed on
// the next app launch.  User-created packs are never touched.
//
const SEED_VERSION = 2;
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
    id: '59d9b72c-f951-49c7-a0e4-6ce588d3aa11',
    asset: 'seed-packs/dinosaurs.zip',
  },
  {
    id: '35cebe5f-d2c7-4a34-ae90-b7058004c493',
    asset: 'seed-packs/black-cats.zip',
  },
  {
    id: '82763403-65d8-4a34-af80-7abe5636eb19',
    asset: 'seed-packs/construction-vehicles.zip',
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManifestStamp {
  id: string;
  name: string;
  contentHash: string;
  filename: string;
}

interface StampPackManifestV2 {
  version: 2;
  package: StampPackage;
  stamps: ManifestStamp[];
}

/** Reconstructed payload after parsing either format. */
interface SeedPayload {
  package: StampPackage;
  stamps: Stamp[];
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
    const manifest = JSON.parse(await manifestEntry.async('string')) as StampPackManifestV2;
    const stamps: Stamp[] = await Promise.all(
      manifest.stamps.map(async (ms) => {
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
    return { package: manifest.package, stamps };
  }

  // ── v1 legacy format: single famerang-stamp-pack.json with base64 ──────
  const legacyEntry =
    zip.file('famerang-stamp-pack.json') ?? zip.file(/\.json$/i)[0] ?? null;
  if (!legacyEntry) throw new Error(`${assetPath}: unrecognised zip format`);
  const payload = JSON.parse(await legacyEntry.async('string')) as {
    package: StampPackage;
    stamps: Stamp[];
  };
  return { package: payload.package, stamps: payload.stamps };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Seeds the default stamp packages into the local IndexedDB.
 *
 * Behaviour:
 *  • First run  – inserts every default pack with its fixed ID and stamps.
 *  • Re-seed    – when SEED_VERSION is bumped, replaces the stamps of any pack
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

  const existingPackages = await db.stampPackages.toArray();
  const existingIds = new Set(existingPackages.map((p) => p.id));
  const maxOrder = existingPackages.reduce((m, p) => Math.max(m, p.sortOrder ?? -1), -1);
  let nextOrder = maxOrder + 1;

  for (const { id, asset } of DEFAULT_PACKS) {
    try {
      const payload = await fetchPayload(asset);

      if (existingIds.has(id)) {
        // Pack already in DB (from a previous seed).  Replace its stamps so
        // any updates you made to the zip are reflected, but leave the pack
        // record itself alone so the user's renamed/reordered version is kept.
        await db.transaction('rw', db.stamps, async () => {
          await db.stamps.where('packageId').equals(id).delete();
          const stamps: Stamp[] = payload.stamps.map((s) => ({ ...s, packageId: id }));
          if (stamps.length) await db.stamps.bulkAdd(stamps);
        });
      } else {
        // Brand-new pack: insert at the bottom of the current list.
        const pkg: StampPackage = {
          ...payload.package,
          id,
          sortOrder: nextOrder++,
          createdAt: payload.package.createdAt ?? Date.now(),
        };
        const stamps: Stamp[] = payload.stamps.map((s) => ({ ...s, packageId: id }));
        await db.transaction('rw', db.stampPackages, db.stamps, async () => {
          await db.stampPackages.add(pkg);
          if (stamps.length) await db.stamps.bulkAdd(stamps);
        });
      }
    } catch (err) {
      console.warn(`[seedPacks] Could not seed "${asset}":`, err);
    }
  }

  localStorage.setItem(SEED_VERSION_KEY, String(SEED_VERSION));
}
