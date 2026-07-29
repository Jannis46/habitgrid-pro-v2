import { useEffect, useMemo, useState } from 'react'
import { BellRing, Download, Smartphone, Square, RectangleHorizontal } from 'lucide-react'
import { today } from '../engine/dates'
import { computeStreak, dayScore, type Habit, type Log } from '../engine/habits'
import { useHabits } from '../lib/store'

/**
 * Erzeugt ein Bild für ein Home-Screen-Widget.
 *
 * ═══ WAS HIER EHRLICH GESAGT WERDEN MUSS ═══
 * Eine Web-App kann auf iOS und Android kein echtes Home-Screen-Widget registrieren.
 * Widgets sind Betriebssystem-Erweiterungen und brauchen eine native App (WidgetKit
 * beziehungsweise Glance/AppWidgetProvider). Es gibt dafür keine Web-Schnittstelle.
 *
 * Was tatsächlich geht und was diese Komponente liefert:
 *   1. Ein fertiges Bild, das Kurzbefehle (iOS) oder Widget-Apps (Android) anzeigen können.
 *   2. `navigator.setAppBadge()` — die Zahl am App-Symbol, sofern der Browser sie kennt.
 *   3. Eine Schritt-für-Schritt-Anleitung für beide Systeme.
 * Die Oberfläche sagt das genauso, statt ein Widget zu versprechen, das der Browser
 * nicht liefern kann.
 */

type Format = 'small' | 'medium'

const FORMATS: { id: Format; label: string; w: number; h: number; hint: string }[] = [
  { id: 'small', label: 'Klein (Quadrat)', w: 360, h: 360, hint: '2×2 Felder' },
  { id: 'medium', label: 'Mittel (Banner)', w: 720, h: 360, hint: '4×2 Felder' },
]

/** Farben werden zur Erzeugung fest eingesetzt — das Bild lebt später ohne Stylesheet. */
function resolvePalette() {
  const style = getComputedStyle(document.documentElement)
  const pick = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    bg: pick('--surface', '#ffffff'),
    track: pick('--surface-2', '#f3f4f6'),
    text: pick('--text-strong', '#111827'),
    muted: pick('--muted', '#6b7280'),
    accent: pick('--accent', '#10b981'),
    border: pick('--border', '#e5e7eb'),
  }
}

