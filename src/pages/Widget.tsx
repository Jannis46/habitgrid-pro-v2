import { ArrowLeft } from 'lucide-react'
import { useSeo } from '../lib/seo'
import { HomeScreenWidgetGenerator } from '../components/HomeScreenWidgetGenerator'

export function WidgetPage() {
  useSeo({
    title: 'Home-Screen-Widget — HabitGrid Pro',
    description: 'Widget mit Serie und Tagesfortschritt erzeugen.',
    path: '/#/widget',
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
      <h1 className="mt-4 mb-5 text-2xl font-semibold tracking-tight">Widget einrichten</h1>
      <HomeScreenWidgetGenerator />
    </main>
  )
}
