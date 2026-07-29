import { useEffect, useMemo, useRef, useState } from 'react'
import type { CategoryId } from '../engine/habits'

/**
 * Streak-Kristall — geschliffener Edelstein, der mit der laufenden Serie wächst.
 *
 * ═══ WARUM KEIN WEBGL MEHR ═══
 * Die vorherige Fassung nutzte MeshPhysicalMaterial mit `transmission`. Durchsichtigkeit
 * heißt dort zwangsläufig: Man sieht die Rückseiten des eigenen Körpers. Genau das
 * erzeugte die überlagerten Innenflächen und den verwaschenen Eindruck — kein Fehler,
 * sondern die Funktionsweise des Materials. Gegensteuern über `side: FrontSide` und
 * `depthWrite` bekämpft nur Symptome und nimmt dem Glas gleichzeitig das Glas.
 *
 * Diese Fassung rechnet die Geometrie selbst: echte 3D-Eckpunkte, Rotationsmatrix,
 * perspektivische Projektion, Rückseiten-Aussortierung und Sortierung nach Tiefe.
 * Gezeichnet wird als SVG-Polygone. Das bedeutet:
 *   • gestochen scharfe Kanten auf jedem Bildschirm und in jeder Auflösung
 *   • keine Rückseiten, keine Z-Fighting-Artefakte, keine Unschärfe
 *   • gleiche Wirkung auf hellem und dunklem Grund
 *   • three.js entfällt vollständig — rund 119 kB gzip weniger im Bundle
 *
 * Der Preis: keine echte Lichtbrechung. Dafür sieht es auf beiden Hintergründen sauber
 * aus, was mit Transmission nicht zu erreichen war.
 */

/** shadow = abgewandte Fläche, light = angestrahlte Fläche, rim = Saum im Profil */
type Preset = { core: string; shadow: string; light: string; rim: string }

const PRESETS: Record<CategoryId, Preset> = {
  fitness: { core: '#f0554a', shadow: '#8c2f28', light: '#ffe4e0', rim: '#ff6b5e' },
  mental: { core: '#d29a34', shadow: '#7a5a15', light: '#fdf3dc', rim: '#f0bd5c' },
  wasser: { core: '#2f9ad6', shadow: '#1a5379', light: '#e2f2fc', rim: '#4bb6ef' },
  schlaf: { core: '#5b68c0', shadow: '#333c78', light: '#e8ebfb', rim: '#7a87e0' },
  lernen: { core: '#8355c7', shadow: '#4a2d75', light: '#f0e7fb', rim: '#a273e8' },
  sonstiges: { core: '#10b981', shadow: '#0a5c42', light: '#e4faf1', rim: '#10b981' },
}

/** Lineare Mischung zweier Hexfarben — für die Facettenschattierung. */
function mix(from: string, to: string, amount: number): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const a = parse(from)
  const b = parse(to)
  const t = Math.max(0, Math.min(1, amount))
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

export const tierOf = (streak: number): 0 | 1 | 2 => (streak >= 15 ? 2 : streak >= 4 ? 1 : 0)

type Vec3 = [number, number, number]

/**
 * Bipyramide: Spitze oben, ein Rundistenring, Spitze unten. Bewusst so einfach.
 *
 * Der vorherige Brillantschliff hatte einen um eine halbe Segmentbreite versetzten
 * zweiten Ring. Das ergab schmale Zickzack-Dreiecke, die als zersplitterte Innenkanten
 * gelesen wurden. Wenige große Facetten sind hier eindeutig besser: klarer Umriss,
 * ruhige Flächen, jede Kante liegt genau einmal im Bild.
 *
 * Krone kürzer als Unterteil — die Proportion eines geschliffenen Steins, keine Raute.
 */
function buildGem(segments: number) {
  const vertices: Vec3[] = [[0, 1.12, 0]] // 0 = Spitze oben
  const girdle: number[] = []

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    girdle.push(vertices.length)
    vertices.push([Math.cos(a) * 1.0, 0.24, Math.sin(a) * 1.0])
  }
  const apexBottom = vertices.length
  vertices.push([0, -1.48, 0])

  const faces: number[][] = []
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments
    faces.push([0, girdle[i], girdle[next]]) // Krone
    faces.push([girdle[i], apexBottom, girdle[next]]) // Unterteil
  }
  return { vertices, faces }
}

const rotate = ([x, y, z]: Vec3, rx: number, ry: number): Vec3 => {
  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  const x1 = x * cy - z * sy
  const z1 = x * sy + z * cy
  const cx = Math.cos(rx)
  const sx = Math.sin(rx)
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx]
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

