import type { RoomGeom, Station, ThemeModule } from '../scene'
import { boxT, columns, iso, poly, r, shade, spanY, T, withSpares } from '../scene'

const BLACK = '#26232F'
const GOLD = '#E8C25A'
const LIGHTS = ['#FF4FD8', '#4FE3FF', '#FFE34F']
const KEYS_T = 2.6
const AMPS_T = 4.8

// t of the side of [ta, tb] nearest to the viewer, pushed out by gap: rows below see the far wall up front
const nearT = (room: RoomGeom, ta: number, tb: number, gap: number) => (room.top ? tb + gap : ta - gap)

// round shapes on the y-facing side of a box: the same shear the wall signs use
const onFace = (x: number, y: number, z: number, inner: string) => {
  const [fx, fy] = iso(x, y, z)
  return `<g transform="matrix(1,0.5,0,1,${r(fx)},${r(fy)})">${inner}</g>`
}

// a cone that thumps while the band plays
const cone = (radius: number, active: boolean, delay: number) =>
  `<circle r="${radius}" fill="#3B3846" stroke="#55515F" stroke-width="1.2"/>` +
  `<circle r="${r(radius * 0.45)}" fill="#14121A">${active ? `<animate attributeName="r" values="${r(radius * 0.62)};${r(radius * 0.45)};${r(radius * 0.45)}" keyTimes="0;.3;1" dur=".5s" begin="${delay}s" repeatCount="indefinite"/>` : ''}</circle>`

function drums(bx: number, by: number, accent: string, active: boolean) {
  let s = `<ellipse cx="${r(bx)}" cy="${r(by)}" rx="24" ry="7" fill="#000" opacity=".18"/>`
  // stands first, then hi-hat, snare, bass drum, toms and the crash on top
  s += `<rect x="${r(bx - 23)}" y="${r(by - 24)}" width="1.4" height="24" fill="#9A9AA6"/><rect x="${r(bx + 19)}" y="${r(by - 31)}" width="1.4" height="31" fill="#9A9AA6"/><rect x="${r(bx - 15)}" y="${r(by - 9)}" width="1.4" height="9" fill="#9A9AA6"/>`
  // the hi-hat closes on every beat while the band plays
  const hat = active ? `<animate attributeName="cy" values="${r(by - 24.6)};${r(by - 26)};${r(by - 26)}" keyTimes="0;.25;1" dur=".5s" repeatCount="indefinite"/>` : ''
  s += `<ellipse cx="${r(bx - 22)}" cy="${r(by - 24)}" rx="6.5" ry="1.8" fill="${GOLD}"/><ellipse cx="${r(bx - 22)}" cy="${r(by - 26)}" rx="6.5" ry="1.8" fill="${shade(GOLD, 1.2)}">${hat}</ellipse>`
  s += `<rect x="${r(bx - 20)}" y="${r(by - 15)}" width="11" height="5" fill="#D9D4CC"/><ellipse cx="${r(bx - 14.5)}" cy="${r(by - 15)}" rx="5.5" ry="2" fill="#F4F1EA"/>`
  s += `<circle cx="${r(bx)}" cy="${r(by - 10)}" r="10" fill="#EFE9DD" stroke="${shade(accent, 0.7)}" stroke-width="3"/><rect x="${r(bx - 4)}" y="${r(by - 12)}" width="8" height="4" fill="${accent}"/>`
  for (const dx of [-6.5, 6.5]) {
    s += `<rect x="${r(bx + dx - 5)}" y="${r(by - 24)}" width="10" height="5" fill="${shade(accent, 0.7)}"/><ellipse cx="${r(bx + dx)}" cy="${r(by - 24)}" rx="5" ry="2" fill="#F4F1EA"/>`
  }
  s += `<rect x="${r(bx + 10)}" y="${r(by - 13)}" width="10" height="11" fill="${shade(accent, 0.7)}"/><ellipse cx="${r(bx + 15)}" cy="${r(by - 13)}" rx="5" ry="2" fill="#F4F1EA"/>`
  const crash = active ? `<animateTransform attributeName="transform" type="rotate" values="-6 ${r(bx + 20)} ${r(by - 31)};0 ${r(bx + 20)} ${r(by - 31)};0 ${r(bx + 20)} ${r(by - 31)}" keyTimes="0;.4;1" dur="2s" repeatCount="indefinite"/>` : ''
  s += `<g>${crash}<ellipse cx="${r(bx + 20)}" cy="${r(by - 31)}" rx="8" ry="2.2" fill="${GOLD}"/><rect x="${r(bx + 17)}" y="${r(by - 32)}" width="3" height="1" fill="#FFF3B0"/></g>`
  return s
}

