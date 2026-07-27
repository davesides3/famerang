# Default Sticker Packs

Famerang ships with a set of built-in sticker packs that are automatically seeded into every user's local database on first launch. This document explains the zip format, and how to add and update packs.

---

## ZIP format (v2)

Each sticker pack zip contains:

| Entry | Description |
|---|---|
| `manifest.json` | Package metadata + sticker list (no image data) |
| `<sticker-name>.png` | One binary PNG file per sticker |

**`manifest.json` shape:**

```json
{
  "version": 2,
  "exportedAt": 1234567890000,
  "kind": "stickerPack",
  "package": {
    "id": "59d9b72c-f951-49c7-a0e4-6ce588d3aa11",
    "name": "Dinosaurs",
    "createdAt": 1234567890000,
    "sortOrder": 0,
    "artist": "Jane Smith",
    "creditsUrl": "https://example.com",
    "creditsLocked": true
  },
  "stickers": [
    {
      "id": "abc123...",
      "name": "spinosaurus-happy-right",
      "contentHash": "sha256...",
      "filename": "spinosaurus-happy-right.png"
    }
  ]
}
```

The PNG files sit at the top level of the zip alongside `manifest.json` — not in a subfolder. Their filenames match the `filename` fields in the manifest.

> **Backwards compatibility:** The app can still import old v1 zips (single `famerang-sticker-pack.json` with base64 images). Any v1 file a user has saved will import correctly. New exports always use v2.

---

## How seeding works

On every app start, `src/lib/seedPacks.ts` compares a `SEED_VERSION` constant against the version stored in the user's `localStorage`. If the stored version is lower, the seed routine runs:

- **New packs** are inserted into IndexedDB with a fixed, stable ID.
- **Existing packs** (already seeded on a previous version) have their stickers replaced, while the pack record itself (name, sort order) is left untouched so any user customisation is preserved.
- **User-created packs** (IDs not in `DEFAULT_PACKS`) are never touched.

After seeding, the new version number is written to `localStorage` so the routine is skipped on subsequent launches.

---

## File locations

| Path | Purpose |
|---|---|
| `public/seed-packs/` | Static zip assets served by Vite at build time |
| `src/lib/seedPacks.ts` | Seed logic and pack manifest (`DEFAULT_PACKS`) |
| `src/lib/stickerPackZip.ts` | Export and import logic (handles v1 + v2) |

---

## Adding a new pack

### 1. Export the pack zip from Famerang

Open the Stickers Library, navigate into the pack, and use the **Export** toolbar button. This produces a `famerang-<name>.zip` file in the v2 format (a `manifest.json` plus individual `.png` files).

### 2. Note the pack's `id`

Open the zip and inspect `manifest.json`. The `package.id` field is a UUID — copy it. This ID must be stable; it is the key used to identify the pack across seed versions.

```json
{
  "package": {
    "id": "59d9b72c-f951-49c7-a0e4-6ce588d3aa11",
    "name": "Dinosaurs"
  }
}
```

### 3. Copy the zip into `public/seed-packs/`

Give it a short, URL-safe filename:

```
public/seed-packs/my-new-pack.zip
```

### 4. Add an entry to `DEFAULT_PACKS` in `seedPacks.ts`

```ts
const DEFAULT_PACKS: Array<{ id: string; asset: string }> = [
  // … existing entries …
  {
    id: 'YOUR-PACK-UUID-HERE',
    asset: 'seed-packs/my-new-pack.zip',
  },
];
```

### 5. Bump `SEED_VERSION`

```ts
const SEED_VERSION = 3; // was 2
```

That's it. On their next app launch, every user will receive the new pack at the bottom of their Sticker Library.

---

## Updating an existing pack

Use this flow when you want to replace the stickers inside a pack that has already been shipped (e.g. you've redrawn some images, added stickers, or fixed filenames).

### 1. Re-export the pack zip from Famerang

Export the updated pack as described above. Make sure `package.id` in `manifest.json` is the **same UUID** as the original — if you imported or re-created the pack, check the JSON and confirm the ID matches the one in `DEFAULT_PACKS`.

### 2. Replace the zip in `public/seed-packs/`

Overwrite the existing file with the new zip, keeping the same filename.

### 3. Bump `SEED_VERSION`

```ts
const SEED_VERSION = 3; // was 2
```

On next launch, the seed routine finds the pack already in the user's DB (matching by ID), deletes its stickers, and re-inserts the stickers from the new zip. The pack name and sort order the user set are preserved.

> **Note on sticker references:** if a user has already placed stickers from this pack onto booklet pages, those `pageSticker` records reference sticker IDs. Where possible, preserve sticker IDs for stickers that haven't changed — only new or redrawn stickers need new IDs. Stickers whose IDs disappear from the pack will leave orphaned placements on existing pages (the image won't render).

### Editing PNGs directly in the zip

Because the v2 format stores PNGs as plain binary files, you can also edit a pack without going through the Famerang UI:

1. Unzip the pack.
2. Edit, replace, or add `.png` files.
3. Update `manifest.json` — add/remove sticker entries and update `filename` references.
4. Rezip and drop back into `public/seed-packs/`.
5. Bump `SEED_VERSION`.

---

## Removing a pack from the defaults

Removing a pack from `DEFAULT_PACKS` stops it from being seeded on new installs; existing users keep whatever is already in their DB. If you need to actively remove a pack from existing installs you would need to add an explicit cleanup step to the seed routine.

---

## Quick reference

| Action | Steps |
|---|---|
| Add a new pack | Export zip → copy to `public/seed-packs/` → add entry to `DEFAULT_PACKS` → bump `SEED_VERSION` |
| Update an existing pack | Replace zip (same filename) → bump `SEED_VERSION` |
| Edit PNGs directly | Unzip → edit PNGs + manifest → rezip → bump `SEED_VERSION` |
| Remove from new installs | Delete zip + remove entry from `DEFAULT_PACKS` (no version bump needed) |
