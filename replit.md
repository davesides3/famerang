# Famerang

A 100% local, offline-first PWA for turning a handful of kids' photos into a printable keepsake storybook — no account, no server, no cloud.

## Product

Famerang lets you build photo booklets on your phone or desktop. Each page has a photo, a caption (above or below), and tap-to-place, drag-to-reposition sticker "stamps." Pages can be reordered via drag-and-drop. The finished booklet can be exported as a draft PDF, a print-quality PDF, a set of full-resolution JPEGs, or an MP4 slideshow video. Everything lives entirely on-device.

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
- **Settings:** rename title, change trim size (see Trim Sizes below), change font family and font size
- **Page list:** drag-grip to reorder, tap row/thumbnail to open Page Editor, trash icon to delete page (confirm dialog)
- **Preview:** full-screen swipe/arrow page navigator, read-only, matches export rendering exactly
- **Export:** four options, each as a full-width button with inline icon:
  - *Send Draft PDF* — 150 DPI, JPEG quality 0.82; optimised for sharing digitally; shows large-booklet warning + "Send Anyway" confirm above a size threshold
  - *Send Print PDF* — 300 DPI, JPEG quality 0.92; full trim resolution for home or professional printing; same large-booklet warning
  - *Send Photos* — full-resolution JPEG of every page via OS multi-file share sheet; falls back to a downloadable ZIP when multi-file share isn't supported; same large-booklet warning
  - *Generate & Send Video* — H.264 MP4 slideshow at 1080p long edge; settings: seconds per page (2 / 3 / 4 / 5s push-buttons) and crossfade toggle; progress bar with per-phase labels; Cancel button replaces Generate while encoding; on mobile a "Tap to Share" button appears after generation (Web Share API requires a fresh user gesture)
- **Backup:** exports the booklet (pages + stamps + referenced stamp packages) as a ZIP; shows "Backup complete" toast; clears the "not backed up" badge
- **Restore:** uploads a booklet ZIP and overwrites the currently-open booklet's pages (confirm-dialog warning first); page list refreshes in place; shows "Booklet restored" toast
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
- **Info dialog:** view/edit artist name and credits URL; padlock icon toggles edit lock (soft protection for shipped packs)

### App-wide
- **Dark mode / light mode** toggle in the header (persists across sessions)
- **Landscape guard:** full-screen overlay prompts portrait orientation on mobile
- **Shared header:** Famerang wordmark (links Home) on the left; Stamps/Booklets nav toggle on the right, replaced by "Close" on overlay-style screens (Page Editor, Preview, Export)
- **Installable PWA** with offline app shell via `vite-plugin-pwa`
- **Default stamp packs:** three packs (Dinosaurs, Black Cats, Construction Vehicles) are automatically seeded into every fresh install; see `docs/default-stamp-packs.md` for how to add or update them

---

## Trim Sizes

All sizes are authored at 300 DPI native resolution. The booklet canvas size is set per-booklet and cannot change after pages are added.

| Key | Label | Dimensions | Pixels |
|---|---|---|---|
| `7x7` | 7" × 7" (default) | Square | 2100 × 2100 |
| `8x8` | 8" × 8" | Square | 2400 × 2400 |
| `9x9` | 9" × 9" | Square | 2700 × 2700 |
| `7.5x10` | 7.5" × 10" (Home Print) | Portrait | 2250 × 3000 |

---

## Video Export

The MP4 export uses **FFmpeg.wasm** (single-threaded UMD core, no `SharedArrayBuffer` / COOP-COEP headers required).

- Output: H.264, YUV420p, 1080p long edge, `+faststart` for instant mobile playback
- First use requires a ~26 MB one-time CDN download (`unpkg.com/@ffmpeg/core@0.12.6`); subsequent exports are served from the Workbox `ffmpeg-cdn` runtime cache
- Progress is reported in phases: downloading encoder → starting encoder → rendering pages (per-page counter) → preparing frames (per-page counter) → encoding video (time-based progress parsed from FFmpeg log output)
- Cancellation: the export honours an `AbortSignal`; during encoding `ff.terminate()` is called immediately
- Mobile share: because `navigator.share()` requires a live user-gesture context (lost during a long async encode), the finished blob is held in state and a "Tap to Share" button is shown rather than calling share automatically

---

## Run & Operate