function buildSvg(format: Format, data: { streak: number; done: number; planned: number }) {
  const { w, h } = FORMATS.find((f) => f.id === format)!
  const c = resolvePalette()
  const percent = data.planned === 0 ? 0 : Math.round((data.done / data.planned) * 100)
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - percent / 100)
  const ringX = format === 'small' ? w / 2 : w - 118

  const gem = (x: number, y: number, s: number) => `
    <g transform="translate(${x} ${y}) scale(${s})">
      <path d="M0 -22 L18 -4 L0 24 L-18 -4 Z" fill="${c.accent}" fill-opacity="0.18"/>
      <path d="M0 -22 L18 -4 L0 24 L-18 -4 Z" fill="none" stroke="${c.accent}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M-18 -4 L18 -4" stroke="${c.accent}" stroke-width="1.6" stroke-opacity="0.6"/>
      <circle cx="0" cy="-1" r="5" fill="${c.accent}"/>
    </g>`

  const ring = `
    <g transform="translate(${ringX} ${format === 'small' ? 232 : 180})">
      <circle r="${radius}" fill="none" stroke="${c.track}" stroke-width="14"/>
      <circle r="${radius}" fill="none" stroke="${c.accent}" stroke-width="14" stroke-linecap="round"
        stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
        transform="rotate(-90)"/>
      <text text-anchor="middle" y="8" font-size="30" font-weight="700" fill="${c.text}"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">${percent}%</text>
      <text text-anchor="middle" y="34" font-size="15" fill="${c.muted}"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">${data.done}/${data.planned} erledigt</text>
    </g>`

  const streakBlock =
    format === 'small'
      ? `<text x="${w / 2}" y="96" text-anchor="middle" font-size="46" font-weight="800" fill="${c.text}"
           font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">🔥 ${data.streak}</text>
         <text x="${w / 2}" y="128" text-anchor="middle" font-size="18" font-weight="600" fill="${c.muted}"
           letter-spacing="2" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">TAGE STREAK</text>
         ${gem(w / 2, 152, 0.85)}`
      : `<text x="56" y="126" font-size="64" font-weight="800" fill="${c.text}"
           font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">🔥 ${data.streak}</text>
         <text x="58" y="164" font-size="21" font-weight="600" fill="${c.muted}" letter-spacing="3"
           font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">TAGE STREAK</text>
         <text x="58" y="250" font-size="19" fill="${c.muted}"
           font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">HabitGrid</text>
         ${gem(96, 292, 1)}`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" rx="56" fill="${c.bg}" stroke="${c.border}" stroke-width="2"/>
    ${streakBlock}
    ${ring}
  </svg>`
}

/** SVG in ein PNG umwandeln — Kurzbefehle und Widget-Apps mögen Rasterbilder lieber. */
function svgToPng(svg: string, w: number, h: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = 2 // für scharfe Darstellung auf Retina-Displays
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale)
      ctx.drawImage(image, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => reject(new Error('Widget konnte nicht erzeugt werden'))
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

/** Beste laufende Serie und heutiger Fortschritt. */
function widgetData(habits: Habit[], log: Log) {
  const day = today()
  const active = habits.filter((h) => !h.archived)
  const streak = active.reduce((best, h) => Math.max(best, computeStreak(h, log, day).current), 0)
  const { done, planned } = dayScore(active, log, day)
  return { streak, done, planned }
}

export function HomeScreenWidgetGenerator() {
  const { habits, log } = useHabits()
  const [format, setFormat] = useState<Format>('small')
  const [png, setPng] = useState('')
  const [badgeState, setBadgeState] = useState<'unsupported' | 'idle' | 'active'>('idle')

  const data = useMemo(() => widgetData(habits, log), [habits, log])
  const svg = useMemo(() => buildSvg(format, data), [format, data])
  const size = FORMATS.find((f) => f.id === format)!

  useEffect(() => {
    let cancelled = false
    void svgToPng(svg, size.w, size.h).then((url) => !cancelled && setPng(url))
    return () => {
      cancelled = true
    }
  }, [svg, size.w, size.h])

  useEffect(() => {
    if (!('setAppBadge' in navigator)) setBadgeState('unsupported')
  }, [])

  const open = Math.max(0, data.planned - data.done)

  const toggleBadge = async () => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (!nav.setAppBadge) return
    try {
      if (badgeState === 'active') {
        await nav.clearAppBadge?.()
        setBadgeState('idle')
      } else {
        await nav.setAppBadge(open)
        setBadgeState('active')
      }
    } catch {
      // Manche Browser melden die Schnittstelle, verweigern aber die Ausführung
      setBadgeState('unsupported')
    }
  }

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="widget-titel">
      <h2 id="widget-titel" className="text-lg font-semibold">
        Home-Screen-Widget
      </h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
        Erzeugt ein Bild mit deiner aktuellen Serie und dem Tagesfortschritt. Kurzbefehle auf dem
        iPhone und Widget-Apps auf Android zeigen es auf dem Home-Bildschirm an.
      </p>

      {/* Formatwahl */}
      <div className="segment mt-4" role="group" aria-label="Widget-Format">
        {FORMATS.map((f) => (
          <button key={f.id} aria-pressed={format === f.id} onClick={() => setFormat(f.id)}>
            {f.id === 'small' ? <Square size={14} aria-hidden /> : <RectangleHorizontal size={14} aria-hidden />}
            {f.label}
          </button>
        ))}
      </div>

      {/* Vorschau */}
      <div
        className="mt-4 grid place-items-center rounded-xl p-4"
        style={{ background: 'var(--bg-elevated)' }}
      >
        <img
          src={png || undefined}
          alt={`Widget-Vorschau: ${data.streak} Tage Serie, ${data.done} von ${data.planned} heute erledigt`}
          className="h-auto w-full"
          style={{ maxWidth: format === 'small' ? 200 : 360 }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className="btn btn-primary"
          href={png || '#'}
          download={`habitgrid-widget-${format}.png`}
          aria-disabled={!png}
        >
          <Download size={16} aria-hidden /> Als PNG speichern
        </a>
        <button className="btn btn-ghost" onClick={toggleBadge} disabled={badgeState === 'unsupported'}>
          <BellRing size={16} aria-hidden />
          {badgeState === 'unsupported'
            ? 'Symbol-Zähler nicht unterstützt'
            : badgeState === 'active'
              ? 'Zähler am App-Symbol aus'
              : `Zähler am App-Symbol an (${open})`}
        </button>
      </div>

      <Instructions />
    </section>
  )
}

function Instructions() {
  const [platform, setPlatform] = useState<'ios' | 'android'>(() =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'android',
  )

  return (
    <div className="mt-6">
      <div className="segment" role="group" aria-label="Betriebssystem">
        <button aria-pressed={platform === 'ios'} onClick={() => setPlatform('ios')}>
          iPhone
        </button>
        <button aria-pressed={platform === 'android'} onClick={() => setPlatform('android')}>
          Android
        </button>
      </div>

      <ol className="mt-3 space-y-2 text-sm" style={{ color: 'var(--muted)' }}>
        {platform === 'ios' ? (
          <>
            <li>1. Widget oben als PNG speichern — es landet in deinen Fotos oder Dateien.</li>
            <li>
              2. App <strong>Kurzbefehle</strong> öffnen, unter „Automation" einen neuen Kurzbefehl
              anlegen, der das Bild anzeigt. Alternativ die kostenlose App{' '}
              <strong>Scriptable</strong> nutzen, dort ein Skript mit dem Bild hinterlegen.
            </li>
            <li>
              3. Auf dem Home-Bildschirm lange drücken → <strong>+</strong> → das gewählte Widget
              hinzufügen und im Widget das Skript auswählen.
            </li>
            <li>
              4. Für Aktualität: Widget nach dem Check-in neu erzeugen und ersetzen. Ein echtes,
              sich selbst aktualisierendes Widget bräuchte eine native App — das kann keine Web-App.
            </li>
          </>
        ) : (
          <>
            <li>1. Widget oben als PNG speichern.</li>
            <li>
              2. Eine Widget-App wie <strong>KWGT</strong> oder <strong>Photo Widget</strong>{' '}
              installieren und das Bild dort als Quelle wählen.
            </li>
            <li>
              3. Auf dem Home-Bildschirm lange drücken → <strong>Widgets</strong> → Widget der
              gewählten App platzieren.
            </li>
            <li>
              4. Zusätzlich: Der Zähler am App-Symbol funktioniert in Chrome direkt, sobald
              HabitGrid installiert ist.
            </li>
          </>
        )}
      </ol>
    </div>
  )
}

/** Hinweisbanner im Dashboard, das auf den Generator führt. */
export function WidgetBanner() {
  const [hidden, setHidden] = useState(() => localStorage.getItem('habitgrid.widget.banner') === '1')
  if (hidden) return null
  return (
    /*
     * Auf dem Telefon untereinander, ab sm nebeneinander. Zuvor lagen Text und Knöpfe
     * in einer umbrechenden Zeile — bei schmaler Breite schoben sie sich ineinander.
     */
    <aside className="no-print card mt-6 flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <Smartphone
          size={20}
          className="mt-0.5 shrink-0"
          style={{ color: 'var(--accent)' }}
          aria-hidden
        />
        <p className="min-w-0 text-sm">
          <strong>Home-Screen-Widget einrichten</strong>
          <span className="mt-0.5 block" style={{ color: 'var(--muted)' }}>
            Serie und Tagesfortschritt direkt auf dem Startbildschirm.
          </span>
        </p>
      </div>
      <div className="flex w-full shrink-0 gap-2 sm:w-auto">
        <a href="#/widget" className="btn btn-primary flex-1 sm:flex-none">
          Einrichten
        </a>
        <button
          className="btn btn-ghost flex-1 sm:flex-none"
          onClick={() => {
            localStorage.setItem('habitgrid.widget.banner', '1')
            setHidden(true)
          }}
        >
          Später
        </button>
      </div>
    </aside>
  )
}
