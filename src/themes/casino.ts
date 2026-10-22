import type { RoomGeom, Station, ThemeModule } from '../scene'
import { agentSpotsAt, bob, boxT, columns, hash, iso, r, shade, spanY, T, tr, withSpares } from '../scene'

const FELT = '#2E7D4F'
const RAIL = '#5E2E1E'
const GOLD = '#E8C15A'
const CHIPS = ['#D0605E', '#4F8FCB', '#F4EBDD', '#2A2A2A', '#6FA75A']
const STOOL_Z = 5

// t of the side of [ta, tb] nearest to the viewer, pushed out by gap: rows below see the far wall up front
const nearT = (room: RoomGeom, ta: number, tb: number, gap: number) => (room.top ? tb + gap : ta - gap)

function chipStack(cx: number, cy: number, color: string, n: number) {
  let s = ''
  for (let k = 0; k < n; k++) s += `<ellipse cx="${r(cx)}" cy="${r(cy - k * 1.4)}" rx="2.6" ry="1.2" fill="${k === n - 1 ? color : shade(color, 0.8)}" stroke="${shade(color, 0.6)}" stroke-width=".3"/>`
  return s
}

// one reel symbol in a 4 px cell: seven, cherries, star, bar
const SYMBOL = [
  (y: number) => `<path d="M-1.2 ${y + 0.6}h2.4l-1.4 2.8" stroke="#C8423A" stroke-width=".9" fill="none"/>`,
  (y: number) => `<circle cx="-.6" cy="${y + 2.6}" r=".8" fill="#E2463A"/><circle cx=".8" cy="${y + 2.4}" r=".8" fill="#E2463A"/><path d="M-.6 ${y + 1.8}l.8 -1.2l.6 1" stroke="#3F7A34" stroke-width=".4" fill="none"/>`,
  (y: number) => `<path d="M0 ${y + 0.4}l.7 1.3h1.2l-1 .9l.4 1.3l-1.3 -.8l-1.3 .8l.4 -1.3l-1 -.9h1.2z" fill="#F2B21B"/>`,
  (y: number) => `<rect x="-1.4" y="${y + 1.2}" width="2.8" height="1.6" fill="#1E1E24"/>`,
]

// A slot machine drawn on a face plane: (fx, fy) is the face's bottom centre on screen and `slope` its shear
// (.5 for a face turned to +y, -.5 for one turned to +x); the reels spin, stop one by one and rest on a symbol.
function machineFace(id: string, fx: number, fy: number, slope: number, h: number, k: number, active: boolean, seed: number) {
  let s = `<g transform="matrix(1,${slope},0,1,${r(fx)},${r(fy)})">`
  const top = -(h - 4)
  s += `<rect x="-5.4" y="${top + 4}" width="10.8" height="8" fill="#1E1E24"/><rect x="-4.6" y="${top + 4.8}" width="9.2" height="6.4" fill="#FFF8EE"/>`
  s += `<clipPath id="${id}"><rect x="-4.6" y="${top + 6}" width="9.2" height="4"/></clipPath><g clip-path="url(#${id})">`
  const cycle = 4
  for (let j = 0; j < 3; j++) {
    const rx = -3.1 + j * 3.1
    const land = (seed + j * 5 + k) % 4
    // a strip of four cells ticked through a cell at a time, then held on `land`
    const cells = [0, 1, 2, 3].map((sym, n) => SYMBOL[(sym + land) % 4]!(top + 6 + n * 4)).join('')
    let anim = ''
    if (active) {
      const steps = 14 + j * 6
      const tick = 0.06
      const values: string[] = []
      const times: string[] = []
      for (let n = 0; n < steps; n++) {
        values.push(`0 ${-((steps - n) % 4) * 4}`)
        times.push(((n * tick) / cycle).toFixed(4))
      }
      values.push('0 0')
      times.push(((steps * tick) / cycle).toFixed(4))
      anim = `<animateTransform attributeName="transform" type="translate" calcMode="discrete" values="${values.join(';')}" keyTimes="${times.join(';')}" dur="${cycle}s" begin="${r(k * 0.7 + (seed % 5) * 0.2)}s" repeatCount="indefinite"/>`
    }
    s += `<g transform="translate(${r(rx)},0)"><g>${anim}${cells}</g></g>`
  }
  s += `</g><path d="M-1.6 ${top + 4.8}v6.4M1.6 ${top + 4.8}v6.4" stroke="#B8B2A7" stroke-width=".4"/><rect x="-4.6" y="${top + 7.6}" width="9.2" height=".3" fill="#C8423A" opacity=".6"/>`
  // marquee bulbs blink in alternation, the tray and the coin slot below the reels
  for (let j = 0; j < 4; j++) s += `<circle cx="${-4.2 + j * 2.8}" cy="${top + 1.6}" r="1.1" fill="${j % 2 ? '#FFE34F' : '#FFFFFF'}"><animate attributeName="opacity" values="1;.2;1" dur=".8s" begin="${r((j % 2) * 0.4 + k * 0.1)}s" repeatCount="indefinite"/></circle>`
  s += `<rect x="-3" y="${top + 14}" width="6" height="1.4" fill="${GOLD}"/><rect x="-1" y="${top + 16.4}" width="2" height=".8" fill="#1E1E24"/><rect x="-4" y="-5" width="8" height="2.6" fill="#1E1E24" opacity=".6"/>`
  return s + `</g>`
}

