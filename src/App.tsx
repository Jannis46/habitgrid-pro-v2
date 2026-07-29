import { useEffect, useState, type ReactElement } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { HabitStore } from './lib/store'
import { applyMode, getMode, watchSystemTheme } from './lib/theme'
import { Landing } from './components/Landing'
import { Dashboard } from './components/Dashboard'
import { CookieConsent } from './components/CookieConsent'
import { AuthPage } from './pages/Auth'
import { AGB, Datenschutz, Impressum, Widerruf } from './pages/Legal'
import { Success } from './pages/Success'
import { Upgrade } from './pages/Upgrade'
import { WidgetPage } from './pages/Widget'
import { SettingsPage } from './pages/Settings'

// ponytail: Hash-Routing statt einer Router-Abhängigkeit — sieben statische Routen,
// keine Parameter, keine verschachtelten Layouts.
const ROUTES: Record<string, () => ReactElement> = {
  app: Dashboard,
  upgrade: Upgrade,
  widget: WidgetPage,
  einstellungen: SettingsPage,
  login: AuthPage,
  impressum: Impressum,
  datenschutz: Datenschutz,
  agb: AGB,
  widerruf: Widerruf,
  success: Success,
}

const currentRoute = () => window.location.hash.replace(/^#\/?/, '').split(/[?#]/)[0]

function Router() {
  const [route, setRoute] = useState(currentRoute)
  const { user, loading } = useAuth()

  useEffect(() => {
    const onChange = () => {
      setRoute(currentRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  // Sitzung wird noch geprüft — ohne diese Weiche blitzt kurz die Anmeldeseite auf
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center" style={{ color: 'var(--muted)' }}>
        <p>Einen Moment…</p>
      </div>
    )
  }

  // Weder App noch Freischaltung ohne Konto — der Pro-Status hängt am Konto
  if (['app', 'upgrade', 'widget', 'einstellungen'].includes(route) && !user) return <AuthPage />

  const Page = ROUTES[route]
  return Page ? <Page /> : <Landing />
}

export default function App() {
  useEffect(() => {
    applyMode(getMode())
    // Auch außerhalb des Dashboards auf einen Systemwechsel reagieren
    return watchSystemTheme()
  }, [])

  return (
    <AuthProvider>
      <HabitStore>
        <Router />
        <CookieConsent />
      </HabitStore>
    </AuthProvider>
  )
}
