import { LABS, ROOM_ORDER } from './labs'
import type { Lab, Theme } from './labs'
import { worldGround, worldOverlay, worldProps } from './world'
import { floorDecor, wallDecor } from './decor'
import { racks } from './racks'
import { seasonDecor } from './season'
import { greenhouse } from './themes/greenhouse'
import { music } from './themes/music'
import { space } from './themes/space'
import { kitchen } from './themes/kitchen'
import { beach } from './themes/beach'
import { casino } from './themes/casino'

export type ServiceStatus = { up: boolean; code?: number; ms?: number }

// A puesto theme living in its own file: floor colour, furniture with stations, and how a skill works at them.
// Its stations use the theme name as kind, so workAnim sends them back to `work`.
export type ThemeModule = {
  floor: string
  furnish: (room: RoomGeom, lab: Lab, active: boolean) => Furnished
  work: (seed: number, accent: string) => { move: string; extra: string }
}
const THEME_MODULES: Partial<Record<Theme, ThemeModule>> = { greenhouse, music, space, kitchen, beach, casino }

export type CrewMember = {
  lab: string | null
  from: string | null
  since: number
  uses: number
  session?: string
}

export type Activity = 'pensando' | 'escribiendo' | 'leyendo' | 'ejecutando' | 'delegando' | 'esperando' | 'pregunta' | 'listo' | 'idle'

export type AgentView = {
  id: string
  label: string
  lab: string
  activity: Activity
  subagents: { id: string; label: string }[]
}

export type Coat = 'gris' | 'naranja' | 'negro' | 'blanco' | 'siames' | 'tricolor' | 'militar'
export const COATS: Coat[] = ['gris', 'naranja', 'negro', 'blanco', 'siames', 'tricolor', 'militar']
export type Cat = { name: string; coat: Coat }

const TW = 36
const TH = 18
const D = 8 // room depth in tiles
const H = 2 * D + 1 // building depth: two rows of rooms plus the corridor
const CORRIDOR_Y = D + 0.5
const DORM_W = 12
const DORM_AISLE_X = 6.05
const STREET_NEAR = H + 1.1
const STREET_FAR = H + 5.1
const Y_MAX = H + 5.8
const WALL_H = 70
const WALK_SPEED = 75
const STROLL_SPEED = 26

export type Pt = { x: number; y: number }
export type RoomGeom = { id: string; kind: 'dorm' | 'lab' | 'patio'; theme?: Theme; x0: number; x1: number; y0: number; y1: number; top: boolean }
export type Station = Pt & { kind: StationKind; z?: number }
export type StationKind = 'lab' | 'bike' | 'tread' | 'bench' | 'cafe' | 'read' | 'arcade' | 'drill' | 'smoke' | Theme

const PALETTE = ['#D97757', '#E08B6D', '#C8644A', '#E9A07E', '#D4835F', '#BF5B3F', '#E6B191', '#CF7050', '#DB9068', '#B9684E', '#E39A73', '#C97C5D']
const CLAUDE = '#D97757'
const WOOD = '#A27552'
const MATTRESS = '#F6F2EA'

// projection origin, set per render because the building's size depends on the layout
let OX = 0
let OY = 0

const r = (n: number) => Math.round(n * 10) / 10
const iso = (x: number, y: number, z = 0): [number, number] => [(x - y) * (TW / 2) + OX, (x + y) * (TH / 2) + OY - z]
const pts = (list: [number, number][]) => list.map(([a, b]) => `${r(a)},${r(b)}`).join(' ')
const poly = (list: [number, number][], fill: string, extra = '') => `<polygon points="${pts(list)}" fill="${fill}"${extra}/>`
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// Screen offset of tile (x, y) from tile (0, 0): pieces drawn at the origin are reused with <use>.
const at = (x: number, y: number, z = 0) => `transform="translate(${r((x - y) * (TW / 2))},${r((x + y) * (TH / 2) - z)})"`
const tr = (p: [number, number]) => `transform="translate(${r(p[0])},${r(p[1])})"`

const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1)))))
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export const colorOf = (skill: string) => PALETTE[hash(skill) % PALETTE.length] ?? PALETTE[0]!
const labById = (id: string): Lab => LABS.find(l => l.id === id) ?? LABS[LABS.length - 1]!

function faces(x: number, y: number, z: number, w: number, d: number, h: number) {
  return {
    right: [iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)] as [number, number][],
    left: [iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)] as [number, number][],
    top: [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)] as [number, number][],
  }
}

function box(x: number, y: number, z: number, w: number, d: number, h: number, color: string) {
  const f = faces(x, y, z, w, d, h)
  const solid = w > 0.25 && d > 0.25
  // a soft contact shadow under furniture standing on the floor, and a lit edge along the top
  const shadow = solid && z === 0 && h > 2 ? poly([iso(x + 0.06, y + 0.06), iso(x + w + 0.16, y + 0.06), iso(x + w + 0.16, y + d + 0.16), iso(x + 0.06, y + d + 0.16)], '#000', ' fill-opacity=".1"') : ''
  const edge = solid ? `<path d="M${pts([iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y, z + h)])}" stroke="#FFF" stroke-opacity=".3" fill="none"/>` : ''
  return shadow + poly(f.right, shade(color, 0.72)) + poly(f.left, shade(color, 0.86)) + poly(f.top, color) + edge
}

// A box tinted by the `color` of the <use> that draws it.
function tintBox(x: number, y: number, z: number, w: number, d: number, h: number, opacity = 1) {
  const f = faces(x, y, z, w, d, h)
  const o = opacity < 1 ? ` fill-opacity="${opacity}"` : ''
  return (
    poly(f.right, 'currentColor', o) + poly(f.right, '#000', ' fill-opacity=".28"') +
    poly(f.left, 'currentColor', o) + poly(f.left, '#000', ' fill-opacity=".14"') +
    poly(f.top, 'currentColor', o)
  )
}

const floorQuad = (x0: number, y0: number, x1: number, y1: number, fill: string, extra = '') => poly([iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)], fill, extra)

function wallText(text: string, x: number, z: number, size: number, fill: string) {
  const [tx, ty] = iso(x, 0, z)
  return `<text transform="matrix(1,0.5,0,1,${r(tx)},${r(ty)})" font-size="${size}" font-weight="700" fill="${fill}" text-anchor="middle">${esc(text)}</text>`
}

// ---------- layout ----------

export function layout(): { rooms: RoomGeom[]; W: number } {
  const labs = ROOM_ORDER.map(id => labById(id))
  const rows: { top: boolean; items: { id: string; kind: RoomGeom['kind']; theme?: Theme; width: number }[] }[] = [
    { top: true, items: [{ id: 'dorm', kind: 'dorm', width: DORM_W }, ...labs.filter(l => l.row === 'top').map(l => ({ id: l.id, kind: 'lab' as const, theme: l.theme, width: l.width }))] },
    { top: false, items: labs.filter(l => l.row === 'bottom').map(l => ({ id: l.id, kind: 'lab' as const, theme: l.theme, width: l.width })) },
  ]
  const W = Math.max(20, ...rows.map(row => row.items.reduce((s, i) => s + i.width, 0)))
  const rooms: RoomGeom[] = []
  for (const row of rows) {
    let x = 0
    for (const item of row.items) {
      rooms.push({ id: item.id, kind: item.kind, theme: item.theme, x0: x, x1: x + item.width, y0: row.top ? 0 : D + 1, y1: row.top ? D : H, top: row.top })
      x += item.width
    }
    // a shorter row is finished with a small patio
    if (x < W) rooms.push({ id: row.top ? 'patio-top' : 'patio-bottom', kind: 'patio', x0: x, x1: W, y0: row.top ? 0 : D + 1, y1: row.top ? D : H, top: row.top })
  }
  return { rooms, W }
}

// distance t from the far wall (the one opposite the door) to a y coordinate
const T = (room: RoomGeom, t: number) => (room.top ? room.y0 + t : room.y1 - t)
const spanY = (room: RoomGeom, ta: number, tb: number) => {
  const a = T(room, ta)
  const b = T(room, tb)
  return { y: Math.min(a, b), d: Math.abs(b - a) }
}
const boxT = (room: RoomGeom, x: number, ta: number, tb: number, z: number, w: number, h: number, color: string) => {
  const { y, d } = spanY(room, ta, tb)
  return box(x, y, z, w, d, h, color)
}
const entryY = (room: RoomGeom) => (room.top ? D - 0.5 : D + 1.5)
const doorX = (room: RoomGeom) => (room.x0 + room.x1) / 2
const columns = (room: RoomGeom, step: number, from = 1.2, margin = 1.5) => {
  const xs: number[] = []
  for (let x = room.x0 + from; x <= room.x1 - margin; x += step) xs.push(x)
  return xs
}

// ---------- reusable pieces ----------

const U = 2
const px = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
  `<rect x="${x * U}" y="${y * U}" width="${w * U}" height="${h * U}" fill="${fill}"${extra}/>`

// Costumes: accessories drawn over the sprite. The body stays currentColor, so it still takes each puesto's colour.
export type Skin = 'clasico' | 'pirata' | 'alien' | 'astronauta' | 'mago' | 'vaquero' | 'ninja' | 'chef' | 'vikingo'
export const SKINS: Skin[] = ['clasico', 'pirata', 'alien', 'astronauta', 'mago', 'vaquero', 'ninja', 'chef', 'vikingo']
let SKILL_SKIN: Skin = 'clasico'
let AGENT_SKIN: Skin = 'clasico'

