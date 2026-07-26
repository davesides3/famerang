# Famerang

A 100% local, offline-first PWA for turning a handful of kids' photos into a printable keepsake storybook — no account, no server, no cloud.

## Product

Famerang lets you build square photo booklets on your phone or desktop. Each page has a photo, a caption (above or below), and tap-to-place, drag-to-reposition sticker "stamps." Pages can be reordered via drag-and-drop. The finished booklet exports as a draft PDF or a set of full-resolution JPEGs. Everything lives entirely on-device.

**Key user flows:**
- Create a booklet → add pages with photos + captions → decorate with stamps → export or back up
- Manage stamp packs in the Stamp Library: create, import, export, reorder, and generate a printable stamp-sheet PDF
- Back up any booklet to a ZIP file and restore it later (per-booklet only; no whole-dataset backup)
- Install the app to the home screen for fully offline use

---

## Features

### Home (`/`)
- Create a booklet (title; trim size and font default to standard values, editable later)
- Open a booklet → Booklet Hub
- Delete a booklet from its card (always-visible trash icon, confirm dialog)
- "Not backed up" badge on booklets that have changed since their last backup

### Booklet Hub (`/booklet/:id`)
- Toolbar: **Add Page · Preview · Export · Backup · Restore · Settings**
- **Settings:** rename title, change trim size (7×7", 8×8", 9×9" square canvas), change font family and font size
- **Page list:** drag-grip to reorder, tap row/thumbnail to open Page Editor, trash icon to delete page (confirm dialog)
- **Preview:** full-screen swipe/arrow page navigator, read-only, matches export rendering exactly
- **Export:** choose between:
  - *Send Draft PDF* — one PDF with every page; shows a large-booklet warning + "Send Anyway" confirm above a size threshold
  - *Send Photos* — full-resolution JPEG of every page via OS multi-file share sheet; falls back to a downloadable ZIP when multi-file share isn't supported; same large-booklet warning
- **Backup:** exports the booklet (pages + stamps + referenced stamp packages) as a ZIP; shows "Backup complete" toast; clears the "not backed up" badge
- **Restore:** uploads a booklet ZIP and overwrites the currently-open booklet's pages (confirm-dialog warning first, since it's destructive and cannot be undone); page list refreshes in place; shows "Booklet restored" toast
- "Not backed up" indicator when the booklet has changed since its last backup