- `pnpm --filter @workspace/famerang run dev` — run the Famerang web app (reads `PORT`/`BASE_PATH` from the artifact's workflow env)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- No database, no API server, no env vars required beyond `PORT` and `BASE_PATH` — entirely client-side

---

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Famerang artifact: React + Vite, Tailwind v4, wouter routing
- Local storage: Dexie (IndexedDB) — `artifacts/famerang/src/lib/db.ts`
- PDF export: `jspdf` (draft booklet PDF, print booklet PDF, stamp-sheet PDF)
- Archive/backup: `jszip` (stamp pack ZIPs, booklet backup ZIPs, photo export ZIPs)
- Video export: `@ffmpeg/ffmpeg` + `@ffmpeg/core` (FFmpeg.wasm, UMD single-threaded build)
- Offline/installable shell: `vite-plugin-pwa` (Workbox)

---

## Where things live

| Path | Purpose |
|---|---|
| `src/lib/db.ts` | Dexie schema/instance (booklets, pages, stamp packages, stamps, page-stamp placements) |
| `src/lib/types.ts` | Domain types and shared constants (`TRIM_SIZES`, font defaults, `MAX_STAMPS_PER_PAGE`) |
| `src/lib/hooks.ts` | All data access: live-query React hooks + async CRUD functions. Only way pages should touch storage. |
| `src/lib/imaging.ts` | Photo center-crop/downscale on upload, stamp content hashing |
| `src/lib/compositing.ts` | `renderPageToCanvas(...)` — single source of truth for page layout; shared by live preview, PDF export, photo export, and video export |
| `src/lib/pdf.ts` | Draft booklet PDF export (150 DPI) |
| `src/lib/printPdf.ts` | Print booklet PDF export (300 DPI) |
| `src/lib/photoExport.ts` | Full-resolution JPEG export and ZIP fallback |
| `src/lib/videoExport.ts` | MP4 slideshow export via FFmpeg.wasm; `generateMp4()` accepts an `AbortSignal` |
| `src/lib/backup.ts` | Per-booklet backup/restore (`exportBookletZip` / `restoreBookletZip`) |
| `src/lib/stampPackZip.ts` | Stamp pack export/import (v2: `manifest.json` + individual PNGs; v1 legacy: single JSON with base64) |
| `src/lib/stampSheet.ts` | Printable stamp-sheet PDF generation |
| `src/lib/seedPacks.ts` | Default stamp pack seeding on first launch |
| `src/lib/share.ts` | OS share-sheet-or-download helper; `isTouchDevice()` exported for component use |
| `src/components/layout/AppLayout.tsx` | Shared app header; every routed screen renders under this one header |
| `src/pages/` | Routed screens (see Features above) |
| `public/seed-packs/` | Default stamp pack ZIPs served as static assets |
| `docs/default-stamp-packs.md` | How to add/update default stamp packs |

---

## Architecture decisions

- **No backend** — deliberately out of scope. The workspace's `api-server` artifact is unused by Famerang.
- **All storage on-device** — one Dexie/IndexedDB database. No sync, no cloud.
- **Per-booklet backup only** — `backup.ts` exports `exportBookletZip` / `restoreBookletZip` for a single booklet and its referenced stamps. There is no whole-dataset backup.
- **Backup format v3** — booklet backup ZIPs contain a `manifest.json` plus one binary image file per page photo (`page-1.jpg` etc.) and one binary PNG per stamp used in the booklet (`stamps/<name>.png`). No base64 is embedded in the JSON. Old v1 and v2 ZIPs still import correctly.
- **Stamp pack format v2** — stamp pack ZIPs contain `manifest.json` plus individual `.png` binary entries. Directly editable in any zip tool.
- **Per-booklet restore always overwrites** — there is no merge option. A confirm dialog warns before proceeding. Restored pages/page-stamps get brand-new IDs (see Gotchas).
- **Photo processing at upload time** — photos are center-cropped and downscaled to the booklet's canvas size immediately on upload, keeping on-device storage bounded regardless of source resolution.
- **Export rendering is single source of truth** — `compositing.ts`'s `renderPageToCanvas` is used by live preview, draft PDF, print PDF, photo export, and video export. Always draws on a white background regardless of dark mode so exports are print-ready.
- **Touch vs. desktop share** — `share.ts` checks `(pointer: coarse) and (hover: none)` to decide whether to invoke the OS share sheet (mobile) or trigger a direct `<a download>` (desktop).
- **Video cancellation via AbortSignal** — `generateMp4()` accepts `signal?: AbortSignal`. At each rendering/encoding checkpoint the signal is checked; during FFmpeg execution `ff.terminate()` is called on abort. The UI replaces the Generate button with a Cancel button in-place to save vertical space.
- **Video share on mobile requires fresh gesture** — `navigator.share()` on iOS/Android requires the call to be within an active user-gesture context. Because the encode takes minutes, the original tap's context is gone by the time the blob is ready. The finished blob is stored in React state and a "Tap to Share" button is displayed for the user to tap explicitly.
- **PWA update strategy** — `index.html` is served `NetworkFirst` (3 s timeout, falls back to cache) so iOS PWA picks up new deployments on cold launch. JS/CSS chunks are content-hashed and served `CacheFirst`. The FFmpeg WASM core is cached for 1 year in a dedicated `ffmpeg-cdn` Workbox cache.
- **Default packs seeded from static ZIPs** — `seedPacks.ts` fetches three ZIPs from `public/seed-packs/` on first launch and writes them to IndexedDB. A `SEED_VERSION` constant controls re-seeding when packs are updated.

---

## Gotchas

- Hooks in page components must be called unconditionally before any early `return null` guard — an earlier bug called `useStamps` after such a guard, causing "Rendered more hooks than during the previous render."
- `vite.config.ts` requires `PORT` and `BASE_PATH` env vars (provided by the artifact workflow) — don't hardcode a port.
- When restoring a single-booklet backup, never reuse the page/page-stamp IDs from the ZIP. If the original source booklet still exists on-device and you restore into a *different* booklet, `bulkPut`-ing the original IDs overwrites those still-live rows — silently moving pages away from the source booklet. Always mint fresh IDs for restored pages/page-stamps and remap references.
- `@ffmpeg/ffmpeg` must be excluded from Vite's dep-optimizer (`optimizeDeps.exclude`) — the optimizer rewrites the package's internal Web Worker URL, causing `ff.load()` to hang indefinitely.
- The FFmpeg UMD core (`ffmpeg-core.js`) declares `var createFFmpegCore` at module scope. When loaded as an ES module blob (required by the `@ffmpeg/ffmpeg` ESM worker), top-level `var` is module-scoped and never reaches `self`. The loader appends `\nexport default createFFmpegCore;\n` to the fetched JS before creating the blob URL so the worker's `import().default` resolves correctly.

---

## User preferences

- Dexie/IndexedDB over SQLite Wasm (initial scoping decision)
- Fully installable PWA; backup/restore via plain upload/download, no native file pickers
- Per-booklet backup only; no whole-dataset backup UI
