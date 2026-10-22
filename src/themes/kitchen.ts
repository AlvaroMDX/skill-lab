import type { RoomGeom, Station, ThemeModule } from '../scene'
import { agentSpotsAt, boxT, columns, hash, iso, pts, r, T, withSpares } from '../scene'

const STEEL = '#B9BEC5'
const BLOCK = '#C89B6A'

const quad = (list: [number, number][], fill: string, inner = '') => `<polygon points="${pts(list)}" fill="${fill}">${inner}</polygon>`
const faceAt = (room: RoomGeom, x0: number, x1: number, t: number, z0: number, z1: number) => {
  const y = T(room, t)
  return [iso(x0, y, z0), iso(x1, y, z0), iso(x1, y, z1), iso(x0, y, z1)] as [number, number][]
}

function floorTiles(room: RoomGeom) {
  let d = ''
  for (let x = room.x0; x < room.x1; x++) {
    for (let y = room.y0; y < room.y1; y++) if ((x + y) % 2 === 0) d += `M${pts([iso(x, y)])}L${pts([iso(x + 1, y)])}L${pts([iso(x + 1, y + 1)])}L${pts([iso(x, y + 1)])}Z`
  }
  return `<path d="${d}" fill="#B8A68A" fill-opacity=".38" pointer-events="none"/>`
}

const steam = (cx: number, cy: number, begin: number) =>
  [0, 1.2]
    .map(o => `<circle cx="${r(cx)}" cy="${r(cy)}" r="2" fill="#FFF" opacity="0" pointer-events="none"><animate attributeName="opacity" values="0;.7;0" dur="2.4s" begin="${r(begin + o)}s" repeatCount="indefinite"/><animate attributeName="cy" values="${r(cy)};${r(cy - 20)}" dur="2.4s" begin="${r(begin + o)}s" repeatCount="indefinite"/><animate attributeName="r" values="2;5.5" dur="2.4s" begin="${r(begin + o)}s" repeatCount="indefinite"/></circle>`)
    .join('')

const flame = (cx: number, cy: number, begin: number) =>
  `<g transform="translate(${r(cx)},${r(cy)})"><path d="M-4 0q1 -6 4 -8q3 2 4 8z" fill="#FF8A3D"><animateTransform attributeName="transform" type="scale" values="1 1;1.1 1.4;.9 .8;1 1" dur=".45s" begin="${r(begin)}s" repeatCount="indefinite"/></path>` +
  `<path d="M-2 0q1 -3 2 -4q1 1 2 4z" fill="#FFE07A"/></g>`

function pot(cx: number, cy: number, color: string, active: boolean, begin: number) {
  return (
    `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="6" ry="3" fill="${color}"/><rect x="${r(cx - 6)}" y="${r(cy - 7)}" width="12" height="7" fill="${color}"/>` +
    `<rect x="${r(cx - 8)}" y="${r(cy - 6)}" width="2" height="2" fill="#3B3F46"/><rect x="${r(cx + 6)}" y="${r(cy - 6)}" width="2" height="2" fill="#3B3F46"/>` +
    `<ellipse cx="${r(cx)}" cy="${r(cy - 7)}" rx="6" ry="3" fill="#E8EBEE"/><ellipse cx="${r(cx)}" cy="${r(cy - 6.6)}" rx="4.8" ry="2.3" fill="#D9822B"/>` +
    (active ? steam(cx, cy - 9, begin) : '')
  )
}

function pan(cx: number, cy: number, active: boolean, begin: number) {
  return (
    `<rect x="${r(cx + 5)}" y="${r(cy - 2)}" width="8" height="2" fill="#4A3527"/><ellipse cx="${r(cx)}" cy="${r(cy - 1)}" rx="7" ry="3.5" fill="#2B2F35"/><ellipse cx="${r(cx)}" cy="${r(cy - 1.5)}" rx="5.5" ry="2.6" fill="#454B55"/>` +
    `<ellipse cx="${r(cx - 1)}" cy="${r(cy - 1.6)}" rx="3" ry="1.5" fill="#FFF"/><circle cx="${r(cx - 1)}" cy="${r(cy - 1.8)}" r="1.1" fill="#F2B21B"/>` +
    (active ? `<text x="${r(cx - 6)}" y="${r(cy - 6)}" font-size="5" font-weight="700" fill="#C8644A" opacity="0">tss<animate attributeName="opacity" values="0;1;0" dur="1.6s" begin="${r(begin)}s" repeatCount="indefinite"/></text>` : '')
  )
}

