import type { RoomGeom, Station, ThemeModule } from '../scene'
import { agentSpotsAt, bob, boxT, columns, hash, iso, poly, pts, r, shade, spanY, T, tr, withSpares } from '../scene'

const FELT = '#2E7D4F'
const RAIL = '#5E2E1E'
const GOLD = '#E8C15A'
const CHIPS = ['#D0605E', '#4F8FCB', '#F4EBDD', '#2A2A2A', '#6FA75A']

function chipStack(cx: number, cy: number, color: string, n: number) {
  let s = ''
  for (let k = 0; k < n; k++) s += `<ellipse cx="${r(cx)}" cy="${r(cy - k * 1.4)}" rx="2.6" ry="1.2" fill="${k === n - 1 ? color : shade(color, 0.8)}"/>`
  return s
}

function slots(room: RoomGeom, active: boolean) {
  const out: { x: number; t: number; s: string }[] = []
  const bodies = ['#B0303A', '#5A3A8A', '#2F6FA8']
  // against the near-facing far wall keep them short so they don't hide the room
  const h = room.top ? 30 : 22
  columns(room, 1.1, 0.9, 0.9).forEach((x, k) => {
    const body = bodies[k % bodies.length]!
    let s = boxT(room, x - 0.4, 0.15, 0.75, 0, 0.8, h, body) + boxT(room, x - 0.42, 0.13, 0.77, h, 0.84, 2, GOLD)
    const { y, d } = spanY(room, 0.15, 0.75)
    const fy = y + d
    if (!room.top) {
      // a bottom room shows the machines from behind: service panel and vents, lights on top
      s += poly([iso(x - 0.3, fy, 4), iso(x + 0.3, fy, 4), iso(x + 0.3, fy, h - 6), iso(x - 0.3, fy, h - 6)], shade(body, 0.6))
      let vents = ''
      for (let z = 7; z < h - 8; z += 2.5) vents += `M${pts([iso(x - 0.2, fy, z)])}L${pts([iso(x + 0.2, fy, z)])}`
      s += `<path d="${vents}" stroke="#1E1E24" stroke-opacity=".5" stroke-width="1"/>`
    }
    const scr = [iso(x - 0.3, fy, h - 15), iso(x + 0.3, fy, h - 15), iso(x + 0.3, fy, h - 5), iso(x - 0.3, fy, h - 5)] as [number, number][]
    if (room.top) s += poly(scr, '#1E1E24')
    // three reels: they cycle their symbols only while someone is playing
    const syms = ['7', '🍒', '★', 'BAR']
    for (let j = 0; j < (room.top ? 3 : 0); j++) {
      const [rx, ry] = iso(x - 0.2 + j * 0.2, fy, h - 12.5)
      const first = syms[(k + j) % syms.length]!
      const spin = active ? `<animate attributeName="opacity" values="1;.25;1" dur="${r(0.3 + j * 0.1)}s" repeatCount="indefinite"/>` : ''
      s += `<rect x="${r(rx - 2.6)}" y="${r(ry - 6.5)}" width="5.2" height="7" fill="#FFF8EE"/><text x="${r(rx)}" y="${r(ry - 1.2)}" font-size="${first === 'BAR' ? 2.6 : 5}" font-weight="700" text-anchor="middle" fill="#C8423A">${first}${spin}</text>`
    }
    // marquee bulbs blink in alternation
    for (let j = 0; j < 4; j++) {
      const [lx, ly] = iso(x - 0.3 + j * 0.2, fy, h - 2.5)
      s += `<circle cx="${r(lx)}" cy="${r(ly)}" r="1.2" fill="${j % 2 ? '#FFE34F' : '#FFFFFF'}"><animate attributeName="opacity" values="1;.2;1" dur=".8s" begin="${r((j % 2) * 0.4 + k * 0.1)}s" repeatCount="indefinite"/></circle>`
    }
    {
      const [lx, ly] = iso(x + 0.42, y + d * 0.5, h - 12)
      s += `<rect x="${r(lx)}" y="${r(ly - 8)}" width="1.4" height="9" fill="#B8B2A7"/><circle cx="${r(lx + 0.7)}" cy="${r(ly - 9)}" r="2" fill="#C8423A"/>`
    }
    // clickable: the webview spins it (easter egg: three sevens)
    const [cx, cy] = iso(x, fy, h - 10)
    out.push({ x, t: 0.45, s: `<g data-slot="${room.id}-${k}" data-x="${r(cx)}" data-y="${r(cy)}" style="cursor:pointer"><title>Tragaperras · clic para jugar</title>${s}</g>` })
  })
  return out
}

