import { useRef, useState } from 'react'
import { Check, Ticket } from 'lucide-react'
import { isValidCoupon, unlockWithCoupon } from '../lib/pro'
import { confetti } from '../lib/confetti'
import { useAuth } from '../auth/AuthContext'

export const PRICE = '9,99 €'
const PAYMENT_LINK = import.meta.env.VITE_STRIPE_PAYMENT_LINK ?? ''

/**
 * Bestelldialog vor der Weiterleitung zu Stripe, inklusive Gutscheineinlösung.
 *
 * Rechtlich zwingend und deshalb nicht wegkürzbar:
 * - § 312j Abs. 2 BGB: wesentliche Merkmale und Gesamtpreis unmittelbar über dem Bestellbutton.
 * - § 312j Abs. 3 BGB: Beschriftung eindeutig als „Zahlungspflichtig bestellen".
 * - § 356 Abs. 5 BGB: gesonderte, aktive Zustimmung zum vorzeitigen Beginn der Ausführung
 *   samt Kenntnisnahme des Erlöschens des Widerrufsrechts.
 *
 * Die beiden Bestätigungen bleiben auch bei 0,00 € stehen: Ein Vertrag über digitale Inhalte
 * kommt auch unentgeltlich zustande, und die Inhalte werden sofort bereitgestellt.
 */
