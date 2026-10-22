import type { RoomGeom, Station, ThemeModule } from '../scene'
import { agentSpotsAt, boxT, columns, hash, iso, poly, pts, r, shade, spanY, T, tr, withSpares } from '../scene'

const STRAW = '#D9B25C'
const BAMBOO = '#B8894E'
const CANVAS = '#FFF6E6'

// Striped cone seen from above: wedges sorted back to front so the near ones cover the far ones.
function parasol(cx: number, cy: number, color: string) {
  const rx = 24
  const ry = 12
  const n = 8
  const wedges = Array.from({ length: n }, (_, k) => ({ k, a0: (k / n) * Math.PI * 2, a1: ((k + 1) / n) * Math.PI * 2 }))
  wedges.sort((p, q) => Math.sin((p.a0 + p.a1) / 2) - Math.sin((q.a0 + q.a1) / 2))
  let s = `<ellipse cx="${r(cx + 4)}" cy="${r(cy + 40)}" rx="20" ry="9" fill="#000" opacity=".1"/>`
  s += `<rect x="${r(cx - 0.8)}" y="${r(cy - 2)}" width="1.6" height="42" fill="#EDE4D3"/>`
  for (const w of wedges) {
    const rim = (a: number): [number, number] => [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]
    const fill = w.k % 2 ? CANVAS : color
    const lit = Math.sin((w.a0 + w.a1) / 2) > 0 ? fill : shade(fill, 0.85)
    s += poly([[cx, cy - 9], rim(w.a0), rim(w.a1)], lit)
  }
  return s + `<circle cx="${r(cx)}" cy="${r(cy - 9.5)}" r="1.6" fill="${shade(color, 0.7)}"/>`
}

function palm(room: RoomGeom, x: number, t: number) {
  const [bx, by] = iso(x, T(room, t))
  let s = `<ellipse cx="${r(bx + 6)}" cy="${r(by)}" rx="16" ry="6" fill="#000" opacity=".12"/>`
  // a gently curved trunk made of stacked rings
  for (let k = 0; k < 11; k++) s += `<rect x="${r(bx - 3 + k * 0.7)}" y="${r(by - 6 - k * 5)}" width="6" height="5.2" fill="${k % 2 ? '#8A6239' : '#9C7144'}"/>`
  const [tx, ty] = [bx + 7.7, by - 60]
  const leaf = (ang: number, len: number, c: string) =>
    `<path d="M0 0 Q${r(len * 0.5)} ${r(-len * 0.35)} ${len} ${r(len * 0.25)} Q${r(len * 0.5)} ${r(-len * 0.12)} 0 4 Z" fill="${c}" transform="rotate(${ang})"/>`
  const leaves = [[-160, 30, '#3E7F3A'], [-20, 30, '#3E7F3A'], [-120, 26, '#4F9A48'], [-60, 26, '#4F9A48'], [150, 22, '#5BAA52'], [30, 22, '#5BAA52'], [-90, 18, '#6BBA5C']] as const
  // the crown sways inside its own group: the outer group holds the position
  s += `<g ${tr([tx, ty])}><g><animateTransform attributeName="transform" type="rotate" values="-3;3;-3" dur="5s" repeatCount="indefinite"/>` +
    leaves.map(([a, l, c]) => leaf(a, l, c)).join('') +
    `<circle cx="-2" cy="3" r="2.6" fill="#6E4A2A"/><circle cx="2.5" cy="4" r="2.6" fill="#5E3F22"/><circle cx="0" cy="6" r="2.4" fill="#6E4A2A"/></g></g>`
  return s
}

// A ragged straw fringe hanging along the visible edge (y + d) of a span.
function fringe(xa: number, xb: number, y: number, z: number, len: number) {
  let f = ''
  for (let x = xa; x < xb; x += 0.16) {
    const [a, b] = iso(x, y, z)
    const [c, e] = iso(x + 0.16, y, z)
    f += `M${r(a)} ${r(b)}L${r((a + c) / 2)} ${r(b + len + (Math.round(x * 10) % 3))}L${r(c)} ${r(e)}Z`
  }
  return `<path d="${f}" fill="${shade(STRAW, 0.82)}"/>`
}