function skillCostume(skin: Skin, kind: 'awake' | 'asleep') {
  const open = kind === 'awake'
  switch (skin) {
    case 'pirata':
      return px(-6, -10.6, 12, 1.8, '#C8423A') + px(-4, -10.6, 1, 1.8, '#FFFFFF', ' opacity=".7"') + px(1, -10.6, 1, 1.8, '#FFFFFF', ' opacity=".7"') + px(6, -10.2, 2, 0.8, '#C8423A') + px(6.4, -9.4, 1.2, 1.6, '#A8322C') +
        (open ? px(1.4, -8, 2.4, 2.4, '#111') + px(-6, -8.4, 12, 0.5, '#111') : '')
    case 'alien':
      return px(-4.3, -13, 0.6, 3.4, '#5FCB4F') + px(3.7, -13, 0.6, 3.4, '#5FCB4F') + px(-4.8, -14, 1.6, 1.6, '#9BFF6B') + px(3.2, -14, 1.6, 1.6, '#9BFF6B') +
        (open ? px(-0.6, -9.6, 1.2, 1.2, '#2A211C') + px(-0.3, -9.4, 0.5, 0.5, '#9BFF6B') : '')
    case 'astronauta':
      return `<rect x="${-8 * U}" y="${-12 * U}" width="${16 * U}" height="${10 * U}" rx="${4 * U}" fill="#CFE8F5" fill-opacity=".28" stroke="#FFFFFF" stroke-width="1.2"/>` +
        px(-5, -11.2, 3, 1, '#FFFFFF', ' opacity=".7"') + px(-2, -2.6, 4, 1, '#B8B2A7')
    case 'mago':
      return `<path d="M${-6 * U} ${-9 * U} L${6 * U} ${-9 * U} L${1.5 * U} ${-17 * U} Z" fill="#5E3FA3"/>` + px(-7, -9.8, 14, 1, '#4A2F85') +
        `<text x="${-1 * U}" y="${-11.2 * U}" font-size="5" fill="#FFE34F">★</text>`
    case 'vaquero':
      return px(-8.5, -10, 17, 1, '#7A4E2D') + px(-4, -12.6, 8, 2.8, '#8A5A3B') + px(-4, -10.8, 8, 0.6, '#3B2A1C')
    case 'ninja':
      return px(-6, -8.6, 12, 2.6, '#232326') + px(6, -8.2, 2.4, 0.8, '#232326') + px(6.4, -7.4, 1.6, 0.8, '#232326') +
        (open ? px(-3, -7.7, 1, 1, '#FFFFFF') + px(2, -7.7, 1, 1, '#FFFFFF') : '')
    case 'chef':
      return px(-4, -12.6, 8, 3.6, '#FFFFFF') + px(-5, -14.4, 10, 2.2, '#FFFFFF') + px(-4, -9.6, 8, 0.6, '#D8D4CC')
    case 'vikingo':
      return px(-5, -11, 10, 2.2, '#8C8F94') + px(-5, -9.2, 10, 0.6, '#6E7177') + px(-7.4, -12.6, 1.4, 2.6, '#F4EBDD') + px(6, -12.6, 1.4, 2.6, '#F4EBDD') + px(-7.8, -13.6, 1, 1.2, '#F4EBDD') + px(6.8, -13.6, 1, 1.2, '#F4EBDD')
    default:
      return ''
  }
}

// Robots: the shell changes with the costume; the chest light and the antenna tip stay currentColor (the puesto's colour).
const AGENT_LOOK: Record<Skin, { shell: string; visor: string; eyes: string; hat: string }> = {
  clasico: { shell: '#EFE6D6', visor: '#262B33', eyes: '#7FE3FF', hat: '' },
  pirata: { shell: '#E2D2B0', visor: '#262B33', eyes: '#FFD36B', hat: px(-7, -12.4, 14, 1.4, '#1C1A19') + px(-5, -14.6, 10, 2.4, '#1C1A19') + px(-1, -14.2, 2, 1.4, '#F4EBDD') },
  alien: { shell: '#A8E890', visor: '#1E2B1A', eyes: '#9BFF6B', hat: px(-5, -13.6, 0.6, 3, '#5FCB4F') + px(4.4, -13.6, 0.6, 3, '#5FCB4F') + px(-5.4, -14.6, 1.4, 1.4, '#9BFF6B') + px(4, -14.6, 1.4, 1.4, '#9BFF6B') },
  astronauta: { shell: '#F7F7F2', visor: '#C9A23A', eyes: '#FFF3C2', hat: `<rect x="${-8 * U}" y="${-13 * U}" width="${16 * U}" height="${11 * U}" rx="${5 * U}" fill="#CFE8F5" fill-opacity=".22" stroke="#FFFFFF" stroke-width="1.2"/>` },
  mago: { shell: '#D9CCF0', visor: '#262B33', eyes: '#FFE34F', hat: `<path d="M${-6 * U} ${-10.6 * U} L${6 * U} ${-10.6 * U} L${1 * U} ${-19 * U} Z" fill="#5E3FA3"/>` },
  vaquero: { shell: '#E8D3B0', visor: '#3B2A1C', eyes: '#FFD36B', hat: px(-8.5, -11.4, 17, 1, '#7A4E2D') + px(-4, -14, 8, 2.8, '#8A5A3B') },
  ninja: { shell: '#2E2B2A', visor: '#111111', eyes: '#FF4F4F', hat: px(-6, -9.8, 12, 1, '#C8423A') + px(6, -9.6, 2.4, 0.8, '#C8423A') },
  chef: { shell: '#F4F1EA', visor: '#262B33', eyes: '#7FE3FF', hat: px(-4, -14.2, 8, 3.4, '#FFFFFF') + px(-5, -15.8, 10, 2, '#FFFFFF') },
  vikingo: { shell: '#D8CBB3', visor: '#262B33', eyes: '#7FE3FF', hat: px(-5.4, -12.6, 10.8, 2, '#8C8F94') + px(-7.6, -14, 1.4, 2.6, '#F4EBDD') + px(6.2, -14, 1.4, 2.6, '#F4EBDD') },
}

function spriteDef(id: string, kind: 'awake' | 'asleep') {
  let s = `<ellipse rx="13" ry="4" fill="#000" opacity=".18"/>`
  for (const lx of [-5, -3, 2, 4]) s += px(lx, -3, 1, 3, 'currentColor') + px(lx, -3, 1, 3, '#000', ' opacity=".22"')
  s += px(-6, -9, 12, 6, 'currentColor') + px(-6, -4, 12, 1, '#000', ' opacity=".2"')
  s += px(-7, -6.5, 1, 2, 'currentColor') + px(6, -6.5, 1, 2, 'currentColor')
  if (kind === 'asleep') {
    s += px(-3.5, -6, 2, 0.6, '#2A211C') + px(1.5, -6, 2, 0.6, '#2A211C')
  } else {
    s += px(-3, -7.5, 1, 2, '#2A211C') + px(2, -7.5, 1, 2, '#2A211C') + px(-6, -8.6, 12, 0.8, 'var(--g, transparent)')
  }
  // a lit pixel on the shoulder gives the body some volume
  s += px(-5, -8, 1.4, 1, '#FFFFFF', ' opacity=".28"')
  s += skillCostume(SKILL_SKIN, kind)
  return `<g id="${id}" shape-rendering="crispEdges">${s}</g>`
}

// Claude sessions: a small dome robot, skill-sized but a different silhouette (two feet, visor, antenna).
function agentDef(id: string) {
  const look = AGENT_LOOK[AGENT_SKIN]
  const shell = look.shell
  const visor = look.visor
  let s = `<ellipse rx="12" ry="4" fill="#000" opacity=".18"/>`
  s += px(-4.5, -2, 2.5, 2, '#5B5650') + px(2, -2, 2.5, 2, '#5B5650')
  s += px(-4, -11, 8, 1, shell) + px(-5, -10, 10, 1, shell) + px(-6, -9, 12, 7, shell) + px(-6, -3, 12, 1, '#000', ' opacity=".16"')
  s += px(-4, -11, 3, 1, '#FFFFFF', ' opacity=".35"') + px(-5.4, -9.4, 1, 3, '#FFFFFF', ' opacity=".2"')
  s += px(-7, -6, 1, 2.5, shell) + px(6, -6, 1, 2.5, shell)
  s += px(-4.5, -8.5, 9, 3.5, visor) + px(-4.5, -8.5, 9, 0.6, '#FFFFFF', ' opacity=".12"')
  s += `<g fill="${look.eyes}">${px(-2.8, -7.5, 1.4, 1.4, look.eyes)}${px(1.4, -7.5, 1.4, 1.4, look.eyes)}` +
    `<animate attributeName="opacity" values="1;1;0;1" keyTimes="0;.92;.96;1" dur="4s" repeatCount="indefinite"/></g>`
  if (AGENT_SKIN === 'pirata') s += px(1, -8.2, 2.4, 2.2, '#111')
  // the chest panel takes the colour of the puesto the robot works in
  s += px(-2, -4.6, 4, 2.2, 'currentColor') + px(-2, -4.6, 4, 0.5, '#FFFFFF', ' opacity=".35"')
  s += px(-0.3, -14, 0.6, 3, '#8C857C')
  s += `<rect x="${-1.2 * U}" y="${-16.2 * U}" width="${2.4 * U}" height="${2.4 * U}" fill="currentColor"><animate attributeName="opacity" values="1;.45;1" dur="1.6s" repeatCount="indefinite"/></rect>`
  s += look.hat
  return `<g id="${id}" shape-rendering="crispEdges">${s}</g>`
}

const COAT_COLORS: Record<Coat, { body: string; dark: string; eyes: string; patch?: string; patch2?: string }> = {
  gris: { body: '#6E6A66', dark: '#575350', eyes: '#F2D16B' },
  naranja: { body: '#D98A3D', dark: '#B86A25', eyes: '#7BC86C', patch: '#B86A25' },
  negro: { body: '#2E2B2A', dark: '#1C1A19', eyes: '#9BE36B' },
  blanco: { body: '#EEE8DE', dark: '#CFC7BA', eyes: '#6FB7E8', patch: '#F2B6B6' },
  siames: { body: '#E8D8BE', dark: '#5A4636', eyes: '#5FA8E8' },
  tricolor: { body: '#F1ECE4', dark: '#2E2B2A', eyes: '#F2D16B', patch: '#D98A3D', patch2: '#2E2B2A' },
  militar: { body: '#6B7A4A', dark: '#3F4A2A', eyes: '#F2D16B', patch: '#4A5535', patch2: '#8C8A5A' },
}

function catDef(coat: Coat) {
  const c = COAT_COLORS[coat]
  const points = coat === 'siames' ? c.dark : c.body
  let s = `<ellipse rx="9" ry="3" fill="#000" opacity=".16"/>`
  s += px(-4, -2, 1, 2, c.dark) + px(2, -2, 1, 2, c.dark)
  s += px(-4.5, -5, 8, 3, c.body)
  if (c.patch) s += px(-3, -5, 2.5, 1.5, c.patch)
  if (c.patch2) s += px(0.5, -4.2, 2, 1.4, c.patch2)
  if (coat === 'naranja') s += px(-2, -5, 0.6, 3, c.dark) + px(0, -5, 0.6, 3, c.dark)
  s += px(3, -7, 3, 3, points) + px(3, -8, 1, 1, points) + px(5, -8, 1, 1, points)
  s += `<g class="cat-eyes">${px(4, -6, 0.6, 0.8, c.eyes)}${px(5.2, -6, 0.6, 0.8, c.eyes)}</g>`
  s += px(-6, -7, 1, 3, points) + px(-6, -8, 1, 1, shade(points, 1.2))
  if (coat === 'militar') s += px(2.6, -8.6, 3.8, 1.2, '#3F4A2A') + px(3, -9.4, 3, 0.8, '#4A5535')
  return `<g id="pt-${coat}" shape-rendering="crispEdges">${s}</g>`
}

const BUNK_W = 1.05
const BUNK_D = 2
const BED_LEVEL_Z = [12, 36]

