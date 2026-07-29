import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  Download,
  Flame,
  LogOut,
  Pencil,
  Plus,
  Printer,
  Trash2,
  Upload,
} from 'lucide-react'
import { formatLong, today, type DayKey } from '../engine/dates'
import {
  CATEGORIES,
  completionRate,
  computeStreak,
  dayScore,
  describeFrequency,
  isScheduled,
  MOOD_LABELS,
  unitLabel,
  type CategoryId,
  type Entry,
  type Habit,
} from '../engine/habits'
import { FREE_HABIT_LIMIT, useHabits } from '../lib/store'
import { useAuth } from '../auth/AuthContext'
import { ThemeToggle } from './ThemeToggle'
import { isPro, onProChange, redeem } from '../lib/pro'
import { useSeo } from '../lib/seo'
import {
  drainCheckoffIntents,
  habitFromHash,
  stopReminderTimers,
  syncReminders,
} from '../lib/reminders'
import { HabitForm } from './HabitForm'
import { Heatmap, HeatmapLegend } from './Heatmap'
import { InstallPrompt } from './InstallPrompt'
import { ReminderSetup } from './ReminderSetup'
import { CheckoutButton } from './Checkout'
import { MilestoneCard } from './MilestoneCard'
import { Wordmark } from './Logo'

// three.js liegt in einem eigenen Chunk und wird nur geladen, wenn das Widget wirklich
// gerendert wird — der Tages-Check-in soll nicht auf 3D-Code warten.
const StreakCrystal = lazy(() =>
  import('./StreakCrystal').then((m) => ({ default: m.StreakCrystal })),
)

