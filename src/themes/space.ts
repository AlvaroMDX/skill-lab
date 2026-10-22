import type { RoomGeom, Station, ThemeModule } from '../scene'
import { boxT, columns, hash, iso, pts, r, shade, T, withSpares } from '../scene'

const HOLO = '#6FE3FF'
const SCREENS = ['#6FE3FF', '#7CF0A0', '#FFB454', '#B48CFF']
const HULL = '#4C566A'
const DESK_DEPTH = 0.8

const quad = (list: [number, number][], fill: string, inner = '') => `<polygon points="${pts(list)}" fill="${fill}">${inner}</polygon>`
const blink = (dur: number, begin: number, low = 0.35) => `<animate attributeName="opacity" values="1;${low};1;.8;1" dur="${r(dur)}s" begin="${r(begin)}s" repeatCount="indefinite"/>`

// t of the side of [ta, tb] nearest to the viewer, pushed out by gap: rows below see the far wall up front
const nearT = (room: RoomGeom, ta: number, tb: number, gap: number) => (room.top ? tb + gap : ta - gap)
// t at depth o into [ta, tb] measured from the side away from the viewer, so both rows look alike
const backT = (room: RoomGeom, ta: number, tb: number, o: number) => (room.top ? ta + o : tb - o)

// a rectangle on the vertical plane at distance t from the far wall, facing the room
const faceAt = (room: RoomGeom, x0: number, x1: number, t: number, z0: number, z1: number) => {
  const y = T(room, t)
  return [iso(x0, y, z0), iso(x1, y, z0), iso(x1, y, z1), iso(x0, y, z1)] as [number, number][]
}

function floorPlates(room: RoomGeom) {
  let seams = ''
  let bolts = ''
  for (let x = room.x0 + 2; x < room.x1; x += 2) seams += `M${pts([iso(x, room.y0)])}L${pts([iso(x, room.y1)])}`
  for (let y = room.y0 + 2; y < room.y1; y += 2) seams += `M${pts([iso(room.x0, y)])}L${pts([iso(room.x1, y)])}`
  for (let x = room.x0 + 0.25; x < room.x1; x += 2) {
    for (let y = room.y0 + 0.25; y < room.y1; y += 2) {
      for (const [bx, by] of [iso(x, y), iso(x + 1.5, y), iso(x, y + 1.5), iso(x + 1.5, y + 1.5)]) bolts += `M${r(bx - 0.8)} ${r(by - 0.5)}h1.6v1h-1.6z`
    }
  }
  return `<path d="${seams}" stroke="#1C212B" stroke-width="1.4" stroke-opacity=".7" fill="none" pointer-events="none"/><path d="${bolts}" fill="#5B6577" pointer-events="none"/>`
}

// porthole on the back wall with twinkling stars and a slow passing comet
function porthole(room: RoomGeom, x: number) {
  const [tx, ty] = iso(x, room.y0, 22)
  const stars = [[-4, -3], [3, -5], [5, 2], [-2, 4], [0, -1], [-6, 1]]
    .map(([sx, sy], k) => `<rect x="${sx}" y="${sy}" width="1.2" height="1.2" fill="#FFF">${blink(1.4 + k * 0.37, k * 0.3, 0.1)}</rect>`)
    .join('')
  return (
    `<g transform="matrix(1,0.5,0,1,${r(tx)},${r(ty)})"><circle r="11" fill="#8C95A6"/><circle r="9" fill="#0E1424"/>` +
    `<clipPath id="ph-${room.id}"><circle r="9"/></clipPath><g clip-path="url(#ph-${room.id})">${stars}` +
    `<circle r="3.5" cx="-3" cy="5" fill="#C8644A"/><circle r="1.4" fill="#FFF"><animate attributeName="cx" values="-12;12" dur="7s" repeatCount="indefinite"/><animate attributeName="cy" values="-8;-2" dur="7s" repeatCount="indefinite"/></circle></g>` +
    `<circle r="9" fill="none" stroke="#FFF" stroke-opacity=".25" stroke-width="1.5"/><circle cx="-4" cy="-4" r="2" fill="#FFF" opacity=".25"/>` +
    [0, 90, 180, 270].map(a => `<rect x="-1" y="-11" width="2" height="2" fill="#5B6577" transform="rotate(${a})"/>`).join('') + `</g>`
  )
}