export function CheckoutButton({
  className = 'btn btn-primary',
  label = 'Vollversion freischalten',
  onUnlocked,
}: {
  className?: string
  label?: string
  onUnlocked?: () => void
}) {
  const { user } = useAuth()
  const dialog = useRef<HTMLDialogElement>(null)
  const [terms, setTerms] = useState(false)
  const [waiver, setWaiver] = useState(false)
  const [coupon, setCoupon] = useState('')
  const [applied, setApplied] = useState(false)
  const [couponError, setCouponError] = useState('')

  const free = applied

  /**
   * Einlösen prüft nur — freigeschaltet wird erst mit dem Bestellknopf.
   *
   * Andernfalls verschwindet die Paywall im selben Moment aus dem Baum, in dem der Status
   * auf „Pro" springt, und reißt diesen Dialog mitsamt Bestätigung und Gratis-Button mit.
   */
  const applyCoupon = () => {
    if (isValidCoupon(coupon)) {
      setApplied(true)
      setCouponError('')
    } else {
      setApplied(false)
      setCouponError('Ungültiger Gutscheincode')
    }
  }

  const submit = () => {
    if (!terms || !waiver) return

    if (free) {
      // Kein Stripe-Aufruf. Der Status landet im localStorage und überlebt das Neuladen.
      unlockWithCoupon(coupon)
      dialog.current?.close()
      confetti()
      onUnlocked?.()
      return
    }

    // ponytail: Zustimmung wird lokal protokolliert. Für einen belastbaren Nachweis im
    // Streitfall gehört sie serverseitig zur Bestellung (siehe api/stripe-webhook.ts).
    localStorage.setItem(
      'habitgrid.consent.order',
      JSON.stringify({ terms: true, waiver: true, at: new Date().toISOString() }),
    )
    if (!PAYMENT_LINK) {
      alert('Kein Stripe-Zahlungslink konfiguriert. Bitte VITE_STRIPE_PAYMENT_LINK in .env setzen.')
      return
    }
    window.location.href = PAYMENT_LINK
  }

  /*
   * Ohne Konto führt der Kaufknopf zur Registrierung, nicht in den Bestelldialog.
   * Der Pro-Status hängt am Konto — wer ohne eines kauft, hätte eine Freischaltung,
   * die an einen einzelnen Browser gebunden ist und beim Gerätewechsel verschwindet.
   */
  const open = () => {
    if (!user) {
      window.location.hash = '#/login'
      return
    }
    dialog.current?.showModal()
  }

  return (
    <>
      <button className={className} onClick={open}>
        {label} — {PRICE}
      </button>

      <dialog
        ref={dialog}
        className="m-auto w-[min(94vw,32rem)] rounded-2xl p-0 backdrop:bg-black/50"
        style={{ background: 'var(--surface)', color: 'var(--text)' }}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close()
        }}
      >
        <div className="p-6">
          <h2 className="text-xl font-semibold">Bestellung prüfen</h2>

          <dl
            className="mt-5 space-y-2 rounded-xl p-4 text-sm"
            style={{ background: 'var(--surface-2)' }}
          >
            <div className="flex justify-between gap-6">
              <dt style={{ color: 'var(--muted)' }}>Leistung</dt>
              <dd className="text-right font-medium">HabitGrid Pro, Einzellizenz</dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt className="shrink-0" style={{ color: 'var(--muted)' }}>
                Umfang
              </dt>
              <dd className="text-right">
                Unbegrenzt viele Habits, Druck- und PDF-Export der Matrix, kommerzielle Nutzung,
                dauerhaft
              </dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt style={{ color: 'var(--muted)' }}>Bereitstellung</dt>
              <dd className="text-right">
                {free ? 'Sofort nach Bestätigung' : 'Lizenzschlüssel sofort nach Zahlung'}
              </dd>
            </div>
            <div
              className="flex justify-between border-t pt-2"
              style={{ borderColor: 'var(--border)' }}
            >
              <dt className="font-medium">Gesamtpreis</dt>
              <dd className="font-semibold">
                {free ? (
                  <>
                    <span className="mr-2 font-normal line-through" style={{ color: 'var(--muted)' }}>
                      {PRICE}
                    </span>
                    <span style={{ color: 'var(--done)' }}>0,00 €</span>
                  </>
                ) : (
                  <>{PRICE} inkl. USt.</>
                )}
              </dd>
            </div>
          </dl>

          {/* -------------------------------- Gutschein ------------------------------- */}
          <div className="mt-4">
            {applied ? (
              <p
                role="status"
                className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium"
                style={{ background: 'color-mix(in oklab, var(--done) 18%, transparent)', color: 'var(--done)' }}
              >
                <Check size={16} aria-hidden />
                {/* Zeigt den eingegebenen Code, nicht die Konstante — so steht der Wert
                    an keiner Stelle im Markup, an der ihn jemand ohne Eingabe findet. */}
                Gutscheincode {coupon.trim().toLowerCase()} angewendet! 100% Rabatt
              </p>
            ) : (
              <>
                <label
                  className="flex items-center gap-1.5 text-sm font-medium"
                  htmlFor="coupon"
                >
                  <Ticket size={15} aria-hidden />
                  Gutscheincode
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="coupon"
                    className="field"
                    value={coupon}
                    onChange={(e) => {
                      setCoupon(e.target.value)
                      setCouponError('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        applyCoupon()
                      }
                    }}
                    placeholder="Code eingeben"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={couponError ? true : undefined}
                    aria-describedby={couponError ? 'coupon-error' : undefined}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost shrink-0"
                    onClick={applyCoupon}
                    disabled={!coupon.trim()}
                  >
                    Einlösen
                  </button>
                </div>
                {couponError && (
                  <p id="coupon-error" role="alert" className="mt-1.5 text-sm" style={{ color: '#dc2626' }}>
                    {couponError}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="mt-5 space-y-3 text-sm">
            <label className="flex gap-3">
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                Ich habe die{' '}
                <a className="underline" href="#/agb" target="_blank">
                  AGB
                </a>{' '}
                und die{' '}
                <a className="underline" href="#/datenschutz" target="_blank">
                  Datenschutzerklärung
                </a>{' '}
                gelesen und akzeptiere sie.
              </span>
            </label>

            <label
              className="flex gap-3 rounded-lg p-3"
              style={{ background: 'var(--accent-soft)' }}
            >
              <input
                type="checkbox"
                checked={waiver}
                onChange={(e) => setWaiver(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                Ich verlange ausdrücklich, dass mit der Ausführung des Vertrags vor Ablauf der
                Widerrufsfrist begonnen wird. Mir ist bekannt, dass ich mit Beginn der Ausführung{' '}
                <strong>mein Widerrufsrecht verliere</strong> (§ 356 Abs. 5 BGB).{' '}
                <a className="underline" href="#/widerruf" target="_blank">
                  Widerrufsbelehrung
                </a>
              </span>
            </label>
          </div>

          <button
            onClick={submit}
            disabled={!terms || !waiver}
            className="btn btn-primary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-40"
            style={free ? { background: 'var(--done)', color: '#fff' } : undefined}
          >
            {free ? 'Jetzt kostenlos freischalten' : 'Zahlungspflichtig bestellen'}
          </button>
          <button
            onClick={() => dialog.current?.close()}
            className="mt-2 w-full py-2 text-sm"
            style={{ color: 'var(--muted)' }}
          >
            Abbrechen
          </button>
          <p className="mt-3 text-center text-xs" style={{ color: 'var(--muted)' }}>
            {free
              ? 'Keine Zahlung nötig. Die Freischaltung gilt in diesem Browser dauerhaft.'
              : 'Zahlung über Stripe. Wir speichern keine Zahlungsdaten.'}
          </p>
        </div>
      </dialog>
    </>
  )
}
