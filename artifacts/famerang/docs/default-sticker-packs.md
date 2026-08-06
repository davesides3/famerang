# Default Sticker Packs

Famerang ships with a set of built-in sticker packs that are automatically seeded into every user's local database on first launch. This document describes the current packs, explains the zip format, and explains how to add and update packs.

---

## Current default packs

| Pack | ID | Stickers | Artist |
|---|---|---|---|
| Animals - Barnyard | `6d9c0177-9dea-472a-8f83-ab3966620650` | 12 | Famerang |
| Animals - Wild | `d3205c9b-b825-4e46-af19-e19c2626ca49` | 42 | Famerang |
| Birds - Backyard | `3afdbfa1-98a5-4765-8483-abdb5065b0c6` | 16 | Famerang |
| Birds - Wild | `1afdb7f2-974e-49ab-a75d-f46a3c8efd28` | 24 | Famerang |
| Cats | `6ebed676-a391-481f-bcc1-d8c6aaec5b97` | 30 | Famerang |
| Construction Vehicles | `b4d38491-d500-4348-afc0-7f2c7c061280` | 16 | Famerang |
| Dinosaurs | `baf7d89a-4e90-4ca7-888c-68fc3a4caa3f` | 22 | Famerang |
| Dogs | `c3de15b6-4aab-48fe-8dc4-68c075c08f61` | 39 | Famerang |
| Insects | `3fd25cac-f078-418d-8367-33875237f74e` | — | Famerang |

All packs are credited to Famerang (`https://www.famerang.com`) with `creditsLocked: true`.

### Sticker inventory

**Animals - Barnyard** — chicken-left, chicken-right, cow-left, cow-right, goat-left, goat-right, horse-left, horse-right, pig-left, pig-right, sheep-left, sheep-right

**Animals - Wild** — alligator-left, alligator-right, bear-black-left, bear-black-right, bear-brown-left, bear-brown-right, cheetah-left, cheetah-right, elephant-left, elephant-right, gazelle-left, gazelle-right, giraffe-left, giraffe-right, ground-hog-left, ground-hog-right, hyena-left, hyena-right, kangaroo-left, kangaroo-right, kiwi-left, kiwi-right, lion-left, lion-right, oppossum-left, oppossum-right, panda-left, panda-right, panther-left, panther-right, raccoon-left, raccoon-right, rino-left, rino-right, snake-left, snake-right, tiger-left, tiger-right, wildebeest-left, wildebeest-right, zebra-left, zebra-right

**Birds - Backyard** — blue-jay-left, blue-jay-right, cardinal-left, cardinal-right, chickadee-left, chickadee-right, goldfinch-left, goldfinch-right, house-finch-left, house-finch-right, mourning-dove-left, mourning-dove-right, robin-left, robin-right, woodpecker-left, woodpecker-right

**Birds - Wild** — eagle-left, eagle-right, great-horned-owl-left, great-horned-owl-right, harpy-eagle-left, harpy-eagle-right, hyacinth-macaw-left, hyacinth-macaw-right, keel-billed-toucan-left, keel-billed-toucan-right, king-bird-of-paradise-left, king-bird-of-paradise-right, peregrine-falcon-left, peregrine-falcon-right, red-tailed-hawk-left, red-tailed-hawk-right, resplendent-quetzal-left, resplendent-quetzal-right, scarlet-macaw-left, scarlet-macaw-right, snowy-owl-left, snowy-owl-right, toco-toucan-left, toco-toucan-right

**Cats** — abyssinian-left, abyssinian-right, american-shorthair-left, american-shorthair-right, bengal-left, bengal-right, black-cat-forward-left, black-cat-forward-right, black-cat-sleeping-left, black-cat-sleeping-right, black-cat-stretching-left, black-cat-stretching-right, british-shorthair-left, british-shorthair-right, maine-coon-left, maine-coon-right, orange-persian-forward-left, orange-persian-forward-right, persian-left, persian-right, ragdoll-left, ragdoll-right, russian-blue-left, russian-blue-right, scottish-fold-left, scottish-fold-right, siamese-left, siamese-right, sphynx-left, sphynx-right

**Construction Vehicles** — backhoe-left, backhoe-right, bulldozer-left, bulldozer-right, crane-left, crane-right, dump-truck-left, dump-truck-right, excavator-left, excavator-right, forklift-left, forklift-right, mixer-left, mixer-right, steamroller-left, steamroller-right

**Dinosaurs** — ankylosaurus-happy-left, ankylosaurus-happy-right, brachiosaurus-happy-left, brachiosaurus-happy-right, parasaurolophus-happy-left, parasaurolophus-happy-right, plesiosaur-happy-left, plesiosaur-happy-right, pteranodon-happy-left, pteranodon-happy-right, spinosaurus-happy-left, spinosaurus-happy-right, stegosaurus-happy-left, stegosaurus-happy-right, triceratops-happy-left, triceratops-happy-right, tyrannosaurus-happy-left, tyrannosaurus-happy-right, velociraptor-happy-left, velociraptor-happy-right *(+ 2 sheet-preview PNGs included in zip)*

**Dogs** — beagle-left, beagle-right, border-collie-left, border-collie-right, chihuahua-left, chihuahua-right, corgi-left, corgi-right, dachshund-left, dachshund-right, french-bulldog-left, french-bulldog-right, golden-retriever-left, golden-retriever-right, great-dane-right, maltese-left, maltese-right, mastiff-left, mastiff-right, min-pin-left, min-pin-right, newfoundland-left, newfoundland-right, pomeranian-left, pomeranian-right, pug-left, pug-right, rottweiler-left, rottweiler-right, saint-bernard-left, saint-bernard-right, siberian-husky-left, siberian-husky-right, springer-spaniel-left, springer-spaniel-right, wolfhound-left, wolfhound-right, yorkie-left, yorkie-right

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
    "id": "baf7d89a-4e90-4ca7-888c-68fc3a4caa3f",
    "name": "Dinosaurs",
    "createdAt": 1234567890000,
    "sortOrder": 0,
    "artist": "Famerang",
    "creditsUrl": "https://www.famerang.com",
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
- **Removed packs** (IDs that were in a prior `DEFAULT_PACKS` but are no longer) are deleted from the user's DB, including any page placements referencing their stickers.
- **User-created packs** (IDs not in `DEFAULT_PACKS` and not in the removal list) are never touched.

After seeding, the new version number is written to `localStorage` so the routine is skipped on subsequent launches.

Current `SEED_VERSION`: **3**

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
const SEED_VERSION = 4; // was 3
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

To actively remove a pack from existing installs, add its ID to the `oldDefaultIds` removal list near the top of the seed routine in `seedPacks.ts`, then bump `SEED_VERSION`. The routine will delete the pack and all its stickers (including any page placements) from the user's DB on next launch.

Simply removing an entry from `DEFAULT_PACKS` without adding it to the removal list will stop the pack from being seeded on new installs, but existing users will keep it.

---

## Quick reference

| Action | Steps |
|---|---|
| Add a new pack | Export zip → copy to `public/seed-packs/` → add entry to `DEFAULT_PACKS` → bump `SEED_VERSION` |
| Update an existing pack | Replace zip (same filename) → bump `SEED_VERSION` |
| Edit PNGs directly | Unzip → edit PNGs + manifest → rezip → bump `SEED_VERSION` |
| Remove from all installs | Add ID to removal list in seed routine → remove from `DEFAULT_PACKS` → delete zip → bump `SEED_VERSION` |
| Remove from new installs only | Remove entry from `DEFAULT_PACKS` (no version bump needed) |
