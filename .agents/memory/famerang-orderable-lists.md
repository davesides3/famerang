---
name: Famerang orderable-list pattern
description: Convention for user-reorderable lists (booklet pages, stamp packages) in the Famerang app.
---

User-reorderable lists in Famerang (booklet pages, stamp packages) share a
convention: an explicit `sortOrder` field drives display order (not
`createdAt`), new items are always appended after the current max so they
land at the bottom, and any import/restore path must treat items already
present locally as keeping their position while genuinely new items get
appended -- never reshuffling or prepending. When backfilling `sortOrder`
for records that predate it (e.g. an old backup), derive a stable order
(such as from `createdAt`) rather than leaving it missing/NaN, since
downstream `max()`-based append logic breaks on invalid values.

**Why:** Users expect predictable positions -- new items always land at the
end, and restoring old data should never reorder or bump what's already
there. This bit us once via an unguarded `Math.max` over `sortOrder` that
produced `NaN` when a value was missing.

**How to apply:** When adding another user-orderable list, follow this
convention rather than inventing new ordering semantics per list, and always
guard `sortOrder` reads with a fallback (`?? -1`) at every read site,
including backup/restore/import.