### Page Editor (`/booklet/:id/page/:pageId`)
- Add or replace the page photo (auto center-cropped and downscaled to the booklet's canvas size on upload)
- Caption text with auto-save on blur; toggle placement above or below the photo
- Stamp strip: placed stamps shown as thumbnails with a trash badge; tap to remove; label shows count vs. maximum (e.g. "Stamps 3/5")
- Tap "Stamps" to open the Stamp Picker; close returns here
- Header chevrons navigate between pages without returning to the Hub

### Stamp Picker (`/booklet/:id/page/:pageId/stamps`)
- Dropdown to switch between stamp packages (shows pack thumbnail + name)
- Pack name + thumbnail header above the stamp grid
- Tap a stamp to place it on the page (at photo center) and close the picker
- "Maximum stamps reached" message when the per-page limit is hit
- Last-selected pack is remembered across sessions

### Stamp Library (`/stamps`)
- Create, rename, or delete a stamp package
- Drag-to-reorder the package list
- Import a stamp pack ZIP (v2 or legacy v1 formats both accepted)
- Deleting a package that is still in use on pages shows a reference-count warning with a force-delete option

### Stamp Package Detail (`/stamps/:packageId`)
- Toolbar: **Export · PDF · Info · Delete**
- Upload one or more PNG/WebP images as new stamps (batch supported)
- Tap a stamp to select it; trash badge on each stamp thumbnail for removal (reference-count-protected)
- **Export:** downloads the pack as a ZIP (v2 format: `manifest.json` + individual `.png` files)
- **PDF:** generates and downloads a printable stamp-sheet PDF (4-column grid, 300 DPI, artist credit footer)
- **Info dialog:** view/edit artist name and credits URL; padlock icon toggles edit lock (soft protection for shipped packs — curious users can unlock it)

### App-wide
- **Dark mode / light mode** toggle in the header (persists across sessions)
- **Landscape guard:** full-screen overlay prompts portrait orientation on mobile
- **Shared header:** Famerang wordmark (links Home) on the left; Stamps/Booklets nav toggle on the right, replaced by "Close" on overlay-style screens (Page Editor, Preview, Export)
- **Installable PWA** with offline app shell via `vite-plugin-pwa`
- **Default stamp packs:** three packs (Dinosaurs, Black Cats, Construction Vehicles) are automatically seeded into every fresh install; see `docs/default-stamp-packs.md` for how to add or update them

---

## Run & Operate

- `pnpm --filter @workspace/famerang run dev` — run the Famerang web app (reads `PORT`/`BASE_PATH` from the artifact's workflow env)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- No database, no API server, no env vars required — entirely client-side

---

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Famerang artifact: React + Vite, Tailwind v4, wouter routing
- Local storage: Dexie (IndexedDB) — `artifacts/famerang/src/lib/db.ts`
- Export: `jspdf` (stamp-sheet PDF and draft booklet PDF), `jszip` (stamp pack ZIPs, booklet backup ZIPs, photo export ZIPs)
- Offline/installable shell: `vite-plugin-pwa`

---

## Where things live

| Path | Purpose |
|---|---|
| `src/lib/db.ts` | Dexie schema/instance (booklets, pages, stamp packages, stamps, page-stamp placements) |
| `src/lib/types.ts` | Domain types and shared constants (canvas sizes, font defaults, `MAX_STAMPS_PER_PAGE`) |
| `src/lib/hooks.ts` | All data access: live-query React hooks + async CRUD functions. Only way pages should touch storage. |
| `src/lib/imaging.ts` | Photo center-crop/downscale on upload, stamp content hashing |
| `src/lib/compositing.ts` | `renderPageToCanvas(...)` — single source of truth for page layout; shared by live preview, PDF export, and ZIP export |
| `src/lib/pdf.ts` | Draft booklet PDF export |
| `src/lib/zipExport.ts` | Photo ZIP export |
| `src/lib/backup.ts` | Per-booklet backup/restore (`exportBookletZip` / `restoreBookletZip`) |
| `src/lib/stampPackZip.ts` | Stamp pack export/import (v2: `manifest.json` + individual PNGs; v1 legacy: single JSON with base64) |
| `src/lib/stampSheet.ts` | Printable stamp-sheet PDF generation |
| `src/lib/seedPacks.ts` | Default stamp pack seeding on first launch |
| `src/lib/share.ts` | OS share-sheet-or-download helper (touch devices get share sheet; desktop gets direct download) |
| `src/components/layout/AppLayout.tsx` | Shared app header; every routed screen renders under this one header |
| `src/pages/` | Routed screens (see Features above) |
| `public/seed-packs/` | Default stamp pack ZIPs served as static assets |
| `docs/default-stamp-packs.md` | How to add/update default stamp packs |

---

## Architecture decisions

- **No backend** — deliberately out of scope. The workspace's `api-server` artifact is unused by Famerang.
- **All storage on-device** — one Dexie/IndexedDB database. No sync, no cloud.
- **Per-booklet backup only** — `backup.ts` exports `exportBookletZip` / `restoreBookletZip` for a single booklet and its referenced stamps. There is no whole-dataset backup; it was removed as dead code since no UI ever called it.
- **Backup format v2** — booklet backup ZIPs contain a `manifest.json` plus one binary image file per page photo (`page-1.jpg` etc.), matching the stamp pack format. Old v1 ZIPs (single JSON with base64 photos) still import correctly. Roughly 25% smaller than v1.
- **Stamp pack format v2** — stamp pack ZIPs contain `manifest.json` plus individual `.png` binary entries. Directly editable in any zip tool.
- **Per-booklet restore always overwrites** — there is no merge option. The target booklet is whichever one the user had open when they tapped Restore. A confirm dialog warns before proceeding. Restored pages/page-stamps get brand-new IDs (see Gotchas).
- **Photo processing at upload time** — photos are center-cropped and downscaled to the booklet's canvas size immediately on upload, keeping on-device storage bounded regardless of source resolution.
- **Export scope** — draft PDF and full-res JPEG export only. High-res multi-page PDF and video/slideshow export were explicitly cut from scope.
- **Stamp deletion is reference-count-protected** — deleting a stamp or package still placed on any page throws `StampInUseError(usageCount)` unless the caller passes `{ force: true }`.
- **Touch vs. desktop downloads** — `share.ts` checks `pointer: coarse` to decide whether to invoke the OS share sheet (mobile) or trigger a direct `<a download>` (desktop). This prevents the Windows/Mac share dialog appearing unexpectedly on desktop.
- **Default packs seeded from static ZIPs** — `seedPacks.ts` fetches three ZIPs from `public/seed-packs/` on first launch and writes them to IndexedDB. A `SEED_VERSION` constant in that file controls re-seeding when packs are updated.

---

## Gotchas

- Hooks in page components must be called unconditionally before any early `return null` guard — an earlier bug called `useStamps` after such a guard, causing "Rendered more hooks than during the previous render."
- `vite.config.ts` requires `PORT` and `BASE_PATH` env vars (provided by the artifact workflow) — don't hardcode a port.
- When restoring a single-booklet backup, never reuse the page/page-stamp IDs from the ZIP. If the original source booklet still exists on-device and you restore into a *different* booklet, `bulkPut`-ing the original IDs overwrites those still-live rows — silently moving pages away from the source booklet. Always mint fresh IDs for restored pages/page-stamps and remap references.
- The `compositing.ts` canvas renderer always draws on a white background regardless of dark mode — this is intentional so that exports are always print-ready and colour-accurate.

---

## User preferences

- Dexie/IndexedDB over SQLite Wasm (initial scoping decision)
- Fully installable PWA; backup/restore via plain upload/download, no native file pickers
- No video/slideshow export
- Per-booklet backup only; no whole-dataset backup UI
