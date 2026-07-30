import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'robots.txt', 'icons/*.png'],
      manifest: {
        id: basePath,
        scope: basePath,
        start_url: basePath,
        name: 'Famerang',
        short_name: 'Famerang',
        description:
          'Turn a handful of photos into a printable storybook, right on your phone. No account, no internet needed.',
        theme_color: '#f6efe3',
        background_color: '#f6efe3',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: `${basePath}icons/icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: `${basePath}icons/icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: `${basePath}icons/icon-512-maskable.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache all app assets EXCEPT html.  index.html is intentionally
        // excluded so the precache handler does not intercept navigations with
        // CacheFirst — that is the root cause of iOS PWA not picking up updates.
        // JS/CSS chunks are content-hashed so CacheFirst is safe for them.
        globPatterns: ['**/*.{js,css,svg,png,ico,woff2}'],
        navigateFallback: `${basePath}index.html`,
        runtimeCaching: [
          {
            // Navigation requests (opening the PWA, refreshing): always try the
            // network first so iOS always loads the latest app shell.  Falls back
            // to the cached copy after 3 s so the app still launches offline.
            urlPattern: ({ request }: { request: Request }) =>
              request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'navigation-cache',
              networkTimeoutSeconds: 3,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache the FFmpeg WASM core from unpkg so it survives browser cache
            // eviction and remains available offline after the first export.
            urlPattern: /^https:\/\/unpkg\.com\/@ffmpeg\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ffmpeg-cdn',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    // @ffmpeg/ffmpeg ships a Web Worker that Vite's dep-optimizer breaks by
    // rewriting the worker file reference.  Excluding these packages lets them
    // load their own worker URL correctly and prevents ff.load() from hanging.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
