/**
 * Erinnerungen: Seitenseite.
 *
 * Die Seite berechnet, was heute fällig ist, und schickt die Liste an den Service Worker.
 * Der Worker entscheidet allein, ob eine Meldung erscheint — so gibt es genau eine Stelle,
 * die Doppelmeldungen verhindert.
 */
import { isScheduled, minutesOfDay, type Habit, type Log } from '../engine/habits'
import { today, type DayKey } from '../engine/dates'

export type ReminderItem = {
  habitId: string
  name: string
  time: string
  done: boolean
}

export type ReminderPayload = { date: DayKey; items: ReminderItem[] }

/**
 * Alle heute geplanten Habits mit gesetzter Erinnerungszeit. Rein rechnend und ohne
 * Seiteneffekte, damit die Auswahl testbar bleibt.
 */
export function dueToday(habits: Habit[], log: Log, day: DayKey = today()): ReminderItem[] {
  return habits
    .filter((h) => !h.archived && h.reminder && minutesOfDay(h.reminder) >= 0)
    .filter((h) => isScheduled(h, day))
    .map((h) => ({
      habitId: h.id,
      name: h.name,
      time: h.reminder!,
      done: log[h.id]?.[day]?.done === true,
    }))
}

/** Millisekunden bis zur Uhrzeit heute; negativ, wenn sie schon vorbei ist. */
export function msUntil(time: string, now: Date): number {
  const minutes = minutesOfDay(time)
  if (minutes < 0) return Number.NaN
  const target = new Date(now)
  target.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return target.getTime() - now.getTime()
}

/* ------------------------------ Berechtigungen ------------------------------ */

export type NotificationState =
  | 'unsupported' // Browser kennt die API nicht
  | 'ios-install' // iOS: erst nach Installation auf dem Home-Bildschirm verfügbar
  | 'default' // noch nicht gefragt
  | 'granted'
  | 'denied'

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS meldet sich seit Version 13 als Mac; der Touchpunkt verrät das Tablet.
  // `navigator.platform` ist abgekündigt — die Kennung kommt aus dem User-Agent.
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export function notificationState(): NotificationState {
  // Auf iOS existiert `Notification` erst in der installierten Web-App (ab iOS 16.4).
  if (!('Notification' in window)) return isIos() ? 'ios-install' : 'unsupported'
  if (isIos() && !isStandalone() && Notification.permission === 'default') return 'ios-install'
  return Notification.permission as 'default' | 'granted' | 'denied'
}

export async function requestPermission(): Promise<NotificationState> {
  if (!('Notification' in window)) return notificationState()
  try {
    await Notification.requestPermission()
  } catch {
    // Ältere Safari-Fassungen kennen nur die Callback-Form; der Status wird unten gelesen.
  }
  return notificationState()
}

/* -------------------------------- Zustellung -------------------------------- */

let timers: number[] = []

const clearTimers = () => {
  timers.forEach(clearTimeout)
  timers = []
}

async function worker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

/**
 * Meldet den heutigen Stand an den Service Worker und stellt Wecker für die noch
 * ausstehenden Zeiten. Bereits verstrichene Zeiten lösen bewusst nichts aus: Wer gerade
 * in der App ist, braucht keine Benachrichtigung über etwas, das vor ihm auf dem Schirm steht.
 */
export async function syncReminders(habits: Habit[], log: Log, now = new Date()) {
  const day = today()
  const items = dueToday(habits, log, day)
  const registration = await worker()
  if (!registration?.active) return

  registration.active.postMessage({
    type: 'SET_REMINDERS',
    payload: { date: day, items } satisfies ReminderPayload,
  })

  clearTimers()
  // Ohne Freigabe keine Wecker — und `Notification` gibt es auf iOS erst in der
  // installierten Web-App, ein ungeprüfter Zugriff würde dort eine Ausnahme werfen.
  if (notificationState() !== 'granted') return

  for (const item of items) {
    if (item.done) continue
    const delay = msUntil(item.time, now)
    if (!Number.isFinite(delay) || delay <= 0) continue
    // setTimeout ist auf ~24 Tage begrenzt; hier geht es nur um den laufenden Tag
    timers.push(
      window.setTimeout(() => {
        registration.active?.postMessage({ type: 'FIRE_DUE' })
      }, delay),
    )
  }
}

export function stopReminderTimers() {
  clearTimers()
}

/**
 * Hintergrundabgleich anmelden, damit Erinnerungen auch bei geschlossener App erscheinen
 * können. Nur Chrome und Edge unterstützen das, und nur bei installierter PWA — der Aufruf
 * scheitert sonst leise, was hier genau richtig ist.
 */