// rotating planet hologram over a projector pedestal
function hologram(room: RoomGeom, x: number, t: number, active: boolean) {
  let s = boxT(room, x - 0.3, t - 0.3, t + 0.3, 0, 0.6, 5, '#3B4252')
  const [bx, by] = iso(x, T(room, t), 5)
  const [px, py] = [bx, by - 26]
  s += `<ellipse cx="${r(bx)}" cy="${r(by)}" rx="6" ry="3" fill="${HOLO}" opacity=".8">${blink(1.1, 0, 0.5)}</ellipse>`
  s += `<polygon points="${pts([[bx - 5, by], [bx + 5, by], [px + 10, py], [px - 10, py]])}" fill="${HOLO}" opacity=".14" pointer-events="none"/>`
  const lands = (dx: number) => `<path d="M${dx - 7} -3 q3 -4 6 -1 q2 3 -2 5 q-4 1 -4 -4z M${dx + 2} 2 q4 -2 5 2 q-2 3 -5 1z M${dx - 2} -8 q3 0 3 2 q-3 1 -3 -2z" fill="${HOLO}" opacity=".75"/>`
  s +=
    `<g transform="translate(${r(px)},${r(py)})" pointer-events="none"><g opacity=".85">${active ? blink(2.6, 0.4, 0.6) : ''}` +
    `<circle r="9" fill="${HOLO}" fill-opacity=".22" stroke="${HOLO}" stroke-width="1"/>` +
    `<clipPath id="hl-${room.id}"><circle r="9"/></clipPath><g clip-path="url(#hl-${room.id})"><g>${lands(0)}${lands(18)}` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;-18 0" dur="${active ? 4 : 9}s" repeatCount="indefinite"/></g></g>` +
    `<ellipse rx="14" ry="3.5" fill="none" stroke="${HOLO}" stroke-width="1" stroke-dasharray="3 2"><animate attributeName="stroke-dashoffset" values="0;10" dur="1.5s" repeatCount="indefinite"/></ellipse>` +
    `<circle r="1.2" fill="#FFF"><animateMotion path="M14 0 A14 3.5 0 1 1 -14 0 A14 3.5 0 1 1 14 0" dur="3s" repeatCount="indefinite"/></circle></g></g>`
  return s
}

