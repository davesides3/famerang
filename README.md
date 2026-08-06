# Famerang

**Turn Apple &amp; Google photos + stamps into printable booklets kids hold &amp; grandparents cherish.**

No screen time. No login or app store. Free. Photos stay on-device.

---

## What it is

Famerang is a Progressive Web App (PWA) that runs entirely in your browser. You pick a handful of photos, arrange them into pages, decorate with sticker stamps, and export — as a PDF ready for a home printer, a print shop, or as an MP4 slideshow to text to grandma.

Nothing ever leaves your device. There is no server, no account, and no subscription.

## Features

- **Photo booklets** — portrait or square layouts (7×7", 8×8", 9×9", 7.5×10" home-print)
- **Sticker stamps** — drag-to-reposition stamps on any page; ships with nine themed packs (Animals, Birds, Cats, Dogs, Insects, Dinosaurs, Construction Vehicles…)
- **Four export formats:**
  - Draft PDF (150 DPI) — for sharing digitally
  - Print PDF (300 DPI) — for home printing or a print shop
  - Full-resolution JPEGs — one per page, delivered via your OS share sheet
  - MP4 slideshow — H.264 video with customisable seconds-per-page and crossfade
- **Backup &amp; restore** — per-booklet ZIP backup; no cloud account required
- **Installable** — add to your home screen for fully offline use
- **Dark mode** — because late-night booklet making is a thing

## Try it

Open [famerang.com](https://famerang.com) in any modern browser on iOS, Android, Mac, or PC. Tap **Add to Home Screen** to install for offline use.

## How it works

| Layer | Technology |
|---|---|
| App shell | React + Vite, Tailwind CSS v4, wouter |
| Storage | Dexie (IndexedDB) — 100% on-device |
| PDF export | jsPDF |
| Video export | FFmpeg.wasm (single-threaded) |
| ZIP handling | JSZip |
| Offline / PWA | vite-plugin-pwa (Workbox) |
| Monorepo | pnpm workspaces, Node.js 24, TypeScript 5.9 |

## Developing locally

```bash
# Clone and install
git clone https://github.com/davesides3/famerang.git
cd famerang
pnpm install

# Start the dev server
pnpm --filter @workspace/famerang run dev
```

The app runs at `http://localhost:<PORT>` (the port is assigned automatically from the `PORT` env var).

```bash
# Typecheck all packages
pnpm run typecheck

# Build everything
pnpm run build
```

## Stamp packs

The app ships with nine default stamp packs sourced from `artifacts/famerang/public/seed-packs/`. Each pack is a ZIP containing a `manifest.json` and individual PNG stamps. See [`docs/default-stamp-packs.md`](artifacts/famerang/docs/default-stamp-packs.md) for how to add or update packs.

## Contributing

Pull requests are welcome. Please open an issue first for anything non-trivial.

## License

[MIT](LICENSE) — © 2026 Dave Sides
