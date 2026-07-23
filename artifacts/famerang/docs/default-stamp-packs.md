# Default Stamp Packs

Famerang ships with a set of built-in stamp packs that are automatically seeded into every user's local database on first launch. This document explains how to add new packs and how to update existing ones.

---

## How seeding works

On every app start, `src/lib/seedPacks.ts` compares a `SEED_VERSION` constant against the version stored in the user's `localStorage`. If the stored version is lower, the seed routine runs:

- **New packs** are inserted into IndexedDB with a fixed, stable ID.
- **Existing packs** (already seeded on a previous version) have their stamps replaced, while the pack record itself (name, sort order) is left untouched so any user customisation is preserved.
- **User-created packs** (IDs not in `DEFAULT_PACKS`) are never touched.

After seeding, the new version number is written to `localStorage` so the routine is skipped on subsequent launches.

---

## File locations

| Path | Purpose |
|---|---|
| `public/seed-packs/` | Static zip assets served by Vite at build time |
| `src/lib/seedPacks.ts` | Seed logic and pack manifest (`DEFAULT_PACKS`) |

---

## Adding a new pack

### 1. Export the pack zip from Famerang

Open the Stamps Library, navigate into the pack, and use the **Export** toolbar button. This produces a `famerang-stamp-pack.zip` file containing a single `famerang-stamp-pack.json` entry.

### 2. Note the pack's `id`

Open the zip and inspect `famerang-stamp-pack.json`. The top-level `package.id` field is a UUID — copy it. This ID must be stable; it is the key used to identify the pack across seed versions.

```json
{
  "package": {
    "id": "59d9b72c-f951-49c7-a0e4-6ce588d3aa11",
    "name": "Dinosaurs",
    ...
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
const SEED_VERSION = 2; // was 1
```

That's it. On their next app launch, every user will receive the new pack at the bottom of their Stamp Library.

---

## Updating an existing pack

Use this flow when you want to replace the stamps inside a pack that has already been shipped (e.g. you've redrawn some images, added stamps, or fixed filenames).

### 1. Re-export the pack zip from Famerang

Export the updated pack as described above. Make sure the `package.id` in the JSON is the **same UUID** as the original pack — if you imported or re-created the pack, you may need to check the JSON and confirm the ID matches the one in `DEFAULT_PACKS`.

### 2. Replace the zip in `public/seed-packs/`

Overwrite the existing file with the new zip, keeping the same filename.

### 3. Bump `SEED_VERSION`

```ts
const SEED_VERSION = 2; // was 1
```

On next launch, the seed routine will find the pack already in the user's DB (matching by ID), delete its stamps, and re-insert the stamps from the new zip. The pack name and sort order the user set are preserved.

> **Note on stamp references:** if a user has already placed stamps from this pack onto booklet pages, those `pageStamp` records reference stamp IDs. The updated zip should keep the same stamp IDs for stamps that haven't changed; only stamps that were added, removed, or redrawn will differ. Stamps whose IDs disappear from the pack will leave orphaned placements on existing pages (the stamp image won't render). Where possible, preserve stamp IDs across updates.

---

## Removing a pack from the defaults

There is currently no automatic removal step — removing a pack from `DEFAULT_PACKS` simply stops it from being seeded on new installs; existing users keep whatever is already in their DB. If you need to actively remove a pack from existing installs you would need to add an explicit cleanup step to the seed routine.

---

## Quick reference

| Action | Steps |
|---|---|
| Add a new pack | Copy zip → add entry to `DEFAULT_PACKS` → bump `SEED_VERSION` |
| Update an existing pack | Replace zip (same filename) → bump `SEED_VERSION` |
| Remove from new installs | Delete zip + remove entry from `DEFAULT_PACKS` (no version bump needed) |
