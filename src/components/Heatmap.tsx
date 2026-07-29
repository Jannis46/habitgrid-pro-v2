import { useMemo } from 'react'
import { addDays, formatLong, isoWeek, MONTH_LABELS, today, type DayKey } from '../engine/dates'
import { heatmap, MOOD_LABELS, type Habit, type Log } from '../engine/habits'

const STATE_STYLE: Record<string, { bg: string; label: string }> = {
  done: { bg: 'var(--done)', label: 'erledigt' },
  rest: { bg: 'var(--rest)', label: 'Ruhetag' },
  missed: { bg: 'var(--missed)', label: 'verpasst' },
  unplanned: { bg: 'transparent', label: 'nicht eingeplant' },
  future: { bg: 'var(--surface-2)', label: 'offen' },
}

/**
 * Matrix-Ansicht im Stil eines Commit-Rasters: Spalten sind Kalenderwochen, Zeilen
 * Wochentage (Montag oben). Ruhetage bekommen eine eigene Farbe — die Matrix bleibt
 * ehrlich, ohne einen Ausfall wie ein Versagen aussehen zu lassen.
 */
export function Heatmap({
  habit,
  log,
  weeks = 53,
  cell = 12,
  onPick,
}: {
  habit: Habit
  log: Log
  weeks?: number
  cell?: number
  onPick?: (day: DayKey) => void
}) {
  const end = today()
  const cells = useMemo(() => {
    // Bis zum kommenden Sonntag auffüllen, damit die letzte Spalte vollständig ist
    const endDate = new Date(end)
    const toSunday = (7 - ((endDate.getDay() + 6) % 7) - 1) % 7
    const to = addDays(end, toSunday)
    const from = addDays(to, -(weeks * 7 - 1))
    return heatmap(habit, log, from, to, end)
  }, [habit, log, weeks, end])

  // In Spalten je Kalenderwoche gruppieren
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

  const monthMarks = columns.map((col, i) => {
    const first = col[0]
    if (!first) return null
    const d = new Date(first.day)
    const prev = columns[i - 1]?.[0]
    if (prev && new Date(prev.day).getMonth() === d.getMonth()) return null
    return MONTH_LABELS[d.getMonth()]
  })

  const gap = Math.max(2, Math.round(cell / 5))

  return (
    /*
     * Eigener Scroll-Container mit Mindestbreite am Raster: Auf dem Telefon soll die
     * Matrix gewischt werden, nicht zusammengedrückt. Die Mindestbreite ist Absicherung —
     * `inline-flex` schrumpft hier zwar ohnehin nicht, aber ein späterer Umbau auf ein
     * anderes Anzeigemodell würde die Zellen sonst still verzerren.
     */
    <div className="-mx-1 w-full overflow-x-auto px-1 pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          gap,
          minWidth: columns.length * (cell + gap),
        }}
      >
        <div style={{ display: 'flex', gap }}>
          {monthMarks.map((label, i) => (
            <span
              key={i}
              style={{ width: cell, fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap' }}
            >
              {label ?? ''}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap }} role="grid" aria-label={`Verlauf für ${habit.name}`}>
          {columns.map((col, ci) => (
            <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap }} role="row">
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
                      borderRadius: Math.max(2, cell / 4),
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
