import type { Station, ThemeModule } from '../scene'
import { agentSpotsAt, boxT, columns, iso, poly, r, shade, spanY, T, withSpares } from '../scene'

const BLACK = '#26232F'
const GOLD = '#E8C25A'
const LIGHTS = ['#FF4FD8', '#4FE3FF', '#FFE34F']

// round shapes on the y-facing side of a box: the same shear the wall signs use
const onFace = (x: number, y: number, z: number, inner: string) => {
  const [fx, fy] = iso(x, y, z)
  return `<g transform="matrix(1,0.5,0,1,${r(fx)},${r(fy)})">${inner}</g>`
}

// a cone that thumps while the band plays
const cone = (radius: number, active: boolean, delay: number) =>
  `<circle r="${radius}" fill="#3B3846" stroke="#55515F" stroke-width="1.2"/>` +
  `<circle r="${r(radius * 0.45)}" fill="#14121A">${active ? `<animate attributeName="r" values="${r(radius * 0.45)};${r(radius * 0.62)};${r(radius * 0.45)}" dur=".45s" begin="${delay}s" repeatCount="indefinite"/>` : ''}</circle>`

function drums(bx: number, by: number, accent: string) {
  let s = `<ellipse cx="${r(bx)}" cy="${r(by)}" rx="24" ry="7" fill="#000" opacity=".18"/>`
  // stands first, then hi-hat, snare, bass drum, toms and the crash on top
  s += `<rect x="${r(bx - 23)}" y="${r(by - 24)}" width="1.4" height="24" fill="#9A9AA6"/><rect x="${r(bx + 19)}" y="${r(by - 31)}" width="1.4" height="31" fill="#9A9AA6"/><rect x="${r(bx - 15)}" y="${r(by - 9)}" width="1.4" height="9" fill="#9A9AA6"/>`
  s += `<ellipse cx="${r(bx - 22)}" cy="${r(by - 24)}" rx="6.5" ry="1.8" fill="${GOLD}"/><ellipse cx="${r(bx - 22)}" cy="${r(by - 26)}" rx="6.5" ry="1.8" fill="${shade(GOLD, 1.2)}"/>`
  s += `<rect x="${r(bx - 20)}" y="${r(by - 15)}" width="11" height="5" fill="#D9D4CC"/><ellipse cx="${r(bx - 14.5)}" cy="${r(by - 15)}" rx="5.5" ry="2" fill="#F4F1EA"/>`
  s += `<circle cx="${r(bx)}" cy="${r(by - 10)}" r="10" fill="#EFE9DD" stroke="${shade(accent, 0.7)}" stroke-width="3"/><rect x="${r(bx - 4)}" y="${r(by - 12)}" width="8" height="4" fill="${accent}"/>`
  for (const dx of [-6.5, 6.5]) {
    s += `<rect x="${r(bx + dx - 5)}" y="${r(by - 24)}" width="10" height="5" fill="${shade(accent, 0.7)}"/><ellipse cx="${r(bx + dx)}" cy="${r(by - 24)}" rx="5" ry="2" fill="#F4F1EA"/>`
  }
  s += `<rect x="${r(bx + 10)}" y="${r(by - 13)}" width="10" height="11" fill="${shade(accent, 0.7)}"/><ellipse cx="${r(bx + 15)}" cy="${r(by - 13)}" rx="5" ry="2" fill="#F4F1EA"/>`
  s += `<ellipse cx="${r(bx + 20)}" cy="${r(by - 31)}" rx="8" ry="2.2" fill="${GOLD}"/><rect x="${r(bx + 17)}" y="${r(by - 32)}" width="3" height="1" fill="#FFF3B0"/>`
  return s
}

// an electric guitar leaning on the amp, body bottom at (gx, gy)
const guitar = (gx: number, gy: number, color: string) =>
  `<g transform="translate(${r(gx)},${r(gy)}) rotate(-14)"><rect x="-1" y="-24" width="2" height="15" fill="#7A5136"/><rect x="-2" y="-27" width="4" height="4" fill="#3B2A20"/>` +
  `<path d="M-5 -10 h4 l1 -2 l1 2 h4 l1 4 l-1 3 l1 3 h-12 l1 -3 l-1 -3 z" fill="${color}"/><rect x="-2" y="-7" width="4" height="1.4" fill="#2A211C"/></g>`