// an electric guitar leaning on the amp, body bottom at (gx, gy)
const guitar = (gx: number, gy: number, color: string) =>
  `<g transform="translate(${r(gx)},${r(gy)}) rotate(-14)"><rect x="-1" y="-24" width="2" height="15" fill="#7A5136"/><rect x="-2" y="-27" width="4" height="4" fill="#3B2A20"/>` +
  `<path d="M-5 -10 h4 l1 -2 l1 2 h4 l1 4 l-1 3 l1 3 h-12 l1 -3 l-1 -3 z" fill="${color}"/><rect x="-2" y="-7" width="4" height="1.4" fill="#2A211C"/><rect x="-0.3" y="-24" width=".6" height="16" fill="#E8E2D6" opacity=".6"/></g>`

export const music: ThemeModule = {
  floor: '#5B4A6E',
  furnish(room, lab, active) {
    const parts: { t: number; svg: string }[] = []
    let rug = ''
    // a big rug with a border, the band plays on it
    {
      const { y, d } = spanY(room, 1.7, 6.2)
      const quad = (a: number, b: number, c: number, e: number, fill: string) => poly([iso(a, b), iso(c, b), iso(c, e), iso(a, e)], fill)
      rug += quad(room.x0 + 0.7, y, room.x1 - 0.9, y + d, shade(lab.accent, 0.5))
      rug += quad(room.x0 + 0.85, y + 0.15, room.x1 - 1.05, y + d - 0.15, shade(lab.accent, 0.7))
      rug += quad(room.x0 + 1.05, y + 0.35, room.x1 - 1.25, y + d - 0.35, shade(lab.accent, 0.58))
    }
    // speakers in both far corners; up front in a row below they are half as tall
    const tall = room.top ? 28 : 16
    let k = 0
    for (const x of [room.x0 + 0.3, room.x1 - 1.1]) {
      let s = boxT(room, x, 0.15, 0.75, 0, 0.8, tall, BLACK)
      const { y, d } = spanY(room, 0.15, 0.75)
      s += room.top ? onFace(x + 0.4, y + d, 20, cone(5, active, k * 0.25)) + onFace(x + 0.4, y + d, 8, cone(7, active, k * 0.25)) : onFace(x + 0.4, y + d, 8, cone(6, active, k * 0.25))
      parts.push({ t: 0.15, svg: s })
      k++
    }
    // drum kit centred at the back of the stage: by the far wall above, by the door below so it hides no player
    {
      const t = room.top ? 1.1 : 6.6
      const [bx, by] = iso((room.x0 + room.x1) / 2 - 0.3, T(room, t))
      parts.push({ t, svg: drums(bx, by, lab.accent, active) })
    }
    // stage lights on poles, at the back of the stage too; their beams sweep the rug while someone plays
    ;[room.x0 + (room.top ? 1.4 : 0.5), room.x1 - (room.top ? 1.8 : 0.6)].forEach((x, j) => {
      const t = room.top ? 0.5 : 7.1
      const [px, py] = iso(x, T(room, t))
      const c = LIGHTS[j % LIGHTS.length]!
      let s = `<ellipse cx="${r(px)}" cy="${r(py)}" rx="5" ry="2" fill="#000" opacity=".2"/><rect x="${r(px - 1)}" y="${r(py - 40)}" width="2" height="40" fill="#55515F"/><rect x="${r(px - 4)}" y="${r(py - 44)}" width="8" height="5" fill="${BLACK}"/>`
      s += `<rect x="${r(px - 3)}" y="${r(py - 40)}" width="6" height="1.6" fill="${active ? c : '#6E6A78'}"/>`
      if (active) {
        const [gx, gy] = iso(x + (j ? -1.4 : 1.4), T(room, 3.8))
        const dur = r(1.4 + j * 0.5)
        s += `<polygon points="${r(px - 2)},${r(py - 39)} ${r(px + 2)},${r(py - 39)} ${r(gx + 18)},${r(gy)} ${r(gx - 18)},${r(gy)}" fill="${c}" opacity=".14" pointer-events="none"><animate attributeName="opacity" values=".08;.22;.08" dur="${dur}s" repeatCount="indefinite"/></polygon>` +
          `<ellipse cx="${r(gx)}" cy="${r(gy)}" rx="18" ry="8" fill="${c}" opacity=".18" pointer-events="none"><animate attributeName="opacity" values=".1;.28;.1" dur="${dur}s" repeatCount="indefinite"/><animate attributeName="cx" values="${r(gx - 10)};${r(gx + 10)};${r(gx - 10)}" dur="${r(dur * 4)}s" repeatCount="indefinite"/></ellipse>` +
          `<circle cx="${r(px)}" cy="${r(py - 38)}" r="12" fill="url(#lamp)" class="lamp-light" pointer-events="none"/>`
      }
      parts.push({ t, svg: s })
    })
    const stations: Station[] = []
    const xs = columns(room, 1.4, 1.6)
    // keyboards on X stands; each player stands at its left end so the keys show by their right hand
    for (const px of xs) {
      const x = px + 0.35
      const t = KEYS_T
      const [lx, ly] = iso(x, T(room, t + 0.2))
      let s = `<path d="M${r(lx - 9)} ${r(ly)} L${r(lx + 7)} ${r(ly - 11)} M${r(lx + 9)} ${r(ly)} L${r(lx - 7)} ${r(ly - 11)}" stroke="#55515F" stroke-width="1.8"/>`
      s += boxT(room, x - 0.45, t, t + 0.4, 11, 0.9, 2.5, BLACK)
      const { y, d } = spanY(room, t + 0.08, t + 0.32)
      s += poly([iso(x - 0.38, y, 13.5), iso(x + 0.38, y, 13.5), iso(x + 0.38, y + d, 13.5), iso(x - 0.38, y + d, 13.5)], '#F4F1EA')
      // black keys on the far half of the keybed
      for (let j = 0; j < 5; j++) {
        const [kx, ky] = iso(x - 0.3 + j * 0.15, room.top ? y : y + d * 0.4, 13.5)
        s += `<rect x="${r(kx - 0.7)}" y="${r(ky - 0.6)}" width="1.6" height="2.6" fill="${BLACK}"/>`
      }
      parts.push({ t, svg: s })
      stations.push({ x: px, y: T(room, nearT(room, t, t + 0.4, 0.4)), kind: 'music' })
    }
    // amps with a guitar leaning on them and a mic stand beside each player
    xs.forEach((x, j) => {
      const t = AMPS_T
      let s = boxT(room, x + 0.25, t, t + 0.45, 0, 0.55, 11, BLACK) + boxT(room, x + 0.25, t, t + 0.45, 11, 0.55, 1.5, '#3B3846')
      const { y, d } = spanY(room, t, t + 0.45)
      s += onFace(x + 0.52, y + d, 5.5, `<rect x="-4" y="-3.5" width="8" height="6" fill="#4A4556"/><rect x="-4" y="-5.5" width="8" height="1.2" fill="${GOLD}"/><rect x="2" y="-5.3" width="1.2" height=".8" fill="${active ? '#FF4F6E' : '#5B4A6E'}"/>`)
      const [gx, gy] = iso(x + 0.85, y + d + 0.15)
      s += guitar(gx, gy, j % 2 ? lab.accent : ['#E2463A', '#4FA3E3', '#F2A23A'][j % 3]!)
      const [mx, my] = iso(x - 0.3, T(room, nearT(room, t, t + 0.45, 0.1)))
      s += `<path d="M${r(mx - 4)} ${r(my)} L${r(mx)} ${r(my - 2)} L${r(mx + 4)} ${r(my)}" stroke="#55515F" stroke-width="1.4" fill="none"/><rect x="${r(mx - 0.6)}" y="${r(my - 22)}" width="1.2" height="20" fill="#9A9AA6"/><rect x="${r(mx - 1.6)}" y="${r(my - 26)}" width="3.2" height="5" rx="1.4" fill="#3B3846"/>`
      parts.push({ t, svg: s })
      stations.push({ x, y: T(room, nearT(room, t, t + 0.45, 0.45)), kind: 'music' })
    })
    parts.sort((a, b) => (room.top ? a.t - b.t : b.t - a.t))
    // the robots listen from the side of the stage that is free in each row
    const spotT = room.top ? 6.6 : 1.3
    return { svg: rug + parts.map(p => p.svg).join(''), stations: withSpares(room, stations, 'music'), agentSpots: [0, 1, 2].map(n => ({ x: room.x0 + 1.9 + n * 1.4, y: T(room, spotT) })).filter(p => p.x < room.x1 - 1) }
  },
  // playing: headphones on, a quick nod on every beat and a note on every bar, in the puesto's colour
  work(seed, accent) {
    const beat = r(0.42 + (seed % 4) * 0.06)
    const b = r(((seed >> 3) % 8) * beat * 0.25)
    // down fast on the beat, back up slowly
    const move = `<animateTransform attributeName="transform" type="translate" values="0 0;0 2;0 0" keyTimes="0;.2;1" keySplines=".2 0 .4 1;.3 0 .6 1" calcMode="spline" dur="${beat}s" begin="${b}s" repeatCount="indefinite"/>`
    const phones =
      `<path d="M-13 -12 Q-13 -24 0 -24 Q13 -24 13 -12" stroke="#2A211C" stroke-width="3.4" fill="none"/><path d="M-13 -12 Q-13 -24 0 -24 Q13 -24 13 -12" stroke="${shade(accent, 0.6)}" stroke-width="2" fill="none"/>` +
      `<rect x="-16" y="-15" width="4.5" height="7" fill="${accent}" stroke="#2A211C" stroke-width=".6"/><rect x="11.5" y="-15" width="4.5" height="7" fill="${accent}" stroke="#2A211C" stroke-width=".6"/>`
    // one note per bar of four beats, three in flight at once
    const bar = r(beat * 4)
    const notes = ['♪', '♫', '♪']
      .map((n, k) => {
        const d = r(b + k * bar)
        const x0 = 8 + k * 3
        const life = `dur="${r(bar * 3)}s" begin="${d}s" repeatCount="indefinite"`
        return `<text x="${x0}" y="-24" font-size="${9 + (k % 2) * 2}" font-weight="700" fill="${shade(accent, 1.15)}" stroke="#2A211C" stroke-opacity=".5" stroke-width="1.5" paint-order="stroke" opacity="0">${n}` +
          `<animate attributeName="y" values="-24;-46" ${life}/><animate attributeName="x" values="${x0};${x0 + 4};${x0 - 1};${x0 + 3}" ${life}/>` +
          `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.6;1" ${life}/></text>`
      })
      .join('')
    // the headphones go over the sprite, so they nod with their own copy of the beat
    return { move, extra: `<g>${move}${phones}</g>` + notes }
  },
}