function slots(room: RoomGeom, active: boolean) {
  const out: { x: number; t: number; s: string; st: Station }[] = []
  const bodies = ['#B0303A', '#5A3A8A', '#2F6FA8']
  if (room.top) {
    // a row against the far wall, screens turned to the room
    const h = 38
    columns(room, 1.1, 0.9, 0.9).forEach((x, k) => {
      const body = bodies[k % bodies.length]!
      let s = boxT(room, x - 0.4, 0.15, 0.75, 0, 0.8, h, body) + boxT(room, x - 0.42, 0.13, 0.77, h, 0.84, 2, GOLD)
      const { y, d } = spanY(room, 0.15, 0.75)
      const [fx, fy] = iso(x, y + d)
      s += machineFace(`sl-${room.id}-${k}`, fx, fy, 0.5, h, k, active, hash(room.id))
      const [lx, ly] = iso(x + 0.42, y + d * 0.5, h - 12)
      s += `<rect x="${r(lx)}" y="${r(ly - 8)}" width="1.4" height="9" fill="#B8B2A7"/><circle cx="${r(lx + 0.7)}" cy="${r(ly - 9)}" r="2" fill="#C8423A"/>`
      s += `<circle cx="${r(fx)}" cy="${r(fy - h + 2.4)}" r="12" fill="url(#lamp)" class="lamp-light" pointer-events="none"/>`
      // clickable: the webview spins it (easter egg: three sevens); data-x/y is the middle of the screen
      out.push({ x, t: 0.45, s: `<g data-slot="${room.id}-${k}" data-x="${r(fx)}" data-y="${r(fy - h + 12)}" style="cursor:pointer"><title>Tragaperras · clic para jugar</title>${s}</g>`, st: { x, y: T(room, 1.25), kind: 'casino' } })
    })
    return out
  }
  // a row below sees its far wall up front, so the machines line the side wall with their screens turned to the room
  // tall enough for the screens to clear the players' heads
  const h = 38
  const x = room.x0 + 0.15
  for (let k = 0, tc = 1.2; tc <= 5.7; k++, tc += 1.1) {
    const body = bodies[k % bodies.length]!
    const y = T(room, tc)
    let s = boxT(room, x, tc - 0.4, tc + 0.4, 0, 0.6, h, body) + boxT(room, x - 0.02, tc - 0.42, tc + 0.42, h, 0.64, 2, GOLD)
    const [fx, fy] = iso(x + 0.6, y)
    s += machineFace(`sl-${room.id}-${k}`, fx, fy, -0.5, h, k, active, hash(room.id))
    s += `<circle cx="${r(fx)}" cy="${r(fy - h + 2.4)}" r="12" fill="url(#lamp)" class="lamp-light" pointer-events="none"/>`
    out.push({ x, t: tc, s: `<g data-slot="${room.id}-${k}" data-x="${r(fx)}" data-y="${r(fy - h + 12)}" style="cursor:pointer"><title>Tragaperras · clic para jugar</title>${s}</g>`, st: { x: room.x0 + 1.3, y, kind: 'casino' } })
  }
  return out
}

