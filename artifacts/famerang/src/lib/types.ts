// Core domain types for Famerang. Everything here is persisted locally via
// Dexie (IndexedDB) -- there is no server and no network representation.

export type CanvasSize = 2100 | 2400 | 2700;

export const CANVAS_SIZES: { value: CanvasSize; label: string }[] = [
  { value: 2100, label: '7" x 7"' },
  { value: 2400, label: '8" x 8"' },
  { value: 2700, label: '9" x 9"' },
];

export const DEFAULT_CANVAS_SIZE: CanvasSize = 2100;
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
  canvasSize: CanvasSize;
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