function roulette(room: RoomGeom, x: number, ta: number) {
  const tb = ta + 1.1
  let s = boxT(room, x - 0.9, ta, tb, 0, 1.8, 11, RAIL) + boxT(room, x - 0.82, ta + 0.08, tb - 0.08, 11, 1.64, 0.6, FELT)
  // betting grid on the felt
  for (let j = 0; j < 6; j++) {
    const [gx, gy] = iso(x - 0.1 + j * 0.15, T(room, (ta + tb) / 2), 11.6)
    s += `<rect x="${r(gx - 2)}" y="${r(gy - 2)}" width="4" height="4" fill="${j % 2 ? '#C8423A' : '#1E1E24'}" opacity=".8"/>`
  }
  const [cx, cy] = iso(x - 0.45, T(room, (ta + tb) / 2), 12)
  const n = 14
  let wedges = ''
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2
    const a1 = ((k + 1) / n) * Math.PI * 2
    const fill = k === 0 ? '#2E9D5F' : k % 2 ? '#C8423A' : '#1E1E24'
    wedges += `<path d="M0 0L${r(12 * Math.cos(a0))} ${r(12 * Math.sin(a0))}A12 12 0 0 1 ${r(12 * Math.cos(a1))} ${r(12 * Math.sin(a1))}Z" fill="${fill}"/>`
  }
  // the flattening lives on the outer group so the inner one can rotate freely
  s += `<g ${tr([cx, cy])}><g transform="scale(1,.5)"><circle r="14" fill="${shade(RAIL, 1.2)}"/><g>` +
    `<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="3s" repeatCount="indefinite"/>${wedges}<circle r="4" fill="${GOLD}"/><rect x="-0.8" y="-7" width="1.6" height="14" fill="${shade(GOLD, 0.8)}"/></g>` +
    `<g><animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="1.7s" repeatCount="indefinite"/><circle cx="10" r="1.6" fill="#FFF"/></g></g></g>`
  const [px, py] = iso(x + 0.6, T(room, (ta + tb) / 2 + 0.2), 11.6)
  s += chipStack(px, py, CHIPS[0]!, 4) + chipStack(px + 6, py + 1, CHIPS[1]!, 3)
  return s
}

function cardTable(room: RoomGeom, x: number, ta: number, seed: number) {
  const tb = ta + 1.0
  let s = boxT(room, x - 0.8, ta, tb, 0, 1.6, 11, RAIL)
  const [cx, cy] = iso(x, T(room, (ta + tb) / 2), 11)
  s += `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="26" ry="12" fill="${FELT}" stroke="${shade(FELT, 0.7)}" stroke-width="1"/><ellipse cx="${r(cx)}" cy="${r(cy)}" rx="16" ry="7" fill="none" stroke="${GOLD}" stroke-opacity=".5" stroke-width=".8"/>`
  // the dealer's cards in the middle, chips in front of each seat
  for (let k = 0; k < 3; k++) s += `<rect x="${r(cx - 8 + k * 5.5)}" y="${r(cy - 3)}" width="4" height="5.4" fill="#FFFFFF" stroke="#B8B2A7" stroke-width=".5"/><rect x="${r(cx - 7 + k * 5.5)}" y="${r(cy - 2)}" width="2" height="1.4" fill="${k % 2 ? '#1E1E24' : '#C8423A'}"/>`
  s += chipStack(cx - 15, cy + 4, CHIPS[seed % CHIPS.length]!, 3) + chipStack(cx + 15, cy + 4, CHIPS[(seed + 2) % CHIPS.length]!, 4)
  return s
}

