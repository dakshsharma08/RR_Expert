/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Preload the two latin font files the first screen uses (Fraunces + Inter), so text
 * renders in the right font without waiting for the CSS to be parsed first.
 * (Improves Largest Contentful Paint on slow phones.)
 */
function preloadFonts(): Plugin {
  return {
    name: 'lockstep-preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) =>
          /(fraunces|inter)-latin-wght-normal-[\w-]+\.woff2$/.test(f),
        );
        const links = files
          .map((f) => `<link rel="preload" href="/${f}" as="font" type="font/woff2" crossorigin>`)
          .join('\n    ');
        return html.replace('</title>', `</title>\n    ${links}`);
      },
    },
  };
}

// Why this file matters (for learners):
// - `react()` compiles JSX, `tailwindcss()` turns our utility classes into CSS.
// - `VitePWA` generates a service worker so the app shell works offline and
//   can be installed on a phone's home screen.
// - `server.proxy` forwards /api calls from the Vite dev server (5173) to our
//   Express API (8787), so the browser never needs the Gemini key.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    preloadFonts(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'LOCKSTEP — Your deadline, locked in',
        short_name: 'LOCKSTEP',
        description:
          'Gemini-planned milestones, a live countdown and a lock-screen wallpaper that shows your real progress.',
        theme_color: '#090909',
        background_color: '#090909',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/app',
        scope: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // The 3D hero is desktop-only decoration: never precache ~1 MB of three.js on phones.
        globIgnores: ['**/HeroRing3D-*.js'],
        // Never cache API calls: plans must be fresh, and AI errors must be honest.
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // Fewer, better-grouped chunks: one icon chunk instead of ~40 tiny requests,
        // and stable vendor groups that cache well between deploys.
        codeSplitting: {
          groups: [
            { name: 'icons', test: /node_modules[\\/]lucide-react/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/ },
            {
              name: 'data',
              test: /node_modules[\\/](dexie|dexie-react-hooks|zod|date-fns|date-fns-tz)[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
});