function defs() {
  const post = (x: number, y: number, color: string) => box(x, y, 0, 0.1, 0.1, 44, color)
  const bunkBack = post(0, 0, shade(WOOD, 0.9)) + post(BUNK_W - 0.1, 0, shade(WOOD, 0.9)) + box(0, 0, BED_LEVEL_Z[0]! - 6, BUNK_W, BUNK_D, 6, MATTRESS)
  const bunkMid = box(0, 0, BED_LEVEL_Z[1]! - 8, BUNK_W, BUNK_D, 2, WOOD) + box(0, 0, BED_LEVEL_Z[1]! - 6, BUNK_W, BUNK_D, 6, MATTRESS)
  const bunkFront = post(0, BUNK_D - 0.1, WOOD) + post(BUNK_W - 0.1, BUNK_D - 0.1, WOOD) + box(BUNK_W - 0.02, BUNK_D - 0.75, 4, 0.04, 0.5, 2, WOOD)
  const blanket = tintBox(0.08, 0.75, 0, BUNK_W - 0.16, 1.15, 3, 0.5)
  const [pcx, pcy] = iso(0.5, 0.5, 0)
  const plant =
    box(0.3, 0.3, 0, 0.4, 0.4, 8, '#B4643F') + box(0.27, 0.27, 8, 0.46, 0.46, 1.5, '#8E4E31') +
    [[-5, -15, 5], [4, -17, 4.5], [-1, -22, 5], [-4, -11, 3.5], [5, -12, 3.5]]
      .map(([dx, dy, rr], i) => `<circle cx="${r(pcx + dx!)}" cy="${r(pcy + dy!)}" r="${rr}" fill="${i % 2 ? '#5E9C55' : '#4A8546'}"/>`)
      .join('') + `<circle cx="${r(pcx - 2)}" cy="${r(pcy - 20)}" r="2" fill="#7DBB6E"/>`
  const glows = LABS.map(
    l => `<radialGradient id="gl-${l.id}"><stop offset="0" stop-color="${l.accent}" stop-opacity=".55"/><stop offset="1" stop-color="${l.accent}" stop-opacity="0"/></radialGradient>`,
  ).join('')
  // every coat, not just the configured cats: the Konami parade uses them all
  const coats = COATS.map(catDef).join('')
  return (
    `<defs>${spriteDef('ca', 'awake')}${spriteDef('cs', 'asleep')}${agentDef('ag')}${coats}` +
    `<linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFE8F5"/><stop offset="1" stop-color="#8DBFD9"/></linearGradient>${glows}` +
    `<radialGradient id="lamp"><stop offset="0" stop-color="#FFE6A0" stop-opacity=".75"/><stop offset="1" stop-color="#FFD36B" stop-opacity="0"/></radialGradient>` +
    `<g id="b1">${bunkBack}</g><g id="b2">${bunkMid}</g><g id="b3">${bunkFront}</g><g id="bl">${blanket}</g><g id="pl">${plant}</g></defs>`
  )
}

const useSprite = (id: 'ca' | 'cs' | 'ag', color: string, sx: number, sy: number, scale = 1, goggles?: string, anim = '') =>
  `<use href="#${id}" color="${color}"${goggles ? ` style="--g:${goggles}"` : ''} transform="translate(${r(sx)},${r(sy)})${scale !== 1 ? ` scale(${scale})` : ''}">${anim}</use>`

const recolor = (from: string, to: string, begin: number) =>
  `<animate attributeName="color" from="${from}" to="${to}" begin="${r(begin)}s" dur=".6s" fill="freeze"/>`

// hidden until the character is clicked: the webview adds `show` for a moment and the CSS fades it out
function label(name: string, y = -25, size = 8.5) {
  return `<text class="tag" y="${y}" font-size="${size}" text-anchor="middle" fill="#2A211C" stroke="#FFF8EE" stroke-width="2.6" paint-order="stroke" font-weight="700">${esc(name)}</text>`
}

const BUBBLES: Record<Activity, { icon: string; fill: string; pulse?: boolean } | null> = {
  pensando: { icon: '…', fill: '#FFFFFF' },
  escribiendo: { icon: '✎', fill: '#FFFFFF' },
  leyendo: { icon: '👀', fill: '#FFFFFF' },
  ejecutando: { icon: '⚙', fill: '#FFFFFF' },
  delegando: { icon: '👥', fill: '#FFFFFF' },
  esperando: { icon: '✋', fill: '#FFD66B', pulse: true },
  pregunta: { icon: '❓', fill: '#FFD66B', pulse: true },
  listo: { icon: '✓', fill: '#9BE3A6' },
  idle: null,
}

function bubble(activity: Activity, y: number) {
  const b = BUBBLES[activity]
  if (!b) return ''
  const pulse = b.pulse ? '<animateTransform attributeName="transform" type="scale" values="1;1.18;1" dur=".9s" repeatCount="indefinite" additive="sum"/>' : ''
  return (
    `<g transform="translate(0,${y})"><g>${pulse}<rect x="-11" y="-11" width="22" height="18" rx="6" fill="${b.fill}" stroke="#2A211C" stroke-opacity=".35"/>` +
    `<path d="M-3 7 L0 11 L3 7 Z" fill="${b.fill}"/><text y="3" font-size="11" text-anchor="middle">${b.icon}</text></g></g>`
  )
}

function sweat(seed: number) {
  const d = (k: number) => r(((seed + k * 7) % 10) / 10)
  return [-1, 1]
    .map(
      (side, k) =>
        `<ellipse cx="${side * 9}" cy="-18" rx="1.3" ry="2" fill="#7FD0FF" opacity="0"><animate attributeName="opacity" values="0;1;0" dur="1.1s" begin="${d(k)}s" repeatCount="indefinite"/>` +
        `<animate attributeName="cy" values="-18;-8" dur="1.1s" begin="${d(k)}s" repeatCount="indefinite"/><animate attributeName="cx" values="${side * 9};${side * 13}" dur="1.1s" begin="${d(k)}s" repeatCount="indefinite"/></ellipse>`,
    )
    .join('')
}

const bob = (dy: number, dur: number, begin = 0) =>
  `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${-dy};0 0" dur="${dur}s" begin="${r(begin)}s" repeatCount="indefinite"/>`

// ---------- themes ----------

export type Furnished = { svg: string; stations: Station[]; agentSpots: Pt[] }

// where the robots of a puesto stand: a row at distance t from the far wall
export const agentSpotsAt = (room: RoomGeom, t: number) => [0, 1, 2].map(k => ({ x: room.x0 + 1.6 + k * 1.4, y: T(room, t) })).filter(p => p.x < room.x1 - 1)
// spare places in the front aisle for when the furniture is full
export const withSpares = (room: RoomGeom, list: Station[], kind: StationKind) => {
  for (let k = 0; k < 8; k++) list.push({ x: room.x0 + 0.9 + k * 0.6, y: T(room, D - 1.3), kind })
  return list
}