export const space: ThemeModule = {
  floor: '#2F3542',
  furnish(room, lab, active) {
    const parts: { t: number; svg: string }[] = []
    const w = room.x1 - room.x0
    // the back wall of a top room has room for a porthole beside the consoles
    const wallEnd = room.top ? room.x1 - 2.2 : room.x1 - 0.3
    let wall = ''
    if (room.top) {
      wall += boxT(room, room.x0 + 0.3, 0.1, 0.7, 0, wallEnd - room.x0 - 0.3, 16, HULL)
      for (let x = room.x0 + 0.5, k = 0; x + 0.8 < wallEnd; x += 1.1, k++) {
        const c = SCREENS[k % SCREENS.length]!
        wall += quad(faceAt(room, x, x + 0.8, 0.7, 7, 14), '#11161F') + quad(faceAt(room, x + 0.08, x + 0.72, 0.7, 8, 13), c, active ? blink(1 + (k % 3) * 0.45, k * 0.2) : '')
        const [lx, ly] = iso(x + 0.2, T(room, 0.7), 4)
        wall += `<rect x="${r(lx)}" y="${r(ly - 1)}" width="2" height="2" fill="${k % 2 ? '#FF6B6B' : '#7CF0A0'}">${blink(0.6 + k * 0.17, k * 0.1, 0.1)}</rect>`
      }
      wall += porthole(room, room.x1 - 1.2)
    } else {
      // up front in a row below we see the low back of the wall consoles: vents and status lights
      wall += boxT(room, room.x0 + 0.3, 0.1, 0.7, 0, wallEnd - room.x0 - 0.3, 9, HULL)
      let vents = ''
      for (let x = room.x0 + 0.6; x + 0.6 < wallEnd; x += 1.1) for (const z of [3, 5]) vents += `M${pts([iso(x, T(room, 0.1), z)])}L${pts([iso(x + 0.6, T(room, 0.1), z)])}`
      wall += `<path d="${vents}" stroke="#1C212B" stroke-width="1"/>`
      for (let x = room.x0 + 0.6, k = 0; x < wallEnd; x += 0.55, k++) {
        const [lx, ly] = iso(x, T(room, 0.4), 9)
        wall += `<rect x="${r(lx - 1)}" y="${r(ly - 1)}" width="2" height="1.4" fill="${k % 3 ? '#7CF0A0' : '#FF6B6B'}">${blink(0.6 + k * 0.13, k * 0.1, 0.1)}</rect>`
      }
    }
    parts.push({ t: 0, svg: wall })

    const stations: Station[] = []
    for (const ta of [2.0, 5.2]) {
      const tb = ta + DESK_DEPTH
      let s = boxT(room, room.x0 + 1, ta, tb, 0, w - 2.4, 11, HULL) + boxT(room, room.x0 + 1, ta, tb, 11, w - 2.4, 1.2, '#6B7689')
      // a lit strip along the side that faces the viewer
      s += quad(faceAt(room, room.x0 + 1.1, room.x1 - 1.5, nearT(room, ta, tb, 0), 8, 9), shade(lab.accent, 1.1), active ? blink(2.4, ta * 0.3, 0.5) : '<set attributeName="opacity" to=".4"/>')
      columns(room, 1.4, 1.6).forEach((x, k) => {
        const c = k % 2 ? lab.accent : SCREENS[(k + (ta > 3 ? 1 : 0)) % SCREENS.length]!
        // monitor at the back of the desk, its screen turned to the player in front
        const m0 = backT(room, ta, tb, 0.15)
        const m1 = backT(room, ta, tb, 0.28)
        s += boxT(room, x - 0.32, Math.min(m0, m1), Math.max(m0, m1), 12.2, 0.64, 10, '#232833')
        const seed = hash(`${room.id}${x}${ta}`)
        s += quad(faceAt(room, x - 0.26, x + 0.26, m1, 14, 21), c, active ? blink(1.3 + (seed % 9) / 10, k * 0.3) : '<set attributeName="opacity" to=".35"/>')
        if (active) {
          // a few lines of text scrolling on the screen
          const [sx, sy] = iso(x - 0.2, T(room, m1), 19)
          s += `<g transform="matrix(1,0.5,0,1,${r(sx)},${r(sy)})"><path d="M0 0h5M0 2h3M0 4h6" stroke="#0E1424" stroke-opacity=".5" stroke-width=".8"><animateTransform attributeName="transform" type="translate" values="0 0;0 -2" dur=".8s" begin="${r((seed % 7) / 10)}s" repeatCount="indefinite"/></path></g>`
        }
        const [kx, ky] = iso(x, T(room, backT(room, ta, tb, 0.6)), 12.2)
        s += `<path d="M${r(kx - 5)} ${r(ky)}l4 2l5 -2.5l-4 -2z" fill="#1C212B"/><rect x="${r(kx - 2)}" y="${r(ky - 0.4)}" width="1.2" height=".8" fill="${c}" opacity=".8"/>`
        stations.push({ x, y: T(room, nearT(room, ta, tb, 0.45)), kind: 'space' })
      })
      parts.push({ t: ta, svg: s })
    }
    parts.push({ t: 3.7, svg: hologram(room, room.x1 - 0.85, 3.7, active) })
    // a cargo crate with hazard stripes in the corner by the door
    {
      const x = room.x1 - 1.2
      let s = boxT(room, x, 6.3, 6.9, 0, 0.7, 9, '#8C95A6')
      const [cx, cy] = iso(x + 0.35, T(room, room.top ? 6.9 : 6.3), 5)
      s += `<path d="M${r(cx - 6)} ${r(cy - 1)}l3 -3m1 4l3 -3m1 4l3 -3" stroke="#F2C14E" stroke-width="2"/>`
      parts.push({ t: 6.3, svg: s })
    }
    parts.sort((a, b) => (room.top ? a.t - b.t : b.t - a.t))
    const svg = floorPlates(room) + parts.map(p => p.svg).join('')
    // the robots wait between the far wall and the first desks above, by the door below
    const spotT = room.top ? 1.2 : 6.75
    return { svg, stations: withSpares(room, stations, 'space'), agentSpots: [0, 1, 2].map(k => ({ x: room.x0 + 1.9 + k * 1.4, y: T(room, spotT) })).filter(p => p.x < room.x1 - 1) }
  },
  // zero gravity: drifts up and down with a slow roll, the shadow on the floor shrinks and fades as it rises,
  // a lost tool tumbles nearby and the console behind answers with a bip
  work(seed, accent) {
    const b = r((seed % 23) / 10)
    const dur = r(3.2 + (seed % 5) * 0.25)
    const roll = seed % 2 ? 9 : -9
    const ease = `keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" calcMode="spline" dur="${dur}s" begin="${b}s" repeatCount="indefinite"`
    const float = `<animateTransform attributeName="transform" type="translate" values="0 -4;0 -12;0 -4" ${ease}/>`
    // the roll turns around the body's centre, not the feet
    const turn = `<animateTransform attributeName="transform" type="rotate" values="${-roll} 0 -9;${roll} 0 -9;${-roll} 0 -9" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" calcMode="spline" dur="${r(dur * 1.6)}s" begin="${b}s" repeatCount="indefinite" additive="sum"/>`
    const shadow = `<ellipse rx="12" ry="3.6" fill="#000" opacity=".26"><animate attributeName="rx" values="12;7;12" ${ease}/><animate attributeName="opacity" values=".26;.12;.26" ${ease}/></ellipse>`
    // a spanner drifting in a slow loop, spinning on itself
    const tool =
      `<g transform="translate(-17,-20)"><g><animateTransform attributeName="transform" type="translate" values="0 0;3 -5;0 -8;-3 -4;0 0" dur="${r(dur * 2)}s" begin="${b}s" repeatCount="indefinite"/>` +
      `<g><animateTransform attributeName="transform" type="rotate" from="${seed % 2 ? 0 : 360}" to="${seed % 2 ? 360 : 0}" dur="${r(4 + (seed % 3))}s" repeatCount="indefinite"/>` +
      `<rect x="-4" y="-0.8" width="8" height="1.6" fill="#B9BEC5"/><path d="M-6 -2.2h3v1.2h-1.6v2h1.6v1.2h-3z" fill="#B9BEC5"/><rect x="3.4" y="-1.6" width="2.4" height="3.2" fill="${accent}"/></g></g></g>`
    const sparks = [0, 1, 2]
      .map(k => `<text x="${-12 + k * 11}" y="${-28 + (k % 2) * 6}" font-size="7" fill="${k === 1 ? HOLO : accent}" opacity="0">✦<animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="${r(b + k * 0.8)}s" repeatCount="indefinite"/></text>`)
      .join('')
    // the console sits behind and to the right: its reply pops up over it
    const bip = `<text x="14" y="-30" font-size="6.5" font-weight="700" fill="${shade(HOLO, 0.8)}" stroke="#0E1424" stroke-width="1.6" paint-order="stroke" opacity="0">bip<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.7;.74;.9;1" dur="${r(dur * 1.5)}s" begin="${b}s" repeatCount="indefinite"/><animate attributeName="y" values="-28;-28;-28;-33;-33" keyTimes="0;.7;.74;.9;1" dur="${r(dur * 1.5)}s" begin="${b}s" repeatCount="indefinite"/></text>`
    return { move: float + turn, extra: shadow + tool + sparks + bip }
  },
}
