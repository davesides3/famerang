// Core domain types for Famerang. Everything here is persisted locally via
// Dexie (IndexedDB) -- there is no server and no network representation.

// ─── Trim sizes ───────────────────────────────────────────────────────────────

export type TrimSizeKey = '7x7' | '8x8' | '9x9' | '7.5x10';

export interface TrimSize {
  key: TrimSizeKey;
  label: string;
  widthPx: number;
  heightPx: number;
}

export const TRIM_SIZES: TrimSize[] = [
  { key: '7x7',    label: '7" × 7"',                 widthPx: 2100, heightPx: 2100 },
  { key: '8x8',    label: '8" × 8"',                 widthPx: 2400, heightPx: 2400 },
  { key: '9x9',    label: '9" × 9"',                 widthPx: 2700, heightPx: 2700 },
  { key: '7.5x10', label: '7.5" × 10" (Home Print)', widthPx: 2250, heightPx: 3000 },
];

export const DEFAULT_TRIM_SIZE_KEY: TrimSizeKey = '7x7';

/** Returns the TrimSize for a key, falling back to the default if the key is
 *  unrecognised (graceful handling of any stale data). */
export function getTrimSize(key: TrimSizeKey): TrimSize {
  return TRIM_SIZES.find((s) => s.key === key) ?? TRIM_SIZES[0];
}

// ─── Domain model ─────────────────────────────────────────────────────────────

export const DEFAULT_FONT_FAMILY = 'Comic Sans MS';
export const DEFAULT_FONT_SIZE = 60;

export const FONT_FAMILY_OPTIONS = [
  'Comic Sans MS',
  'Baloo 2',
  'Patrick Hand',
  'Georgia',
  'Verdana',
] as const;

export type TextPlacement = 'above' | 'below';

export interface Booklet {
  id: string;
  title: string;
  /** String key into TRIM_SIZES (e.g. '7x7', '8x8', '9x9', '7.5x10').
   *  Stored as a string since db.ts v5; older records with a numeric value
   *  are migrated automatically on open. */
  canvasSize: TrimSizeKey;
  fontFamily: string;
  fontSize: number;
  createdAt: number;
  updatedAt: number;
  // Timestamp of the last successful backup (global or booklet-level) that
  // included this booklet. `null` means it has never been backed up. Used
  // to show the "not backed up" indicator whenever updatedAt > this.
  lastBackedUpAt: number | null;
}

export interface Page {
  id: string;
  bookletId: string;
  photoDataUrl: string | null;
  textContent: string;
  textPlacement: TextPlacement;
  sortOrder: number;
}

export interface StampPackage {
  id: string;
  name: string;
  createdAt: number;
  // Position in the user-orderable stamp package list (lower = higher up).
  // Newly created/imported/restored packages are appended after the
  // current maximum so they land at the bottom of the list.
  sortOrder: number;
  // Optional artist credit metadata. `creditsLocked` prevents casual editing
  // of these fields in the UI (soft protection for packs shipped with the
  // product); the padlock icon in the Info dialog lets the curator toggle it.
  artist?: string;
  creditsUrl?: string;
  creditsLocked?: boolean;
}

export interface Stamp {
  id: string;
  packageId: string;
  name: string;
  pngDataUrl: string;
  contentHash: string;
}

export interface PageStamp {
  id: string;
  pageId: string;
  stampId: string;
  xRatio: number;
  yRatio: number;
  // Sequence in which the stamp was placed -- later stamps draw on top.
  stackOrder: number;
}

export interface PageStampWithStamp extends PageStamp {
  stamp: Stamp;
}

export interface PageWithStamps extends Page {
  stamps: PageStampWithStamp[];
}