export const casino: ThemeModule = {
  floor: '#7A2232',
  furnish(room, _lab, active) {
    const items: { d: number; s: string }[] = []
    const add = (x: number, t: number, s: string) => items.push({ d: x + T(room, t), s })
    // carpet: a gold diamond in every other tile, one path for the whole room
    let motif = ''
    for (let x = room.x0; x < room.x1; x++) {
      for (let y = room.y0; y < room.y1; y++) {
        if ((x + y) % 2) continue
        const [a, b] = iso(x + 0.5, y + 0.2)
        const [c, d] = iso(x + 0.8, y + 0.5)
        const [e, f] = iso(x + 0.5, y + 0.8)
        const [g, h] = iso(x + 0.2, y + 0.5)
        motif += `M${r(a)} ${r(b)}L${r(c)} ${r(d)}L${r(e)} ${r(f)}L${r(g)} ${r(h)}Z`
      }
    }
    let s = `<path d="${motif}" fill="none" stroke="${GOLD}" stroke-opacity=".35" stroke-width="1" pointer-events="none"/>`

    const stations: Station[] = []
    for (const m of slots(room, active)) {
      add(m.x, m.t, m.s)
      stations.push({ x: m.x, y: T(room, 1.25), kind: 'casino' })
    }
    const xs = columns(room, 2.6, 1.6, 1.3)
    xs.forEach((x, k) => {
      const ta = 3.0
      add(x, ta + 0.5, k === 0 ? roulette(room, x, ta) : cardTable(room, x, ta, hash(`${room.id}${k}`)))
      for (const dx of [-0.5, 0.5]) stations.push({ x: x + dx, y: T(room, ta + 1.5), kind: 'casino' })
    })
    // a second row of card tables when the room is deep enough for players and the aisle
    columns(room, 2.6, 2.6, 1.3).forEach((x, k) => {
      const ta = 5.0
      add(x, ta + 0.5, cardTable(room, x, ta, hash(`${room.id}b${k}`)))
      for (const dx of [-0.5, 0.5]) stations.push({ x: x + dx, y: T(room, ta + 1.5), kind: 'casino' })
    })
    items.sort((a, b) => a.d - b.d)
    s += items.map(i => i.s).join('')
    return { svg: s, stations: withSpares(room, stations, 'casino'), agentSpots: agentSpotsAt(room, 2.25) }
  },
  work(seed, accent) {
    const b = r((seed % 14) / 10)
    const chip = (k: number) => {
      const c = k === 0 ? accent : CHIPS[(seed + k) % CHIPS.length]!
      const d = r(b + k * 0.35)
      return `<ellipse cx="${10 + k * 3}" cy="-8" rx="2.6" ry="1.2" fill="${c}" stroke="${shade(c, 0.7)}" stroke-width=".5"><animate attributeName="cy" values="-8;-17;-8" keyTimes="0;.5;1" keySplines=".2 .6 .4 1;.6 0 .8 .4" calcMode="spline" dur="1.1s" begin="${d}s" repeatCount="indefinite"/></ellipse>`
    }
    const card = `<g><animateTransform attributeName="transform" type="rotate" values="-8;8;-8" dur="2s" begin="${b}s" repeatCount="indefinite"/><rect x="-14" y="-12" width="5" height="7" fill="#FFF" stroke="#B8B2A7" stroke-width=".5"/><rect x="-12" y="-13" width="5" height="7" fill="#FFF" stroke="#B8B2A7" stroke-width=".5"/><text x="-9.5" y="-8" font-size="4" font-weight="700" text-anchor="middle" fill="#C8423A">A</text></g>`
    const win = (icon: string, at: number) => `<text x="0" y="-26" font-size="10" text-anchor="middle" opacity="0">${icon}<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;${at};${r(at + 0.04)};${r(at + 0.12)};${r(at + 0.16)}" dur="9s" begin="${b}s" repeatCount="indefinite"/></text>`
    // the jackpot is rare: a short burst once every long cycle, offset by the skill's seed
    const jb = r((seed % 37) + 3)
    const jackpot = `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.02;.08;.1;1" dur="40s" begin="${jb}s" repeatCount="indefinite"/>` +
      `<text x="0" y="-34" font-size="8" font-weight="700" text-anchor="middle" fill="${GOLD}" stroke="#5E2E1E" stroke-width="2" paint-order="stroke">JACKPOT!</text>` +
      [-10, -4, 3, 9].map((cx, k) => `<circle cx="${cx}" cy="-30" r="1.8" fill="${GOLD}"><animate attributeName="cy" values="-30;-6" dur=".7s" begin="${r(jb + k * 0.15)}s" repeatCount="indefinite"/></circle>`).join('') + '</g>'
    return {
      move: bob(1.2, 1.4, b),
      extra: chip(0) + chip(1) + (seed % 2 ? card : '') + win(seed % 3 ? '💰' : '🎰', 0.55) + jackpot,
    }
  },
}
