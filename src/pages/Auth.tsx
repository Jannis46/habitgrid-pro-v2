import { useState, type FormEvent } from 'react'
import { ArrowLeft } from 'lucide-react'
import { authMessage, useAuth } from '../auth/AuthContext'
import { useSeo } from '../lib/seo'

type Mode = 'login' | 'register' | 'reset'

export function AuthPage() {
  useSeo({
    title: 'Anmelden — HabitGrid Pro',
    description: 'Melde dich an, um deine Habits auf allen Geräten weiterzuführen.',
    path: '/#/login',
    noindex: true,
  })

  const { signIn, signUp, resetPassword, mode: backend } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'login') {
        // Wiederkehrende Nutzer wollen zu ihren Habits, nicht zu einem Angebot
        await signIn(email, password)
        window.location.hash = '#/app'
      } else if (mode === 'register') {
        // Frisch registriert: erst jetzt ist die Freischaltung sinnvoll, weil sie ab
        // hier an einem Konto hängt und nicht an diesem einen Browser
        await signUp(name, email, password)
        window.location.hash = '#/upgrade'
      } else {
        setInfo(await resetPassword(email, newPassword || undefined))
      }
    } catch (err) {
      setError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const titles: Record<Mode, string> = {
    login: 'Willkommen zurück',
    register: 'Konto anlegen',
    reset: 'Passwort zurücksetzen',
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <a href="#/" className="mb-8 inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
        <ArrowLeft size={15} /> Zur Startseite
      </a>

      <h1 className="text-3xl font-semibold tracking-tight">{titles[mode]}</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
        {backend === 'local'
          ? 'Dein Konto liegt in diesem Browser. Es verlässt dein Gerät nicht.'
          : 'Dein Konto wird über Supabase verwaltet und funktioniert auf allen Geräten.'}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        {mode === 'register' && (
          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <input
              className="field mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Wie sollen wir dich nennen?"
            />
          </label>
        )}

        <label className="block">
          <span className="text-sm font-medium">E-Mail</span>
          <input
            type="email"
            required
            className="field mt-1.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        {mode !== 'reset' && (
          <label className="block">
            <span className="text-sm font-medium">Passwort</span>
            <input
              type="password"
              required
              minLength={8}
              className="field mt-1.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {mode === 'register' && (
              <span className="mt-1 block text-xs" style={{ color: 'var(--muted)' }}>
                Mindestens 8 Zeichen.
              </span>
            )}
          </label>
        )}

        {/* Im lokalen Modus gibt es keinen Server, der eine Wiederherstellungs-Mail
            verschicken könnte — dort wird das Passwort direkt neu gesetzt. */}
        {mode === 'reset' && backend === 'local' && (
          <label className="block">
            <span className="text-sm font-medium">Neues Passwort</span>
            <input
              type="password"
              minLength={8}
              className="field mt-1.5"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        )}

        {error && (
          <p role="alert" className="text-sm" style={{ color: '#dc2626' }}>
            {error}
          </p>
        )}
        {info && (
          <p aria-live="polite" className="text-sm" style={{ color: 'var(--done)' }}>
            {info}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn btn-primary w-full disabled:opacity-50">
          {busy
            ? 'Einen Moment…'
            : mode === 'login'
              ? 'Anmelden'
              : mode === 'register'
                ? 'Konto anlegen'
                : 'Passwort zurücksetzen'}
        </button>
      </form>

      <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm">
        {mode !== 'login' ? (
          <button className="underline" onClick={() => setMode('login')}>
            Ich habe schon ein Konto
          </button>
        ) : (
          <button className="underline" onClick={() => setMode('register')}>
            Konto anlegen
          </button>
        )}
        {mode !== 'reset' && (
          <button className="underline" onClick={() => setMode('reset')}>
            Passwort vergessen?
          </button>
        )}
      </div>
    </main>
  )
}
