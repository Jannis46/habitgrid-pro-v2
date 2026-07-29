/**
 * Erzeugt sämtliche Marken-Assets aus der Logo-Geometrie — ohne Bildbibliothek.
 *
 * Quelle der Wahrheit ist dieselbe Raute wie in `src/components/Logo.tsx`: ein Kristall
 * aus vier Facetten, zwei gefüllt, zwei offen. Wird das Zeichen dort geändert, müssen die
 * Koordinaten unten mitwandern — deshalb stehen sie als einzige Konstante am Anfang.
 *
 * Statt sharp oder canvas als Abhängigkeit aufzunehmen, schreibt dieses Skript PNGs direkt:
 * node:zlib liefert die Kompression, der Rest sind Polygonfüllung und ein PNG-Container.
 *
 *   node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/* ------------------------------ Logo-Geometrie ----------------------------- */
// Koordinaten im 32er-Raster, identisch zu Logo.tsx
const FACETS = {
  tl: [[15.44, 3.12], [15.44, 15.44], [3.12, 15.44]],
  tr: [[16.56, 3.12], [28.88, 15.44], [16.56, 15.44]],
  br: [[16.56, 28.88], [28.88, 16.56], [16.56, 16.56]],
  bl: [[15.44, 28.88], [15.44, 16.56], [3.12, 16.56]],
}
const FILLED = ['tl', 'tr', 'br']
const OPEN = ['bl']

const BG = [15, 23, 42] // #0f172a Schiefer
const GRAD_FROM = [16, 185, 129] // #10b981 Smaragd
const GRAD_TO = [5, 150, 105] // #059669
const OUTLINE = [226, 232, 240] // #e2e8f0

/* ------------------------------- PNG-Encoder ------------------------------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, pixels) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // Filtertyp 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // Bittiefe
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** ICO-Container mit PNG-Nutzlast — von allen Browsern seit Vista akzeptiert. */
function encodeIco(size, png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserviert
  header.writeUInt16LE(1, 2) // Typ 1 = Icon
  header.writeUInt16LE(1, 4) // ein Bild
  const entry = Buffer.alloc(16)
  entry[0] = size === 256 ? 0 : size // 0 bedeutet 256
  entry[1] = size === 256 ? 0 : size
  entry.writeUInt16LE(1, 4) // Farbebenen
  entry.writeUInt16LE(32, 6) // Bit pro Pixel
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12) // Datenbeginn
  return Buffer.concat([header, entry, png])
}

/* -------------------------------- Rasterung -------------------------------- */

const inside = (pts, x, y) => {
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** Polygon zum Schwerpunkt hin schrumpfen — erzeugt aus einer Fläche eine Kontur. */
const shrink = (pts, factor) => {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length
  return pts.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor])
}

/**
 * Zeichnet das Icon. `padding` als Anteil der Kantenlänge — maskable Icons brauchen
 * Sicherheitsabstand, weil Android sie zu Kreisen oder Squircles beschneidet.
 */