export function Dashboard() {
  useSeo({
    title: 'Deine Habits — HabitGrid Pro',
    description: 'Tages-Check-in, Serien und Matrix-Ansicht.',
    path: '/#/app',
    noindex: true, // Bereich hinter dem Login gehört nicht in den Index
  })

  const { user, signOut } = useAuth()
  const store = useHabits()
  const [pro, setPro] = useState(isPro)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [detail, setDetail] = useState<{ habit: Habit; day: DayKey } | null>(null)
  const [notice, setNotice] = useState('')

  // Gutschein oder Lizenzschlüssel können auch aus einem Dialog kommen
  useEffect(() => onProChange(() => setPro(isPro())), [])

  const day = today()
  const active = useMemo(() => store.habits.filter((h) => !h.archived), [store.habits])
  const score = useMemo(() => dayScore(active, store.log, day), [active, store.log, day])
  const atLimit = !pro && active.length >= FREE_HABIT_LIMIT

  const todaysHabits = useMemo(
    () => active.filter((h) => isScheduled(h, day)),
    [active, day],
  )

  /* ------------------------------ Erinnerungen ------------------------------- */

  const hasTimedHabits = useMemo(() => active.some((h) => h.reminder), [active])

  useEffect(() => {
    void syncReminders(store.habits, store.log)
    return stopReminderTimers
  }, [store.habits, store.log])

  const openHabit = useCallback(
    (habitId: string | null) => {
      if (!habitId) return
      const habit = store.habits.find((h) => h.id === habitId)
      if (habit) setDetail({ habit, day: today() })
    },
    [store.habits],
  )

  // Deep Link aus einer Benachrichtigung: #/app?habit=<id>
  // Beides nötig: beim Kaltstart über die URL und bei bereits laufender App, wenn der
  // Service Worker das Fenster nur fokussiert und die Adresse wechselt.
  useEffect(() => {
    openHabit(habitFromHash())
    const onHashChange = () => openHabit(habitFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [openHabit])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_HABIT') openHabit(event.data.habitId)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [openHabit])

  // „Erledigt" direkt aus einer Benachrichtigung wird beim nächsten Öffnen angewandt
  useEffect(() => {
    let cancelled = false
    void drainCheckoffIntents().then((ids) => {
      if (cancelled || ids.length === 0) return
      const stamp = today()
      for (const id of ids) store.setEntry(id, stamp, { done: true })
      setNotice(
        ids.length === 1
          ? 'Aus der Erinnerung abgehakt.'
          : `${ids.length} Habits aus Erinnerungen abgehakt.`,
      )
    })
    return () => {
      cancelled = true
    }
    // Nur beim ersten Rendern — sonst würden die Absichten mehrfach angewandt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* -------------------------------- Kristall --------------------------------- */

  // Die beste laufende Serie bestimmt Stufe und Farbwelt des Widgets
  const highlight = useMemo(() => {
    let best = { streak: 0, category: 'sonstiges' as CategoryId, name: '' }
    for (const habit of active) {
      const { current } = computeStreak(habit, store.log, day)
      if (current > best.streak) {
        best = { streak: current, category: habit.category ?? 'sonstiges', name: habit.name }
      }
    }
    return best
  }, [active, store.log, day])

  /* --------------------------------- Aktionen -------------------------------- */

  const unlock = useCallback(() => {
    const key = prompt('Lizenzschlüssel eingeben (Format HG-PRO-XXXX-YYYY):')
    if (key === null) return
    if (redeem(key)) {
      setPro(true)
      setNotice('Vollversion freigeschaltet. Danke!')
    } else {
      setNotice('Dieser Schlüssel wurde nicht erkannt.')
    }
  }, [])

  const backup = useCallback(() => {
    const url = URL.createObjectURL(new Blob([store.serialize()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `habitgrid-sicherung-${today()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [store])

  const restore = useCallback(
    (file: File | undefined) => {
      if (!file) return
      void file.text().then((text) => {
        setNotice(
          store.hydrate(text)
            ? 'Sicherung eingelesen.'
            : 'Diese Datei konnte nicht gelesen werden. Erwartet wird eine HabitGrid-Sicherung.',
        )
      })
    },
    [store],
  )

  const onPickDay = useCallback(
    (habit: Habit, pickedDay: DayKey) => setDetail({ habit, day: pickedDay }),
    [],
  )
  const onEdit = useCallback((habit: Habit) => setEditing(habit), [])
  const onRemove = useCallback(
    (habit: Habit) => {
      if (confirm(`„${habit.name}" mit allen Einträgen löschen?`)) store.removeHabit(habit.id)
    },
    [store],
  )

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
      {/*
        Mobile Topbar: Marke und Bedienelemente in einer Zeile, darunter die Anrede.
        Zuvor umbrach die Knopfreihe auf dem Telefon in zwei Zeilen und schob den
        eigentlichen Inhalt nach unten. „Drucken" ist dort ausgeblendet — ein
        Druckdialog auf dem Handy ist kein Anwendungsfall, sondern eine Sackgasse.
      */}
      <header className="no-print py-4">
        <div className="flex items-center justify-between gap-2">
          <a href="#/" className="logo-hover" aria-label="Zur Startseite">
            <Wordmark size={20} />
          </a>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <button
              className="btn btn-ghost btn-icon hidden sm:inline-flex"
              onClick={() => window.print()}
              title="Matrix drucken"
            >
              <Printer size={16} aria-hidden /> Drucken
            </button>
            <button className="btn btn-ghost btn-icon" onClick={signOut} title="Abmelden">
              <LogOut size={16} aria-hidden />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>

        <div className="mt-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            Hallo {user?.name ?? 'du'}
            {pro && (
              <span
                className="ml-2 rounded-full px-2 py-0.5 align-middle text-xs font-medium"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                Pro
              </span>
            )}
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {formatLong(day)} · {score.done} von {score.planned} erledigt
          </p>
        </div>
      </header>

      <InstallPrompt />
      <ReminderSetup hasTimedHabits={hasTimedHabits} />

      {notice && (
        <p aria-live="polite" className="no-print mt-4 text-sm" style={{ color: 'var(--muted)' }}>
          {notice}
        </p>
      )}

      {/* --------------------------------- Kristall -------------------------------- */}
      {active.length > 0 && (
        <section className="no-print mt-6" aria-labelledby="kristall">
          <div className="card overflow-hidden">
            <Suspense fallback={<div className="h-[190px] sm:h-[230px]" />}>
              <StreakCrystal streak={highlight.streak} category={highlight.category} />
            </Suspense>
            <div className="border-t px-4 py-3 text-center" style={{ borderColor: 'var(--border)' }}>
              <h2 id="kristall" className="text-sm font-medium">
                {highlight.streak === 0
                  ? 'Dein Kristall wartet auf den ersten Tag'
                  : `${highlight.streak} ${unitLabel('Tage', highlight.streak)} — ${highlight.name}`}
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                {highlight.streak >= 15
                  ? 'Höchste Stufe erreicht: Glaskristall mit Lichtbrechung.'
                  : highlight.streak >= 4
                    ? `Noch ${15 - highlight.streak} Tage bis zum Glaskristall.`
                    : `Ab 4 Tagen beginnt er zu leuchten.`}{' '}
                Zum Drehen ziehen.
              </p>
            </div>
            <MilestoneCard streak={highlight.streak} category={highlight.category} />
          </div>
        </section>
      )}

      {/* ------------------------------ Tages-Check-in ------------------------------ */}
      {active.length > 0 && (
        <section className="no-print mt-6" aria-labelledby="heute">
          <h2 id="heute" className="mb-3 text-lg font-semibold">
            Heute
          </h2>
          {todaysHabits.length > 0 ? (
            <ul className="grid gap-2">
              {todaysHabits.map((h) => (
                <TodayRow
                  key={h.id}
                  habit={h}
                  done={store.log[h.id]?.[day]?.done === true}
                  onToggle={store.toggleDay}
                  onOpenNote={onPickDay}
                  day={day}
                />
              ))}
            </ul>
          ) : (
            <p className="card p-4 text-sm" style={{ color: 'var(--muted)' }}>
              Heute ist nichts eingeplant. Genieß den freien Tag.
            </p>
          )}
        </section>
      )}

      {/* -------------------------------- Habit-Karten ------------------------------ */}
      <section className="mt-10" aria-labelledby="matrix">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="matrix" className="text-lg font-semibold">
            Deine Matrix
          </h2>
          <span className="print-only text-sm">{formatLong(day)}</span>
        </div>

        {active.length === 0 && !creating && (
          <div className="card p-8 text-center">
            <p className="font-medium">Noch kein Habit angelegt.</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              Fang mit einem einzigen an. Drei sind kostenlos.
            </p>
            <button className="btn btn-primary mt-4" onClick={() => setCreating(true)}>
              <Plus size={16} /> Erstes Habit anlegen
            </button>
          </div>
        )}

        <div className="grid gap-4">
          {active.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              entries={store.log[habit.id]}
              onEdit={onEdit}
              onPickDay={onPickDay}
              onRemove={onRemove}
            />
          ))}
        </div>
      </section>

      {/* --------------------------------- Anlegen --------------------------------- */}
      <section className="no-print mt-6">
        {creating || editing ? (
          <HabitForm
            initial={editing ?? undefined}
            onCancel={() => {
              setCreating(false)
              setEditing(null)
            }}
            onSave={(draft) => {
              if (editing) store.updateHabit(editing.id, draft)
              else store.addHabit(draft)
              setCreating(false)
              setEditing(null)
            }}
          />
        ) : atLimit ? (
          <div className="card p-6 text-center">
            <p className="font-medium">Drei Habits sind kostenlos — mehr gibt's in der Vollversion.</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              Einmalig 9,99 €. Kein Abo, keine Verlängerung, alle Funktionen dauerhaft.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <CheckoutButton
                onUnlocked={() => {
                  setPro(true)
                  setNotice('Vollversion freigeschaltet. Viel Spaß!')
                }}
              />
              <button className="btn btn-ghost" onClick={unlock}>
                Ich habe einen Schlüssel
              </button>
            </div>
          </div>
        ) : (
          active.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setCreating(true)}>
              <Plus size={16} /> Weiteres Habit ({active.length}
              {pro ? '' : ` von ${FREE_HABIT_LIMIT}`})
            </button>
          )
        )}
      </section>

      {/* ------------------------------ Daten sichern ------------------------------- */}
      <section className="no-print mt-10" aria-labelledby="daten">
        <h2 id="daten" className="mb-3 text-lg font-semibold">
          Deine Daten
        </h2>
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <button className="btn btn-ghost" onClick={backup}>
            <Download size={16} /> Sicherung herunterladen
          </button>
          <label className="btn btn-ghost cursor-pointer">
            <Upload size={16} /> Sicherung einlesen
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => restore(e.target.files?.[0])}
            />
          </label>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Alles liegt auf diesem Gerät. Die Sicherung ist deine Umzugshilfe.
          </p>
        </div>
      </section>

      {detail && <DayDetail habit={detail.habit} day={detail.day} onClose={() => setDetail(null)} />}
    </div>
  )
}

/* ------------------------------ Heutige Zeile ------------------------------ */

/**
 * Eigene Komponente mit `memo`: Beim Abhaken eines Habits ändert sich nur dessen `done` —
 * die übrigen Zeilen überspringen das Rendern und der Klick bleibt innerhalb eines Frames.
 */
const TodayRow = memo(function TodayRow({
  habit,
  done,
  day,
  onToggle,
  onOpenNote,
}: {
  habit: Habit
  done: boolean
  day: DayKey
  onToggle: (habitId: string, day: DayKey) => void
  onOpenNote: (habit: Habit, day: DayKey) => void
}) {
  return (
    <li className="card flex items-center gap-3 p-3">
      <button
        className="checkin shrink-0"
        data-done={done}
        aria-pressed={done}
        aria-label={`${habit.name} für heute ${done ? 'abwählen' : 'abhaken'}`}
        onClick={() => onToggle(habit.id, day)}
        style={done ? { background: habit.color, borderColor: habit.color } : undefined}
      >
        {done ? <Check size={22} /> : <span className="text-lg">{habit.icon}</span>}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{habit.name}</p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {describeFrequency(habit.frequency)}
          {habit.reminder && ` · Erinnerung ${habit.reminder}`}
        </p>
      </div>
      <button className="btn btn-ghost shrink-0 text-sm" onClick={() => onOpenNote(habit, day)}>
        Notiz
      </button>
    </li>
  )
})

/* ---------------------------------- Karten --------------------------------- */

/**
 * `memo` plus Einträge als eigene Prop: Beim Abhaken von Habit A bekommt Habit B dieselbe
 * `entries`-Referenz wie zuvor und rendert nicht neu. Ohne das würde jeder Klick sämtliche
 * Serien, Quoten und Heatmaps der gesamten Liste neu berechnen.
 */
const HabitCard = memo(function HabitCard({
  habit,
  entries,
  onEdit,
  onPickDay,
  onRemove,
}: {
  habit: Habit
  entries: Record<DayKey, Entry> | undefined
  onEdit: (habit: Habit) => void
  onPickDay: (habit: Habit, day: DayKey) => void
  onRemove: (habit: Habit) => void
}) {
  // Ein Ein-Habit-Log für die Engine — stabile Referenz, solange sich die Einträge nicht ändern
  const log = useMemo(() => ({ [habit.id]: entries ?? {} }), [habit.id, entries])
  const stats = useMemo(
    () => ({
      streak: computeStreak(habit, log),
      rate: completionRate(habit, log, 30),
    }),
    [habit, log],
  )
  const category = CATEGORIES.find((c) => c.id === habit.category)
  const pick = useCallback((day: DayKey) => onPickDay(habit, day), [onPickDay, habit])

  return (
    <article className="card p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg"
            style={{ background: `${habit.color}22` }}
          >
            {habit.icon}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold">{habit.name}</h3>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {describeFrequency(habit.frequency)}
              {habit.frequency.kind !== 'weekly' && habit.graceDays > 0 && (
                <>
                  {' '}
                  · {stats.streak.restLeftThisWeek} von {habit.graceDays} Ruhetagen übrig
                </>
              )}
              {category && category.id !== 'sonstiges' && <> · {category.name}</>}
            </p>
          </div>
        </div>

        <div className="no-print flex shrink-0 gap-1">
          <button
            className="btn btn-ghost btn-icon px-2 py-1.5"
            onClick={() => onEdit(habit)}
            aria-label={`${habit.name} bearbeiten`}
          >
            <Pencil size={15} />
          </button>
          <button
            className="btn btn-ghost btn-icon px-2 py-1.5"
            aria-label={`${habit.name} löschen`}
            onClick={() => onRemove(habit)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs" style={{ color: 'var(--muted)' }}>
            Aktuelle Serie
          </dt>
          <dd className="flex items-center justify-center gap-1 text-xl font-semibold tabular-nums">
            <Flame size={16} style={{ color: habit.color }} aria-hidden />
            {stats.streak.current}
            <span className="text-sm font-normal" style={{ color: 'var(--muted)' }}>
              {unitLabel(stats.streak.unit, stats.streak.current)}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs" style={{ color: 'var(--muted)' }}>
            Längste Serie
          </dt>
          <dd className="text-xl font-semibold tabular-nums">{stats.streak.longest}</dd>
        </div>
        <div>
          <dt className="text-xs" style={{ color: 'var(--muted)' }}>
            Letzte 30 Tage
          </dt>
          <dd className="text-xl font-semibold tabular-nums">{stats.rate}%</dd>
        </div>
      </dl>

      <div className="mt-4">
        <Heatmap habit={habit} log={log} onPick={pick} />
      </div>
      <div className="mt-3">
        <HeatmapLegend />
      </div>
    </article>
  )
})

/* ------------------------------ Tagesdetails ------------------------------- */

function DayDetail({ habit, day, onClose }: { habit: Habit; day: DayKey; onClose: () => void }) {
  const store = useHabits()
  const entry = store.log[habit.id]?.[day]
  const [note, setNote] = useState(entry?.note ?? '')

  return (
    <div
      className="no-print fixed inset-0 z-40 grid place-items-end bg-black/40 sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${habit.name} am ${formatLong(day)}`}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-5 sm:w-auto sm:min-w-[26rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold">
          {habit.icon} {habit.name}
        </h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {formatLong(day)}
        </p>

        <button
          className="btn mt-4 w-full"
          style={{
            background: entry?.done ? habit.color : 'var(--surface-2)',
            color: entry?.done ? '#fff' : 'var(--text)',
          }}
          onClick={() => store.toggleDay(habit.id, day)}
        >
          {entry?.done ? (
            <>
              <Check size={16} /> Erledigt
            </>
          ) : (
            'Als erledigt markieren'
          )}
        </button>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Wie ging es dir dabei?</legend>
          <div className="mt-2 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((m) => (
              <button
                key={m}
                aria-pressed={entry?.mood === m}
                aria-label={MOOD_LABELS[m]}
                onClick={() =>
                  store.setEntry(habit.id, day, { mood: entry?.mood === m ? undefined : m })
                }
                className="h-10 flex-1 rounded-lg border text-lg"
                style={{
                  borderColor: entry?.mood === m ? 'var(--accent)' : 'var(--border)',
                  background: entry?.mood === m ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                {['😞', '😐', '🙂', '😊', '🤩'][m - 1]}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mt-5 block">
          <span className="text-sm font-medium">Notiz</span>
          <textarea
            className="field mt-1.5 min-h-24"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => store.setEntry(habit.id, day, { note })}
            placeholder="Was ist dir aufgefallen?"
          />
        </label>

        <button className="btn btn-primary mt-5 w-full" onClick={onClose}>
          Fertig
        </button>
      </div>
    </div>
  )
}