const normalize = (v: Vec3): Vec3 => {
  const len = Math.hypot(...v) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

const LIGHT = normalize([0.35, 0.72, 0.85])
/** Kameradistanz für die perspektivische Verkürzung */
const CAMERA_Z = 5.2

export function StreakCrystal({
  streak,
  category = 'sonstiges',
  /** Landingpage: fest im Endzustand, damit Besucher das Ziel sofort sehen */
  showcase = false,
}: {
  streak: number
  category?: CategoryId
  showcase?: boolean
}) {
  const tier = showcase ? 2 : tierOf(streak)
  const preset = PRESETS[category] ?? PRESETS.sonstiges
  const host = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const polygons = useRef<SVGPolygonElement[]>([])
  const [ready, setReady] = useState(false)

  // Mehr Segmente ab Stufe 1 — der Schliff wird feiner, je länger die Serie hält
  const gem = useMemo(() => buildGem(tier === 0 ? 6 : 8), [tier])

  useEffect(() => {
    const el = host.current
    const root = svg.current
    if (!el || !root) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scale = showcase ? 82 : 62
    const state = { rx: -0.18, ry: 0.6, velX: 0, velY: 0, dragging: false, lastX: 0, lastY: 0 }
    const parallax = { x: 0, y: 0 }
    let t = 0

    const draw = () => {
      const rotated = gem.vertices.map((v) => rotate(v, state.rx, state.ry))
      const projected = rotated.map(([x, y, z]) => {
        const p = CAMERA_Z / (CAMERA_Z - z)
        return [x * p * scale, -y * p * scale, z] as [number, number, number]
      })

      // Nach Tiefe sortieren und Rückseiten aussortieren — das ersetzt Z-Buffer und
      // Backface-Culling der Grafikkarte und garantiert, dass nichts durchscheint.
      const drawable = gem.faces
        .map((face) => {
          const [a, b, c] = face.map((i) => rotated[i])
          const normal = normalize(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]))
          const depth = face.reduce((sum, i) => sum + rotated[i][2], 0) / face.length
          return { face, normal, depth }
        })
        .filter((f) => f.normal[2] > 0.02) // zeigt zur Kamera
        .sort((a, b) => a.depth - b.depth)

      polygons.current.forEach((polygon, index) => {
        const item = drawable[index]
        if (!item) {
          polygon.setAttribute('points', '')
          polygon.style.display = 'none'
          return
        }
        polygon.style.display = ''
        polygon.setAttribute(
          'points',
          item.face.map((i) => `${projected[i][0].toFixed(2)},${projected[i][1].toFixed(2)}`).join(' '),
        )
        // Lambert-Beleuchtung: je direkter die Facette zum Licht zeigt, desto heller
        const lambert = Math.max(0, item.normal.reduce((sum, n, i) => sum + n * LIGHT[i], 0))
        // Rimlight: Flächen, die fast im Profil stehen, bekommen einen Smaragdsaum.
        // Das zeichnet die Silhouette nach, ohne eine einzige Konturlinie zu brauchen.
        const rim = Math.pow(1 - Math.min(1, item.normal[2]), 2.2)
        const fill = mix(mix(preset.shadow, preset.light, 0.12 + lambert * 0.88), preset.rim, rim * 0.55)

        // Voll deckend. Jede Teiltransparenz ließ den Schein dahinter durchscheinen und
        // erzeugte genau die Artefakte, um die es hier geht.
        polygon.setAttribute('fill', fill)
        // Kontur in der eigenen Füllfarbe: schließt die Haarlinien, die Antialiasing
        // zwischen benachbarten Polygonen hinterlässt. Eine andersfarbige Kontur würde
        // sich an gemeinsamen Kanten verdoppeln — das waren die Innenkanten.
        polygon.setAttribute('stroke', fill)
      })
    }

    /* ------------------------------- Interaktion ------------------------------- */
    const onDown = (e: PointerEvent) => {
      state.dragging = true
      state.lastX = e.clientX
      state.lastY = e.clientY
      root.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!state.dragging) return
      state.velY = (e.clientX - state.lastX) * 0.009
      state.velX = (e.clientY - state.lastY) * 0.006
      state.ry += state.velY
      state.rx = Math.max(-1.1, Math.min(1.1, state.rx + state.velX))
      state.lastX = e.clientX
      state.lastY = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      state.dragging = false
      if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId)
    }
    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerup', onUp)
    root.addEventListener('pointercancel', onUp)

    const onWindowPointer = (e: PointerEvent) => {
      if (state.dragging) return
      const rect = el.getBoundingClientRect()
      parallax.x = Math.max(-1, Math.min(1, (e.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2)))
      parallax.y = Math.max(-1, Math.min(1, (e.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2)))
    }
    window.addEventListener('pointermove', onWindowPointer)

    /* ---------------------------- Schleife und Pause --------------------------- */
    let raf = 0
    let running = false
    let visible = false
    let lastFrame = 0
    const FRAME_MS = 1000 / 60
    const baseSpin = reduceMotion ? 0 : tier === 0 ? 0.0022 : 0.0045

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (now - lastFrame < FRAME_MS) return
      lastFrame = now
      t += 0.016

      if (!state.dragging) {
        state.velY *= 0.93
        state.velX *= 0.93
        state.ry += state.velY + baseSpin
        state.rx += state.velX
        if (!reduceMotion) {
          // Neigung folgt der Maus, kehrt aber immer zur Grundlage zurück
          state.rx += (-0.18 + parallax.y * -0.22 - state.rx) * 0.05
        }
      }

      if (!reduceMotion && root.parentElement) {
        // Schweben auf der Y-Achse plus leichte seitliche Verschiebung
        const float = Math.sin(t * 0.85) * (showcase ? 9 : 6)
        root.parentElement.style.transform = `translate3d(${(parallax.x * 10).toFixed(1)}px, ${float.toFixed(1)}px, 0)`
      }

      draw()
    }

    const start = () => {
      if (running) return
      running = true
      lastFrame = 0
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }
    const update = () => {
      if (visible && !document.hidden) start()
      else stop()
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        update()
      },
      { threshold: 0.05 },
    )
    observer.observe(el)
    document.addEventListener('visibilitychange', update)

    draw() // ein Standbild, falls die Schleife pausiert bleibt
    setReady(true)

    return () => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', update)
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerup', onUp)
      root.removeEventListener('pointercancel', onUp)
      window.removeEventListener('pointermove', onWindowPointer)
    }
  }, [gem, preset, tier, showcase])

  const glowId = `gem-glow-${category}-${tier}`
  const coreId = `gem-core-${category}-${tier}`

  return (
    <div
      ref={host}
      className={`relative w-full overflow-hidden ${
        showcase ? 'h-[300px] sm:h-[380px] lg:h-[460px]' : 'h-[190px] sm:h-[230px]'
      }`}
    >
      {/*
        Absolut positioniert mit `inset-0`, damit dieser Kasten eine definite Höhe hat.
        Ohne sie löst `height: 100%` am SVG gegen ein Elternelement mit automatischer
        Höhe auf, greift nicht — und das SVG wuchs auf 342 px in einem 190-px-Kasten.
      */}
      <div
        className="absolute inset-0 grid place-items-center will-change-transform"
      >
        <svg
          ref={svg}
          viewBox="-150 -150 300 300"
          preserveAspectRatio="xMidYMid meet"
          className="cursor-grab touch-none select-none active:cursor-grabbing"
          style={{ height: '100%', width: 'auto', aspectRatio: '1 / 1', maxWidth: '100%' }}
          role="img"
          aria-label={
            showcase
              ? 'Streak-Kristall in der höchsten Stufe — zum Drehen ziehen'
              : `Streak-Kristall, Stufe ${tier + 1} von 3, aktuelle Serie ${streak} Tage`
          }
          opacity={ready ? 1 : 0}
        >
          <defs>
            <radialGradient id={glowId}>
              <stop offset="0%" stopColor={preset.core} stopOpacity={tier === 0 ? 0.1 : 0.3} />
              <stop offset="55%" stopColor={preset.core} stopOpacity={tier === 0 ? 0.03 : 0.1} />
              <stop offset="100%" stopColor={preset.core} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={coreId}>
              <stop offset="0%" stopColor={preset.light} />
              <stop offset="45%" stopColor={preset.core} />
              <stop offset="100%" stopColor={preset.core} stopOpacity="0.25" />
            </radialGradient>
          </defs>

          {/* Weicher Schein hinter dem Stein */}
          {tier >= 1 && <circle cx="0" cy="0" r="132" fill={`url(#${glowId})`} />}

          {/* Kontaktschatten */}
          <ellipse cx="0" cy="118" rx={showcase ? 62 : 48} ry="9" fill="var(--text)" opacity="0.09" />

          {/*
            Facetten. Der frühere leuchtende Kern ist entfallen: Hinter voll deckenden
            Flächen ist er nicht zu sehen, und halbdurchlässige Flächen waren genau das
            Problem. Die Farbe des Kerns trägt jetzt das Rimlight an den Silhouettenkanten.
          */}
          <g strokeLinejoin="round">
            {gem.faces.map((_, i) => (
              <polygon
                key={i}
                ref={(node) => {
                  if (node) polygons.current[i] = node
                }}
                strokeWidth="1"
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}