function board(room: RoomGeom, x: number, t: number) {
  const y0 = T(room, t - 0.2)
  const y1 = T(room, t + 0.2)
  let s = quad([iso(x - 0.3, y0, 14), iso(x + 0.3, y0, 14), iso(x + 0.3, y1, 14), iso(x - 0.3, y1, 14)], '#E7BE88')
  const [cx, cy] = iso(x, T(room, t), 14)
  s += `<rect x="${r(cx - 6)}" y="${r(cy - 2)}" width="7" height="2.4" rx="1" fill="#F07B2C"/><circle cx="${r(cx + 3)}" cy="${r(cy)}" r="1.4" fill="#F07B2C"/><circle cx="${r(cx + 5.5)}" cy="${r(cy + 0.5)}" r="1.4" fill="#F07B2C"/>`
  return s + `<rect x="${r(cx - 3)}" y="${r(cy - 5)}" width="6" height="1.4" fill="#D5D9DE"/><rect x="${r(cx + 3)}" y="${r(cy - 5)}" width="3" height="1.4" fill="#3B3F46"/>`
}

// a rail of ladle, spatula, whisk and frying pan hanging on the back wall
function utensils(room: RoomGeom, x0: number, x1: number) {
  const [ax, ay] = iso(x0, room.y0, 30)
  const [bx, by] = iso(x1, room.y0, 30)
  let s = `<path d="M${r(ax)} ${r(ay)}L${r(bx)} ${r(by)}" stroke="#7A7F87" stroke-width="1.6"/>`
  const n = Math.max(1, Math.floor((x1 - x0) / 0.45))
  for (let k = 0; k < n; k++) {
    const [hx, hy] = iso(x0 + 0.25 + k * 0.45, room.y0, 30)
    const sway = `<animateTransform attributeName="transform" type="rotate" values="-3;3;-3" dur="${r(2.6 + (k % 3) * 0.4)}s" repeatCount="indefinite"/>`
    const item = [
      `<rect x="-.6" y="0" width="1.2" height="9" fill="#9AA0A8"/><ellipse cx="0" cy="10" rx="2.6" ry="1.8" fill="#9AA0A8"/>`,
      `<rect x="-.6" y="0" width="1.2" height="7" fill="#6E4A30"/><rect x="-2" y="7" width="4" height="4" fill="#3B3F46"/>`,
      `<rect x="-.6" y="0" width="1.2" height="5" fill="#9AA0A8"/><ellipse cx="0" cy="8" rx="2" ry="3.4" fill="none" stroke="#C3C7CC" stroke-width=".8"/>`,
      `<rect x="-.6" y="0" width="1.2" height="5" fill="#2B2F35"/><circle cx="0" cy="9" r="4" fill="#2B2F35"/><circle cx="0" cy="9" r="2.8" fill="#454B55"/>`,
    ][k % 4]
    s += `<g transform="translate(${r(hx)},${r(hy)})"><g>${sway}${item}</g></g>`
  }
  return s
}

