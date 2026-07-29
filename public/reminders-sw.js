/**
 * Erinnerungs-Logik des Service Workers.
 *
 * Wird per `workbox.importScripts` in den generierten Service Worker eingebunden.
 * ACHTUNG: Ein Syntaxfehler hier lässt `importScripts` werfen und verhindert die
 * Installation des GESAMTEN Service Workers — samt Offline-Cache. Diese Datei wird
 * nicht vom TypeScript-Compiler geprüft, also bei Änderungen im Browser gegenprüfen.
 *
 * WAS HIER EHRLICH GESAGT WERDEN MUSS:
 * Es gibt keinen browserübergreifenden Weg, eine lokale Benachrichtigung für eine feste
 * Uhrzeit zu planen, während die App geschlossen ist. `Notification.showTrigger` war ein
 * Chrome-Experiment und wurde wieder entfernt. Was tatsächlich funktioniert:
 *   1. App offen  -> die Seite meldet die fällige Zeit, dieser Worker zeigt die Meldung.
 *   2. App zu     -> `periodicsync`, sofern der Browser es unterstützt (Chrome/Edge, nur
 *                    bei installierter PWA). Den Zeitpunkt bestimmt der Browser.
 *   3. Sonst      -> keine Meldung. Punktgenaue Zustellung bei geschlossener App ginge
 *                    nur über echtes Web Push mit VAPID und einem sendenden Server
 *                    (siehe `push`-Handler unten, vorbereitet aber nicht aktiv).
 */

/* eslint-env serviceworker */

const DB_NAME = 'habitgrid-reminders'
const STORE = 'kv'

/**
 * Einheitliche Darstellung aller Meldungen. Pfade bewusst ohne führenden Schrägstrich:
 * Sie lösen gegen den Scope des Workers auf und funktionieren dadurch auch, wenn die
 * App in einem Unterverzeichnis liegt (GitHub Pages).
 */
function notificationOptions(options) {
  const { body, habitId, tag } = options
  return {
    body,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-72.png',
    vibrate: [100, 50, 100],
    lang: 'de',
    tag,
    // Ohne `renotify` ersetzt eine gleich getaggte Meldung die alte lautlos. Beim
    // Testen sieht es dann so aus, als käme überhaupt nichts an.
    renotify: Boolean(tag),
    requireInteraction: false,
    data: { habitId, url: self.registration.scope },
    actions: habitId
      ? [
          { action: 'done', title: 'Erledigt' },
          { action: 'open', title: 'Öffnen' },
        ]
      : [],
  }
}

function withStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction(STORE, mode)
      const request = fn(tx.objectStore(STORE))
      tx.oncomplete = () => {
        db.close()
        resolve(request ? request.result : undefined)
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    }
  })
}

const idbGet = (key) => withStore('readonly', (store) => store.get(key))
const idbSet = (key, value) => withStore('readwrite', (store) => store.put(value, key))

const pad = (n) => String(n).padStart(2, '0')
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * Zeigt alle Erinnerungen, deren Uhrzeit erreicht ist und die heute noch nicht gezeigt
 * wurden. Die Sperre gegen Doppelmeldungen liegt bewusst nur hier — egal ob die Seite
 * oder `periodicsync` auslöst, es gibt genau eine Stelle, die entscheidet.
 */
async function showDueReminders() {
  const data = await idbGet('reminders')
  if (!data || !Array.isArray(data.items)) return 0

  const now = new Date()
  const todayKey = dayKey(now)
  // Liste stammt von einem anderen Tag — dann stimmen „erledigt" und Zeitplan nicht mehr
  if (data.date !== todayKey) return 0

  const shown = (await idbGet('shown')) ?? { date: todayKey, ids: [] }
  if (shown.date !== todayKey) {
    shown.date = todayKey
    shown.ids = []
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  let count = 0

  for (const item of data.items) {
    if (item.done || shown.ids.includes(item.habitId)) continue
    const parts = String(item.time).split(':').map(Number)
    const hours = parts[0]
    const minutes = parts[1]
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) continue
    if (hours * 60 + minutes > nowMinutes) continue

    await self.registration.showNotification(
      'HabitGrid Pro',
      notificationOptions({
        body: `Zeit für dein Habit: ${item.name}! Tippe hier, um es abzuhaken.`,
        habitId: item.habitId,
        // Ein Tag pro Habit: eine erneute Meldung ersetzt die alte, statt zu stapeln
        tag: `habit-${item.habitId}`,
      }),
    )
    shown.ids.push(item.habitId)
    count++
  }

  if (count > 0) await idbSet('shown', shown)
  return count
}

