import { useMemo, useState } from 'react'
import { addDays, formatLong, isoWeek, MONTH_LABELS, today, type DayKey } from '../engine/dates'
import { heatmap, MOOD_LABELS, type Habit, type Log } from '../engine/habits'

const STATE_STYLE: Record<string, { bg: string; label: string }> = {
  done: { bg: 'var(--done)', label: 'erledigt' },
  rest: { bg: 'var(--rest)', label: 'Ruhetag' },
  missed: { bg: 'var(--missed)', label: 'verpasst' },
  unplanned: { bg: 'transparent', label: 'nicht eingeplant' },
  future: { bg: 'var(--surface-2)', label: 'offen' },
}

type Range = 30 | 90 | 365

const RANGES: { id: Range; label: string }[] = [
  { id: 30, label: '30 Tage' },
  { id: 90, label: '90 Tage' },
  { id: 365, label: '1 Jahr' },
]

const isCoarse = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/**
 * Kachelgröße je Zeitraum. Auf Touch-Geräten durchgehend größer — die Werte sind so
 * gewählt, dass die 30-Tage-Ansicht ohne Wischen auf ein 375-px-Display passt:
 * 5 Spalten × (28 + 5) = 165 px. Erst „1 Jahr" braucht den Scroll-Container.
 */
const CELL: Record<Range, { coarse: number; fine: number }> = {
  30: { coarse: 28, fine: 22 },
  90: { coarse: 18, fine: 15 },
  365: { coarse: 14, fine: 12 },
}

/**
 * Matrix-Ansicht im Stil eines Commit-Rasters: Spalten sind Kalenderwochen, Zeilen
 * Wochentage (Montag oben). Ruhetage bekommen eine eigene Farbe — die Matrix bleibt
 * ehrlich, ohne einen Ausfall wie ein Versagen aussehen zu lassen.
 *
 * Auf dem Telefon startet sie bei 30 Tagen. Ein ganzes Jahr auf 375 px Breite ist
 * entweder gestaucht oder unlesbar klein; beides hilft niemandem. Wer das Jahr sehen
 * will, schaltet um und wischt.
 */
export function Heatmap({
  habit,
  log,
  onPick,
}: {
  habit: Habit
  log: Log
  onPick?: (day: DayKey) => void
}) {
  const [range, setRange] = useState<Range>(() => (isCoarse() ? 30 : 365))
  const cell = isCoarse() ? CELL[range].coarse : CELL[range].fine
  const gap = Math.max(3, Math.round(cell / 6))
  const end = today()

  const cells = useMemo(() => {
    // Bis zum kommenden Sonntag auffüllen, damit die letzte Spalte vollständig ist
    const endDate = new Date(end)
    const toSunday = (7 - ((endDate.getDay() + 6) % 7) - 1) % 7
    const to = addDays(end, toSunday)
    const weeks = Math.ceil(range / 7)
    const from = addDays(to, -(weeks * 7 - 1))
    return heatmap(habit, log, from, to, end)
  }, [habit, log, range, end])

  const columns = useMemo(() => {
    const groups: (typeof cells)[] = []
    let currentKey = ''
    for (const c of cells) {
      const key = isoWeek(c.day)
      if (key !== currentKey) {
        groups.push([])
        currentKey = key
      }
      groups[groups.length - 1].push(c)
    }
    return groups
  }, [cells])

  /*
   * Monatsnamen nur setzen, wenn bis zum vorherigen Namen genug Platz ist. Ein „Jul"
   * braucht rund 22 px; stehen die Spalten enger, würden die Beschriftungen ineinander
   * laufen. Lieber ein Monat weniger beschriftet als unlesbarer Text.
   */
  const monthMarks = useMemo(() => {
    const minColumns = Math.ceil(24 / (cell + gap))
    let lastLabeled = -Infinity
    return columns.map((col, i) => {
      const first = col[0]
      if (!first) return null
      const date = new Date(first.day)
      const prev = columns[i - 1]?.[0]
      const isNewMonth = !prev || new Date(prev.day).getMonth() !== date.getMonth()
      if (!isNewMonth || i - lastLabeled < minColumns) return null
      lastLabeled = i
      return MONTH_LABELS[date.getMonth()]
    })
  }, [columns, cell, gap])

  const gridWidth = columns.length * (cell + gap)

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {formatLong(cells[0]?.day ?? end).replace(/^\w+, /, '')} – heute
        </p>
        <div className="segment" role="group" aria-label="Zeitraum der Matrix">
          {RANGES.map((r) => (
            <button
              key={r.id}
              aria-pressed={range === r.id}
              onClick={() => setRange(r.id)}
              className="text-xs"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/*
        Scroll-Container mit fester Mindestbreite am Raster. Zusammen mit `flexShrink: 0`
        an Spalten und Zellen ist ausgeschlossen, dass das Raster zusammengedrückt wird —
        es wird gewischt statt gestaucht.
      */}
      <div className="w-full overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap, width: gridWidth, minWidth: gridWidth }}>
          <div style={{ display: 'flex', gap }} aria-hidden>
            {monthMarks.map((label, i) => (
              <span
                key={i}
                style={{
                  width: cell,
                  flexShrink: 0,
                  fontSize: 10,
                  lineHeight: '12px',
                  color: 'var(--muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                {label ?? ''}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap }} role="grid" aria-label={`Verlauf für ${habit.name}`}>
            {columns.map((col, ci) => (
              <div
                key={ci}
                style={{ display: 'flex', flexDirection: 'column', gap, flexShrink: 0 }}
                role="row"
              >
                {col.map((c) => {
                  const style = STATE_STYLE[c.state]
                  const mood = c.mood ? ` · Stimmung: ${MOOD_LABELS[c.mood]}` : ''
                  return (
                    <button
                      key={c.day}
                      role="gridcell"
                      disabled={c.state === 'unplanned' || !onPick}
                      onClick={() => onPick?.(c.day)}
                      title={`${formatLong(c.day)} — ${style.label}${mood}`}
                      aria-label={`${formatLong(c.day)}, ${style.label}`}
                      style={{
                        width: cell,
                        height: cell,
                        flexShrink: 0,
                        borderRadius: Math.max(3, cell / 4),
                        background: c.state === 'done' ? habit.color : style.bg,
                        border: c.state === 'unplanned' ? '1px dashed var(--border)' : 'none',
                        opacity: c.state === 'done' && c.mood ? 0.45 + c.mood * 0.11 : 1,
                        cursor: onPick && c.state !== 'unplanned' ? 'pointer' : 'default',
                        padding: 0,
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function HeatmapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
      {[
        ['var(--done)', 'erledigt'],
        ['var(--rest)', 'Ruhetag (Serie hält)'],
        ['var(--missed)', 'verpasst'],
        ['var(--surface-2)', 'offen'],
      ].map(([bg, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span style={{ width: 10, height: 10, borderRadius: 3, background: bg }} />
          {label}
        </span>
      ))}
    </div>
  )
}
