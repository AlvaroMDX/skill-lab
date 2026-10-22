import type { Pt, RoomGeom } from './scene'
import { D, H, T, TH, TW, WALL_H, Y_MAX, box, iso, poly, pts, px, r } from './scene'

// Seasonal dressing for the whole lab, on top of each puesto's theme. 'auto' picks by date, 'off' shows nothing.
const IDS = ['halloween', 'navidad', 'nochevieja', 'reyes', 'sanvalentin', 'carnaval', 'primavera', 'verano', 'sanfermin', 'otono', 'invierno', 'cumple', 'fiesta'] as const
export type SeasonId = (typeof IDS)[number]
export const SEASONS = ['auto', 'off', ...IDS] as const

export const SEASON_NAMES: Record<string, string> = {
  auto: '🗓️ Automática (según la fecha)',
  off: '🚫 Sin decoración',
  halloween: '🎃 Halloween',
  navidad: '🎄 Navidad',
  nochevieja: '🎆 Nochevieja y Año Nuevo',
  reyes: '👑 Reyes Magos',
  sanvalentin: '💘 San Valentín',
  carnaval: '🎭 Carnaval',
  primavera: '🌸 Primavera',
  verano: '☀️ Verano',
  sanfermin: '🐂 San Fermín',
  otono: '🍂 Otoño',
  invierno: '❄️ Invierno',
  cumple: '🎂 Cumpleaños de Skill Lab',
  fiesta: '🪩 Modo fiesta',
}

// when 'auto' shows each one, for a hint next to the selector
export const SEASON_WHEN: Record<string, string> = {
  halloween: '20 oct – 2 nov',
  navidad: '1 dic – 7 ene',
  nochevieja: '31 dic – 1 ene',
  reyes: '5 – 6 ene',
  sanvalentin: '7 – 14 feb',
  carnaval: 'jueves lardero – miércoles de ceniza',
  primavera: '20 mar – 20 jun',
  verano: '21 jun – 22 sep',
  sanfermin: '6 – 14 jul',
  otono: '23 sep – 30 nov',
  invierno: '8 ene – 19 mar',
  cumple: '22 oct, el día que nació Skill Lab',
  fiesta: 'solo a mano',
}

const BIRTH_YEAR = 2026

const easterDay = (y: number) => {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const n = h + l - 7 * m + 114
  return Date.UTC(y, Math.floor(n / 31) - 1, (n % 31) + 1) / 864e5
}

// festivities first, then the plain season of the year, so 'auto' always has something to show
export function seasonByDate(date: Date): SeasonId {
  const v = (date.getMonth() + 1) * 100 + date.getDate()
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5
  const easter = easterDay(date.getFullYear())
  if (v === 1022) return 'cumple'
  if (v >= 1231 || v <= 101) return 'nochevieja'
  if (v >= 105 && v <= 106) return 'reyes'
  if (v >= 1201 || v <= 107) return 'navidad'
  if (v >= 1020 && v <= 1102) return 'halloween'
  if (day >= easter - 52 && day <= easter - 46) return 'carnaval'
  if (v >= 207 && v <= 214) return 'sanvalentin'
  if (v >= 706 && v <= 714) return 'sanfermin'
  if (v >= 320 && v <= 620) return 'primavera'
  if (v >= 621 && v <= 922) return 'verano'
  if (v >= 923 && v <= 1130) return 'otono'
  return 'invierno'
}

export function activeSeason(season: string, now: number): SeasonId | null {
  if (season === 'off') return null
  if ((IDS as readonly string[]).includes(season)) return season as SeasonId
  return seasonByDate(new Date(now))
}

type Ctx = { id: SeasonId; rooms: RoomGeom[]; W: number; date: Date; vw: number; vh: number; decor: string[]; lights: string[] }

function build(rooms: RoomGeom[], W: number, now: number, season: string): Ctx | null {
  const id = activeSeason(season, now)
  if (!id) return null
  const vw = Math.ceil((W + Y_MAX) * (TW / 2) + 80)
  const vh = Math.ceil((W + Y_MAX) * (TH / 2) + 180)
  const c: Ctx = { id, rooms, W, date: new Date(now), vw, vh, decor: [], lights: [] }
  CLOCK = now / 1000
  DRESS[id](c)
  return c
}

// Decorations drawn after the rooms and the street, before the characters (dimmed by the night shade).
export function seasonDecor(rooms: RoomGeom[], W: number, now: number, season: string) {
  const c = build(rooms, W, now, season)
  return c && c.decor.length ? `<g pointer-events="none" data-season="${c.id}">${c.decor.join('')}</g>` : ''
}

// Season lights, only shown at night: meant to go above the night shade, with the street lamps.
export function seasonLights(rooms: RoomGeom[], W: number, now: number, season: string) {
  const c = build(rooms, W, now, season)
  return c && c.lights.length ? `<g class="lamp-light" pointer-events="none">${c.lights.join('')}</g>` : ''
}

// ---------- helpers ----------