function furnish(room: RoomGeom, lab: Lab, active: boolean): Furnished {
  const theme = room.theme ?? 'lab'
  const mod = THEME_MODULES[theme]
  if (mod) return mod.furnish(room, lab, active)
  const agentSpots = (t: number) => agentSpotsAt(room, t)
  const spare = (list: Station[], kind: StationKind) => withSpares(room, list, kind)
  let s = ''

  if (theme === 'gym') {
    // mirror and dumbbell rack on the far wall
    s += boxT(room, room.x0 + 0.3, 0.1, 0.7, 0, room.x1 - room.x0 - 0.6, 9, '#8C8F94')
    for (const x of columns(room, 0.7, 0.6, 0.8)) {
      const [cx, cy] = iso(x, T(room, 0.4), 10)
      s += `<rect x="${r(cx - 4)}" y="${r(cy - 3)}" width="8" height="2.4" fill="#3B3F46"/><rect x="${r(cx - 5)}" y="${r(cy - 4.5)}" width="2.4" height="5" fill="#2B2F35"/><rect x="${r(cx + 2.6)}" y="${r(cy - 4.5)}" width="2.4" height="5" fill="#2B2F35"/>`
    }
    const stations: Station[] = []
    for (const x of columns(room, 1.3)) {
      // static bike: base, frame, seat, handlebar
      s += boxT(room, x - 0.2, 2.0, 2.9, 0, 0.4, 3, '#3B3F46') + boxT(room, x - 0.06, 2.1, 2.3, 3, 0.12, 9, '#C8423A') + boxT(room, x - 0.06, 2.6, 2.75, 3, 0.12, 8, '#C8423A')
      s += boxT(room, x - 0.15, 2.55, 2.85, 11, 0.3, 1.5, '#222') + boxT(room, x - 0.25, 2.05, 2.15, 12, 0.5, 1, '#222')
      stations.push({ x, y: T(room, 2.7), kind: 'bike', z: 9 })
    }
    for (const x of columns(room, 1.6, 1.2, 1.7)) {
      // treadmill: belt with a console at the far end
      s += boxT(room, x - 0.4, 3.9, 5.5, 0, 0.8, 4, '#2B2F35') + boxT(room, x - 0.3, 4.0, 5.4, 4, 0.6, 0.6, '#55595F')
      s += boxT(room, x - 0.42, 3.85, 4.0, 4, 0.08, 18, '#8C8F94') + boxT(room, x + 0.34, 3.85, 4.0, 4, 0.08, 18, '#8C8F94') + boxT(room, x - 0.42, 3.8, 4.1, 22, 0.84, 3, '#3B3F46')
      stations.push({ x, y: T(room, 4.9), kind: 'tread', z: 4 })
    }
    for (const x of columns(room, 2.2, 1.4, 2).slice(0, 3)) {
      // bench press: bench, uprights, bar
      s += boxT(room, x - 0.18, 6.0, 6.9, 0, 0.36, 6, '#4A4E55') + boxT(room, x - 0.5, 6.0, 6.1, 0, 0.06, 20, '#8C8F94') + boxT(room, x + 0.44, 6.0, 6.1, 0, 0.06, 20, '#8C8F94')
      stations.push({ x, y: T(room, 6.4), kind: 'bench', z: 6 })
    }
    return { svg: s, stations: spare(stations, 'tread'), agentSpots: agentSpots(1.3) }
  }

  if (theme === 'cafe') {
    s += boxT(room, room.x0 + 0.3, 0.15, 0.85, 0, room.x1 - room.x0 - 0.6, 18, '#8A5A3B') + boxT(room, room.x0 + 0.3, 0.15, 0.85, 18, room.x1 - room.x0 - 0.6, 1.5, '#5E3B25')
    s += boxT(room, room.x0 + 0.6, 0.25, 0.7, 19.5, 0.8, 10, '#3B3F46')
    const [mx, my] = iso(room.x0 + 1.0, T(room, 0.5), 25)
    s += `<rect x="${r(mx - 2)}" y="${r(my)}" width="4" height="2" fill="#E2463A"><animate attributeName="opacity" values="1;.3;1" dur="1.6s" repeatCount="indefinite"/></rect>`
    for (const x of columns(room, 0.9, 2.2, 0.8)) {
      const [cx, cy] = iso(x, T(room, 0.5), 19.5)
      s += `<rect x="${r(cx - 2)}" y="${r(cy - 4)}" width="4" height="4" fill="#FFFFFF"/>`
    }
    const stations: Station[] = []
    for (const t of [2.8, 5.2]) {
      for (const x of columns(room, 2.2, 1.6, 1.6)) {
        const [cx, cy] = iso(x, T(room, t), 13)
        s += boxT(room, x - 0.05, t - 0.05, t + 0.05, 0, 0.1, 13, '#5E3B25')
        s += `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="17" ry="8.5" fill="#F4EBDD" stroke="#A27552" stroke-width="1.5"/><rect x="${r(cx - 2)}" y="${r(cy - 5)}" width="4" height="4" fill="#FFFFFF"/>`
        stations.push({ x: x - 0.75, y: T(room, t), kind: 'cafe' }, { x: x + 0.75, y: T(room, t), kind: 'cafe' })
      }
    }
    return { svg: s, stations: spare(stations, 'cafe'), agentSpots: agentSpots(1.3) }
  }

  if (theme === 'library') {
    const spines = ['#B8553A', '#4F8FCB', '#6FA75A', '#E0A43B', '#8A7BD1', '#3FA7A0', '#D0605E']
    // against the back wall the shelf stays under the room's sign
    const shelves = room.top ? 2 : 3
    s += boxT(room, room.x0 + 0.2, 0.05, 0.6, 0, room.x1 - room.x0 - 0.4, shelves === 2 ? 28 : 44, '#7A5136')
    for (let shelf = 0; shelf < shelves; shelf++) {
      let k = 0
      for (let x = room.x0 + 0.35; x < room.x1 - 0.35; x += 0.22, k++) {
        const [bx, by] = iso(x, T(room, room.top ? 0.6 : 0.05), 6 + shelf * (shelves === 2 ? 11 : 13))
        s += `<rect x="${r(bx - 2)}" y="${r(by - 10)}" width="3.4" height="${9 + (k % 3)}" fill="${spines[(k + shelf * 3) % spines.length]}"/>`
      }
    }
    const stations: Station[] = []
    for (const t of [2.6, 4.9]) {
      s += boxT(room, room.x0 + 1, t, t + 0.8, 0, room.x1 - room.x0 - 2.4, 13, '#9A6B47')
      for (const x of columns(room, 2.4, 1.6, 1.8)) {
        const [lx, ly] = iso(x, T(room, t + 0.3), 13)
        s += `<rect x="${r(lx - 0.8)}" y="${r(ly - 9)}" width="1.6" height="9" fill="#3B3F46"/><path d="M${r(lx - 5)} ${r(ly - 9)} h10 l-2 -4 h-6 z" fill="#2F7D4A"/>`
        s += `<ellipse cx="${r(lx)}" cy="${r(ly - 2)}" rx="10" ry="4" fill="#FFE6A0" opacity=".35" class="lamp-light"/>`
      }
      for (const x of columns(room, 1.4, 1.6)) stations.push({ x, y: T(room, t + 0.8 + 0.45), kind: 'read' })
    }
    return { svg: s, stations: spare(stations, 'read'), agentSpots: agentSpots(1.15) }
  }

  if (theme === 'arcade') {
    const neon = ['#FF4FD8', '#4FE3FF', '#FFE34F', '#7CFF6B', '#FF8A4F']
    const stations: Station[] = []
    for (const t of [0.2, 3.6]) {
      columns(room, 1.2, 0.9, 1.3).forEach((x, k) => {
        s += boxT(room, x - 0.4, t, t + 0.7, 0, 0.8, 31, '#2B2840')
        const { y, d } = spanY(room, t, t + 0.7)
        const sy = room.top ? y + d : y
        const scr = [iso(x - 0.32, sy, 13), iso(x + 0.32, sy, 13), iso(x + 0.32, sy, 25), iso(x - 0.32, sy, 25)] as [number, number][]
        s += `<polygon points="${pts(scr)}" fill="${neon[k % neon.length]}" opacity=".85"><animate attributeName="opacity" values=".9;.45;.9;.7" dur="${r(0.7 + (k % 3) * 0.3)}s" repeatCount="indefinite"/></polygon>`
        s += poly([iso(x - 0.4, sy, 28), iso(x + 0.4, sy, 28), iso(x + 0.4, sy, 31), iso(x - 0.4, sy, 31)], neon[(k + 2) % neon.length]!)
        stations.push({ x, y: T(room, t + 0.7 + 0.5), kind: 'arcade' })
      })
    }
    return { svg: s, stations: spare(stations, 'arcade'), agentSpots: agentSpots(6.2) }
  }

  if (theme === 'smoking') {
    // extractor fan and an ironic no-smoking sign on the far wall, benches, standing ashtrays, smoke drifting up
    s += boxT(room, room.x0 + 0.4, 0.1, 0.5, 0, 1.2, 26, '#8C857C')
    {
      const [fx, fy] = iso(room.x0 + 1.0, T(room, room.top ? 0.5 : 0.1), 16)
      s += `<circle cx="${r(fx)}" cy="${r(fy)}" r="7" fill="#3B3F46"/><g transform="translate(${r(fx)},${r(fy)})"><g><animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="1.2s" repeatCount="indefinite"/>` +
        `<rect x="-6" y="-1" width="12" height="2" fill="#B8B2A7"/><rect x="-1" y="-6" width="2" height="12" fill="#B8B2A7"/></g></g>`
      const [nx, ny] = iso(room.x1 - 1.4, T(room, room.top ? 0.5 : 0.1), 12)
      s += `<circle cx="${r(nx)}" cy="${r(ny)}" r="7" fill="#FFFFFF" stroke="#C8423A" stroke-width="2.4"/><rect x="${r(nx - 3.5)}" y="${r(ny - 1)}" width="7" height="2" fill="#3B3F46"/><path d="M${r(nx - 5)} ${r(ny - 5)} L${r(nx + 5)} ${r(ny + 5)}" stroke="#C8423A" stroke-width="2.4"/>`
    }
    const stations: Station[] = []
    for (const t of [2.4, 4.8]) {
      s += boxT(room, room.x0 + 1, t, t + 0.6, 0, room.x1 - room.x0 - 2.4, 6, '#8A5A3B') + boxT(room, room.x0 + 1, t, t + 0.12, 6, room.x1 - room.x0 - 2.4, 9, '#6E4A30')
      for (const x of columns(room, 1.4, 1.6)) stations.push({ x, y: T(room, t + 0.35), kind: 'smoke', z: 6 })
      for (const x of columns(room, 2.4, 2.2, 1.6)) {
        const [ax, ay] = iso(x, T(room, t + 1.2))
        s += `<rect x="${r(ax - 1)}" y="${r(ay - 16)}" width="2" height="16" fill="#8C857C"/><ellipse cx="${r(ax)}" cy="${r(ay - 16)}" rx="5" ry="2.2" fill="#55595F"/><circle cx="${r(ax + 1)}" cy="${r(ay - 17)}" r="1" fill="#FF8A3D"/>`
      }
    }
    // ambient smoke: soft puffs rising and fading
    for (let k = 0; k < 6; k++) {
      const [cx, cy] = iso(room.x0 + 1 + ((k * 1.7) % Math.max(1, room.x1 - room.x0 - 2)), T(room, 2 + (k % 3) * 1.6), 20)
      const d = r((k * 0.9) % 4)
      s += `<circle cx="${r(cx)}" cy="${r(cy)}" r="7" fill="#D8D4CC" opacity="0" pointer-events="none"><animate attributeName="opacity" values="0;.45;0" dur="4.5s" begin="${d}s" repeatCount="indefinite"/>` +
        `<animate attributeName="cy" values="${r(cy)};${r(cy - 26)}" dur="4.5s" begin="${d}s" repeatCount="indefinite"/><animate attributeName="r" values="5;12" dur="4.5s" begin="${d}s" repeatCount="indefinite"/></circle>`
    }
    return { svg: s, stations: spare(stations, 'smoke'), agentSpots: agentSpots(1.3) }
  }

  if (theme === 'military') {
    // lockers and a flag on the far wall, sandbag parapets, ammo crates and a target
    for (const x of columns(room, 0.9, 1.6, 0.8)) s += boxT(room, x - 0.4, 0.1, 0.55, 0, 0.8, 26, '#5B6B3A')
    {
      // the flag stands in the front corner: on the back wall it would cover the sign
      // the cloth waves by morphing its outline around the pole: a transform animation would pivot on the map's origin
      const [fx, fy] = iso(room.x0 + 0.5, T(room, 6.0), 0)
      const cloth = (a: number) => `M0 0 C7 ${-2 * a} 13 ${2 * a} 20 0 L20 13 C13 ${13 + 2 * a} 7 ${13 - 2 * a} 0 13 Z`
      const stripe = (a: number) => `M0 5 C7 ${5 - 2 * a} 13 ${5 + 2 * a} 20 5 L20 8 C13 ${8 + 2 * a} 7 ${8 - 2 * a} 0 8 Z`
      const wave = (f: (a: number) => string) => `<animate attributeName="d" values="${f(1)};${f(-1)};${f(1)}" dur="1.6s" repeatCount="indefinite"/>`
      s += `<ellipse cx="${r(fx)}" cy="${r(fy)}" rx="5" ry="2.5" fill="#000" opacity=".18"/><rect x="${r(fx - 1.2)}" y="${r(fy - 60)}" width="2.4" height="60" fill="#8C857C"/><rect x="${r(fx - 1.2)}" y="${r(fy - 60)}" width="1" height="60" fill="#B8B2A7"/>` +
        `<circle cx="${r(fx)}" cy="${r(fy - 61)}" r="2.2" fill="#D4B24C"/>` +
        `<g ${tr([fx + 1.2, fy - 58])}><path d="${cloth(1)}" fill="#3F5A2A">${wave(cloth)}</path><path d="${stripe(1)}" fill="#F2D16B">${wave(stripe)}</path>` +
        `<text x="5" y="11.5" font-size="5" fill="#F2D16B">★</text></g>`
    }
    const stations: Station[] = []
    for (const t of [2.4, 4.8]) {
      let k = 0
      for (let x = room.x0 + 1; x < room.x1 - 1.4; x += 0.55, k++) {
        const [bx, by] = iso(x, T(room, t + 0.35), 0)
        s += `<rect x="${r(bx - 6)}" y="${r(by - 12)}" width="12" height="6" rx="3" fill="${k % 2 ? '#B9A57A' : '#A8946A'}"/><rect x="${r(bx - 3)}" y="${r(by - 17)}" width="12" height="6" rx="3" fill="${k % 2 ? '#A8946A' : '#B9A57A'}"/>`
      }
      for (const x of columns(room, 1.4, 1.6)) stations.push({ x, y: T(room, t + 0.8 + 0.45), kind: 'drill' })
    }
    for (const x of [room.x1 - 1.3, room.x1 - 1.9]) s += boxT(room, x, 6.4, 6.9, 0, 0.5, 8, '#6E5A35') + boxT(room, x, 6.4, 6.9, 8, 0.5, 1, '#4E3F25')
    {
      const [tx, ty] = iso(room.x0 + 1.7, T(room, 6.9), 0)
      s += `<rect x="${r(tx - 1)}" y="${r(ty - 24)}" width="2" height="24" fill="#6E5A35"/><circle cx="${r(tx)}" cy="${r(ty - 30)}" r="8" fill="#F4EBDD" stroke="#C8423A" stroke-width="2"/><circle cx="${r(tx)}" cy="${r(ty - 30)}" r="4" fill="none" stroke="#C8423A" stroke-width="2"/><circle cx="${r(tx)}" cy="${r(ty - 30)}" r="1.4" fill="#C8423A"/>`
    }
    return { svg: s, stations: spare(stations, 'drill'), agentSpots: agentSpots(1.3) }
  }

  // lab
  s += boxT(room, room.x0 + 0.3, 0.15, 0.85, 0, room.x1 - room.x0 - 0.6, 18, '#B8B2A7') + boxT(room, room.x0 + 0.6, 0.25, 0.6, 18, 0.9, 12, '#3B3F46')
  const [mx, my] = iso(room.x0 + 1.5, T(room, 0.4), 24)
  s += `<rect x="${r(mx - 1)}" y="${r(my - 4)}" width="3" height="7" fill="${active ? '#7CF0A0' : '#59606B'}">${active ? '<animate attributeName="opacity" values="1;.3;1" dur="1.2s" repeatCount="indefinite"/>' : ''}</rect>`
  const stations: Station[] = []
  for (const t of [2.2, 4.6]) {
    s += boxT(room, room.x0 + 1, t, t + 0.8, 0, room.x1 - room.x0 - 2.4, 15, '#F4F1EA')
    for (const x of columns(room, 1.6, 1.4, 1.6)) {
      const [cx, cy] = iso(x, T(room, t + 0.4), 15)
      s += `<rect x="${r(cx - 1.5)}" y="${r(cy - 12)}" width="3" height="6" fill="#DDE7EA" opacity=".9"/><circle cx="${r(cx)}" cy="${r(cy - 4)}" r="4.5" fill="${lab.accent}" opacity=".85" stroke="#FFF" stroke-opacity=".6"/>`
      if (active) {
        const delay = r((hash(`${room.id}${x}${t}`) % 13) / 10)
        s += `<circle cx="${r(cx)}" cy="${r(cy - 10)}" opacity="0" r="1.6" fill="${shade(lab.accent, 1.4)}"><animate attributeName="cy" values="${r(cy - 10)};${r(cy - 24)}" dur="1.4s" begin="${delay}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.4s" begin="${delay}s" repeatCount="indefinite"/></circle>`
      }
    }
    for (const x of columns(room, 1.4, 1.6)) stations.push({ x, y: T(room, t + 0.8 + 0.45), kind: 'lab' })
  }
  return { svg: s, stations: spare(stations, 'lab'), agentSpots: agentSpots(1.3) }
}