// the wheel turns steadily; the ball runs the other way, slows down, drops into a pocket and rides with the wheel
function roulette(room: RoomGeom, x: number, ta: number, active: boolean) {
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
  const spin = active ? 6 : 14
  const wheel = `<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="${spin}s" repeatCount="indefinite"/>`
  // over one cycle the wheel turns 360; the ball's last stretch matches it so it rests in the same pocket
  const ball = active
    ? `<animateTransform attributeName="transform" type="rotate" values="0;-900;-774" keyTimes="0;.65;1" keySplines=".1 .6 .4 1;0 0 1 1" calcMode="spline" dur="${spin}s" repeatCount="indefinite"/>`
    : wheel
  const drop = active ? `<animate attributeName="cx" values="11.5;11.5;8;8" keyTimes="0;.6;.66;1" dur="${spin}s" repeatCount="indefinite"/>` : ''
  // the flattening lives on the outer group so the inner ones can rotate freely
  s += `<g ${tr([cx, cy])}><ellipse cy="2" rx="15" ry="7.5" fill="#000" opacity=".2"/><g transform="scale(1,.5)"><circle r="14" fill="${shade(RAIL, 1.2)}"/><circle r="12.6" fill="none" stroke="${GOLD}" stroke-width=".6"/><g>` +
    `${wheel}${wedges}<circle r="4" fill="${GOLD}"/><rect x="-0.8" y="-7" width="1.6" height="14" fill="${shade(GOLD, 0.8)}"/><rect x="-7" y="-0.8" width="14" height="1.6" fill="${shade(GOLD, 0.8)}"/></g>` +
    `<g>${ball}<circle cx="${active ? 11.5 : 8}" r="1.6" fill="#FFF">${drop}</circle></g></g></g>`
  const [px, py] = iso(x + 0.6, T(room, (ta + tb) / 2 + 0.2), 11.6)
  s += chipStack(px, py, CHIPS[0]!, 4) + chipStack(px + 6, py + 1, CHIPS[1]!, 3)
  return s
}

function cardTable(room: RoomGeom, x: number, ta: number, seed: number) {
  const tb = ta + 1.0
  let s = boxT(room, x - 0.8, ta, tb, 0, 1.6, 11, RAIL)
  const [cx, cy] = iso(x, T(room, (ta + tb) / 2), 11)
  s += `<ellipse cx="${r(cx)}" cy="${r(cy + 1.5)}" rx="26" ry="12" fill="${shade(RAIL, 0.8)}"/><ellipse cx="${r(cx)}" cy="${r(cy)}" rx="26" ry="12" fill="${FELT}" stroke="${shade(FELT, 0.7)}" stroke-width="1"/><ellipse cx="${r(cx)}" cy="${r(cy)}" rx="16" ry="7" fill="none" stroke="${GOLD}" stroke-opacity=".5" stroke-width=".8"/>`
  // the dealer's cards in the middle, chips in front of each seat
  for (let k = 0; k < 3; k++) s += `<rect x="${r(cx - 8 + k * 5.5)}" y="${r(cy - 3)}" width="4" height="5.4" fill="#FFFFFF" stroke="#B8B2A7" stroke-width=".5"/><rect x="${r(cx - 7 + k * 5.5)}" y="${r(cy - 2)}" width="2" height="1.4" fill="${k % 2 ? '#1E1E24' : '#C8423A'}"/>`
  s += chipStack(cx - 15, cy + 4, CHIPS[seed % CHIPS.length]!, 3) + chipStack(cx + 15, cy + 4, CHIPS[(seed + 2) % CHIPS.length]!, 4)
  return s
}