function drawIcon(size, { padding = 0.06, radius = 0.22, background = true } = {}) {
  const px = Buffer.alloc(size * size * 4)
  const inner = size * (1 - padding * 2)
  const offset = size * padding
  const scale = inner / 32
  const corner = size * radius
  const SS = 3 // Kantenglättung über 3×3 Teilabtastung

  // Innenkante der offenen Facette einmalig vorberechnen — daraus wird die Kontur
  const ringInner = Object.fromEntries(OPEN.map((k) => [k, shrink(FACETS[k], 0.62)]))
  const gradientDenominator = 18 * 18 + 24 * 24

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px1 = x + (sx + 0.5) / SS
          const py1 = y + (sy + 0.5) / SS

          // Abgerundetes Quadrat als Grundform
          const dx = Math.max(corner - px1, px1 - (size - corner), 0)
          const dy = Math.max(corner - py1, py1 - (size - corner), 0)
          const outside = Math.hypot(dx, dy) > corner
          if (background && outside) continue

          let sr = BG[0]
          let sg = BG[1]
          let sb = BG[2]
          let sa = background ? 255 : 0

          // In Logo-Koordinaten umrechnen
          const lx = (px1 - offset) / scale
          const ly = (py1 - offset) / scale

          const facet = FILLED.find((k) => inside(FACETS[k], lx, ly))
          if (facet) {
            // Farbverlauf entlang der Achse (8,3) -> (26,27), wie im SVG
            const t = Math.min(1, Math.max(0, ((lx - 8) * 18 + (ly - 3) * 24) / gradientDenominator))
            // Die hintere Facette etwas zurücknehmen, damit der Stein Tiefe bekommt
            const depth = facet === 'br' ? 0.85 : 1
            sr = (GRAD_FROM[0] + (GRAD_TO[0] - GRAD_FROM[0]) * t) * depth + BG[0] * (1 - depth)
            sg = (GRAD_FROM[1] + (GRAD_TO[1] - GRAD_FROM[1]) * t) * depth + BG[1] * (1 - depth)
            sb = (GRAD_FROM[2] + (GRAD_TO[2] - GRAD_FROM[2]) * t) * depth + BG[2] * (1 - depth)
            sa = 255
          } else {
            for (const key of OPEN) {
              if (inside(FACETS[key], lx, ly) && !inside(ringInner[key], lx, ly)) {
                // 42 % Deckkraft der Kontur über den Hintergrund legen
                sr = BG[0] + (OUTLINE[0] - BG[0]) * 0.42
                sg = BG[1] + (OUTLINE[1] - BG[1]) * 0.42
                sb = BG[2] + (OUTLINE[2] - BG[2]) * 0.42
                sa = 255
              }
            }
          }

          r += sr
          g += sg
          b += sb
          a += sa
        }
      }

      const samples = SS * SS
      const i = (y * size + x) * 4
      px[i] = Math.round(r / samples)
      px[i + 1] = Math.round(g / samples)
      px[i + 2] = Math.round(b / samples)
      px[i + 3] = Math.round(a / samples)
    }
  }
  return encodePng(size, px)
}

/* --------------------------------- Ausgabe --------------------------------- */

/**
 * Badge für Benachrichtigungen: Android zeigt es einfarbig in der Statusleiste und
 * wertet nur den Alphakanal aus. Deshalb weiße Form auf durchsichtigem Grund — ein
 * farbiges Icon erschiene dort als grauer Klecks.
 */
function drawBadge(size) {
  const px = Buffer.alloc(size * size * 4)
  const scale = size / 32
  const SS = 3
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const lx = (x + (sx + 0.5) / SS) / scale
          const ly = (y + (sy + 0.5) / SS) / scale
          if (Object.values(FACETS).some((f) => inside(f, lx, ly))) hits++
        }
      }
      const i = (y * size + x) * 4
      px[i] = px[i + 1] = px[i + 2] = 255
      px[i + 3] = Math.round((hits / (SS * SS)) * 255)
    }
  }
  return encodePng(size, px)
}

await mkdir(join('public', 'icons'), { recursive: true })

const files = [
  [join('public', 'icons', 'icon-192.png'), drawIcon(192)],
  [join('public', 'icons', 'icon-512.png'), drawIcon(512)],
  // Maskable: mehr Rand und volle Fläche, damit die Beschneidung nichts abschneidet
  [join('public', 'icons', 'icon-maskable-512.png'), drawIcon(512, { padding: 0.2, radius: 0.5 })],
  [join('public', 'icons', 'badge-72.png'), drawBadge(72)],
  // iOS rundet selbst ab und mag keine Transparenz
  [join('public', 'apple-touch-icon.png'), drawIcon(180, { radius: 0.0001 })],
]

for (const [path, buf] of files) await writeFile(path, buf)
await writeFile(join('public', 'favicon.ico'), encodeIco(32, drawIcon(32, { radius: 0.2 })))

console.log(`${files.length + 1} Marken-Assets geschrieben (PNG + ICO)`)