export async function enableBackgroundDelivery(): Promise<boolean> {
  const registration = await worker()
  const periodicSync = (registration as ServiceWorkerRegistration & {
    periodicSync?: { register: (tag: string, options: { minInterval: number }) => Promise<void> }
  })?.periodicSync
  if (!periodicSync) return false
  try {
    const status = await navigator.permissions.query({
      name: 'periodic-background-sync' as PermissionName,
    })
    if (status.state !== 'granted') return false
    await periodicSync.register('habit-reminders', { minInterval: 60 * 60 * 1000 })
    return true
  } catch {
    return false
  }
}

/** Wurde über eine Benachrichtigung „Erledigt" getippt? Liefert die betroffenen Habit-IDs. */
export async function drainCheckoffIntents(): Promise<string[]> {
  const registration = await worker()
  if (!registration?.active) return []
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'INTENTS') return
      navigator.serviceWorker.removeEventListener('message', onMessage)
      resolve(event.data.habitIds ?? [])
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    registration.active!.postMessage({ type: 'GET_INTENTS' })
    // Antwortet der Worker nicht, darf der Aufrufer nicht ewig hängen
    setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', onMessage)
      resolve([])
    }, 1500)
  })
}

/* -------------------------------- Diagnose ---------------------------------- */

export type NotificationDiagnosis = {
  permission: NotificationPermission | 'nicht verfügbar'
  serviceWorker: 'aktiv' | 'wartet' | 'wird installiert' | 'nicht registriert' | 'nicht unterstützt'
  standalone: boolean
  isIos: boolean
  /** iOS zeigt Mitteilungen ausschließlich in der installierten Web-App */
  iosNeedsInstall: boolean
  backgroundDelivery: boolean
}

export async function diagnose(): Promise<NotificationDiagnosis> {
  const ios = isIos()
  let sw: NotificationDiagnosis['serviceWorker'] = 'nicht unterstützt'
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) sw = 'nicht registriert'
    else if (registration.active) sw = 'aktiv'
    else if (registration.waiting) sw = 'wartet'
    else sw = 'wird installiert'
  }
  return {
    permission: 'Notification' in window ? Notification.permission : 'nicht verfügbar',
    serviceWorker: sw,
    standalone: isStandalone(),
    isIos: ios,
    iosNeedsInstall: ios && !isStandalone(),
    backgroundDelivery: 'periodicSync' in ((await worker()) ?? {}),
  }
}

/**
 * Löst sofort eine Testmeldung aus.
 *
 * Bewusst über den Service Worker statt über `new Notification()`: In einer installierten
 * PWA — und auf iOS grundsätzlich — ist der Konstruktor nicht verfügbar. Nur der Weg über
 * `registration.showNotification` funktioniert überall dort, wo es darauf ankommt.
 */
export async function triggerInstantTestNotification(): Promise<{ ok: boolean; error?: string }> {
  if (notificationState() === 'ios-install') {
    return {
      ok: false,
      error:
        'Auf iOS funktionieren Push-Mitteilungen nur, wenn HabitGrid Pro zum Home-Bildschirm hinzugefügt wurde.',
    }
  }
  if (Notification.permission !== 'granted') {
    const state = await requestPermission()
    if (state !== 'granted') {
      return { ok: false, error: 'Ohne erteilte Berechtigung kann keine Meldung erscheinen.' }
    }
  }

  const registration = await worker()
  if (!registration) return { ok: false, error: 'Kein Service Worker registriert.' }

  // Antwort des Workers abwarten, damit ein Fehler nicht unbemerkt verpufft
  const answer = new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'TEST_NOTIFICATION_RESULT') return
      navigator.serviceWorker.removeEventListener('message', onMessage)
      resolve({ ok: event.data.ok, error: event.data.error })
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', onMessage)
      resolve({ ok: false, error: 'Der Service Worker hat nicht geantwortet.' })
    }, 3000)
  })

  const target = registration.active ?? navigator.serviceWorker.controller
  if (!target) return { ok: false, error: 'Service Worker ist noch nicht aktiv — Seite neu laden.' }
  target.postMessage({ type: 'TEST_NOTIFICATION' })
  return answer
}

/** Liest die Habit-ID aus einem Deep Link wie `#/app?habit=abc`. */
export function habitFromHash(hash = window.location.hash): string | null {
  const query = hash.split('?')[1]
  return query ? new URLSearchParams(query).get('habit') : null
}