// a round bar stool, its seat at STOOL_Z; the player sits on it
function stool(room: RoomGeom, x: number, t: number) {
  const [sx, sy] = iso(x, T(room, t))
  return `<ellipse cx="${r(sx)}" cy="${r(sy)}" rx="6" ry="2.6" fill="#000" opacity=".18"/><rect x="${r(sx - 1)}" y="${r(sy - STOOL_Z)}" width="2" height="${STOOL_Z}" fill="#9A9AA6"/>` +
    `<ellipse cx="${r(sx)}" cy="${r(sy - STOOL_Z)}" rx="5.4" ry="2.6" fill="${RAIL}"/><ellipse cx="${r(sx)}" cy="${r(sy - STOOL_Z - 0.8)}" rx="5" ry="2.2" fill="#B0303A"/>`
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
      stations.push(m.st)
    }
    // tables leave the side wall free below, where the machines are; players sit on the viewer's side of each
    const from = room.top ? 1.6 : 3.1
    const seat = (x: number, ta: number, tb: number) => {
      const t = nearT(room, ta, tb, 0.45)
      for (const dx of [-0.5, 0.5]) {
        add(x + dx, t, stool(room, x + dx, t))
        stations.push({ x: x + dx, y: T(room, t), kind: 'casino', z: STOOL_Z })
      }
    }
    columns(room, 2.6, from, 1.3).forEach((x, k) => {
      const ta = 2.5
      const tb = ta + (k === 0 ? 1.1 : 1.0)
      add(x, (ta + tb) / 2, k === 0 ? roulette(room, x, ta, active) : cardTable(room, x, ta, hash(`${room.id}${k}`)))
      seat(x, ta, tb)
    })
    // a second row of card tables, staggered so the first row's players don't stand in them
    columns(room, 2.6, from + 1, 1.3).forEach((x, k) => {
      const ta = 5.0
      add(x, ta + 0.5, cardTable(room, x, ta, hash(`${room.id}b${k}`)))
      seat(x, ta, ta + 1.0)
    })
    items.sort((a, b) => a.d - b.d)
    s += items.map(i => i.s).join('')
    return { svg: s, stations: withSpares(room, stations, 'casino'), agentSpots: room.top ? agentSpotsAt(room, 7.0) : agentSpotsAt(room, 6.7).map(p => ({ ...p, x: p.x + 0.6 })) }
  },
  // betting: a chip flicked onto the felt in front, cards fanned in the other hand, a win now and then and a rare jackpot
  work(seed, accent) {
    const b = r((seed % 14) / 10)
    const dur = r(2.2 + (seed % 4) * 0.2)
    // the chip leaves the hand, arcs up and lands on the table behind, then a new one is taken
    const arc = `keyTimes="0;.15;.4;.55;1" dur="${dur}s" begin="${b}s" repeatCount="indefinite"`
    const chip = (c: string) =>
      `<ellipse rx="2.6" ry="1.2" fill="${c}" stroke="${shade(c, 0.6)}" stroke-width=".5"><animate attributeName="cx" values="12;12;15;17;17" ${arc}/>` +
      `<animate attributeName="cy" values="-9;-9;-22;-18;-18" keySplines="0 0 1 1;.2 .6 .4 1;.6 0 .8 .4;0 0 1 1" calcMode="spline" ${arc}/><animate attributeName="opacity" values="1;1;1;1;0" ${arc}/></ellipse>`
    const stack = chipStack(12, -7, CHIPS[(seed + 1) % CHIPS.length]!, 2)
    const card =
      `<g transform="translate(-12,-9)"><g><animateTransform attributeName="transform" type="rotate" values="-6;6;-6" keyTimes="0;.5;1" keySplines=".4 0 .6 1;.4 0 .6 1" calcMode="spline" dur="${r(dur * 1.5)}s" begin="${b}s" repeatCount="indefinite"/>` +
      `<rect x="-4" y="-7" width="5" height="7" fill="#FFF" stroke="#B8B2A7" stroke-width=".5" transform="rotate(-12)"/><rect x="-1" y="-7.4" width="5" height="7" fill="#FFF" stroke="#B8B2A7" stroke-width=".5"/>` +
      `<text x="1.5" y="-2.6" font-size="4" font-weight="700" text-anchor="middle" fill="#C8423A">A</text></g></g>`
    const win = (icon: string, at: number) => `<text x="0" y="-26" font-size="10" text-anchor="middle" opacity="0">${icon}<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;${at};${r(at + 0.04)};${r(at + 0.12)};${r(at + 0.16)}" dur="9s" begin="${b}s" repeatCount="indefinite"/></text>`
    // the jackpot is rare: a short burst once every long cycle, offset by the skill's seed
    const jb = r((seed % 37) + 3)
    const jackpot = `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.02;.08;.1;1" dur="40s" begin="${jb}s" repeatCount="indefinite"/>` +
      `<text x="0" y="-34" font-size="8" font-weight="700" text-anchor="middle" fill="${GOLD}" stroke="#5E2E1E" stroke-width="2" paint-order="stroke">JACKPOT!</text>` +
      [-10, -4, 3, 9].map((cx, k) => `<circle cx="${cx}" cy="-30" r="1.8" fill="${GOLD}"><animate attributeName="cy" values="-30;-6" dur=".7s" begin="${r(jb + k * 0.15)}s" repeatCount="indefinite"/></circle>`).join('') + '</g>'
    return {
      move: bob(0.8, dur / 2, b),
      extra: stack + chip(accent) + (seed % 2 ? card : '') + win(seed % 3 ? '💰' : '🎰', 0.55) + jackpot,
    }
  },
}