// how a skill works at each kind of station
function workAnim(kind: StationKind, seed: number, accent: string) {
  const mod = THEME_MODULES[kind as Theme]
  if (mod) return mod.work(seed, accent)
  const b = r((seed % 14) / 10)
  switch (kind) {
    case 'bike':
      return { move: bob(1.5, 0.22, b), extra: sweat(seed) }
    case 'tread':
      return { move: bob(3, 0.18, b), extra: sweat(seed) }
    case 'bench':
      return {
        move: bob(0.6, 1.2, b),
        extra:
          `<rect x="-16" y="-24" width="32" height="2.4" fill="#3B3F46"><animate attributeName="y" values="-24;-34;-24" dur="1.2s" begin="${b}s" repeatCount="indefinite"/></rect>` +
          `<rect x="-18" y="-27" width="3" height="8" fill="#222"><animate attributeName="y" values="-27;-37;-27" dur="1.2s" begin="${b}s" repeatCount="indefinite"/></rect>` +
          `<rect x="15" y="-27" width="3" height="8" fill="#222"><animate attributeName="y" values="-27;-37;-27" dur="1.2s" begin="${b}s" repeatCount="indefinite"/></rect>` +
          sweat(seed),
      }
    case 'cafe':
      return {
        move: `<animateTransform attributeName="transform" type="rotate" values="-4;4;-4" dur="2.4s" begin="${b}s" repeatCount="indefinite"/>`,
        extra:
          `<rect x="10" y="-12" width="4" height="4" fill="#FFFFFF" stroke="#A27552" stroke-width=".6"/>` +
          [0, 0.6].map(o => `<path d="M12 -14 q-2 -3 0 -6" stroke="#FFFFFF" stroke-width="1" fill="none" opacity="0"><animate attributeName="opacity" values="0;.8;0" dur="1.8s" begin="${r(b + o)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;0 -6" dur="1.8s" begin="${r(b + o)}s" repeatCount="indefinite"/></path>`).join(''),
      }
    case 'read':
      return {
        move: bob(0.8, 2.2, b),
        extra:
          `<rect x="-6" y="-11" width="12" height="7" fill="${accent}"/><rect x="0" y="-10.5" width="5.5" height="6" fill="#FFFFFF"><animateTransform attributeName="transform" type="scale" values="1 1;-1 1;1 1" dur="3.2s" begin="${b}s" repeatCount="indefinite" additive="sum"/></rect>` +
          `<text x="10" y="-22" font-size="9" opacity="0">💡<animate attributeName="opacity" values="0;0;1;0" keyTimes="0;.75;.85;1" dur="6s" begin="${b}s" repeatCount="indefinite"/></text>`,
      }
    case 'arcade':
      return {
        move: `<animateTransform attributeName="transform" type="translate" values="-1 0;1 0;-1 0" dur=".16s" begin="${b}s" repeatCount="indefinite"/>`,
        extra: ['#FF4FD8', '#4FE3FF', '#FFE34F'].map((c, k) => `<text x="${-8 + k * 8}" y="-24" font-size="7" fill="${c}" opacity="0">★<animate attributeName="opacity" values="0;1;0" dur=".9s" begin="${r(b + k * 0.3)}s" repeatCount="indefinite"/></text>`).join(''),
      }
    case 'smoke':
      return {
        move: bob(0.8, 2.6, b),
        extra:
          `<rect x="9" y="-9.6" width="6" height="1.6" fill="#F4F1EA"/><rect x="15" y="-9.6" width="1.4" height="1.6" fill="#FF8A3D"><animate attributeName="opacity" values="1;.5;1" dur="1.4s" begin="${b}s" repeatCount="indefinite"/></rect>` +
          [0, 1.1].map(o => `<circle cx="16" cy="-12" r="2" fill="#D8D4CC" opacity="0"><animate attributeName="opacity" values="0;.8;0" dur="2.2s" begin="${r(b + o)}s" repeatCount="indefinite"/><animate attributeName="cy" values="-12;-28" dur="2.2s" begin="${r(b + o)}s" repeatCount="indefinite"/><animate attributeName="r" values="1.5;5" dur="2.2s" begin="${r(b + o)}s" repeatCount="indefinite"/></circle>`).join('') +
          `<text x="-12" y="-18" font-size="7" font-weight="700" fill="#6E6A66" opacity="0">cof<animate attributeName="opacity" values="0;0;1;0" keyTimes="0;.8;.86;1" dur="7s" begin="${b}s" repeatCount="indefinite"/></text>`,
      }
    case 'drill':
      return {
        move: `<animateTransform attributeName="transform" type="scale" values="1 1;1.12 .62;1 1" dur=".7s" begin="${b}s" repeatCount="indefinite"/>`,
        extra: `<text x="0" y="-22" font-size="8" font-weight="700" text-anchor="middle" fill="#3F4A2A" stroke="#F4EBDD" stroke-width="2" paint-order="stroke" opacity="0">¡1, 2!<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.6;.65;.9;1" dur="4.2s" begin="${b}s" repeatCount="indefinite"/></text>`,
      }
    default:
      return {
        move: bob(1.6, 1.5, b),
        extra: `<text x="9" y="-20" font-size="9" fill="${accent}" opacity="0">✦<animate attributeName="opacity" values="0;1;0" dur="2.2s" begin="${b}s" repeatCount="indefinite"/></text>`,
      }
  }
}

// ---------- dorm ----------

type Bunk = { x: number; y: number }

const BUNKS: Bunk[] = (() => {
  const list: Bunk[] = []
  for (const y of [0.25, 3.55]) for (let i = 0; i < 8; i++) list.push({ x: i < 4 ? 0.3 + i * 1.35 : 6.75 + (i - 4) * 1.3, y })
  return list
})()

function bedSpot(index: number): { front: Pt; bunk?: Bunk; level?: number; floor?: Pt } {
  if (index < BUNKS.length * 2) {
    const bunk = BUNKS[Math.floor(index / 2)]!
    return { bunk, level: index % 2, front: { x: bunk.x + BUNK_W / 2, y: bunk.y + BUNK_D + 0.35 } }
  }
  const k = index - BUNKS.length * 2
  const floor = { x: 0.6 + (k % 11) * 1.05, y: 7.2 - Math.floor(k / 11) * 0.5 }
  return { floor, front: floor }
}

function walkPath(bed: Pt, room: RoomGeom, target: Pt): Pt[] {
  const ey = entryY(room)
  const side = room.x1 - 0.5
  const raw: Pt[] = [
    bed,
    { x: DORM_AISLE_X, y: bed.y },
    { x: DORM_AISLE_X, y: CORRIDOR_Y },
    { x: doorX(room), y: CORRIDOR_Y },
    { x: doorX(room), y: ey },
    { x: side, y: ey },
    { x: side, y: target.y },
    target,
  ]
  return raw.filter((p, i) => i === 0 || p.x !== raw[i - 1]!.x || p.y !== raw[i - 1]!.y)
}

function screenPath(path: Pt[], speed = WALK_SPEED) {
  const scr = path.map(p => iso(p.x, p.y))
  let len = 0
  for (let i = 1; i < scr.length; i++) len += Math.hypot(scr[i]![0] - scr[i - 1]![0], scr[i]![1] - scr[i - 1]![1])
  return { d: 'M' + scr.map(([a, b]) => `${r(a)} ${r(b)}`).join(' L'), dur: Math.max(1.5, len / speed) }
}

// The cat sprite faces right; this flips it on every stretch of its loop that runs leftwards on screen,
// timed with the animateMotion it rides (same path, so same proportions).
function facing(path: Pt[]) {
  const scr = path.map(p => iso(p.x, p.y))
  const segs: { len: number; dir: number }[] = []
  let total = 0
  let dir = 1
  for (let i = 1; i < scr.length; i++) {
    const dx = scr[i]![0] - scr[i - 1]![0]
    const len = Math.hypot(dx, scr[i]![1] - scr[i - 1]![1])
    if (Math.abs(dx) > 0.5) dir = dx > 0 ? 1 : -1
    segs.push({ len, dir })
    total += len
  }
  const values: string[] = []
  const times: string[] = []
  let at = 0
  for (const seg of segs) {
    const v = `${seg.dir} 1`
    if (values[values.length - 1] !== v) {
      values.push(v)
      times.push((total ? at / total : 0).toFixed(4))
    }
    at += seg.len
  }
  times[0] = '0'
  return { values: values.join(';'), keyTimes: times.join(';') }
}

// ---------- day & night ----------

export type ClockMode = 'auto' | 'day' | 'night'

