import { useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { isPro } from '../lib/pro'
import { useSeo } from '../lib/seo'
import { CheckoutButton, PRICE } from '../components/Checkout'
import { Logo } from '../components/Logo'

/**
 * Freischalt-Bildschirm direkt nach der Registrierung.
 *
 * Bewusst NACH der Kontoerstellung und nicht davor: Ohne Konto gäbe es nichts, woran
 * der Pro-Status hängen könnte — die Freischaltung wäre an einen Browser gebunden statt
 * an eine Person. Außerdem soll niemand vor einer Bezahlschranke stehen, bevor er das
 * Produkt überhaupt betreten hat.
 *
 * „Später entscheiden" ist gleichwertig gestaltet. Drei Habits sind dauerhaft kostenlos;
 * ein Bildschirm, der den kostenlosen Weg versteckt, wäre eine Dark Pattern.
 */
export function Upgrade() {
  useSeo({
    title: 'Vollversion freischalten — HabitGrid Pro',
    description: 'Unbegrenzt viele Habits, Druck- und PDF-Export. Einmalig statt Abo.',
    path: '/#/upgrade',
    noindex: true,
  })

  const { user } = useAuth()
  const [unlocked, setUnlocked] = useState(isPro)

  if (unlocked) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <div
          className="mx-auto grid h-14 w-14 place-items-center rounded-full"
          style={{ background: 'var(--accent-soft)', color: 'var(--done)' }}
        >
          <Check size={26} />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Alles freigeschaltet</h1>
        <p className="mt-3" style={{ color: 'var(--muted)' }}>
          Unbegrenzt viele Habits, Druck- und PDF-Export. Viel Erfolg mit deiner ersten Serie.
        </p>
        <a href="#/app" className="btn btn-primary mt-8">
          Zu deinen Habits <ArrowRight size={16} aria-hidden />
        </a>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-14 sm:py-20">
      <div className="text-center">
        <Logo size={38} className="mx-auto" />
        <p className="eyebrow mt-5">Schritt 2 von 2</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Willkommen, {user?.name ?? 'du'}
        </h1>
        <p className="lede mx-auto mt-3">
          Dein Konto steht. Du kannst sofort loslegen — drei Habits sind dauerhaft kostenlos.
          Wer mehr braucht, schaltet hier einmalig frei.
        </p>
      </div>

      <div className="card mt-8 p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">HabitGrid Pro</h2>
          <p className="text-2xl font-semibold">
            {PRICE}
            <span className="ml-2 text-sm font-normal" style={{ color: 'var(--muted)' }}>
              einmalig
            </span>
          </p>
        </div>

        <ul className="mt-5 space-y-2.5 text-[15px]" style={{ color: 'var(--muted)' }}>
          {[
            'Unbegrenzt viele Habits statt drei',
            'Druck- und PDF-Export der Matrix',
            'Kommerzielle Nutzung in Kundenprojekten',
            'Dauerhafte Lizenz — kein Abo, keine Verlängerung',
          ].map((line) => (
            <li key={line} className="flex gap-2">
              <Check size={17} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
              {line}
            </li>
          ))}
        </ul>

        <CheckoutButton
          label="Jetzt freischalten"
          className="btn btn-primary mt-7 w-full"
          onUnlocked={() => setUnlocked(true)}
        />
        <p className="mt-2 text-center text-xs" style={{ color: 'var(--muted)' }}>
          Gutscheincode? Im nächsten Schritt eingebbar.
        </p>
      </div>

      {/* Gleichwertig gestaltet — der kostenlose Weg wird nicht versteckt */}
      <a href="#/app" className="btn btn-ghost mt-4 w-full">
        Später entscheiden, jetzt kostenlos starten <ArrowRight size={16} aria-hidden />
      </a>
    </main>
  )
}