self.addEventListener('message', (event) => {
  const message = event.data || {}

  if (message.type === 'SET_REMINDERS') {
    event.waitUntil(idbSet('reminders', message.payload))
  }

  if (message.type === 'FIRE_DUE') {
    event.waitUntil(showDueReminders())
  }

  /*
   * Sofortige Testmeldung. Umgeht bewusst die Fälligkeitsprüfung und die Sperre gegen
   * Doppelmeldungen — genau darum geht es beim Testen: Man will sehen, ob die Kette aus
   * Berechtigung, Service Worker und Darstellung überhaupt trägt.
   */
  if (message.type === 'TEST_NOTIFICATION') {
    event.waitUntil(
      self.registration
        .showNotification(
          'HabitGrid Pro',
          notificationOptions({
            body: 'Test bestanden — so sehen deine Erinnerungen aus.',
            tag: `test-${Date.now()}`,
          }),
        )
        .then(() => event.source?.postMessage({ type: 'TEST_NOTIFICATION_RESULT', ok: true }))
        .catch((error) =>
          event.source?.postMessage({
            type: 'TEST_NOTIFICATION_RESULT',
            ok: false,
            error: String(error && error.message ? error.message : error),
          }),
        ),
    )
  }

  // Beim Start fragt die Seite ab, ob über eine Benachrichtigung abgehakt wurde.
  if (message.type === 'GET_INTENTS') {
    event.waitUntil(
      (async () => {
        const intents = (await idbGet('intents')) ?? []
        if (intents.length) await idbSet('intents', [])
        event.source?.postMessage({ type: 'INTENTS', habitIds: intents })
      })(),
    )
  }
})

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'habit-reminders') event.waitUntil(showDueReminders())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const habitId = event.notification.data && event.notification.data.habitId
  const checkedOff = event.action === 'done'

  event.waitUntil(
    (async () => {
      // „Erledigt" direkt aus der Meldung: Der Worker kann den localStorage der Seite
      // nicht schreiben, hinterlegt die Absicht deshalb und die App wendet sie beim
      // nächsten Öffnen an.
      if (checkedOff && habitId) {
        const intents = (await idbGet('intents')) ?? []
        if (!intents.includes(habitId)) {
          intents.push(habitId)
          await idbSet('intents', intents)
        }
      }

      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows[0]
      if (open) {
        await open.focus()
        open.postMessage({ type: 'OPEN_HABIT', habitId, checkedOff })
        return
      }
      // Scope statt Wurzelpfad — sonst landet der Klick bei einem Unterverzeichnis-
      // Deployment auf der Domain-Wurzel statt in der App.
      const target = `${self.registration.scope}#/app${habitId ? `?habit=${habitId}` : ''}`
      await self.clients.openWindow(target)
    })(),
  )
})

/**
 * Vorbereitung für echtes Web Push. Aktiv wird das erst, wenn ein Server mit
 * VAPID-Schlüsseln Nachrichten sendet — siehe README. Bis dahin läuft er nie an.
 */
self.addEventListener('push', (event) => {
  let payload = { title: 'HabitGrid Pro', body: 'Zeit für dein Habit!' }
  try {
    if (event.data) payload = Object.assign(payload, event.data.json())
  } catch {
    // Nicht-JSON-Nutzlast: Standardtext verwenden statt die Meldung zu verschlucken
  }
  event.waitUntil(
    self.registration.showNotification(
      payload.title,
      notificationOptions({ body: payload.body, habitId: payload.habitId, tag: 'push' }),
    ),
  )
})