function bar(room: RoomGeom) {
  const x0 = room.x0 + 0.4
  const w = room.x1 - room.x0 - 0.8
  let s = ''
  // on the near-facing far wall of a bottom room a shelf and roof would hide the whole room
  if (room.top) {
    s += boxT(room, x0 + 0.2, 0.05, 0.3, 0, w - 0.4, 24, '#8A5A3B')
    const { y, d } = spanY(room, 0.05, 0.3)
    const bottles = ['#4F9A48', '#C8423A', '#E0A43B', '#4F8FCB', '#F4EBDD']
    let k = 0
    for (let x = x0 + 0.5; x < x0 + w - 0.4; x += 0.3, k++) {
      const [bx, by] = iso(x, y + d, 24)
      s += `<rect x="${r(bx - 1.2)}" y="${r(by - 7)}" width="2.4" height="7" fill="${bottles[k % bottles.length]}"/><rect x="${r(bx - 0.5)}" y="${r(by - 9.5)}" width="1" height="2.6" fill="#3B3F46"/>`
    }
  }
  s += boxT(room, x0, 0.45, 1.0, 0, w, 15, BAMBOO) + boxT(room, x0 - 0.05, 0.4, 1.05, 15, w + 0.1, 1.6, '#8A5A3B')
  {
    // bamboo slats on the visible face, coconuts and cocktails on the counter
    const { y, d } = spanY(room, 0.45, 1.0)
    let slats = ''
    for (let x = x0 + 0.12; x < x0 + w; x += 0.24) slats += `M${pts([iso(x, y + d, 1)])}L${pts([iso(x, y + d, 14)])}`
    s += `<path d="${slats}" stroke="${shade(BAMBOO, 0.7)}" stroke-width="1"/>`
    if (!room.top) s += fringe(x0 - 0.05, x0 + w + 0.05, spanY(room, 0.4, 1.05).y + 0.65, 16.6, 5)
    for (const [k, x] of columns(room, 1.7, 1.1, 1.0).entries()) {
      const [cx, cy] = iso(x, T(room, 0.72), 16.6)
      s += k % 2
        ? `<rect x="${r(cx - 1.6)}" y="${r(cy - 6)}" width="3.2" height="5" fill="#FFB0C0" opacity=".9"/><rect x="${r(cx - 0.3)}" y="${r(cy - 1)}" width=".6" height="1.2" fill="#DDE7EA"/><path d="M${r(cx + 1)} ${r(cy - 6)} l3 -4" stroke="#FFE34F" stroke-width="1"/>`
        : `<circle cx="${r(cx)}" cy="${r(cy - 3)}" r="3.2" fill="#6E4A2A"/><path d="M${r(cx + 0.5)} ${r(cy - 5.6)} l2 -5" stroke="#FF6FA0" stroke-width="1"/>`
    }
  }
  if (room.top) {
    // thatched roof on bamboo posts
    for (const x of [x0 + 0.05, x0 + w - 0.2]) s += boxT(room, x, 1.05, 1.2, 0, 0.15, 34, BAMBOO)
    s += boxT(room, x0 - 0.2, 0.0, 1.45, 34, w + 0.4, 3.5, STRAW)
    s += fringe(x0 - 0.2, x0 + w + 0.2, T(room, 1.45), 34, 5)
  }
  return s
}

const LOUNGER_LEN = 1.2
const LOUNGER_W = 0.9
const TOWEL_Z = 4.6
// where the bather's feet rest, measured from the backrest end of the lounger
const FEET_AT = 0.95
// t at depth o into [ta, tb] measured from the side away from the viewer, so both rows look alike
const backT = (room: RoomGeom, ta: number, tb: number, o: number) => (room.top ? ta + o : tb - o)

// the sprite stands up along screen y; this lays it back on the lounger, head on the backrest: rotate · skewX · scale,
// its width follows the tile x axis and its height leans back along -y, so it matches the iso grid
const recline = (b: number) =>
  `<animateTransform attributeName="transform" type="rotate" from="26.57" to="26.57" dur="1s" fill="freeze"/>` +
  `<animateTransform attributeName="transform" type="skewX" from="-12.2" to="-12.2" dur="1s" fill="freeze" additive="sum"/>` +
  // breathing: the chest rises and falls slowly
  `<animateTransform attributeName="transform" type="scale" values=".8 .84;.8 .87;.8 .84" keyTimes="0;.45;1" keySplines=".4 0 .6 1;.4 0 .6 1" calcMode="spline" dur="3.6s" begin="${r(b)}s" repeatCount="indefinite" additive="sum"/>`

