import { createRoot } from 'react-dom/client';

import App from './App';
import { seedDefaultPacks } from './lib/seedPacks';

import './index.css';

// Seed default sticker packs into IndexedDB before first render.
// Fire-and-forget: the UI mounts immediately; packs appear as soon as the
// async writes complete (~1-2 s on first load).  If an asset fetch fails the
// app still starts normally and the failed pack is retried next launch.
seedDefaultPacks().catch((err) => console.warn('[seedPacks]', err));

createRoot(document.getElementById('root')!).render(<App />);
