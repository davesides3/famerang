import JSZip from 'jszip';
import { db } from './db';
import type { Stamp, StampPackage } from './types';
import { readJsonPayloadFromFile } from './zipUtil';

const STAMP_PACK_VERSION = 1;
const STAMP_PACK_ENTRY = 'famerang-stamp-pack.json';

interface StampPackPayload {
  version: number;
  exportedAt: number;
  kind: 'stampPack';
  package: StampPackage;
  stamps: Stamp[];
}

const newId = () => crypto.randomUUID();

/** Exports a stamp pack and its stamps (images inline as base64) as a
 * downloadable local ZIP file, following the same shape as the app's other
 * backup exports. */
export async function exportStampPackageZip(packageId: string): Promise<Blob> {
  const pkg = await db.stampPackages.get(packageId);
  if (!pkg) throw new Error('Stamp pack not found.');
  const stamps = await db.stamps.where('packageId').equals(packageId).toArray();

  const payload: StampPackPayload = {
    version: STAMP_PACK_VERSION,
    exportedAt: Date.now(),
    kind: 'stampPack',
    package: pkg,
    stamps,
  };

  const zip = new JSZip();
  zip.file(STAMP_PACK_ENTRY, JSON.stringify(payload));
  return zip.generateAsync({ type: 'blob' });
}

export type StampPackImportTarget =
  | { mode: 'new' }
  | { mode: 'merge'; packageId: string };

/** Imports a stamp pack previously produced by `exportStampPackageZip`,
 * either as a brand-new pack or merged into an existing one. Stamps always
 * get fresh ids on import so they never collide with anything already on
 * this device. */
export async function importStampPackageZip(
  file: File,
  target: StampPackImportTarget,
): Promise<StampPackage> {
  const text = await readJsonPayloadFromFile(file, STAMP_PACK_ENTRY);
  let payload: StampPackPayload;
  try {
    payload = JSON.parse(text) as StampPackPayload;
  } catch {
    throw new Error('This file is not a valid Famerang stamp pack.');
  }

  if (!payload || typeof payload.version !== 'number' || !payload.package || !Array.isArray(payload.stamps)) {
    throw new Error('This file is not a valid Famerang stamp pack.');
  }

  return db.transaction('rw', db.stampPackages, db.stamps, async () => {
    let targetPackage: StampPackage;
    if (target.mode === 'merge') {
      const existing = await db.stampPackages.get(target.packageId);
      if (!existing) throw new Error('Target stamp pack no longer exists.');
      targetPackage = existing;
    } else {
      targetPackage = {
        id: newId(),
        name: payload.package.name,
        createdAt: Date.now(),
      };
      await db.stampPackages.add(targetPackage);
    }

    const importedStamps: Stamp[] = payload.stamps.map((stamp) => ({
      ...stamp,
      id: newId(),
      packageId: targetPackage.id,
    }));
    if (importedStamps.length) await db.stamps.bulkAdd(importedStamps);

    return targetPackage;
  });
}