export const music: ThemeModule = {
  floor: '#5B4A6E',
  furnish(room, lab, active) {
    let s = ''
    const w = room.x1 - room.x0
    // a big rug with a border, the band plays on it
    {
      const { y, d } = spanY(room, 1.7, 6.2)
      const quad = (a: number, b: number, c: number, e: number, fill: string) => poly([iso(a, b), iso(c, b), iso(c, e), iso(a, e)], fill)
      s += quad(room.x0 + 0.7, y, room.x1 - 0.9, y + d, shade(lab.accent, 0.5))
      s += quad(room.x0 + 0.85, y + 0.15, room.x1 - 1.05, y + d - 0.15, shade(lab.accent, 0.7))
      s += quad(room.x0 + 1.05, y + 0.35, room.x1 - 1.25, y + d - 0.35, shade(lab.accent, 0.58))
    }
    // tall speakers in both back corners
    let k = 0
    for (const x of [room.x0 + 0.3, room.x1 - 1.1]) {
      s += boxT(room, x, 0.15, 0.75, 0, 0.8, 28, BLACK)
      const { y, d } = spanY(room, 0.15, 0.75)
      s += onFace(x + 0.4, y + d, 20, cone(5, active, k * 0.2)) + onFace(x + 0.4, y + d, 8, cone(7, active, k * 0.2 + 0.1))
      k++
    }
    // drum kit at the back, centred
    {
      const [bx, by] = iso((room.x0 + room.x1) / 2 - 0.3, T(room, 1.1))
      s += drums(bx, by, lab.accent)
    }
    // stage lights on poles; their beams sweep the rug while someone plays
    ;[room.x0 + 1.4, room.x1 - 1.8].forEach((x, j) => {
      const [px, py] = iso(x, T(room, 0.5))
      s += `<rect x="${r(px - 1)}" y="${r(py - 40)}" width="2" height="40" fill="#55515F"/><rect x="${r(px - 4)}" y="${r(py - 44)}" width="8" height="5" fill="${BLACK}"/>`
      s += `<rect x="${r(px - 3)}" y="${r(py - 40)}" width="6" height="1.6" fill="${active ? LIGHTS[j % LIGHTS.length] : '#6E6A78'}"/>`
      if (active) {
        const [gx, gy] = iso(x + (j ? -1.2 : 1.2), T(room, 3.8))
        const c = LIGHTS[j % LIGHTS.length]
        s += `<polygon points="${r(px - 2)},${r(py - 39)} ${r(px + 2)},${r(py - 39)} ${r(gx + 18)},${r(gy)} ${r(gx - 18)},${r(gy)}" fill="${c}" opacity=".14" pointer-events="none"><animate attributeName="opacity" values=".08;.22;.08" dur="${r(1.4 + j * 0.5)}s" repeatCount="indefinite"/></polygon>` +
          `<ellipse cx="${r(gx)}" cy="${r(gy)}" rx="18" ry="8" fill="${c}" opacity=".18" pointer-events="none"><animate attributeName="opacity" values=".1;.28;.1" dur="${r(1.4 + j * 0.5)}s" repeatCount="indefinite"/></ellipse>`
      }
    })
    const stations: Station[] = []
    const xs = columns(room, 1.4, 1.6)
    // front row of keyboards on X stands
    for (const x of xs) {
      const t = 2.6
      const [lx, ly] = iso(x, T(room, t + 0.2))
      s += `<path d="M${r(lx - 9)} ${r(ly)} L${r(lx + 7)} ${r(ly - 11)} M${r(lx + 9)} ${r(ly)} L${r(lx - 7)} ${r(ly - 11)}" stroke="#55515F" stroke-width="1.8"/>`
      s += boxT(room, x - 0.45, t, t + 0.4, 11, 0.9, 2.5, BLACK)
      const { y, d } = spanY(room, t + 0.08, t + 0.32)
      s += poly([iso(x - 0.38, y, 13.5), iso(x + 0.38, y, 13.5), iso(x + 0.38, y + d, 13.5), iso(x - 0.38, y + d, 13.5)], '#F4F1EA')
      for (let j = 0; j < 5; j++) {
        const [kx, ky] = iso(x - 0.3 + j * 0.15, room.top ? y : y + d * 0.4, 13.5)
        s += `<rect x="${r(kx - 0.7)}" y="${r(ky - 0.6)}" width="1.6" height="2.6" fill="${BLACK}"/>`
      }
      stations.push({ x, y: T(room, t + 0.95), kind: 'music' })
    }
    // back row: amps with a guitar leaning on them and a mic stand per player
    xs.forEach((x, j) => {
      const t = 4.8
      s += boxT(room, x + 0.25, t, t + 0.45, 0, 0.55, 11, BLACK) + boxT(room, x + 0.25, t, t + 0.45, 11, 0.55, 1.5, '#3B3846')
      const { y, d } = spanY(room, t, t + 0.45)
      s += onFace(x + 0.52, y + d, 5.5, `<rect x="-4" y="-3.5" width="8" height="6" fill="#4A4556"/><rect x="-4" y="-5.5" width="8" height="1.2" fill="${GOLD}"/>`)
      const [gx, gy] = iso(x + 0.85, y + d + 0.15)
      s += guitar(gx, gy, j % 2 ? lab.accent : ['#E2463A', '#4FA3E3', '#F2A23A'][j % 3]!)
      const [mx, my] = iso(x - 0.1, T(room, t + 0.35))
      s += `<path d="M${r(mx - 4)} ${r(my)} L${r(mx)} ${r(my - 2)} L${r(mx + 4)} ${r(my)}" stroke="#55515F" stroke-width="1.4" fill="none"/><rect x="${r(mx - 0.6)}" y="${r(my - 22)}" width="1.2" height="20" fill="#9A9AA6"/><rect x="${r(mx - 1.6)}" y="${r(my - 26)}" width="3.2" height="5" rx="1.4" fill="#3B3846"/>`
      stations.push({ x, y: T(room, t + 0.95), kind: 'music' })
    })
    return { svg: s, stations: withSpares(room, stations, 'music'), agentSpots: agentSpotsAt(room, 1.3) }
  },
  // playing: headphones on, nodding to the beat, notes rising in the puesto's colour
  work(seed, accent) {
    const b = r((seed % 14) / 10)
    const tempo = r(0.42 + (seed % 3) * 0.08)
    const move = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -2.4;0 0" dur="${tempo}s" begin="${b}s" repeatCount="indefinite"/>`
    const phones =
      `<path d="M-13 -13 Q-13 -24 0 -24 Q13 -24 13 -13" stroke="${shade(accent, 0.6)}" stroke-width="2" fill="none"/>` +
      `<rect x="-16" y="-15" width="4.5" height="7" fill="${accent}"/><rect x="11.5" y="-15" width="4.5" height="7" fill="${accent}"/>`
    const notes = ['♪', '♫', '♪']
      .map((n, k) => {
        const d = r(b + k * 0.9)
        const x0 = 8 + k * 4
        return `<text x="${x0}" y="-22" font-size="${9 + (k % 2) * 2}" font-weight="700" fill="${shade(accent, 1.15)}" stroke="#2A211C" stroke-opacity=".5" stroke-width="1.5" paint-order="stroke" opacity="0">${n}` +
          `<animate attributeName="y" values="-22;-44" dur="2.7s" begin="${d}s" repeatCount="indefinite"/><animate attributeName="x" values="${x0};${x0 + 4};${x0 - 2}" dur="2.7s" begin="${d}s" repeatCount="indefinite"/>` +
          `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.15;.7;1" dur="2.7s" begin="${d}s" repeatCount="indefinite"/></text>`
      })
      .join('')
    // the headphones go over the sprite, so they nod with their own copy of the beat
    return { move, extra: `<g>${move}${phones}</g>` + notes }
  },
}
