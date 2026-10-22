import type { RoomGeom, Station, ThemeModule } from '../scene'
import { agentSpotsAt, boxT, columns, hash, iso, pts, r, shade, T, withSpares } from '../scene'

const HOLO = '#6FE3FF'
const SCREENS = ['#6FE3FF', '#7CF0A0', '#FFB454', '#B48CFF']
const HULL = '#4C566A'

const quad = (list: [number, number][], fill: string, inner = '') => `<polygon points="${pts(list)}" fill="${fill}">${inner}</polygon>`
const blink = (dur: number, begin: number, low = 0.35) => `<animate attributeName="opacity" values="1;${low};1;.8;1" dur="${r(dur)}s" begin="${r(begin)}s" repeatCount="indefinite"/>`

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
    `<circle r="9" fill="none" stroke="#FFF" stroke-opacity=".25" stroke-width="1.5"/><circle cx="-4" cy="-4" r="2" fill="#FFF" opacity=".25"/></g>`
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
    let wall = boxT(room, room.x0 + 0.3, 0.1, 0.7, 0, wallEnd - room.x0 - 0.3, 16, HULL)
    for (let x = room.x0 + 0.5, k = 0; x + 0.8 < wallEnd; x += 1.1, k++) {
      const c = SCREENS[k % SCREENS.length]!
      wall += quad(faceAt(room, x, x + 0.8, 0.7, 7, 14), '#11161F') + quad(faceAt(room, x + 0.08, x + 0.72, 0.7, 8, 13), c, active ? blink(1 + (k % 3) * 0.45, k * 0.2) : '')
      const [lx, ly] = iso(x + 0.2, T(room, 0.7), 4)
      wall += `<rect x="${r(lx)}" y="${r(ly - 1)}" width="2" height="2" fill="${k % 2 ? '#FF6B6B' : '#7CF0A0'}">${blink(0.6 + k * 0.17, k * 0.1, 0.1)}</rect>`
    }
    if (room.top) wall += porthole(room, room.x1 - 1.2)
    parts.push({ t: 0, svg: wall })

    const stations: Station[] = []
    for (const t of [2.4, 4.8]) {
      let s = boxT(room, room.x0 + 1, t, t + 0.8, 0, w - 2.4, 11, HULL) + boxT(room, room.x0 + 1, t, t + 0.8, 11, w - 2.4, 1.2, '#6B7689')
      columns(room, 1.4, 1.6).forEach((x, k) => {
        const c = k % 2 ? lab.accent : SCREENS[(k + (t > 3 ? 1 : 0)) % SCREENS.length]!
        s += boxT(room, x - 0.32, t + 0.15, t + 0.28, 12.2, 0.64, 10, '#232833')
        s += quad(faceAt(room, x - 0.26, x + 0.26, t + 0.28, 14, 21), c, active ? blink(1.3 + (hash(`${room.id}${x}${t}`) % 9) / 10, k * 0.3) : '<set attributeName="opacity" to=".35"/>')
        const [kx, ky] = iso(x, T(room, t + 0.6), 12.2)
        s += `<rect x="${r(kx - 4)}" y="${r(ky - 1)}" width="8" height="2" fill="#1C212B"/>`
        stations.push({ x, y: T(room, t + 0.8 + 0.45), kind: 'space' })
      })
      parts.push({ t, svg: s })
    }
    parts.push({ t: 3.7, svg: hologram(room, room.x1 - 0.85, 3.7, active) })
    // a cargo crate with hazard stripes in the front corner
    {
      const x = room.x1 - 1.2
      let s = boxT(room, x, 6.3, 6.9, 0, 0.7, 9, '#8C95A6')
      const [cx, cy] = iso(x + 0.35, T(room, room.top ? 6.9 : 6.3), 5)
      s += `<path d="M${r(cx - 6)} ${r(cy - 1)}l3 -3m1 4l3 -3m1 4l3 -3" stroke="#F2C14E" stroke-width="2"/>`
      parts.push({ t: 6.3, svg: s })
    }
    parts.sort((a, b) => (room.top ? a.t - b.t : b.t - a.t))
    const svg = floorPlates(room) + parts.map(p => p.svg).join('')
    return { svg, stations: withSpares(room, stations, 'space'), agentSpots: agentSpotsAt(room, 1.3) }
  },
  work(seed, accent) {
    const b = r((seed % 14) / 10)
    const spin = seed % 2 ? 8 : -8
    return {
      // zero gravity: a slow drift up and down with a gentle roll
      move:
        `<animateTransform attributeName="transform" type="translate" values="0 -3;0 -10;0 -3" dur="3.4s" begin="${b}s" repeatCount="indefinite"/>` +
        `<animateTransform attributeName="transform" type="rotate" values="${-spin};${spin};${-spin}" dur="5.2s" begin="${b}s" repeatCount="indefinite" additive="sum"/>`,
      extra:
        `<ellipse cy="1" rx="8" ry="3" fill="#000" opacity=".25"><animate attributeName="rx" values="8;5;8" dur="3.4s" begin="${b}s" repeatCount="indefinite"/></ellipse>` +
        [0, 1, 2]
          .map(k => `<text x="${-12 + k * 11}" y="${-26 + (k % 2) * 6}" font-size="7" fill="${k === 1 ? HOLO : accent}" opacity="0">✦<animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="${r(b + k * 0.8)}s" repeatCount="indefinite"/></text>`)
          .join('') +
        `<text x="11" y="-16" font-size="6.5" font-weight="700" fill="${shade(HOLO, 0.8)}" opacity="0">bip<animate attributeName="opacity" values="0;0;1;0" keyTimes="0;.7;.78;1" dur="3.6s" begin="${b}s" repeatCount="indefinite"/></text>`,
    }
  },
}