// integer mixing: string hashes of 'i:k' are too correlated, particles lined up
const rnd = (i: number, k = 0) => {
  let h = Math.imul(i + 1, 374761393) ^ Math.imul(k + 7, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const pick = <V,>(list: readonly V[], i: number) => list[i % list.length]!
const at = (p: [number, number], body: string, scale = 1) => `<g transform="translate(${r(p[0])},${r(p[1])})${scale !== 1 ? ` scale(${scale})` : ''}">${body}</g>`
// The svg is replaced on every redraw, which restarts SMIL at 0: begins follow the wall clock so a crossing carries on
// where it was instead of starting over (the Reyes and the bull never got past the first stretch of the street).
let CLOCK = 0
const begin = (dur: number, off = 0) => `begin="${-Math.round(((((CLOCK + off) % dur) + dur) % dur) * 1000) / 1000}s"`
const loop = (attr: string, values: string, dur: number, off = 0, extra = '') =>
  `<animate attributeName="${attr}" values="${values}" dur="${r(dur)}s" ${begin(r(dur), off)}${extra} repeatCount="indefinite"/>`
const motion = (path: string, dur: number, off = 0, extra = '') =>
  `<animateMotion path="${path}" dur="${r(dur)}s" ${begin(r(dur), off)}${extra} repeatCount="indefinite"/>`
const EASE = '.45 0 .55 1'
const eased = (n: number) => ` calcMode="spline" keySplines="${Array(n).fill(EASE).join(';')}"`

// Walkers crossing the whole island along the road at depth y, in +x: they come in and leave past the island's ends,
// clipped to the terrain, then wait out of sight for `rest` of the loop. `lead` puts one ahead of the others.
function parade(c: Ctx, body: string, y: number, speed: number, rest: number, lead = 0) {
  const dur = r((c.W + 16) / speed / (1 - rest))
  const path = `M${pts([iso(-8, y)])}L${pts([iso(c.W + 8, y)])}`
  c.decor.push(`<g clip-path="url(#world-clip)"><g>${body}${motion(path, dur, lead, ` keyPoints="0;1;1" keyTimes="0;${r(1 - rest)};1" calcMode="linear"`)}</g></g>`)
}
const glow = (color: string, rad: number) => `<circle r="${rad}" fill="${color}" fill-opacity=".18"/><circle r="${r(rad * 0.55)}" fill="${color}" fill-opacity=".28"/>`
const HEART = 'M0 2 L-3 -1 L-3 -2 L-2 -3 L-1 -3 L0 -2 L1 -3 L2 -3 L3 -2 L3 -1 Z'
const heart = (fill: string, s = 1) => `<path d="${HEART}" fill="${fill}"${s !== 1 ? ` transform="scale(${s})"` : ''}/>`
const RAINBOW = ['#E8574B', '#F2B33D', '#4FB06D', '#3E8ED0', '#9B5DC4', '#F07AAE']

// the big piece of the season (tree, cake, snowman…): in the patio if there is one, else on the sidewalk corner
function center(c: Ctx): Pt {
  const p = c.rooms.find(rm => rm.kind === 'patio' && rm.x1 - rm.x0 >= 3)
  return p ? { x: (p.x0 + p.x1) / 2 + 0.6, y: T(p, 1.8) } : { x: -1.6, y: H + 0.8 }
}
const corner = (c: Ctx, right = false): Pt => ({ x: right ? c.W + 1.6 : -1.6, y: H + 0.8 })

// sidewalk spots halfway between the street lamps, clear of the recycling bin and behind the strolling lane
function slots(c: Ctx): Pt[] {
  const bin = Math.round(c.W * 0.55)
  const out: Pt[] = []
  for (let x = 5; x < c.W - 1; x += 6) if (Math.abs(x - bin) > 1.8) out.push({ x, y: H + 0.45 })
  return out
}

type Run = { len: number; at: (s: number, z: number) => [number, number] }
// the two tall walls: the back one and the left one
const runs = (c: Ctx): Run[] => [
  { len: c.W, at: (s, z) => iso(s, 0, z) },
  { len: H, at: (s, z) => iso(0, s, z) },
]

// a rope hanging between nails along both tall walls; `item` dresses points along each swag
function swags(c: Ctx, z: number, step: number, sag: number, color: string, us: number[], item: (q: (ds: number, dz: number) => [number, number], i: number) => string, from = 0) {
  let rope = ''
  let items = ''
  let i = 0
  for (const run of runs(c)) {
    const start = run.len === c.W ? from + 0.2 : 0.2
    for (let a = start; a + step <= run.len - 0.1; a += step) {
      const b = a + step
      rope += `M${pts([run.at(a, z)])}Q${pts([run.at((a + b) / 2, z - 2 * sag)])} ${pts([run.at(b, z)])}`
      for (const u of us) {
        const s = a + step * u
        const zz = z - 4 * sag * u * (1 - u)
        items += item((ds, dz) => run.at(s + ds, zz + dz), i++)
      }
    }
  }
  return `<path d="${rope}" stroke="${color}" stroke-width="1" fill="none"/>${items}`
}

// coloured bulbs on a wire; at night they chase along it in threes, like a marquee
function garland(c: Ctx, colors: string[], from = 0, z = WALL_H - 2) {
  c.decor.push(
    swags(c, z, 1.6, 2.5, '#3B352F', [0.5], (q, i) => {
      const color = pick(colors, i)
      const [x, y] = q(0, -1.5)
      const chase = loop('opacity', '1;1;.3;.3;1', 1.8, -(i % 3) * 0.6, ' keyTimes="0;.3;.38;.92;1"')
      c.lights.push(at([x, y], `<g>${glow(color, 6)}<circle r="1.8" fill="${color}"/>${chase}</g>`))
      return `<circle cx="${r(x)}" cy="${r(y)}" r="1.8" fill="${color}"/>`
    }, from),
  )
}

// triangular flags (or any shape) hanging in the wall's plane
function bunting(c: Ctx, colors: string[], from = 0, shape: 'flag' | 'heart' = 'flag') {
  c.decor.push(
    swags(c, WALL_H - 1, 2, 2, '#6B5D4F', [0.2, 0.5, 0.8], (q, i) => {
      const color = pick(colors, i)
      return shape === 'heart' ? at(q(0, -3), heart(color, 0.9)) : poly([q(-0.17, 0), q(0.17, 0), q(0, -7)], color)
    }, from),
  )
}

// sky band above the back wall: flyers cross it parallel to the wall, from past the top edge of the view
// to past the right one, so neither end of the loop is ever on screen; then a pause before the next pass
function flyer(c: Ctx, body: string, z: number, speed: number, night = false, off = 0) {
  const top = iso(0, -2, WALL_H + z)[1]
  const x0 = Math.min(-4, (-50 - top) / (TH / 2))
  const x1 = c.W + 9
  const rest = 0.3
  const dur = (x1 - x0) / speed / (1 - rest)
  const path = `M${pts([iso(x0, -2, WALL_H + z)])}L${pts([iso(x1, -2, WALL_H + z)])}`
  const bob = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" dur="2.6s" ${begin(2.6, off)}${eased(2)} repeatCount="indefinite"/>`
  const svg = `<g><g>${body}${bob}</g>${motion(path, dur, off, ` keyPoints="0;1;1" keyTimes="0;${1 - rest};1" calcMode="linear"`)}</g>`
  ;(night ? c.lights : c.decor).push(svg)
}
const skyPoint = (c: Ctx, f: number, z: number) => iso(c.W * f, -5, WALL_H + z)

// falling (or rising) bits over the whole scene
function fall(c: Ctx, colors: string[], n: number, o: { w?: number; h?: number; dur?: number; up?: boolean; flip?: boolean; hearts?: boolean } = {}) {
  let s = ''
  const w = o.w ?? 2
  const h = o.h ?? 2
  for (let i = 0; i < n; i++) {
    const x = r(rnd(i, 1) * c.vw)
    const dur = (o.dur ?? 10) * (0.7 + rnd(i, 2) * 0.6)
    const drift = r((rnd(i, 3) - 0.5) * 70)
    const [y0, y1] = o.up ? [c.vh + 10, -20] : [-20, c.vh + 10]
    const span = y1 - y0
    const color = pick(colors, i)
    const shape = o.hearts
      ? heart(color, 0.8)
      : `<rect x="${-w / 2}" width="${w}" height="${h}" fill="${color}">${o.flip ? loop('width', `${w};${r(w * 0.15)};${w}`, 0.6 + rnd(i, 4) * 0.8, i) + loop('x', `${-w / 2};${r(-w * 0.075)};${-w / 2}`, 0.6 + rnd(i, 4) * 0.8, i) : ''}</rect>`
    const path = `M${x} ${y0}C${r(+x + +drift)} ${r(y0 + span / 3)} ${r(+x - +drift)} ${r(y0 + (2 * span) / 3)} ${r(+x + +drift / 2)} ${y1}`
    // confetti spins about its own middle as it flutters down, rather than collapsing onto one edge
    s += `<g opacity=".9">${shape}${motion(path, dur, rnd(i, 5) * dur)}</g>`
  }
  c.decor.push(s)
}

// a cloth banner across the frieze of the dorm's back wall, with sheared text like the wall signs
function banner(c: Ctx, text: string, fill: string, ink = '#FFF') {
  const x0 = 0.8
  const x1 = Math.min(11.2, c.W - 1)
  const a = WALL_H - 10
  const b = WALL_H - 1
  const [tx, ty] = iso((x0 + x1) / 2, 0, a + 2)
  c.decor.push(
    poly([iso(x0, 0, a), iso(x1, 0, a), iso(x1, 0, b), iso(x0, 0, b)], fill) +
      poly([iso(x0, 0, a), iso(x0 - 0.3, 0, a - 3), iso(x0, 0, b)], fill) + poly([iso(x1, 0, a), iso(x1 + 0.3, 0, a - 3), iso(x1, 0, b)], fill) +
      `<text transform="matrix(1,0.5,0,1,${r(tx)},${r(ty)})" font-size="7" font-weight="700" fill="${ink}" text-anchor="middle" letter-spacing=".5">${text}</text>`,
  )
  return x1 + 0.3
}

// snow lying on top of the tall walls, with icicles
function roofSnow(c: Ctx) {
  const Z = WALL_H
  let s = poly([iso(-0.3, -0.35, Z + 3), iso(c.W + 0.1, -0.35, Z + 3), iso(c.W + 0.1, 0.08, Z + 3), iso(-0.3, 0.08, Z + 3)], '#F7FAFD')
  s += poly([iso(-0.35, -0.3, Z + 3), iso(0.08, -0.3, Z + 3), iso(0.08, H + 0.1, Z + 3), iso(-0.35, H + 0.1, Z + 3)], '#F7FAFD')
  s += poly([iso(0.08, 0.08, Z), iso(c.W + 0.1, 0.08, Z), iso(c.W + 0.1, 0.08, Z + 3), iso(0.08, 0.08, Z + 3)], '#DCE8F2')
  s += poly([iso(0.08, 0.08, Z), iso(0.08, H + 0.1, Z), iso(0.08, H + 0.1, Z + 3), iso(0.08, 0.08, Z + 3)], '#E6EEF5')
  let ice = ''
  for (const run of runs(c)) {
    for (let k = 0.7; k < run.len; k += 1.3) {
      const [x, y] = run.at(k, Z)
      ice += `M${r(x - 1.5)} ${r(y)}L${r(x)} ${r(y + 3 + rnd(Math.round(k * 10), 7) * 5)}L${r(x + 1.5)} ${r(y)}Z`
    }
  }
  c.decor.push(s + `<path d="${ice}" fill="#DDEFFB"/>`)
}

function moon(c: Ctx, color = '#F4F1E1') {
  const p = skyPoint(c, 0.72, 70)
  c.lights.push(at(p, `${glow(color, 30)}<circle r="14" fill="${color}"/><circle cx="-4" cy="-3" r="3" fill="#000" fill-opacity=".08"/><circle cx="5" cy="4" r="2" fill="#000" fill-opacity=".08"/>`))
}

// ---------- sprites (pixel units of 2px, origin at the feet) ----------

const pumpkin = () =>
  px(-4, -6, 8, 6, '#E07A1F') + px(-5, -5, 1, 4, '#C8641A') + px(4, -5, 1, 4, '#C8641A') + px(-0.5, -6, 1, 6, '#C8641A') + px(-0.5, -8, 1.5, 2, '#4E6B2A') + face('#3A1D0A')
const face = (fill: string) => px(-3, -4.5, 1.5, 1.5, fill) + px(1.5, -4.5, 1.5, 1.5, fill) + px(-2.5, -2.5, 5, 1, fill) + px(-1, -2, 1, 0.8, fill)

const bat = (i: number) => {
  // a quick downstroke and a slower recovery, both wings in step
  const flap = (side: 1 | -1) => {
    const w = (y: number, tip: number) => `${-tip * side},${y} ${-4.5 * side},${r(y / 2 - 1)} ${-2 * side},-2 ${-2 * side},1`
    return `<polygon points="${w(-5, 7)}" fill="#5E4A7A">${loop('points', `${w(-5, 7)};${w(4, 6)};${w(-5, 7)}`, 0.36, i * 0.13, ' keyTimes="0;.35;1"')}</polygon>`
  }
  return flap(1) + flap(-1) + `<ellipse rx="2.2" ry="2.6" fill="#5E4A7A"/><rect x="-1.2" y="-1" width="1" height="1" fill="#FFD34D"/><rect x=".2" y="-1" width="1" height="1" fill="#FFD34D"/><rect x="-1.5" y="-4" width="1" height="2" fill="#5E4A7A"/><rect x=".5" y="-4" width="1" height="2" fill="#5E4A7A"/>`
}

const witch = () =>
  px(-8, -1, 14, 0.8, '#7A5A3A') + px(-10, -2.5, 3, 3, '#C9A15A') + px(-3, -6, 5, 5, '#2B2233') + px(-4, -3, 2, 2, '#4B2E5A') +
  px(-1, -8, 2.5, 2, '#8FBF6A') + px(-2.5, -9, 5.5, 1, '#2B2233') + px(-1, -12, 2.5, 3, '#2B2233') + px(-0.5, -13.5, 1.2, 1.5, '#2B2233')

const santa = () =>
  // two reindeer ahead of the sleigh, the first one with the red nose
  [6, 14].map((x, k) =>
    px(x, -5, 5, 2.5, '#8B5A2B') + px(x, -2.5, 0.8, 2.5, '#6E4520') + px(x + 4, -2.5, 0.8, 2.5, '#6E4520') + px(x + 4.5, -7.5, 2, 2.5, '#8B5A2B') +
    px(x + 4.5, -9.5, 0.6, 2, '#6E4520') + px(x + 6, -9.5, 0.6, 2, '#6E4520') + (k === 1 ? px(x + 6.5, -6.5, 1, 1, '#FF3B30') : ''),
  ).join('') +
  `<path d="M${2 * 2} ${-4 * 2}L${20 * 2} ${-6 * 2}" stroke="#E8C15A" stroke-width=".8"/>` +
  px(-6, -4.5, 9, 3.5, '#C0392B') + px(-7, -1, 11, 0.8, '#E8C15A') + px(-6.5, -7.5, 3, 3, '#8A6B47') +
  px(-3, -8.5, 4, 4, '#D63A2F') + px(-2.5, -10.5, 3, 2, '#F2C9A0') + px(-2.5, -9.5, 3, 1.5, '#FFF') + px(-3, -12.5, 4, 2, '#D63A2F') + px(-3.8, -13, 1, 1, '#FFF')

const cupid = () =>
  px(-4, -9, 2.5, 3, '#FFF') + px(-2, -7, 4, 4, '#F6C7A6') + px(-1.5, -10, 3, 3, '#F6C7A6') + px(-1.5, -11, 3, 1, '#E9B949') + px(-2, -3, 4, 1.5, '#FFF') +
  `<path d="M6 -16 Q12 -8 6 0" stroke="#A0522D" stroke-width="1.2" fill="none"/><path d="M6 -16 L6 0 M2 -8 L13 -8" stroke="#E25563" stroke-width=".8"/>` + px(6.5, -4.5, 1, 1, '#E25563')

const tree = () => {
  let s = px(-1.2, -4, 2.4, 4, '#6B4A2F')
  for (let k = 0; k < 4; k++) {
    const bw = 16 - k * 3.4
    const y0 = -4 - k * 4.5
    s += px(-bw / 2, y0 - 2, bw, 2, '#2F7A3E') + px(-(bw - 3) / 2, y0 - 4, bw - 3, 2, '#3A8F4A') + px(-(bw - 6) / 2, y0 - 5.5, Math.max(1, bw - 6), 1.5, '#47A257')
  }
  return s
}
const TREE_BULBS: [number, number][] = [[-5, -7], [4, -6], [-2, -10], [3, -12], [-4, -14], [1, -16], [-2, -20], [2, -22], [6, -9], [-6, -10]]
const star = (fill: string) => `<path d="M0 -6 L1.6 -2 L6 -2 L2.5 .8 L3.8 5 L0 2.5 L-3.8 5 L-2.5 .8 L-6 -2 L-1.6 -2 Z" fill="${fill}"/>`

const snowman = () =>
  `<ellipse cy="-1" rx="10" ry="3" fill="#000" fill-opacity=".1"/><ellipse cy="-8" rx="9" ry="8" fill="#F4F8FC"/><ellipse cy="-21" rx="6.5" ry="6" fill="#F7FAFD"/><ellipse cy="-31" rx="4.5" ry="4.2" fill="#FBFDFF"/>` +
  `<rect x="-6" y="-27" width="12" height="3" fill="#C0392B"/><rect x="2" y="-25" width="3" height="8" fill="#C0392B"/>` +
  `<rect x="-6" y="-35" width="12" height="2" fill="#2A211C"/><rect x="-4" y="-43" width="8" height="8" fill="#2A211C"/><rect x="-4" y="-38" width="8" height="1.5" fill="#C0392B"/>` +
  `<rect x="-2.5" y="-33" width="1.6" height="1.6" fill="#2A211C"/><rect x="1" y="-33" width="1.6" height="1.6" fill="#2A211C"/><path d="M0 -31 L6 -30 L0 -29.5 Z" fill="#E67E22"/>` +
  `<rect x="-.8" y="-20" width="1.6" height="1.6" fill="#2A211C"/><rect x="-.8" y="-15" width="1.6" height="1.6" fill="#2A211C"/>` +
  `<path d="M-6 -22 L-14 -28 M6 -21 L13 -27" stroke="#6B4A2F" stroke-width="1.4"/>`

const camel = (robe: string, skin: string) =>
  px(-6, -10, 10, 4, '#C79A5B') + px(-3, -12, 4, 2, '#B98B4E') + px(3.5, -14, 2, 7, '#C79A5B') + px(3.5, -15, 4.5, 2, '#C79A5B') +
  [-5.5, -3, 1, 2.8].map((x, k) => `<rect x="${x * 2}" y="-12" width="2" height="12" fill="#A87D45">${loop('height', k % 2 ? '12;10;12' : '10;12;10', 0.9)}</rect>`).join('') +
  px(-3, -19, 4, 7, robe) + px(-2.5, -22, 3, 3, skin) + px(-2.8, -24, 3.6, 2, '#F2C14E') + px(-2.8, -24.8, 0.8, 0.8, '#F2C14E') + px(-1.4, -24.8, 0.8, 0.8, '#F2C14E') + px(0, -24.8, 0.8, 0.8, '#F2C14E')

const bull = () =>
  px(-6, -8, 12, 5, '#2A1E17') + px(5, -10, 4, 4, '#2A1E17') + px(8.5, -12, 0.8, 2, '#EEE6D2') + px(5.5, -12, 0.8, 2, '#EEE6D2') + px(-7, -8, 1, 3, '#2A1E17') +
  [-5, -2, 2, 4.5].map((x, k) => `<rect x="${x * 2}" y="-6" width="2" height="6" fill="#1B130E">${loop('height', k % 2 ? '6;3;6' : '3;6;3', 0.35)}</rect>`).join('')
const runner = () =>
  px(-1.5, -9, 3, 5, '#FFF') + px(-1.5, -9, 3, 1, '#D22B2B') + px(-1.5, -5.5, 3, 0.8, '#D22B2B') + px(-1, -11, 2, 2, '#E8B98F') +
  [-1.2, 0.4].map((x, k) => `<rect x="${x * 2}" y="-8" width="1.6" height="8" fill="#FFF">${loop('height', k ? '8;5;8' : '5;8;5', 0.3)}</rect>`).join('') +
  px(1.5, -10, 2, 0.8, '#E8C15A')

const balloon = (color: string, i: number, h = 22) =>
  `<g><path d="M0 0 Q2 ${-h / 2} 0 ${-h}" stroke="#7A6E62" stroke-width=".6" fill="none"/><ellipse cy="${-h - 5}" rx="4" ry="5" fill="${color}"/><rect x="-1" y="${-h - 8}" width="1.4" height="2" fill="#FFF" fill-opacity=".6"/>` +
  float(i) + `</g>`

// balloons tug at their strings: a slow lift and a sideways drift on unrelated periods
const float = (i: number) => {
  const up = r(2.6 + (i % 3) * 0.5)
  const side = r(3.4 + (i % 4) * 0.45)
  return `<animateTransform attributeName="transform" type="translate" values="0 0;0 -3;0 0" dur="${up}s" ${begin(up, i * 0.7)}${eased(2)} repeatCount="indefinite"/>` +
    `<animateTransform attributeName="transform" type="rotate" values="-3;3;-3" dur="${side}s" ${begin(side, i * 1.1)}${eased(2)} additive="sum" repeatCount="indefinite"/>`
}

const butterfly = (c: Ctx, color: string, i: number) => {
  const [cx, cy] = iso(c.W * (0.15 + 0.7 * rnd(i, 11)), H + 0.4, 18 + rnd(i, 12) * 30)
  const a = 22 + rnd(i, 13) * 20
  const path = `M${r(cx)} ${r(cy)}c${r(a)} -18 ${r(a * 1.6)} 8 ${r(a)} 14c${r(-a / 2)} 8 ${r(-a * 1.3)} 4 ${r(-a)} -14z`
  const wing = (side: number) => `<ellipse cx="${side * 2.2}" rx="2.4" ry="3" fill="${color}">${loop('rx', '2.4;.4;2.4', 0.35, i * 0.11)}${loop('cx', `${side * 2.2};${side * 0.6};${side * 2.2}`, 0.35, i * 0.11)}</ellipse>`
  c.decor.push(`<g><g transform="scale(1.6)">${wing(-1)}${wing(1)}<rect x="-.5" y="-2.5" width="1" height="5" fill="#2A211C"/></g>${motion(path, 7 + rnd(i, 14) * 5, i * 1.3)}</g>`)
}

const planter = (p: Pt, i: number) => {
  let s = box(p.x - 0.7, p.y - 0.2, 0, 1.4, 0.4, 7, '#A0603A')
  for (let k = 0; k < 7; k++) {
    const [x, y] = iso(p.x - 0.55 + k * 0.18, p.y, 7)
    const h = 4 + (k % 3) * 3
    s += `<rect x="${r(x - 0.6)}" y="${r(y - h)}" width="1.2" height="${h}" fill="#4A8546"/><rect x="${r(x - 2.5)}" y="${r(y - h - 4)}" width="5" height="5" fill="${pick(['#F07AAE', '#F2D03D', '#E8574B', '#B98AE0', '#FFFFFF'], i + k)}"/>`
  }
  return s
}

// fireworks, night only: a rocket climbs and slows, bursts with a flash into two rings of sparks
// that fly out fast, slow down, droop under gravity and fade; every shell on its own period
function fireworks(c: Ctx, n: number) {
  const B = 0.3 // share of the loop spent climbing
  for (let k = 0; k < n; k++) {
    const p = skyPoint(c, 0.15 + (0.75 * k) / Math.max(1, n - 1), 60 + rnd(k, 20) * 35)
    const color = pick(['#FFD34D', '#FF6B6B', '#7FE0FF', '#B5FF7A', '#FF9DE2'], k)
    const dur = r(2.8 + rnd(k, 22) * 1.2)
    const off = rnd(k, 21) * dur
    const rise = 40
    let s = `<g>${'<path d="M0 0v7" stroke="#FFE9B0" stroke-width="1.4" stroke-linecap="round"/>'}` +
      motion(`M0 ${rise}V0`, dur, off, ` keyPoints="0;1;1" keyTimes="0;${B};1" calcMode="spline" keySplines=".2 .7 .4 1;0 0 1 1"`) +
      loop('opacity', '1;1;0;0', dur, off, ` keyTimes="0;${B - 0.01};${B};1"`) + `</g>`
    s += `<circle r="12" fill="${color}" opacity="0">${loop('opacity', `0;0;.45;0;0`, dur, off, ` keyTimes="0;${B};${B + 0.03};${B + 0.15};1"`)}</circle>`
    for (let j = 0; j < 10; j++) {
      const ang = (j / 10) * Math.PI * 2 + (j % 2) * 0.3
      const reach = j % 2 ? 15 : 25
      const [ex, ey] = [Math.cos(ang) * reach, Math.sin(ang) * reach]
      s += `<circle r="${j % 2 ? 1.2 : 1.6}" fill="${j % 2 ? '#FFF6D8' : color}" opacity="0">` +
        motion(`M0 0Q${r(ex * 0.95)} ${r(ey * 0.95 - 3)} ${r(ex)} ${r(ey + 10)}`, dur, off, ` keyPoints="0;0;1;1" keyTimes="0;${B};.92;1" calcMode="spline" keySplines="0 0 1 1;.1 .8 .3 1;0 0 1 1"`) +
        loop('opacity', '0;0;1;1;0;0', dur, off, ` keyTimes="0;${B};${B + 0.01};.6;.9;1"`) + `</circle>`
    }
    c.lights.push(at(p, s))
  }
}

// ---------- seasons ----------

const DRESS: Record<SeasonId, (c: Ctx) => void> = {
  halloween(c) {
    garland(c, ['#FF8C1A', '#9B5DC4', '#7CD957'])
    cobwebs(c)
    for (const [i, p] of slots(c).entries()) {
      const s = iso(p.x, p.y)
      c.decor.push(at(s, pumpkin(), i % 2 ? 1.1 : 1.4))
      c.lights.push(at(s, `<g transform="translate(0,-6)">${glow('#FF9A2E', 14)}</g>` + `<g>${face('#FFD34D')}${loop('opacity', '1;.6;1;.85;1', 1.3, i * 0.4)}</g>`, i % 2 ? 1.1 : 1.4))
    }
    const big = iso(center(c).x, center(c).y)
    c.decor.push(at(big, pumpkin(), 2.2))
    c.lights.push(at(big, `<g transform="translate(0,-14)">${glow('#FF9A2E', 18)}</g><g transform="scale(2.2)">${face('#FFD34D')}</g>`))
    // a ghost hovering by the right corner of the sidewalk
    const g = iso(corner(c, true).x, corner(c, true).y, 10)
    c.decor.push(at(g, `<g opacity=".88"><path d="M-7 0 V-12 Q-7 -20 0 -20 Q7 -20 7 -12 V0 L4.5 -3 L2.3 0 L0 -3 L-2.3 0 L-4.5 -3 Z" fill="#F4F2FA"/><rect x="-3.5" y="-14" width="2" height="3" fill="#2A211C"/><rect x="1.5" y="-14" width="2" height="3" fill="#2A211C"/>` +
      motion('M0 0 Q4 -6 0 -10 Q-4 -6 0 0', 4, 0, eased(2).replace('calcMode="spline"', 'calcMode="spline" keyPoints="0;.5;1" keyTimes="0;.5;1"')) + `</g>`))
    for (let i = 0; i < 5; i++) {
      const [cx, cy] = skyPoint(c, 0.2 + i * 0.16, 30 + rnd(i, 30) * 30)
      const path = `M${r(cx)} ${r(cy)}c30 -20 60 10 30 25c-25 12 -60 -5 -30 -25z`
      c.decor.push(`<g><g transform="scale(1.4)">${bat(i)}</g>${motion(path, 4 + rnd(i, 31) * 3, i)}</g>`)
    }
    moon(c, '#FFE2A8')
    flyer(c, witch(), 75, 1.6, true)
  },
  navidad(c) {
    christmas(c)
  },
  reyes(c) {
    christmas(c)
    // the three kings ride along the road, following the star
    const kings: [string, string][] = [['#7B3FA0', '#F2C9A0'], ['#2E7D5B', '#E8B98F'], ['#B8862B', '#8A5A3B']]
    kings.forEach(([robe, skin], k) => parade(c, at([0, 0], camel(robe, skin), 0.9), H + 3, 0.6, 0.2, (2 - k) * 2.6))
    const sp = skyPoint(c, 0.6, 95)
    c.decor.push(at(sp, `${star('#F2C14E')}<path d="M-4 1 L-40 18" stroke="#F2C14E" stroke-opacity=".5" stroke-width="2"/>`))
    c.lights.push(at(sp, `${glow('#FFE38A', 20)}${star('#FFF1B0')}`))
  },
  nochevieja(c) {
    const y = c.date.getMonth() === 11 ? c.date.getFullYear() + 1 : c.date.getFullYear()
    const from = banner(c, `¡FELIZ ${y}!`, '#2A2140', '#F2C14E')
    garland(c, ['#F2C14E', '#FFFFFF', '#F2C14E', '#E8574B'], from)
    fall(c, RAINBOW, 34, { w: 2, h: 3, dur: 11, flip: true })
    // a clock striking midnight at the sidewalk corner, like the one in Puerta del Sol
    const p = iso(center(c).x, center(c).y)
    c.decor.push(at(p, px(-1, -24, 2, 24, '#3B3F46') + `<circle cy="-56" r="9" fill="#F7F1E1" stroke="#3B3F46" stroke-width="2"/>` +
      `<path d="M0 -56 V-62 M0 -56 L4 -56" stroke="#2A211C" stroke-width="1.4"/>` + px(-3, -38, 6, 5, '#3B3F46') + `<circle cy="-71" r="3" fill="#F2C14E"/>`))
    c.lights.push(at(p, `<g transform="translate(0,-56)">${glow('#FFF1C2', 16)}</g>`))
    fireworks(c, 5)
  },
  sanvalentin(c) {
    bunting(c, ['#E25563', '#F07AAE', '#FFFFFF'], 0, 'heart')
    for (const [i, p] of slots(c).entries()) {
      const s = iso(p.x, p.y)
      c.decor.push(at(s, [-3, 0, 3].map((dx, k) => `<g transform="translate(${dx},0)">${heartBalloon(pick(['#E25563', '#F07AAE', '#C2185B'], i + k), i * 3 + k)}</g>`).join(''), 1.4))
    }
    fall(c, ['#F07AAE', '#E25563', '#FFC1D9'], 14, { up: true, hearts: true, dur: 16 })
    flyer(c, cupid(), 45, 1.1)
    garland(c, ['#FF7AA8'], 0, WALL_H - 9)
  },
  carnaval(c) {
    bunting(c, RAINBOW, c.W)
    let masks = ''
    for (let x = 2.5, i = 0; x < c.W - 1; x += 4, i++) {
      const color = pick(RAINBOW, i * 2)
      masks += at(iso(x, 0, WALL_H - 4), px(-4, -2, 8, 3, color) + px(-5, -3, 2, 2, color) + px(3, -3, 2, 2, color) + px(-3, -1.5, 2, 1, '#2A211C') + px(1, -1.5, 2, 1, '#2A211C') + px(4, -7, 1, 4, pick(RAINBOW, i * 2 + 3)))
    }
    c.decor.push(masks)
    fall(c, RAINBOW, 36, { w: 2, h: 3, dur: 12, flip: true })
    // streamers dangling from the back wall
    let st = ''
    for (let x = 1.4, i = 0; x < c.W - 1; x += 2.6, i++) {
      const [sx, sy] = iso(x, 0, WALL_H)
      st += `<path d="M${r(sx)} ${r(sy)}q3 3 0 6q-3 3 0 6" stroke="${pick(RAINBOW, i + 1)}" stroke-width="1.5" fill="none"/>`
    }
    c.decor.push(st)
  },
  primavera(c) {
    for (const [i, p] of slots(c).entries()) c.decor.push(planter(p, i))
    for (let i = 0; i < 6; i++) butterfly(c, pick(['#F2D03D', '#F07AAE', '#7FC8F8', '#FFFFFF', '#F2994A'], i), i)
    fall(c, ['#FFC1D9', '#FFFFFF', '#F7A8C8'], 14, { w: 2, h: 2, dur: 14, flip: true })
    flowersAt(c, center(c))
  },
  verano(c) {
    bunting(c, ['#E8574B', '#F2B33D', '#3E8ED0', '#4FB06D'])
    const sun = skyPoint(c, 0.72, 70)
    let rays = ''
    for (let k = 0; k < 12; k++) rays += `<rect x="-1.5" y="-26" width="3" height="7" fill="#FFC93C" transform="rotate(${k * 30})"/>`
    c.decor.push(at(sun, `<g>${rays}<animateTransform attributeName="transform" type="rotate" from="0" to="30" dur="6s" ${begin(6)} repeatCount="indefinite"/></g><circle r="15" fill="#FFD84F"/>` +
      px(-5, -2, 4, 2, '#2A211C') + px(1, -2, 4, 2, '#2A211C') + px(-1, -1.5, 2, 0.6, '#2A211C') + `<path d="M-5 5 Q0 9 5 5" stroke="#C8641A" stroke-width="1.4" fill="none"/>`))
    moon(c) // covers the sun at night
    // an inflatable pool with a duck and a bouncing beach ball
    const p = iso(center(c).x, center(c).y)
    c.decor.push(at(p, `<ellipse rx="30" ry="15" fill="#2F6FB0"/><ellipse cy="-5" rx="30" ry="15" fill="#4FA3E0"/><ellipse cy="-5" rx="22" ry="10.5" fill="#7FD3F0"/>` +
      `<path d="M-12 -6 q4 -2 8 0 M4 -2 q4 -2 8 0" stroke="#FFF" stroke-opacity=".7" fill="none">${loop('stroke-opacity', '.7;.2;.7', 2.5)}</path>` +
      `<g><path d="M-3 -10 h7 v3 h-7 z M2 -13 h3 v3 h-3 z" fill="#F2D03D"/><rect x="5" y="-12" width="2" height="1" fill="#E67E22"/>` + motion('M-6 0 L6 2 L-6 0', 7, 0, ' keyPoints="0;.5;1" keyTimes="0;.5;1"' + eased(2)) + `</g>` +
      `<g transform="translate(40,-2)"><ellipse rx="6" ry="2" fill="#000" fill-opacity=".15"/><g><circle cy="-6" r="6" fill="#FFF"/><path d="M-6 -6 A6 6 0 0 1 0 -12 V-6 Z" fill="#E8574B"/><path d="M0 -6 V0 A6 6 0 0 1 -6 -6 Z" fill="#3E8ED0"/><path d="M0 -12 A6 6 0 0 1 6 -6 H0 Z" fill="#F2D03D"/>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;0 -18;0 0" keyTimes="0;.5;1" calcMode="spline" keySplines=".2 .6 .4 1;.6 0 .8 .4" dur="1.2s" ${begin(1.2)} repeatCount="indefinite"/></g></g>`))
    for (const [i, s] of slots(c).entries()) {
      if (i % 2) continue
      c.decor.push(box(s.x - 0.45, s.y - 0.2, 0, 0.9, 0.4, 9, '#F4F1EA') + box(s.x - 0.45, s.y - 0.2, 9, 0.9, 0.4, 1.5, '#7FC8F8'))
      const [x, y] = iso(s.x, s.y, 10)
      c.decor.push(`<rect x="${r(x - 0.6)}" y="${r(y - 26)}" width="1.2" height="26" fill="#8C857C"/><path d="M${r(x - 15)} ${r(y - 24)} Q${r(x)} ${r(y - 38)} ${r(x + 15)} ${r(y - 24)} Z" fill="${pick(['#E8574B', '#3E8ED0'], i)}"/>` +
        `<path d="M${r(x - 5)} ${r(y - 31)} Q${r(x)} ${r(y - 37)} ${r(x + 5)} ${r(y - 31)} L${r(x + 3)} ${r(y - 24)} L${r(x - 3)} ${r(y - 24)} Z" fill="#FFF" fill-opacity=".6"/>` +
        at([x + 6, y - 2], px(-1, -6, 2, 3, '#F7A8C8') + px(-0.6, -3, 1.2, 3, '#D9A066')))
    }
  },
  sanfermin(c) {
    bunting(c, ['#D22B2B', '#FFFFFF'])
    // the runners a few strides ahead of the bull, all at the same pace so the gap holds along the whole street
    parade(c, runner(), H + 2.6, 3.2, 0.3, 0.9)
    parade(c, runner(), H + 3.1, 3.2, 0.3, 0.55)
    parade(c, bull(), H + 2.85, 3.2, 0.3)
    // red scarves knotted on the street lamps' arms
    for (let x = 2; x < c.W; x += 6) {
      const [lx, ly] = iso(x, H + 0.55)
      c.decor.push(`<path d="M${r(lx + 2)} ${r(ly - 62)} l3 0 l-1 6 z" fill="#D22B2B"/>`)
    }
  },
  otono(c) {
    fall(c, ['#D9822B', '#B5542C', '#E3B23C', '#8E5A2E'], 20, { w: 3, h: 2, dur: 13, flip: true })
    for (const [i, p] of slots(c).entries()) {
      const [x, y] = iso(p.x, p.y)
      let pile = ''
      for (let k = 0; k < 6; k++) pile += px((rnd(i * 6 + k, 40) - 0.5) * 8, -1 - rnd(i * 6 + k, 41) * 3, 2, 1.2, pick(['#D9822B', '#B5542C', '#E3B23C'], k + i))
      c.decor.push(at([x, y], pile, 1.5))
    }
    // the chestnut seller: a little cart with a smoking brazier
    const p = center(c)
    c.decor.push(box(p.x - 0.8, p.y - 0.4, 0, 1.6, 0.8, 16, '#6B4A2F') + box(p.x - 0.5, p.y - 0.3, 16, 0.8, 0.6, 4, '#3B3F46'))
    const [bx, by] = iso(p.x - 0.1, p.y, 20)
    let smoke = ''
    for (let k = 0; k < 4; k++) {
      smoke += `<circle r="3" fill="#D8D2C8">${motion('M0 0 q-4 -10 2 -22 q4 -8 -2 -16', 3.2, k * 0.8)}${loop('fill-opacity', '.7;.4;0', 3.2, k * 0.8)}${loop('r', '2;4;6', 3.2, k * 0.8)}</circle>`
    }
    c.decor.push(at([bx, by], smoke + px(-2, -1, 4, 1, '#E8574B')))
    c.decor.push(at(iso(p.x + 0.4, p.y + 0.4, 12), `<rect x="-22" y="-8" width="24" height="8" fill="#F4ECDC"/><text x="-10" y="-2" font-size="6" font-weight="700" fill="#6B4A2F" text-anchor="middle">CASTAÑAS</text>`))
    c.lights.push(at([bx, by], glow('#FF8A3D', 12)))
  },
  invierno(c) {
    roofSnow(c)
    fall(c, ['#FFFFFF', '#EAF4FF'], 26, { w: 2, h: 2, dur: 12 })
    c.decor.push(at(iso(center(c).x, center(c).y), snowman(), 1.5))
  },
  cumple(c) {
    const n = c.date.getFullYear() - BIRTH_YEAR
    const from = banner(c, n <= 0 ? '¡HOY NACE SKILL LAB!' : `¡${n} ${n === 1 ? 'AÑO' : 'AÑOS'} DE SKILL LAB!`, '#D97757')
    bunting(c, ['#D97757', '#F2B33D', '#7FC8F8', '#F07AAE'], from)
    for (const [i, p] of slots(c).entries()) {
      c.decor.push(at(iso(p.x, p.y), [-4, 0, 4].map((dx, k) => `<g transform="translate(${dx},0)">${balloon(pick(RAINBOW, i * 3 + k), i * 3 + k, 20 + k * 4)}</g>`).join(''), 1.4))
    }
    fall(c, RAINBOW, 24, { w: 2, h: 3, dur: 12, flip: true })
    // the cake, with as many candles as years (at least one)
    const p = iso(center(c).x, center(c).y)
    const candles = Math.min(9, Math.max(1, n))
    let top = ''
    let flames = ''
    for (let k = 0; k < candles; k++) {
      const x = r(-12 + (24 * (k + 0.5)) / candles)
      top += `<rect x="${r(+x - 1)}" y="-40" width="2" height="7" fill="${pick(['#7FC8F8', '#F07AAE', '#F2D03D'], k)}"/>`
      flames += `<ellipse cx="${x}" cy="-42" rx="1.4" ry="2.4" fill="#FFB43D">${loop('ry', '2.4;1.6;2.4', 0.6, k * 0.2)}</ellipse>`
    }
    c.decor.push(at(p, `<ellipse rx="24" ry="10" fill="#000" fill-opacity=".12"/><rect x="-22" y="-18" width="44" height="17" fill="#F6E3C8"/><ellipse cy="-1" rx="22" ry="8" fill="#E8CFAE"/><ellipse cy="-18" rx="22" ry="8" fill="#FBEFDF"/>` +
      `<path d="M-22 -18 q5 6 10 0 q5 6 10 0 q5 6 10 0 q5 6 10 0 q1 3 2 0" stroke="#F07AAE" stroke-width="2.5" fill="none"/>` +
      `<rect x="-15" y="-31" width="30" height="13" fill="#F07AAE"/><ellipse cy="-18.5" rx="15" ry="5" fill="#E05F97"/><ellipse cy="-31" rx="15" ry="5" fill="#F7A8C8"/>` +
      `<circle cx="-7" cy="-31" r="1.5" fill="#D63A2F"/><circle cx="6" cy="-30" r="1.5" fill="#D63A2F"/>${top}${flames}`))
    c.lights.push(at(p, `<g transform="translate(0,-42)">${glow('#FFC861', 26)}</g>`))
  },
  fiesta(c) {
    bunting(c, RAINBOW)
    fall(c, RAINBOW, 30, { w: 2, h: 3, dur: 9, flip: true })
    // a disco ball over the corridor, with beams that sweep the floor
    const cx = c.W / 2
    const [bx, by] = iso(cx, H / 2 - 0.5, WALL_H - 6)
    const [tx, ty] = iso(cx, H / 2 - 0.5, WALL_H + 30)
    let tiles = ''
    for (let k = 0; k < 9; k++) tiles += `<rect x="${-6 + (k % 3) * 4}" y="${-6 + Math.floor(k / 3) * 4}" width="3" height="3" fill="#E9EEF5">${loop('fill', '#E9EEF5;#9FB3C8;#FFFFFF;#E9EEF5', 1.2, k * 0.3)}</rect>`
    c.decor.push(`<path d="M${r(tx)} ${r(ty)}L${r(bx)} ${r(by - 7)}" stroke="#8C857C"/>` + at([bx, by], `<circle r="8" fill="#B8C4D2"/>${tiles}`))
    let beams = ''
    for (let k = 0; k < 5; k++) {
      const [fx, fy] = iso(cx - 6 + k * 3, H / 2 + (k % 2 ? 1.5 : -1.5))
      beams += `<path d="M${r(bx)} ${r(by)}L${r(fx - 8)} ${r(fy)}L${r(fx + 8)} ${r(fy)}Z" fill="${pick(RAINBOW, k)}" fill-opacity=".22">${loop('fill-opacity', '.25;.05;.25', 1.6, k * 0.4)}</path>`
    }
    c.decor.push(beams)
    c.lights.push(beams + at([bx, by], glow('#FFFFFF', 16)))
    fireworks(c, 3)
  },
}

function christmas(c: Ctx) {
  roofSnow(c)
  garland(c, ['#E8574B', '#F2C14E', '#4FB06D', '#3E8ED0'], 0, WALL_H - 5)
  fall(c, ['#FFFFFF', '#EAF4FF'], 22, { w: 2, h: 2, dur: 13 })
  const p = center(c)
  const base = iso(p.x, p.y)
  const baubles = TREE_BULBS.map(([x, y], i) => px(x, y, 1.6, 1.6, pick(['#E8574B', '#F2C14E', '#3E8ED0', '#F4F1EA'], i))).join('')
  c.decor.push(at(base, tree() + baubles + `<g transform="translate(0,-48)">${star('#F2C14E')}</g>`, 1.8))
  c.lights.push(at(base, TREE_BULBS.map(([x, y], i) => `<rect x="${x * 2}" y="${y * 2}" width="3.2" height="3.2" fill="${pick(['#FF6B6B', '#FFE066', '#7FC8F8', '#FFFFFF'], i)}">${loop('fill-opacity', '1;.2;1', 1.1 + (i % 3) * 0.4, i * 0.3)}</rect>`).join('') +
    `<g transform="translate(0,-48)">${glow('#FFE38A', 14)}${star('#FFF1B0')}</g>`, 1.8))
  // presents under the tree, as real isometric boxes
  const gifts: [number, number, string][] = [[-1.1, 0.5, '#C0392B'], [0.7, 0.6, '#3E8ED0'], [-0.2, 0.9, '#F2C14E']]
  for (const [dx, dy, color] of gifts) c.decor.push(box(p.x + dx - 0.25, p.y + dy - 0.25, 0, 0.5, 0.5, 7, color) + box(p.x + dx - 0.04, p.y + dy - 0.26, 0, 0.08, 0.52, 7.4, '#FFF'))
  flyer(c, santa(), 40, 1.3, true)
  wreath(c)
}

// a wreath over the building's street door, at the end of the corridor
function wreath(c: Ctx) {
  const [x, y] = iso(c.W, D + 0.5, 22)
  c.decor.push(at([x, y], `<circle r="6" fill="none" stroke="#2F7A3E" stroke-width="3.5"/><circle cx="-3" cy="-3" r="1.2" fill="#E8574B"/><circle cx="3.5" cy="1" r="1.2" fill="#E8574B"/><path d="M-2 5 L0 3 L2 5 L0 8 Z" fill="#C0392B"/>`))
}

function cobwebs(c: Ctx) {
  const web = (o: [number, number], spokes: [number, number][]) => {
    let d = spokes.map(s => `M${pts([o])}L${pts([s])}`).join('')
    for (const f of [0.35, 0.65, 0.95]) {
      const ring = spokes.map(([x, y]) => [o[0] + (x - o[0]) * f, o[1] + (y - o[1]) * f] as [number, number])
      d += `M${pts([ring[0]!])}` + ring.slice(1).map((q, k) => {
        const prev = ring[k]!
        const mid: [number, number] = [(prev[0] + q[0]) / 2 + (o[0] - (prev[0] + q[0]) / 2) * 0.15, (prev[1] + q[1]) / 2 + (o[1] - (prev[1] + q[1]) / 2) * 0.15]
        return `Q${pts([mid])} ${pts([q])}`
      }).join('')
    }
    return `<path d="${d}" stroke="#FFFFFF" stroke-opacity=".75" stroke-width=".7" fill="none"/>`
  }
  const Z = WALL_H
  c.decor.push(web(iso(0, 0, Z), [iso(2.4, 0, Z), iso(1.8, 0, Z - 16), iso(0, 0, Z - 24), iso(0, 1.8, Z - 16), iso(0, 2.4, Z)]))
  c.decor.push(web(iso(c.W, 0, Z), [iso(c.W - 2.4, 0, Z), iso(c.W - 1.6, 0, Z - 14), iso(c.W, 0, Z - 20)]))
  // a spider going up and down its thread
  const [sx, sy] = iso(1.2, 0, Z - 6)
  c.decor.push(`<line x1="${r(sx)}" y1="${r(sy)}" x2="${r(sx)}" y2="${r(sy + 14)}" stroke="#FFF" stroke-opacity=".6" stroke-width=".6">${loop('y2', `${r(sy + 8)};${r(sy + 22)};${r(sy + 8)}`, 5, 0, ' keyTimes="0;.5;1"' + eased(2))}</line>` +
    `<g><ellipse rx="2.5" ry="2" fill="#2A211C"/><path d="M-5 -2 L5 2 M-5 2 L5 -2 M-5 0 L5 0" stroke="#2A211C" stroke-width=".8"/>` +
    motion(`M${r(sx)} ${r(sy + 8)} V${r(sy + 22)}`, 5, 0, ' keyPoints="0;1;0" keyTimes="0;.5;1"' + eased(2)) + `</g>`)
}

function heartBalloon(color: string, i: number) {
  return `<g><path d="M0 0 Q2 -10 0 -20" stroke="#7A6E62" stroke-width=".6" fill="none"/><g transform="translate(0,-25)">${heart(color, 1.8)}</g>` +
    float(i) + `</g>`
}

function flowersAt(c: Ctx, p: Pt) {
  let s = ''
  for (let k = 0; k < 16; k++) {
    const [x, y] = iso(p.x + (rnd(k, 50) - 0.5) * 3.4, p.y + (rnd(k, 51) - 0.5) * 2)
    s += `<rect x="${r(x - 0.6)}" y="${r(y - 8)}" width="1.2" height="8" fill="#4A8546"/><rect x="${r(x - 3)}" y="${r(y - 12)}" width="6" height="6" fill="${pick(['#F07AAE', '#F2D03D', '#E8574B', '#B98AE0', '#FFFFFF'], k)}"/><rect x="${r(x - 1)}" y="${r(y - 10)}" width="2" height="2" fill="#F2B33D"/>`
  }
  c.decor.push(s)
}
