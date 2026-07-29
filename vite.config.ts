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
          /*
           * `id` legt die dauerhafte Identität der App fest. Chrome empfiehlt, ihn zu
           * setzen und danach nie mehr zu ändern — eine Änderung gilt als neue App und
           * die bereits installierte bleibt unabhängig davon bestehen.
           */
          id: 'com.habitgrid.pro',
          name: 'HabitGrid Pro — Habit Tracker ohne Abo',
          short_name: 'HabitGrid',
          description:
            'Minimalistischer Habit Tracker mit Heatmap-Matrix, Ruhetagen und Offline-Modus. Einmal kaufen, dauerhaft nutzen.',
          lang: 'de',
          dir: 'ltr',
          /*
           * start_url und scope folgen dem Basispfad. Ein fest verdrahtetes '/' würde
           * bei einem Unterverzeichnis-Deployment außerhalb des Scopes liegen — die App
           * wäre dann gar nicht installierbar.
           */
          start_url: base,
          scope: base,
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          orientation: 'portrait',
          // Splash-Screen der installierten App im hellen Grundton der Oberfläche
          background_color: '#f9fafb',
          theme_color: '#f9fafb',
          categories: ['lifestyle', 'productivity', 'health'],
          // Es gibt keine native Entsprechung — Android soll keine anbieten
          prefer_related_applications: false,
          /*
           * Getrennte Einträge für `any` und `maskable` statt eines kombinierten
           * "any maskable": Ein maskierbares Icon trägt Sicherheitsabstand für den
           * Zuschnitt. Als `any` verwendet wirkt es sichtbar zu klein im Rahmen.
           */
          icons: [
            { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
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