export const kitchen: ThemeModule = {
  floor: '#ECE6DA',
  furnish(room, lab, active) {
    const parts: { t: number; svg: string }[] = []
    const w = room.x1 - room.x0

    // the range along the far wall: steel stoves with ovens, burners, pots and flames
    let wall = ''
    if (room.top) {
      wall += quad([iso(room.x0 + 0.2, room.y0, 14), iso(room.x1 - 0.2, room.y0, 14), iso(room.x1 - 0.2, room.y0, 31), iso(room.x0 + 0.2, room.y0, 31)], '#F4F2EC')
      let grout = ''
      for (let x = room.x0 + 0.6; x < room.x1 - 0.2; x += 0.4) grout += `M${pts([iso(x, room.y0, 14)])}L${pts([iso(x, room.y0, 31)])}`
      for (const z of [18, 22.5, 27]) grout += `M${pts([iso(room.x0 + 0.2, room.y0, z)])}L${pts([iso(room.x1 - 0.2, room.y0, z)])}`
      wall += `<path d="${grout}" stroke="#D8D3C8" stroke-width=".8"/>`
    }
    const units: number[] = []
    for (let x = room.x0 + 0.3; x + 1.2 <= room.x1 - 0.3; x += 1.25) units.push(x)
    units.forEach((x, k) => {
      wall += boxT(room, x, 0.1, 0.8, 0, 1.2, 14, STEEL)
      wall += quad(faceAt(room, x + 0.12, x + 1.08, 0.8, 2, 10), '#3B3F46') + quad(faceAt(room, x + 0.3, x + 0.9, 0.8, 4, 8), active ? '#FF9A4A' : '#5A4A42', active ? `<animate attributeName="opacity" values="1;.6;1" dur="${r(1.2 + k * 0.3)}s" repeatCount="indefinite"/>` : '')
      wall += quad(faceAt(room, x + 0.1, x + 1.1, 0.8, 11, 12.4), '#8C9199')
      for (const [j, bx] of [x + 0.32, x + 0.88].entries()) {
        const [cx, cy] = iso(bx, T(room, 0.45), 14)
        const seed = hash(`${room.id}${k}${j}`)
        wall += `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="5" ry="2.5" fill="#2B2F35"/>`
        if (active) wall += flame(cx, cy + 0.5, (seed % 7) / 10)
        if ((k + j) % 2 === 0) wall += pot(cx, cy - 1, j ? lab.accent : '#C8423A', active, (seed % 11) / 10)
        else if (k % 2 === 0) wall += pan(cx, cy, active, (seed % 9) / 10)
      }
    })
    // the extractor hood stays under the sign: on a top room only, above the stoves
    if (room.top) {
      const hw = Math.min(3, w - 2.4)
      const hx = room.x0 + 0.4
      wall += boxT(room, hx - 0.1, 0.05, 0.85, 22, hw + 0.2, 2.5, '#A2A8B0') + boxT(room, hx + 0.3, 0.05, 0.55, 24.5, hw - 0.6, 6, '#B9BEC5')
      for (let x = hx + 0.3; x < hx + hw; x += 0.9) {
        const [lx, ly] = iso(x, T(room, 0.85), 22)
        wall += `<rect x="${r(lx - 2)}" y="${r(ly - 1)}" width="4" height="1.6" fill="#FFE6A0" opacity="${active ? 1 : 0.4}"/>`
      }
      wall += utensils(room, hx + hw + 0.3, room.x1 - 0.3)
    }
    parts.push({ t: 0, svg: wall })

    // two islands with a butcher-block top, a pot, a pan or a cutting board at every place
    const stations: Station[] = []
    for (const t of [2.5, 4.9]) {
      let s = boxT(room, room.x0 + 1, t, t + 0.8, 0, w - 2.4, 12, STEEL) + boxT(room, room.x0 + 0.95, t - 0.05, t + 0.85, 12, w - 2.3, 2, BLOCK)
      for (let x = room.x0 + 1.4; x < room.x1 - 1.6; x += 0.7) s += quad(faceAt(room, x, x + 0.4, t + 0.8, 7, 7.8), '#7A7F87')
      columns(room, 1.4, 1.6).forEach((x, k) => {
        const seed = hash(`${room.id}${x}${t}`)
        const [cx, cy] = iso(x, T(room, t + 0.4), 14)
        const kind = (k + (t > 3 ? 1 : 0)) % 3
        s += kind === 0 ? pot(cx, cy, k % 2 ? lab.accent : '#5E6A7A', active, (seed % 13) / 10) : kind === 1 ? pan(cx, cy, active, (seed % 9) / 10) : board(room, x, t + 0.4)
        stations.push({ x, y: T(room, t + 0.8 + 0.45), kind: 'kitchen' })
      })
      parts.push({ t, svg: s })
    }
    parts.sort((a, b) => (room.top ? a.t - b.t : b.t - a.t))
    return { svg: floorTiles(room) + parts.map(p => p.svg).join(''), stations: withSpares(room, stations, 'kitchen'), agentSpots: agentSpotsAt(room, 1.3) }
  },
  work(seed, accent) {
    const b = r((seed % 14) / 10)
    const flip = seed % 2 === 1
    const tool = flip
      ? // tossing a pancake: the pan jerks up and the pancake jumps out and back
        `<g transform="translate(8,-9)"><g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="1.3s" begin="${b}s" repeatCount="indefinite"/>` +
        `<rect x="5" y="-1" width="6" height="1.6" fill="#4A3527"/><ellipse rx="6" ry="2.4" fill="#2B2F35"/></g>` +
        `<ellipse rx="3.6" ry="1.4" fill="#E9B45F"><animate attributeName="cy" values="-1;-14;-1" keyTimes="0;.45;1" dur="1.3s" begin="${b}s" repeatCount="indefinite"/></ellipse></g>`
      : // stirring a pot with a wooden spoon
        `<g transform="translate(9,-8)"><ellipse cy="2" rx="5.5" ry="2.4" fill="${accent}"/><rect x="-5.5" y="-3" width="11" height="5" fill="${accent}"/><ellipse cy="-3" rx="5.5" ry="2.4" fill="#D9822B"/>` +
        `<g><animateTransform attributeName="transform" type="rotate" values="-25;25;-25" dur=".9s" begin="${b}s" repeatCount="indefinite"/><rect x="-.7" y="-12" width="1.4" height="10" fill="#A27552"/></g></g>` +
        steam(9, -12, b)
    return {
      move: `<animateTransform attributeName="transform" type="rotate" values="-3;3;-3" dur="${flip ? 1.3 : 0.9}s" begin="${b}s" repeatCount="indefinite"/>`,
      extra:
        tool +
        `<text x="-14" y="-22" font-size="8" opacity="0">${flip ? '🍳' : '🔥'}<animate attributeName="opacity" values="0;0;1;0" keyTimes="0;.7;.8;1" dur="5.4s" begin="${b}s" repeatCount="indefinite"/></text>` +
        `<text x="8" y="-26" font-size="6" fill="#FF8A3D" opacity="0">✦<animate attributeName="opacity" values="0;1;0" dur="1.7s" begin="${r(b + 0.5)}s" repeatCount="indefinite"/></text>`,
    }
  },
}
