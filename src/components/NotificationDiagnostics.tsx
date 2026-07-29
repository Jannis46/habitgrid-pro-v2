import { useEffect, useState } from 'react'
import { Bell, CircleAlert, CircleCheck, Share } from 'lucide-react'
import {
  diagnose,
  requestPermission,
  triggerInstantTestNotification,
  type NotificationDiagnosis,
} from '../lib/reminders'

/**
 * Prüfstand für Benachrichtigungen.
 *
 * Wenn Meldungen ausbleiben, liegt es fast nie an einer einzelnen Ursache, sondern an
 * einem von vier Gliedern: Berechtigung, Service Worker, Installationszustand oder der
 * Fälligkeitslogik. Diese Ansicht zeigt alle vier — und der Testknopf umgeht die
 * Fälligkeitsprüfung, damit sich die restliche Kette isoliert prüfen lässt.
 */
export function NotificationDiagnostics() {
  const [state, setState] = useState<NotificationDiagnosis | null>(null)
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => void diagnose().then(setState)
  useEffect(refresh, [])

  const rows: { label: string; value: string; ok: boolean }[] = state
    ? [
        {
          label: 'Berechtigung',
          value: state.permission,
          ok: state.permission === 'granted',
        },
        {
          label: 'Service Worker',
          value: state.serviceWorker,
          ok: state.serviceWorker === 'aktiv',
        },
        {
          label: 'Als App installiert',
          value: state.standalone ? 'ja' : 'nein — läuft im Browser-Tab',
          // Nur auf iOS ist das zwingend; anderswo ist es eine Empfehlung
          ok: state.standalone || !state.isIos,
        },
        {
          label: 'Zustellung bei geschlossener App',
          value: state.backgroundDelivery ? 'möglich (Hintergrundabgleich)' : 'nur bei offener App',
          ok: state.backgroundDelivery,
        },
      ]
    : []

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="push-titel">
      <h2 id="push-titel" className="text-lg font-semibold">
        Benachrichtigungen prüfen
      </h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
        Kommt nichts an, zeigt diese Übersicht, an welcher Stelle es hakt.
      </p>

      {state?.iosNeedsInstall && (
        <p
          className="mt-4 flex gap-2 rounded-xl p-3 text-sm"
          style={{ background: 'var(--accent-soft)' }}
        >
          <Share size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Auf iOS funktionieren Push-Mitteilungen nur, wenn HabitGrid Pro zum
            Home-Bildschirm hinzugefügt wurde. In Safari auf das Teilen-Symbol tippen, dann
            „Zum Home-Bildschirm".
          </span>
        </p>
      )}

      <dl className="mt-4 divide-y" style={{ borderColor: 'var(--border)' }}>
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-sm">{row.label}</dt>
            <dd className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
              {row.value}
              {row.ok ? (
                <CircleCheck size={15} style={{ color: 'var(--done)' }} aria-label="in Ordnung" />
              ) : (
                <CircleAlert size={15} style={{ color: 'var(--rest)' }} aria-label="beachten" />
              )}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setResult(null)
            setResult(await triggerInstantTestNotification())
            refresh()
            setBusy(false)
          }}
        >
          <Bell size={16} aria-hidden />
          {busy ? 'Wird gesendet…' : 'Test-Benachrichtigung senden'}
        </button>
        {state?.permission !== 'granted' && (
          <button
            className="btn btn-ghost"
            onClick={async () => {
              await requestPermission()
              refresh()
            }}
          >
            Berechtigung anfragen
          </button>
        )}
      </div>

      {result && (
        <p
          role="status"
          className="mt-3 text-sm"
          style={{ color: result.ok ? 'var(--done)' : '#dc2626' }}
        >
          {result.ok
            ? 'Gesendet. Erscheint keine Meldung, blockiert dein Betriebssystem sie — prüf die Systemeinstellungen für den Browser.'
            : result.error}
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
        Geplante Erinnerungen erscheinen zur eingestellten Uhrzeit, solange die App geöffnet
        ist. Bei geschlossener App weckt sie nur Chrome und Edge über den Hintergrundabgleich,
        und den Zeitpunkt bestimmt der Browser. Punktgenaue Zustellung bräuchte einen Server,
        der die Meldung verschickt — und damit laufende Kosten, die dieses Produkt nicht hat.
      </p>
    </section>
  )
}