export const beach: ThemeModule = {
  floor: '#EED9A4',
  furnish(room, lab, active) {
    const items: { d: number; s: string }[] = []
    const add = (x: number, t: number, s: string) => items.push({ d: x + T(room, t), s })
    // sand grains and a few ripples, all in one path
    let grains = ''
    for (let x = room.x0; x < room.x1; x++) {
      for (let y = room.y0; y < room.y1; y++) {
        const h = hash(`${x},${y}`)
        const [gx, gy] = iso(x + ((h % 7) + 1) / 8, y + (((h >> 3) % 7) + 1) / 8)
        grains += `M${r(gx)} ${r(gy)}h2`
        if (h % 5 === 0) grains += `M${r(gx - 8)} ${r(gy + 5)}q4 -2 8 0t8 0`
      }
    }
    let s = `<path d="${grains}" stroke="#C9AE74" stroke-width="1.2" fill="none" stroke-opacity=".7" pointer-events="none"/>`

    add(room.x0 + 3, 0.5, bar(room))
    if (room.x1 - room.x0 >= 5) add(room.x1 - 0.7, 2.3, palm(room, room.x1 - 0.7, 2.3))

    const stations: Station[] = []
    const towels = [lab.accent, '#4F8FCB', '#E0A43B', '#D0605E']
    for (const [row, ta] of [3.0, 5.3].entries()) {
      const tb = ta + LOUNGER_LEN
      const span = (o0: number, o1: number) => {
        const a = backT(room, ta, tb, o0)
        const b = backT(room, ta, tb, o1)
        return [Math.min(a, b), Math.max(a, b)] as const
      }
      const xs = columns(room, 1.5, 1.2, 1.6)
      xs.forEach((x, k) => {
        const towel = towels[(k + row) % towels.length]!
        const hw = LOUNGER_W / 2
        // lounger: frame, raised backrest at the end away from the viewer, towel with a stripe near the feet
        let l = boxT(room, x - hw, ta, tb, 0, LOUNGER_W, 4, '#F4EBDD')
        const [r0, r1] = span(0, 0.3)
        l += boxT(room, x - hw, r0, r1, 4, LOUNGER_W, 6, '#E4D8C2')
        const [w0, w1] = span(0.32, LOUNGER_LEN - 0.06)
        l += boxT(room, x - hw + 0.06, w0, w1, 4, LOUNGER_W - 0.12, 0.6, towel)
        const [s0, s1] = span(LOUNGER_LEN - 0.3, LOUNGER_LEN - 0.2)
        l += boxT(room, x - hw + 0.06, s0, s1, 4.6, LOUNGER_W - 0.12, 0.1, '#FFFFFF')
        // a pillow on the backrest
        const [px, py] = iso(x, T(room, backT(room, ta, tb, 0.18)), 10)
        l += `<ellipse cx="${r(px)}" cy="${r(py)}" rx="5" ry="2.4" fill="#FFFFFF" stroke="#E4D8C2" stroke-width=".6"/>`
        add(x, (ta + tb) / 2, l)
        stations.push({ x, y: T(room, backT(room, ta, tb, FEET_AT)), kind: 'beach', z: TOWEL_Z })
      })
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const ux = (xs[k]! + xs[k + 1]!) / 2
        const pt = backT(room, ta, tb, 0.4)
        const [cx, cy] = iso(ux, T(room, pt), 40)
        add(ux, pt + (room.top ? 1 : -1), parasol(cx, cy, row ? '#4F8FCB' : '#D0605E'))
      }
    }
    {
      // a beach ball that bounces while the puesto is busy, its shadow shrinking as it rises
      const bx = room.x0 + 0.7
      const [cx, cy] = iso(bx, T(room, 6.9), 5)
      const spline = `keyTimes="0;.5;1" keySplines=".2 .6 .4 1;.6 0 .8 .4" calcMode="spline" dur="1s" repeatCount="indefinite"`
      const anim = active ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -12;0 0" ${spline}/>` : ''
      const shadow = active ? `<animate attributeName="rx" values="5;3;5" ${spline}/>` : ''
      add(bx, 6.9, `<ellipse cx="${r(cx)}" cy="${r(cy + 5)}" rx="5" ry="2" fill="#000" opacity=".15">${shadow}</ellipse><g>${anim}<circle cx="${r(cx)}" cy="${r(cy)}" r="5" fill="#FFFFFF"/>` +
        `<path d="M${r(cx - 5)} ${r(cy)}a5 5 0 0 1 5 -5v10a5 5 0 0 1 -5 -5z" fill="#D0605E"/><path d="M${r(cx)} ${r(cy - 5)}a5 5 0 0 1 5 5h-5z" fill="#4F8FCB"/><circle cx="${r(cx - 1.5)}" cy="${r(cy - 2)}" r="1.2" fill="#FFF" opacity=".7"/></g>`)
    }
    items.sort((a, b) => a.d - b.d)
    s += items.map(i => i.s).join('')
    return { svg: s, stations: withSpares(room, stations, 'beach'), agentSpots: agentSpotsAt(room, 1.75) }
  },
  // lying back on the lounger in shades: sunbathing under a pulsing sun or sipping a coconut, with a sigh now and then
  work(seed, accent) {
    const b = (seed % 17) / 10
    const move = recline(b)
    // the shades and the coconut lie back with the body, so they share its transform
    const shades = `<rect x="-7" y="-15.6" width="5.4" height="3.2" fill="#1E1E24"/><rect x="1.6" y="-15.6" width="5.4" height="3.2" fill="#1E1E24"/><rect x="-2" y="-15" width="4" height=".9" fill="#1E1E24"/><rect x="-6.2" y="-15" width="1.4" height=".8" fill="#FFF" opacity=".5"/>`
    const sighDur = r(7 + (seed % 4))
    const sigh = `<text x="2" y="-26" font-size="7" font-weight="700" fill="#8A6239" stroke="#FFF6E6" stroke-width="2" paint-order="stroke" opacity="0">aaah<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.7;.74;.9;1" dur="${sighDur}s" begin="${r(b)}s" repeatCount="indefinite"/><animate attributeName="y" values="-24;-24;-24;-29;-29" keyTimes="0;.7;.74;.9;1" dur="${sighDur}s" begin="${r(b)}s" repeatCount="indefinite"/></text>`
    if (seed % 2) {
      // the coconut rests on the belly, then rises to the mouth for a sip
      const sip = `<animateTransform attributeName="transform" type="translate" values="0 0;-6 -6;-6 -6;0 0;0 0" keyTimes="0;.15;.45;.6;1" keySplines=".4 0 .6 1;0 0 1 1;.4 0 .6 1;0 0 1 1" calcMode="spline" dur="4.4s" begin="${r(b)}s" repeatCount="indefinite"/>`
      const coconut = `<g>${sip}<circle cx="8" cy="-6" r="4" fill="#6E4A2A" stroke="#2A211C" stroke-width=".6"/><circle cx="7" cy="-7.5" r="1.3" fill="#F4EBDD"/><path d="M7.5 -8 L4 -13" stroke="${accent}" stroke-width="1.2"/></g>`
      return { move, extra: `<g>${move}${shades}${coconut}</g>` + sigh }
    }
    // the sun hangs over the lounger, its rays turning and its glow breathing
    const sun =
      `<g transform="translate(22,-38)"><g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="${12 + (seed % 5)}s" repeatCount="indefinite"/>` +
      `<path d="M0 -7v3M0 4v3M-7 0h3M4 0h3M-5 -5l2 2M3 3l2 2M-5 5l2 -2M3 -3l2 -2" stroke="#FFB627" stroke-width="1.4"/></g><circle r="3.4" fill="#FFD84A" stroke="#FFB627"/>` +
      `<animate attributeName="opacity" values=".6;1;.6" dur="2.6s" begin="${r(b)}s" repeatCount="indefinite"/></g>`
    return { move, extra: `<g>${move}${shades}</g>` + sun + sigh }
  },
}
