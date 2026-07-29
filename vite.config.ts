import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  /*
   * Basispfad kommt aus der Umgebung, damit derselbe Code auf Vercel (Wurzel) und auf
   * GitHub Pages (Unterverzeichnis /repo-name/) läuft.
   *
   * Bewusst NICHT './': Der Service Worker braucht einen absoluten Scope, und
   * `start_url` im Manifest muss zum ausgelieferten Pfad passen. Ein relativer
   * Basispfad lädt zwar die Assets korrekt, macht die App aber nicht installierbar.
   *
   * GitHub Pages:  VITE_BASE=/habitgrid-pro/  in .env.production eintragen
   * Vercel/Netlify: nichts eintragen, '/' ist die Vorgabe
   */
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE || '/'

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.svg',
          'favicon.ico',
          'apple-touch-icon.png',
          'robots.txt',
          'sitemap.xml',
        ],
        manifest: {
          name: 'HabitGrid Pro — Habit Tracker ohne Abo',
          short_name: 'HabitGrid',
          description:
            'Minimalistischer Habit Tracker mit Heatmap-Matrix, Ruhetagen und Offline-Modus. Einmal kaufen, dauerhaft nutzen.',
          lang: 'de',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          // Splash-Screen der installierten App im hellen Grundton der Oberfläche
          background_color: '#f9fafb',
          theme_color: '#f9fafb',
          categories: ['productivity', 'lifestyle', 'health'],
          icons: [
            { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
            { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
            {
              src: `${base}icons/icon-maskable-512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          // Ein neuer Worker übernimmt sofort und wirft die alten Caches weg. Ohne das
          // bleibt eine installierte App auf dem Stand des Tages hängen, an dem sie
          // installiert wurde — Layoutfehler inklusive, die längst behoben sind.
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          // Offline First: Der App-Shell kommt aus dem Cache, Updates laufen im Hintergrund nach.
          runtimeCaching: [
            {
              urlPattern: ({ request }) =>
                ['style', 'script', 'worker', 'image', 'font'].includes(request.destination),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'habitgrid-assets',
                expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
          navigateFallback: `${base}index.html`,
          // Erinnerungs-Logik als eigenes Skript in den erzeugten Worker einbinden.
          // Spart gegenüber `injectManifest` drei workbox-Abhängigkeiten und eine zweite
          // tsconfig für den Worker-Kontext.
          importScripts: [`${base}reminders-sw.js`],
        },
        devOptions: { enabled: false },
      }),
    ],
  }
})