// 0 at full day, 1 at full night, with an hour of twilight on each side
export function darkness(date: Date, mode: ClockMode) {
  if (mode === 'day') return 0
  if (mode === 'night') return 1
  const h = date.getHours() + date.getMinutes() / 60
  if (h >= 8 && h < 19.5) return 0
  if (h >= 21 || h < 6.5) return 1
  return h < 12 ? (8 - h) / 1.5 : (h - 19.5) / 1.5
}

// ---------- scene ----------

export type SceneInput = {
  roster: string[]
  crew: Record<string, CrewMember>
  agents: AgentView[]
  now: number
  pet?: boolean
  cats?: Cat[]
  night?: boolean
  // health of each deployed service, by URL (see racks.ts)
  services?: Record<string, ServiceStatus>
  skillSkin?: Skin
  agentSkin?: Skin
  // 'auto', 'off' or a season id from season.ts
  season?: string
}

export function renderScene({ roster, crew, agents, now, pet = true, cats = [{ name: 'Michi', coat: 'gris' }], night = false, services = {}, skillSkin = 'clasico', agentSkin = 'clasico', season = 'auto' }: SceneInput) {
  const { rooms, W } = layout()
  OX = Y_MAX * (TW / 2) + 40
  OY = 150
  SKILL_SKIN = SKINS.includes(skillSkin) ? skillSkin : 'clasico'
  AGENT_SKIN = SKINS.includes(agentSkin) ? agentSkin : 'clasico'
  const VIEW_W = Math.ceil((W + Y_MAX) * (TW / 2) + 80)
  const VIEW_H = Math.ceil((W + Y_MAX) * (TH / 2) + OY + 30)
  const roomById = (id: string) => rooms.find(rm => rm.id === id) ?? rooms.find(rm => rm.kind === 'lab')!
  const dayIndex = Math.floor(now / 86_400_000)
  const shownCats = pet ? cats.slice(0, 8) : []

  const out: string[] = [defs()]
  const busy = new Map<string, number>()
  for (const skill of roster) {
    const lab = crew[skill]?.lab
    if (lab) busy.set(lab, (busy.get(lab) ?? 0) + 1)
  }
  for (const a of agents) busy.set(a.lab, busy.get(a.lab) ?? 0)

  // the world around the building (street, beach, forest…): ground behind everything
  out.push(worldGround(W, VIEW_W, VIEW_H))

  // building slab and back walls
  out.push(poly([iso(W, 0), iso(W, H), iso(W, H, -10), iso(W, 0, -10)], '#5A5047'))
  out.push(poly([iso(0, H), iso(W, H), iso(W, H, -10), iso(0, H, -10)], '#6E6257'))
  out.push(poly([iso(0, 0), iso(W, 0), iso(W, 0, WALL_H), iso(0, 0, WALL_H)], '#EFE7DA'))
  out.push(poly([iso(0, 0), iso(0, H), iso(0, H, WALL_H), iso(0, 0, WALL_H)], '#E1D6C6'))
  out.push(poly([iso(0, 0, WALL_H - 10), iso(W, 0, WALL_H - 10), iso(W, 0, WALL_H), iso(0, 0, WALL_H)], '#E6DCCB'))
  out.push(poly([iso(0, 0, WALL_H - 10), iso(0, H, WALL_H - 10), iso(0, H, WALL_H), iso(0, 0, WALL_H)], '#D7CBB8'))
  out.push(poly([iso(0, 0, 6), iso(W, 0, 6), iso(W, 0), iso(0, 0)], '#CDBFAA'))
  out.push(poly([iso(0, 0, 6), iso(0, H, 6), iso(0, H), iso(0, 0)], '#C2B39D'))
  out.push(poly([iso(0, 0, WALL_H), iso(W, 0, WALL_H), iso(W, -0.25, WALL_H), iso(0, -0.25, WALL_H)], '#B9AC98'))
  out.push(poly([iso(0, 0, WALL_H), iso(0, H, WALL_H), iso(-0.25, H, WALL_H), iso(-0.25, 0, WALL_H)], '#AEA08B'))
  out.push(wallDecor(W))

  const glows: string[] = []
  const windowBack = (xa: number, xb: number) => {
    const mid = (xa + xb) / 2
    const glass = [iso(xa + 0.1, 0, 26), iso(xb - 0.1, 0, 26), iso(xb - 0.1, 0, 52), iso(xa + 0.1, 0, 52)] as [number, number][]
    glows.push(poly(glass, '#FFD36B', ' class="win-glow"'))
    return poly([iso(xa, 0, 24), iso(xb, 0, 24), iso(xb, 0, 54), iso(xa, 0, 54)], '#8F7A63') + poly(glass, 'url(#glass)') +
      `<path d="M${pts([iso(mid, 0, 26)])}L${pts([iso(mid, 0, 52)])}M${pts([iso(xa + 0.1, 0, 39)])}L${pts([iso(xb - 0.1, 0, 39)])}" stroke="#8F7A63" stroke-width="2"/>`
  }
  const windowSide = (ya: number, yb: number) => {
    const mid = (ya + yb) / 2
    const glass = [iso(0, ya + 0.1, 26), iso(0, yb - 0.1, 26), iso(0, yb - 0.1, 52), iso(0, ya + 0.1, 52)] as [number, number][]
    glows.push(poly(glass, '#FFD36B', ' class="win-glow"'))
    return poly([iso(0, ya, 24), iso(0, yb, 24), iso(0, yb, 54), iso(0, ya, 54)], '#8F7A63') + poly(glass, 'url(#glass)') +
      `<path d="M${pts([iso(0, mid, 26)])}L${pts([iso(0, mid, 52)])}M${pts([iso(0, ya + 0.1, 39)])}L${pts([iso(0, yb - 0.1, 39)])}" stroke="#8F7A63" stroke-width="2"/>`
  }
  out.push(windowBack(1.2, 3.4), windowBack(8.6, 10.8), windowSide(2.2, 4.6), windowSide(D + 3, D + 5.4))

  // title floating outside the room, above the side wall and sheared to run parallel to it
  const sideText = (text: string, y: number, z: number, size: number, fill: string, spacing: number, extra = '') => {
    const [tx, ty] = iso(-0.2, y, z)
    return `<text transform="matrix(1,-0.5,0,1,${r(tx)},${r(ty)})" font-size="${size}" font-weight="700" fill="${fill}" text-anchor="middle" letter-spacing="${spacing}"${extra}>${esc(text)}</text>`
  }
  out.push(sideText('SKILL LAB', H / 2 + 0.1, WALL_H + 13, 26, '#000000', 3, ' opacity=".35"'))
  out.push(sideText('SKILL LAB', H / 2, WALL_H + 15, 26, '#D97757', 3))
  out.push(sideText('laboratorio de skills', H / 2, WALL_H + 3, 9, '#A99C8B', 1.5))

  // floors
  const THEME_FLOOR: Partial<Record<Theme, string>> = {
    gym: '#C9CDD2', cafe: '#E3CBA8', arcade: '#34304A', military: '#9AA27A', smoking: '#B9AFA2',
    ...Object.fromEntries(Object.entries(THEME_MODULES).map(([id, m]) => [id, m!.floor])),
  }
  let grid = ''
  let checker = ''
  const corridor = { x0: 0, x1: W, y0: D, y1: D + 1 }
  out.push(floorQuad(corridor.x0, corridor.y0, corridor.x1, corridor.y1, '#CFC8BC'))
  for (const room of rooms) {
    const fill = room.kind === 'dorm' ? '#EADBC4' : room.kind === 'patio' ? '#B9D69A' : THEME_FLOOR[room.theme ?? 'lab'] ?? labById(room.id).floor
    out.push(floorQuad(room.x0, room.y0, room.x1, room.y1, fill))
    if (room.kind === 'lab' && room.theme && THEME_FLOOR[room.theme]) {
      // a strip of the lab's colour by the door keeps the room recognisable
      const a = T(room, D - 0.35)
      const b = T(room, D)
      out.push(floorQuad(room.x0, Math.min(a, b), room.x1, Math.max(a, b), labById(room.id).accent, ' opacity=".7"'))
    }
    // a room with its own floor pattern (planks, tiles, carpet…) skips the generic grid and checker
    const decor = floorDecor(room, fill)
    if (decor !== null) {
      out.push(decor)
      continue
    }
    for (let x = room.x0 + 1; x < room.x1; x++) grid += `M${pts([iso(x, room.y0)])}L${pts([iso(x, room.y1)])}`
    for (let y = room.y0 + 1; y < room.y1; y++) grid += `M${pts([iso(room.x0, y)])}L${pts([iso(room.x1, y)])}`
    if (room.kind === 'patio') continue
    for (let x = room.x0; x < room.x1; x++) {
      for (let y = room.y0; y < room.y1; y++) {
        if ((x + y) % 2) checker += `M${pts([iso(x, y)])}L${pts([iso(x + 1, y)])}L${pts([iso(x + 1, y + 1)])}L${pts([iso(x, y + 1)])}Z`
      }
    }
  }
  out.push(`<path d="${checker}" fill="#000" fill-opacity=".035" pointer-events="none"/>`)
  out.push(`<path d="${grid}" stroke="#000" stroke-opacity=".06" pointer-events="none"/>`)
  out.push(floorQuad(0.4, D + 0.18, W - 0.4, D + 0.82, '#A9876C'), floorQuad(0.55, D + 0.28, W - 0.55, D + 0.72, '#C29E7F'))
  for (const room of rooms.filter(rm => rm.kind === 'lab' && busy.has(rm.id))) {
    const [gx, gy] = iso((room.x0 + room.x1) / 2, (room.y0 + room.y1) / 2)
    out.push(`<ellipse cx="${r(gx)}" cy="${r(gy)}" rx="${r((room.x1 - room.x0) * 20)}" ry="${r((room.x1 - room.x0) * 10)}" fill="url(#gl-${room.id})" pointer-events="none"><animate attributeName="opacity" values=".75;1;.75" dur="3s" repeatCount="indefinite"/></ellipse>`)
  }

  // partitions with door gaps, the building's front and right walls
  const PART = '#D8CDBD'
  const gap = 0.65
  for (const [y, top] of [[D, true], [D + 1, false]] as const) {
    const doors = rooms.filter(rm => rm.top === top).map(doorX).sort((a, b) => a - b)
    let start = 0
    for (const dx of doors) {
      if (dx - gap > start) out.push(box(start, y - 0.07, 0, dx - gap - start, 0.14, 12, PART))
      start = dx + gap
    }
    if (W > start) out.push(box(start, y - 0.07, 0, W - start, 0.14, 12, PART))
  }
  for (const room of rooms) if (room.x0 > 0) out.push(box(room.x0 - 0.07, room.top ? 0 : D + 1.07, 0, 0.14, D - 0.07, 12, PART))
  // right wall, with the building's door to the street at the end of the corridor
  out.push(box(W - 0.07, 0, 0, 0.14, D + 0.15, 12, PART), box(W - 0.07, D + 0.85, 0, 0.14, H - D - 0.85, 12, PART))

  out.push(wallText('LITERAS', 6, WALL_H - 26, 15, '#9C7B5C'))

  const drawSign = (room: RoomGeom) => {
    const lab = room.kind === 'lab' ? labById(room.id) : null
    const name = lab ? lab.name : 'Patio'
    const accent = lab ? lab.accent : '#7DA65F'
    const n = lab ? busy.get(room.id) : undefined
    const wy = room.top ? 0 : D + 1
    const z = room.top ? WALL_H - 16 : 40
    const inset = Math.min(0.4, (room.x1 - room.x0) / 6)
    const [ax, ay] = iso(room.x0 + inset, wy, z)
    const [bx, by] = iso(room.x1 - inset, wy, z)
    if (!room.top) {
      for (const sx of [room.x0 + 1.2, room.x1 - 1.2]) {
        const [p, q] = iso(sx, wy, 12)
        out.push(`<rect x="${r(p - 1)}" y="${r(q - (z - 12) + 22)}" width="2" height="${r(z - 12 - 22 + 1)}" fill="#8F8678"/>`)
      }
    }
    out.push(`<g${lab ? ` data-lab="${room.id}" style="cursor:pointer"` : ''}><title>${esc(name)}${lab ? ' · clic para editar el puesto' : ''}</title>${poly([[ax, ay], [bx, by], [bx, by + 22], [ax, ay + 22]], accent)}`)
    const [tx, ty] = iso((room.x0 + room.x1) / 2, wy, z - 16)
    out.push(`<text transform="matrix(1,0.5,0,1,${r(tx)},${r(ty)})" font-size="12" font-weight="700" fill="#FFF" text-anchor="middle">${esc(name)}${n ? ` · ${n}` : ''}</text></g>`)
  }

  const furnished = new Map<string, Furnished>()
  const drawRoom = (room: RoomGeom) => {
    if (room.kind === 'patio') {
      out.push(box(room.x0 + 0.6, T(room, 3.2), 0, Math.min(2.4, room.x1 - room.x0 - 1.2), 0.5, 7, '#A27552'))
      for (const p of [{ x: room.x0 + 0.2, y: T(room, 0.9) }, { x: room.x1 - 1.1, y: T(room, 0.9) }, { x: room.x1 - 1.1, y: T(room, 6.2) }]) out.push(`<use href="#pl" ${at(p.x, p.y)}/>`)
      return
    }
    if (room.kind !== 'lab') return
    const f = furnish(room, labById(room.id), busy.has(room.id))
    furnished.set(room.id, f)
    out.push(f.svg)
    out.push(racks(room, labById(room.id), services))
  }

  // painter's order, back to front: wall signs, top rooms, plants, then the hanging signs and the bottom rooms in front of them
  rooms.filter(rm => rm.top && rm.kind !== 'dorm').forEach(drawSign)
  rooms.filter(rm => rm.top).forEach(drawRoom)
  const plants: Pt[] = [{ x: W - 0.95, y: D + 0.05 }]
  for (const room of rooms.filter(rm => rm.top && rm.kind === 'lab')) plants.push({ x: room.x0 + 0.05, y: room.y0 + D - 1.1 })
  for (const p of plants) out.push(`<use href="#pl" ${at(p.x, p.y)}/>`)
  // the bin, in the corridor by the side wall
  {
    const [bx, by] = iso(0.65, D + 0.5)
    out.push(
      // the translate places the bin; its animations run on .bin-body so they never override it
      `<g data-bin="in" ${tr([bx, by])}><title>Papelera: arrastra aquí skills, agentes, bolsas… o un gato</title><g class="bin-body">` +
      `<ellipse rx="11" ry="4" fill="#000" opacity=".18"/><path d="M-8 -20 h16 l-2 20 h-12 z" fill="#6E6A66"/><path d="M-4 -17 v14 M0 -17 v14 M4 -17 v14" stroke="#4F4B47" stroke-width="1.6"/>` +
      `<g class="lid"><rect x="-10" y="-24" width="20" height="4" fill="#8C857C"/><rect x="-3" y="-27" width="6" height="3" fill="#8C857C"/></g></g></g>`,
    )
  }
  rooms.filter(rm => !rm.top).forEach(drawSign)
  rooms.filter(rm => !rm.top).forEach(drawRoom)

  // the world's props in front of the building (lamps, trees, umbrellas…) and the lights they cast at night
  const props = worldProps(W)
  out.push(props.svg)
  const lamps = props.lamps
  {
    const cx = Math.round(W * 0.55)
    const [bx, by] = iso(cx, H + 0.6)
    out.push(
      `<g data-bin="out" ${tr([bx, by])}><title>Contenedor: funciona como la papelera</title><g class="bin-body"><ellipse rx="22" ry="7" fill="#000" opacity=".2"/>` +
      `<path d="M-18 -26 h36 l-3 26 h-30 z" fill="#3F7D4A"/><path d="M-18 -26 h36 v4 h-36 z" fill="#2F6239"/><rect x="-6" y="-16" width="12" height="7" fill="#FFFFFF" opacity=".85"/><text y="-10.5" font-size="6" text-anchor="middle" fill="#2F6239" font-weight="700">♻</text>` +
      `<circle cx="-12" cy="1" r="2.5" fill="#222"/><circle cx="12" cy="1" r="2.5" fill="#222"/>` +
      `<g class="lid"><path d="M-20 -30 h40 v4 h-40 z" fill="#2B5532"/></g></g></g>`,
    )
  }

  out.push(seasonDecor(rooms, W, now, season))

  // the cats patrol: even ones the corridor, odd ones the sidewalk
  const corridorLoop = (): Pt[] => [
    { x: 1.6, y: CORRIDOR_Y }, { x: W - 1.6, y: CORRIDOR_Y }, { x: W - 3, y: CORRIDOR_Y }, { x: W - 3, y: D + 1.7 }, { x: W - 4.5, y: D + 1.7 }, { x: W - 4.5, y: CORRIDOR_Y },
    { x: 9, y: CORRIDOR_Y }, { x: DORM_AISLE_X, y: CORRIDOR_Y }, { x: DORM_AISLE_X, y: D - 1 }, { x: 3, y: D - 1 }, { x: DORM_AISLE_X, y: D - 1 }, { x: DORM_AISLE_X, y: CORRIDOR_Y }, { x: 1.6, y: CORRIDOR_Y },
  ]
  const sidewalkLoop = (): Pt[] => [{ x: -2, y: H + 1.3 }, { x: W + 2, y: H + 1.3 }, { x: W + 2, y: H + 1.0 }, { x: -2, y: H + 1.0 }, { x: -2, y: H + 1.3 }]
  const catLayer: string[] = []
  shownCats.forEach((cat, i) => {
    const loop = i % 2 ? sidewalkLoop() : corridorLoop()
    const sp = screenPath(loop, 22 - (i % 3) * 3)
    const face = facing(loop)
    const offset = (now / 1000 + i * 7.3) % sp.dur
    catLayer.push(
      `<g data-pet="${i}" data-coat="${cat.coat}" data-name="${esc(cat.name)}" style="cursor:pointer"><title>${esc(cat.name)} · clic: nombre · doble clic: mimos</title><animateMotion path="${sp.d}" dur="${r(sp.dur)}s" begin="${r(-offset)}s" repeatCount="indefinite"/>` +
      // a generous invisible hit area: a moving 18 px cat is hard to grab
      `<ellipse cy="-6" rx="15" ry="11" fill="transparent"/>` +
      // nested on purpose: facing (discrete scale), then the step bob, then the sprite the webview may flip with CSS
      `<g><animateTransform attributeName="transform" type="scale" calcMode="discrete" values="${face.values}" keyTimes="${face.keyTimes}" dur="${r(sp.dur)}s" begin="${r(-offset)}s" repeatCount="indefinite"/>` +
      `<g>${bob(1, 0.3)}<use href="#pt-${cat.coat}"/></g></g>${label(cat.name, -20, 8)}</g>`,
    )
  })

  // ---------- characters ----------

  const t = (ms: number) => (now - ms) / 1000
  // by day a third of the idle skills (a different third each day) go out for a walk instead of napping
  const strolling = (skill: string) => !night && (hash(skill) + dayIndex) % 3 === 0
  const sleeperAt = new Map<number, string>()
  const strollers: string[] = []
  roster.forEach((skill, i) => {
    const c = crew[skill]
    if (c?.lab) return
    const returning = c?.from && t(c.since) < 30
    if (!returning && strolling(skill)) strollers.push(skill)
    else sleeperAt.set(i, skill)
  })

  const returnPath = (bedIndex: number, fromLab: string) => {
    const room = roomById(fromLab)
    return screenPath(walkPath(bedSpot(bedIndex).front, room, { x: room.x1 - 0.5, y: entryY(room) }).reverse())
  }

  const sleeper = (skill: string, i: number) => {
    const c = crew[skill]
    const spot = bedSpot(i)
    const color = colorOf(skill)
    let appearIn = 0
    if (c && !c.lab && c.from) {
      const back = returnPath(i, c.from)
      if (t(c.since) < back.dur) appearIn = back.dur - t(c.since)
    }
    const open = `<g data-skill="${esc(skill)}" data-home="${r(spot.front.x)},${r(spot.front.y)}" data-color="${color}" data-asleep="1" style="cursor:pointer"${appearIn > 0 ? ` opacity="0"><set attributeName="opacity" to="1" begin="${r(appearIn)}s" fill="freeze"/` : ''}>`
    const title = `<title>${esc(skill)} · durmiendo${c?.uses ? ` · ${c.uses} usos` : ''}</title>`
    if (spot.bunk) {
      const b = spot.bunk
      const z = BED_LEVEL_Z[spot.level ?? 0]!
      const [sx, sy] = iso(b.x + BUNK_W / 2, b.y + 0.55, z)
      const zz = r((hash(skill) % 30) / 10)
      return (
        `${open}${title}${useSprite('cs', color, sx, sy, 0.75)}<use href="#bl" style="color:${color}" ${at(b.x, b.y, z)}/>` +
        `<text x="${r(sx + 10)}" font-size="8" fill="#8C7A66" opacity="0">z<animate attributeName="opacity" values="0;1;0" dur="3s" begin="${zz}s" repeatCount="indefinite"/><animate attributeName="y" values="${r(sy - 12)};${r(sy - 24)}" dur="3s" begin="${zz}s" repeatCount="indefinite"/></text><g ${tr([sx, sy])}>${label(skill, -16, 8)}</g></g>`
      )
    }
    const f = spot.floor!
    const [sx, sy] = iso(f.x, f.y)
    return `${open}${title}${box(f.x - 0.4, f.y - 0.25, 0, 0.8, 0.5, 3, shade(color, 1.3))}${useSprite('cs', color, sx, sy - 2, 0.7)}</g>`
  }

  BUNKS.forEach((b, bi) => {
    out.push(`<use href="#b1" ${at(b.x, b.y)}/>`)
    const low = sleeperAt.get(bi * 2)
    if (low) out.push(sleeper(low, bi * 2))
    out.push(`<use href="#b2" ${at(b.x, b.y)}/>`)
    const high = sleeperAt.get(bi * 2 + 1)
    if (high) out.push(sleeper(high, bi * 2 + 1))
    out.push(`<use href="#b3" ${at(b.x, b.y)}/>`)
  })
  for (const [i, skill] of sleeperAt) if (i >= BUNKS.length * 2) out.push(sleeper(skill, i))

  const slotsUsed = new Map<string, number>()
  const layer: { depth: number; svg: string }[] = []
  const walk = (skill: string, d: string, dur: number, elapsed: number, labColor: string, toLab: boolean) => {
    const own = colorOf(skill)
    const color = toLab ? own : labColor
    const anim = toLab ? recolor(own, labColor, dur - elapsed - 0.3) : recolor(labColor, own, Math.max(0, 0.4 - elapsed))
    return (
      `<g data-skill="${esc(skill)}" style="cursor:pointer"><title>${esc(skill)}</title><animateMotion path="${d}" dur="${r(dur)}s" begin="${r(-elapsed)}s" fill="freeze"/>` +
      (toLab ? '' : `<set attributeName="opacity" to="0" begin="${r(dur - elapsed)}s" fill="freeze"/>`) +
      `<g>${bob(2.5, 0.34)}${useSprite('ca', color, 0, 0, 1, '#FFFFFF', anim)}${label(skill)}</g></g>`
    )
  }

  roster.forEach((skill, i) => {
    const c = crew[skill]
    if (!c) return
    const elapsed = t(c.since)
    if (c.lab) {
      const room = roomById(c.lab)
      const lab = labById(c.lab)
      const f = furnished.get(room.id)
      const list = f?.stations.length ? f.stations : [{ x: room.x1 - 1, y: entryY(room), kind: 'lab' as StationKind }]
      const slot = slotsUsed.get(room.id) ?? 0
      slotsUsed.set(room.id, slot + 1)
      const target = list[Math.min(slot, list.length - 1)]!
      const sp = screenPath(walkPath(bedSpot(i).front, room, target))
      if (elapsed < sp.dur) {
        layer.push({ depth: 1e6, svg: walk(skill, sp.d, sp.dur, elapsed, lab.accent, true) })
        return
      }
      const [tx, ty] = iso(target.x, target.y, target.z ?? 0)
      const a = workAnim(target.kind, hash(skill), lab.accent)
      layer.push({
        depth: target.x + target.y,
        svg:
          `<g data-skill="${esc(skill)}" data-home="${r(target.x)},${r(target.y)}" data-color="${lab.accent}" style="cursor:pointer" ${tr([tx, ty])}><title>${esc(skill)} · ${esc(lab.name)}${c.uses ? ` · ${c.uses} usos` : ''}</title>` +
          `<g>${a.move}${useSprite('ca', lab.accent, 0, 0, 1, '#FFFFFF')}</g>${a.extra}${label(skill)}</g>`,
      })
    } else if (c.from) {
      const back = returnPath(i, c.from)
      if (elapsed < back.dur) layer.push({ depth: 1e6, svg: walk(skill, back.d, back.dur, elapsed, labById(c.from).accent, false) })
    }
  })

  // Claude sessions and their sub-agents; idle ones go for a walk by day
  const agentsPerRoom = new Map<string, number>()
  const strollingAgents: AgentView[] = []
  for (const a of agents) {
    if (a.activity === 'idle' && !night) {
      strollingAgents.push(a)
      continue
    }
    const room = roomById(a.lab)
    const k = agentsPerRoom.get(room.id) ?? 0
    agentsPerRoom.set(room.id, k + 1)
    const spots = furnished.get(room.id)?.agentSpots ?? [{ x: room.x1 - 1.5, y: entryY(room) }]
    const spot = spots[k % spots.length]!
    const [sx, sy] = iso(spot.x + Math.floor(k / spots.length) * 0.5, spot.y)
    const working = a.activity !== 'idle' && a.activity !== 'listo' && a.activity !== 'esperando' && a.activity !== 'pregunta'
    const gym = room.theme === 'gym' && working
    let svg =
      `<g data-session="${esc(a.id)}" data-home="${r(spot.x)},${r(spot.y)}" data-color="${CLAUDE}" style="cursor:pointer" ${tr([sx, sy])}${a.activity === 'idle' ? ' opacity=".6"' : ''}><title>${esc(a.label)} · ${a.activity === 'idle' ? 'en reposo' : a.activity}</title>` +
      `<g>${working ? bob(gym ? 3 : 2, gym ? 0.25 : 0.6) : ''}${useSprite('ag', CLAUDE, 0, 0, 1)}</g>${gym ? sweat(hash(a.id)) : ''}${bubble(a.activity, -50)}${label(a.label, -38, 8)}</g>`
    // up to 10 sub-agents in rows of 5, shifted so the whole block stays inside the room
    const subs = a.subagents.slice(0, 10)
    const cols = Math.min(subs.length, 5)
    const rows = Math.ceil(subs.length / 5)
    const fx = Math.max(room.x0 + 0.5, Math.min(spot.x + 0.5, room.x1 - 0.5 - (cols - 1) * 0.7))
    const fy = Math.max(room.y0 + 0.5, Math.min(spot.y + 0.7, room.y1 - 0.4 - (rows - 1) * 0.7))
    subs.forEach((sub, j) => {
      const [qx, qy] = iso(fx + (j % 5) * 0.7, fy + Math.floor(j / 5) * 0.7)
      svg += `<g ${tr([qx, qy])}><title>subagente · ${esc(sub.label)}</title><g>${bob(1.5, 0.45, j * 0.1)}${useSprite('ag', '#E9A07E', 0, 0, 0.6)}</g></g>`
    })
    layer.push({ depth: spot.x + spot.y, svg })
  }

  // strollers on the street: skills on the near sidewalk, idle agents on the far one
  const stroll = (key: string, lane: number, i: number) => {
    const forward = i % 2 === 0
    const xs = forward ? [-3, W + 3] : [W + 3, -3]
    const sp = screenPath([{ x: xs[0]!, y: lane }, { x: xs[1]!, y: lane }, { x: xs[1]!, y: lane + 0.35 }, { x: xs[0]!, y: lane + 0.35 }, { x: xs[0]!, y: lane }], STROLL_SPEED - (hash(key) % 8))
    return { d: sp.d, dur: sp.dur, begin: -((now / 1000 + (hash(key) % 997)) % sp.dur) }
  }
  strollers.forEach((skill, i) => {
    const p = stroll(skill, STREET_NEAR, i)
    layer.push({
      depth: 2e6,
      svg:
        `<g data-skill="${esc(skill)}" data-stroll="1" style="cursor:pointer"><title>${esc(skill)} · de paseo</title><animateMotion path="${p.d}" dur="${r(p.dur)}s" begin="${r(p.begin)}s" repeatCount="indefinite"/>` +
        `<g>${bob(1.8, 0.42)}${useSprite('ca', colorOf(skill), 0, 0, 1)}</g>${label(skill)}</g>`,
    })
  })
  strollingAgents.forEach((a, i) => {
    const p = stroll(a.id, STREET_FAR - 0.1, i + 1)
    layer.push({
      depth: 2e6,
      svg:
        `<g data-session="${esc(a.id)}" data-stroll="1" style="cursor:pointer"><title>${esc(a.label)} · paseando (en reposo)</title><animateMotion path="${p.d}" dur="${r(p.dur)}s" begin="${r(p.begin)}s" repeatCount="indefinite"/>` +
        `<g>${bob(1.5, 0.5)}${useSprite('ag', CLAUDE, 0, 0, 1)}</g>${label(a.label, -38, 8)}</g>`,
    })
  })

  layer.sort((a, b) => a.depth - b.depth)
  out.push(...layer.filter(l => l.depth < 2e6).map(l => l.svg))
  out.push(...catLayer)
  out.push(...layer.filter(l => l.depth >= 2e6).map(l => l.svg))

  // weather and sky effects of the world (snowfall…), above the characters
  out.push(worldOverlay(W, VIEW_W, VIEW_H))

  // night: a shade over everything, then the lights that shine through it
  out.push(`<rect id="shade" x="-40" y="-40" width="${VIEW_W + 80}" height="${VIEW_H + 80}" fill="#0B1030" opacity="0" pointer-events="none"/>`)
  out.push(`<g pointer-events="none">${glows.join('')}${lamps.join('')}</g>`)

  const asleep = sleeperAt.size
  const working = roster.filter(s => crew[s]?.lab).length
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}" font-family="Verdana,sans-serif">${out.join('')}</svg>`
  // where a dropped cat can play its scene: free stations of each room (on the bike, by the table, at the desk...),
  // free top bunks (drawn above everything, a cat on a lower one would cover the bunk over it), the patio lawn;
  // in screen coordinates, z included
  const catSpots: { room: string; kind: string; x: number; y: number }[] = []
  for (const room of rooms) {
    if (room.kind === 'lab') {
      const f = furnished.get(room.id)
      const used = slotsUsed.get(room.id) ?? 0
      // the front-aisle spares are only for crowds: a cat goes to a real piece of furniture
      const real = (f?.stations ?? []).filter(st => Math.abs(st.y - T(room, D - 1.3)) > 0.01)
      real.slice(used).forEach(st => {
        const [x, y] = iso(st.x, st.y, st.z ?? 0)
        catSpots.push({ room: room.id, kind: st.kind, x: r(x), y: r(y) })
      })
    } else if (room.kind === 'dorm') {
      BUNKS.forEach((b, bi) => {
        if (sleeperAt.has(bi * 2 + 1)) return
        const [x, y] = iso(b.x + BUNK_W / 2, b.y + 1.1, BED_LEVEL_Z[1]!)
        catSpots.push({ room: room.id, kind: 'bed', x: r(x), y: r(y) })
      })
    } else {
      for (const [dx, t] of [[1.2, 2.2], [2.4, 4.2], [1.4, 5.6]] as const) {
        if (room.x0 + dx >= room.x1 - 0.5) continue
        const [x, y] = iso(room.x0 + dx, T(room, t))
        catSpots.push({ room: room.id, kind: 'lawn', x: r(x), y: r(y) })
      }
    }
  }

  const geo = {
    ox: OX, oy: OY, vw: VIEW_W, vh: VIEW_H, D, H, W, aisle: DORM_AISLE_X, catSpots,
    rooms: rooms.map(rm => ({ id: rm.id, kind: rm.kind, theme: rm.theme ?? null, x0: rm.x0, x1: rm.x1, y0: rm.y0, y1: rm.y1, top: rm.top })),
  }
  return { svg, asleep, working, strolling: strollers.length + strollingAgents.length, sessions: agents.length, geo }
}

// Shared drawing helpers for the files that draw part of the scene (themes/, world.ts, decor.ts, racks.ts).
export { r, iso, pts, poly, esc, at, tr, shade, hash, box, tintBox, floorQuad, boxT, T, spanY, columns, entryY, doorX, px, U, bob, sweat, label }
export { TW, TH, D, H, WALL_H, CORRIDOR_Y, STREET_NEAR, STREET_FAR, Y_MAX }
