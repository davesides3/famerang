# Famerang

A 100% local, offline-first PWA for turning a handful of kids' photos into a printable keepsake storybook -- no account, no server, no cloud.

## Run & Operate

- `pnpm --filter @workspace/famerang run dev` -- run the Famerang web app (reads `PORT`/`BASE_PATH` from the artifact's workflow env)
- `pnpm run typecheck` -- full typecheck across all packages
- `pnpm run build` -- typecheck + build all packages
- No database, no API server, no env vars are required for this artifact -- it is entirely client-side.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Famerang artifact: React + Vite, Tailwind v4, wouter routing
- Local storage: Dexie (IndexedDB) -- `artifacts/famerang/src/lib/db.ts`
- Export: `jspdf` (draft PDF), `jszip` (page-image ZIP and full-dataset backup)
- Offline/installable shell: `vite-plugin-pwa`

## Where things live

- `artifacts/famerang/src/lib/db.ts` -- Dexie schema/instance (booklets, pages, stamp packages, stamps, page-stamp placements)
- `artifacts/famerang/src/lib/types.ts` -- domain types and shared constants (canvas sizes, font defaults)
- `artifacts/famerang/src/lib/hooks.ts` -- all data access: live-query React hooks + async CRUD functions. This is the only way pages should touch storage.
- `artifacts/famerang/src/lib/imaging.ts` -- photo center-crop/downscale on upload, stamp content hashing
- `artifacts/famerang/src/lib/compositing.ts` -- `renderPageToCanvas(...)`, the single source of truth for page layout; shared by the live editor preview, PDF export, and ZIP export
- `artifacts/famerang/src/lib/pdf.ts` / `zipExport.ts` / `backup.ts` / `share.ts` -- export, photo ZIP export, backup/restore (both full-dataset and single-booklet), and OS share-sheet-or-download helper
- `artifacts/famerang/src/components/layout/AppLayout.tsx` -- shared app header (Famerang wordmark left, route-aware Stamps/Booklets nav or a `useHeaderClose` "Close" override on right). Every routed screen renders under this one header instead of its own back/title bar.
- `artifacts/famerang/src/pages/` -- routed screens: `Home.tsx` (booklet list), `BookletHub.tsx` (per-booklet page list + reorder/export/backup/restore toolbar), `PageEditor.tsx` (photo + caption + stamp placement), `PagePreview.tsx` (full-page preview), `StampsLibrary.tsx` (stamp packages)

## Architecture decisions

- No backend, no OpenAPI/codegen, no Postgres -- deliberately out of scope. The workspace's `api-server`/`db`/`api-spec` packages are unused by this artifact.
- All storage lives in one Dexie/IndexedDB database on-device. Backup/restore ZIPs contain a single JSON dump each (photos/stamps travel inline as base64 data URLs, so no separate asset bundling is needed) -- there are two independent shapes: a full-dataset dump (every booklet/page/stamp) and a single-booklet dump (one booklet's own record, pages, and referenced stamps/packages).
- Per-booklet restore (`restoreBookletZip`) always overwrites -- there is no merge option, and the target booklet is whichever one the user was viewing when they tapped Restore (not necessarily the booklet that was originally backed up). The user is warned via a confirm dialog before it proceeds, since it's destructive. Restored pages/page-stamps are given brand-new ids rather than reusing the ids captured in the backup, because reusing them would make `bulkPut` overwrite still-live rows if the original source booklet still exists on-device (see Gotchas).
- Photos are always center-cropped and downscaled to the booklet's square canvas size at upload time, so on-device storage stays bounded regardless of source photo resolution.
- Export deliberately covers only a 1-up draft PDF and a ZIP of page images -- full high-res PDF and video/slideshow export were explicitly cut from scope.
- Stamp deletion (both individual stamps and whole packages) is reference-count-protected: deleting something still placed on a page throws `StampInUseError(usageCount)` unless the caller passes `{ force: true }`.

## Product

- Create booklets (square trim size, font, font size), add pages with a photo + caption (placed above or below), and decorate photos with tap-to-place, drag-to-reposition sticker "stamps" organized into packages.
- Reorder pages via drag-and-drop (grip handle on the left of each page row); delete a page directly from the page-list row (trash icon on the right) or delete a whole booklet directly from its card on Home -- both always visible, with a confirm dialog before deleting.
- Export the booklet as a draft PDF or a ZIP of page images, sharing via the OS share sheet or a plain download.
- Back up a single booklet, or the entire local dataset, to a ZIP file. Full-dataset restore supports replace or merge; single-booklet restore always overwrites the currently-open booklet (with a confirm warning first) and the page list refreshes in place. Both backup and restore show a completion toast.
- Every routed screen (booklet list, booklet hub, page editor, page preview, stamp library) shares one physical header (Famerang wordmark + contextual nav/Close) instead of each screen having its own header bar.
- Installable as a PWA with an offline app shell.

## User preferences

- None recorded yet beyond the initial scoping decisions (see task history): Dexie/IndexedDB over SQLite Wasm, fully installable PWA, backup/restore via plain upload/download (no native file pickers), no video/slideshow export.

## Gotchas

- Hooks in page components must be called unconditionally before any early `return null` guard -- an earlier bug in the page editor called `useStamps` after such a guard, causing a "Rendered more hooks than during the previous render" crash.
- `vite.config.ts` requires `PORT` and `BASE_PATH` env vars (provided by the artifact workflow) -- don't hardcode a port.
- When restoring a single-booklet backup, never reuse the page/page-stamp ids captured in the ZIP. If the original source booklet still exists on-device and you restore into a *different* booklet, `bulkPut`-ing rows with the original ids overwrites those still-live rows in place -- silently moving pages away from the original booklet instead of copying them. Always mint fresh ids for restored pages/page-stamps and remap references.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
