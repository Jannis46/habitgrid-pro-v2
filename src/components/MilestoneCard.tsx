import { useRef } from 'react'
import { Info, Sparkles } from 'lucide-react'
import type { CategoryId } from '../engine/habits'
import {
  DISCLAIMER,
  nextMilestone,
  reachedMilestone,
  type Milestone,
} from '../engine/scientificMilestones'

/**
 * Zeigt die erreichte und die nächste Etappe zur laufenden Serie.
 *
 * Der Text bleibt beschreibend („in Studien beobachtet"), die Quelle steht einen Klick
 * entfernt. Wer motivierende Aussagen über Körper und Psyche macht, muss zeigen können,
 * worauf sie beruhen — sonst ist es Werbung mit Gesundheitsbezug ohne Beleg.
 */
export function MilestoneCard({ streak, category }: { streak: number; category: CategoryId }) {
  const reached = reachedMilestone(category, streak)
  const next = nextMilestone(category, streak)
  if (!reached && !next) return null

  return (
    <div className="border-t px-4 py-3.5" style={{ borderColor: 'var(--border)' }}>
      {reached && (
        <div className="flex items-start gap-2">
          <Sparkles size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
              {reached.title}
              <EvidenceButton milestone={reached} />
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              {reached.description}
            </p>
          </div>
        </div>
      )}

      {next && (
        <p className={`text-xs ${reached ? 'mt-3' : ''}`} style={{ color: 'var(--muted)' }}>
          Nächste Etappe in {next.days - streak} {next.days - streak === 1 ? 'Tag' : 'Tagen'}:{' '}
          <span style={{ color: 'var(--text)' }}>{next.title}</span>
          <EvidenceButton milestone={next} />
        </p>
      )}
    </div>
  )
}

/** Info-Schaltfläche mit Quellenfenster. Nativer Dialog — Fokusführung inklusive. */
function EvidenceButton({ milestone }: { milestone: Milestone }) {
  const dialog = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button
        onClick={() => dialog.current?.showModal()}
        aria-label={`Wissenschaftliche Grundlage zu „${milestone.title}" anzeigen`}
        className="touch-target ml-1 inline-grid h-5 w-5 place-items-center rounded-full align-middle transition-colors"
        style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
      >
        <Info size={11} aria-hidden />
      </button>

      <dialog
        ref={dialog}
        className="m-auto w-[min(94vw,30rem)] rounded-2xl p-0 backdrop:bg-black/60"
        style={{ background: 'var(--surface)', color: 'var(--text)' }}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close()
        }}
      >
        <div className="p-6">
          <p className="eyebrow">Wissenschaftliche Basis</p>
          <h2 className="mt-2 text-lg font-semibold">{milestone.title}</h2>

          <p className="mt-3 text-sm leading-relaxed">{milestone.description}</p>

          <dl className="mt-5 space-y-3 rounded-xl p-4 text-sm" style={{ background: 'var(--surface-2)' }}>
            <div>
              <dt className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                Quelle
              </dt>
              <dd className="mt-0.5">{milestone.evidenceSource}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                Einordnung
              </dt>
              <dd className="mt-0.5 leading-relaxed" style={{ color: 'var(--muted)' }}>
                {milestone.evidenceDetail}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            {DISCLAIMER}
          </p>

          <button className="btn btn-ghost mt-5 w-full" onClick={() => dialog.current?.close()}>
            Schließen
          </button>
        </div>
      </dialog>
    </>
  )
}
