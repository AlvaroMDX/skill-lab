import type { RoomGeom, Station, ThemeModule } from '../scene'
import { boxT, columns, hash, iso, pts, r, shade, T, withSpares } from '../scene'

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

// a cook stands this far in front of the island, and works on the middle of its top
const GAP = 0.45
const ISLAND_DEPTH = 0.8
const TOP_Z = 14
// t of the side of [ta, tb] nearest to the viewer, pushed out by gap: rows below see the far wall up front
const nearT = (room: RoomGeom, ta: number, tb: number, gap: number) => (room.top ? tb + gap : ta - gap)

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
    if (room.top) for (let x = room.x0 + 0.3; x + 1.2 <= room.x1 - 0.3; x += 1.25) units.push(x)
    else {
      // up front in a row below a range would hide the cooks: low crates of vegetables instead
      const veg = ['#E2463A', '#F07B2C', '#7FB04F', '#F2C14E', '#B05BB0']
      for (let x = room.x0 + 0.4, k = 0; x + 0.7 <= room.x1 - 0.3; x += 0.85, k++) {
        wall += boxT(room, x, 0.15, 0.75, 0, 0.7, 5, '#B8894E')
        const c = veg[k % veg.length]!
        for (const [dx, dt] of [[0.18, 0.3], [0.42, 0.3], [0.3, 0.55], [0.55, 0.55]] as const) {
          const [vx, vy] = iso(x + dx, T(room, dt), 5)
          wall += `<circle cx="${r(vx)}" cy="${r(vy - 1.5)}" r="2.2" fill="${c}"/><rect x="${r(vx - 1)}" y="${r(vy - 3)}" width="1" height="1" fill="#FFF" opacity=".4"/>`
        }
      }
    }
    units.forEach((x, k) => {
      wall += boxT(room, x, 0.1, 0.8, 0, 1.2, 14, STEEL)
      wall += quad(faceAt(room, x + 0.12, x + 1.08, 0.8, 2, 10), '#3B3F46') + quad(faceAt(room, x + 0.3, x + 0.9, 0.8, 4, 8), active ? '#FF9A4A' : '#5A4A42', active ? `<animate attributeName="opacity" values="1;.6;1" dur="${r(1.2 + k * 0.3)}s" repeatCount="indefinite"/>` : '')
      wall += quad(faceAt(room, x + 0.1, x + 1.1, 0.8, 11, 12.4), '#8C9199')
      if (active) {
        // the oven glow carries on at night
        const [gx, gy] = iso(x + 0.6, T(room, 0.8), 6)
        wall += `<ellipse cx="${r(gx)}" cy="${r(gy)}" rx="12" ry="7" fill="url(#lamp)" class="lamp-light" pointer-events="none"/>`
      }
      for (const [j, bx] of [x + 0.32, x + 0.88].entries()) {
        const [cx, cy] = iso(bx, T(room, 0.45), 14)
        const seed = hash(`${room.id}${k}${j}`)
        wall += `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="5" ry="2.5" fill="#2B2F35"/><ellipse cx="${r(cx)}" cy="${r(cy)}" rx="3" ry="1.4" fill="none" stroke="#454B55" stroke-width=".8"/>`
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
        if (active) wall += `<ellipse cx="${r(lx)}" cy="${r(ly + 9)}" rx="8" ry="10" fill="url(#lamp)" class="lamp-light" pointer-events="none"/>`
      }
      wall += utensils(room, hx + hw + 0.3, room.x1 - 0.3)
    }
    parts.push({ t: 0, svg: wall })

    // two islands with a butcher-block top, a pot, a pan or a cutting board at every place
    const stations: Station[] = []
    for (const t of [2.0, 5.2]) {
      let s = boxT(room, room.x0 + 1, t, t + ISLAND_DEPTH, 0, w - 2.4, 12, STEEL) + boxT(room, room.x0 + 0.95, t - 0.05, t + ISLAND_DEPTH + 0.05, 12, w - 2.3, 2, BLOCK)
      // drawer handles on the side the cooks stand at
      const ht = nearT(room, t, t + ISLAND_DEPTH, 0)
      for (let x = room.x0 + 1.4; x < room.x1 - 1.6; x += 0.7) s += quad(faceAt(room, x, x + 0.4, ht, 7, 7.8), '#7A7F87')
      columns(room, 1.4, 1.6).forEach((x, k) => {
        const seed = hash(`${room.id}${x}${t}`)
        const [cx, cy] = iso(x, T(room, t + ISLAND_DEPTH / 2), TOP_Z)
        const kind = (k + (t > 3 ? 1 : 0)) % 3
        s += kind === 0 ? pot(cx, cy, k % 2 ? lab.accent : '#5E6A7A', active, (seed % 13) / 10) : kind === 1 ? pan(cx, cy, active, (seed % 9) / 10) : board(room, x, t + ISLAND_DEPTH / 2)
        stations.push({ x, y: T(room, nearT(room, t, t + ISLAND_DEPTH, GAP)), kind: 'kitchen' })
      })
      parts.push({ t, svg: s })
    }
    parts.sort((a, b) => (room.top ? a.t - b.t : b.t - a.t))
    // the robots wait between the range and the first island above, by the door below
    const spotT = room.top ? 1.3 : 6.75
    return { svg: floorTiles(room) + parts.map(p => p.svg).join(''), stations: withSpares(room, stations, 'kitchen'), agentSpots: [0, 1, 2].map(n => ({ x: room.x0 + 1.9 + n * 1.4, y: T(room, spotT) })).filter(p => p.x < room.x1 - 1) }
  },
  // cooking on the island behind: stirring a pot, sautéing in a pan or chopping on a board, all on the spot where the island's own piece sits
  work(seed, accent) {
    const b = r((seed % 19) / 10)
    // middle of the island top, seen from the cook's feet
    const ox = r((GAP + ISLAND_DEPTH / 2) * 18)
    const oy = r(-(GAP + ISLAND_DEPTH / 2) * 9 - TOP_Z)
    const kind = seed % 3
    const lean = (dur: number) => `<animateTransform attributeName="transform" type="rotate" values="1;4;1" keyTimes="0;.5;1" keySplines=".4 0 .6 1;.4 0 .6 1" calcMode="spline" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/>`
    let tool = ''
    let dur = 1
    if (kind === 0) {
      // stirring: the spoon handle circles over the pot, the steam rises from its middle
      dur = r(1.1 + (seed % 4) * 0.1)
      tool =
        `<g transform="translate(${ox},${oy})"><ellipse cy="1" rx="6.4" ry="3" fill="${shade(accent, 0.7)}"/><rect x="-6.4" y="-6" width="12.8" height="7" fill="${accent}"/><rect x="2" y="-5" width="3" height="5" fill="#000" opacity=".12"/>` +
        `<ellipse cy="-6" rx="6.4" ry="3" fill="${shade(accent, 1.2)}"/><ellipse cy="-5.6" rx="5" ry="2.2" fill="#D9822B"/>` +
        `<g><animateMotion path="M3 -6 A3.4 1.4 0 1 1 -3 -6 A3.4 1.4 0 1 1 3 -6" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/><rect x="-.7" y="-12" width="1.4" height="7" fill="#A27552"/><ellipse cy="-5" rx="1.4" ry=".7" fill="#A27552"/></g>` +
        `<circle cx="-2" cy="-5.6" r=".8" fill="#F4D58D"/><circle cx="2.4" cy="-5.2" r=".7" fill="#7FB04F"/>` +
        steam(0, -10, b) + `</g>`
    } else if (kind === 1) {
      // sautéing: the pan jerks up and the food jumps out of it and lands back in
      dur = r(1.2 + (seed % 4) * 0.1)
      const jerk = `<animateTransform attributeName="transform" type="translate" values="0 0;-1 -3;0 0;0 0" keyTimes="0;.15;.35;1" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/>`
      const bits = [[-2, '#E2463A'], [0.5, '#7FB04F'], [3, '#F2C14E']]
        .map(([dx, c], k) => `<rect x="${dx}" y="-3" width="1.8" height="1.8" fill="${c}"><animate attributeName="y" values="-3;-3;${-11 - k * 2};-3;-3" keyTimes="0;.12;.42;.7;1" keySplines="0 0 1 1;.2 .7 .5 1;.5 0 .8 .3;0 0 1 1" calcMode="spline" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/></rect>`)
        .join('')
      tool =
        `<g transform="translate(${ox},${oy})"><g>${jerk}<rect x="-14" y="-2.6" width="8" height="2" fill="#4A3527"/><ellipse cy="-1" rx="7" ry="3.4" fill="#2B2F35"/><ellipse cy="-1.5" rx="5.6" ry="2.6" fill="#454B55"/>${bits}</g>` +
        `<path d="M-4 1q1 -3 4 -4q3 1 4 4z" fill="#FF8A3D" opacity=".9"><animate attributeName="opacity" values=".9;.5;.9" dur=".3s" repeatCount="indefinite"/></path>` +
        `<text x="6" y="-8" font-size="5" font-weight="700" fill="#C8644A" opacity="0">tss<animate attributeName="opacity" values="0;0;1;0" keyTimes="0;.3;.45;1" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/></text></g>`
    } else {
      // chopping: the knife taps down on the carrot and the slices pile up beside it
      dur = r(0.45 + (seed % 3) * 0.05)
      const chop = `<animateTransform attributeName="transform" type="translate" values="0 -3;0 0;0 -3" keyTimes="0;.3;1" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/>`
      tool =
        `<g transform="translate(${ox},${oy})"><path d="M-8 0l7 3.5l9 -4.5l-7 -3.5z" fill="#E7BE88" stroke="#C99A62" stroke-width=".6"/>` +
        `<rect x="-5" y="-2.4" width="6" height="2" rx="1" fill="#F07B2C"/><rect x="1" y="-2.6" width="1" height="1" fill="#7FB04F"/>` +
        [0, 1, 2].map(k => `<ellipse cx="${3 + k * 1.6}" cy="${-0.6 + k * 0.4}" rx="1.1" ry=".7" fill="#F07B2C"/>`).join('') +
        `<g>${chop}<path d="M1 -3h6l-1 -2.4h-5z" fill="#D5D9DE"/><rect x="7" y="-5.4" width="3.4" height="1.6" fill="#3B3F46"/></g></g>`
    }
    return {
      move: lean(dur),
      extra:
        tool +
        `<text x="-15" y="-22" font-size="8" opacity="0">${kind === 1 ? '🍳' : kind === 0 ? '🥄' : '🥕'}<animate attributeName="opacity" values="0;0;1;0" keyTimes="0;.7;.8;1" dur="${r(dur * 5)}s" begin="${b}s" repeatCount="indefinite"/></text>`,
    }
  },
}
