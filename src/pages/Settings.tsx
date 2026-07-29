import { ArrowLeft } from 'lucide-react'
import { useSeo } from '../lib/seo'
import { NotificationDiagnostics } from '../components/NotificationDiagnostics'
import { HomeScreenWidgetGenerator } from '../components/HomeScreenWidgetGenerator'
import { ThemeToggle } from '../components/ThemeToggle'

export function SettingsPage() {
  useSeo({
    title: 'Einstellungen — HabitGrid Pro',
    description: 'Benachrichtigungen prüfen, Widget einrichten, Erscheinungsbild wählen.',
    path: '/#/einstellungen',
    noindex: true,
  })

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 sm:px-6">
      <a
        href="#/app"
        className="mt-6 inline-flex items-center gap-1.5 text-sm"
        style={{ color: 'var(--muted)' }}
      >
        <ArrowLeft size={15} aria-hidden /> Zurück zu deinen Habits
      </a>
      <h1 className="mt-4 mb-5 text-2xl font-semibold tracking-tight">Einstellungen</h1>

      <div className="grid gap-4">
        <NotificationDiagnostics />

        <section className="card p-5 sm:p-6" aria-labelledby="darstellung">
          <h2 id="darstellung" className="text-lg font-semibold">
            Erscheinungsbild
          </h2>
          <p className="mt-1 mb-4 text-sm" style={{ color: 'var(--muted)' }}>
            „System" folgt der Einstellung deines Geräts und wechselt automatisch mit.
          </p>
          <ThemeToggle />
        </section>

        <HomeScreenWidgetGenerator />
      </div>
    </main>
  )
}
