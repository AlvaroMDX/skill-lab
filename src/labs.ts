export type Theme = 'lab' | 'gym' | 'cafe' | 'library' | 'arcade' | 'military' | 'smoking' | 'greenhouse' | 'music' | 'space' | 'kitchen' | 'beach' | 'casino'
export const THEMES: Theme[] = ['lab', 'gym', 'cafe', 'library', 'arcade', 'military', 'smoking', 'greenhouse', 'music', 'space', 'kitchen', 'beach', 'casino']

// What surrounds the building.
export type World = 'city' | 'beach' | 'forest' | 'snow' | 'moon'
export const WORLDS: World[] = ['city', 'beach', 'forest', 'snow', 'moon']

// Ready-made sets of puesto colours.
export const PALETTES: Record<string, string[]> = {
  calidos: ['#D9653B', '#E0A43B', '#C8423A', '#E5833A', '#B85C38', '#D4A24C', '#C9583E', '#E7B04F'],
  pasteles: ['#F4A7B9', '#A7C7E7', '#B5E2B5', '#FDD9A0', '#C9B6E4', '#A8DCD9', '#F7C8A0', '#D7E8A6'],
  multicolor: ['#E63946', '#F4A261', '#E9C46A', '#2A9D8F', '#457B9D', '#8E5BD6', '#43AA8B', '#F15BB5'],
  frios: ['#3D85C6', '#2A9D8F', '#5E60CE', '#4EA8DE', '#56CFE1', '#6D9DC5', '#4361EE', '#48BFE3'],
  neon: ['#FF4FD8', '#4FE3FF', '#B6FF4F', '#FFE34F', '#FF8A4F', '#A06BFF', '#4FFFB0', '#FF4F6E'],
  tierra: ['#8B6B4A', '#A0522D', '#6B8E4E', '#B5895B', '#7A6A53', '#9C7A3C', '#5F7A61', '#B07A5A'],
}

// A deployed service shown as a server rack in its puesto: green light while the URL answers, red when it doesn't.
export type Service = { name: string; url: string }

export type Lab = {
  id: string
  name: string
  accent: string
  floor: string
  match?: RegExp
  width: number
  row: 'top' | 'bottom'
  theme: Theme
  custom: boolean
  services: Service[]
}

type LabOverride = { name?: string; accent?: string; match?: string; width?: number; row?: 'top' | 'bottom'; theme?: Theme; services?: Service[] }

export type LabConfig = {
  returnDelaySeconds?: number
  // folder the person keeps their projects in; puestos can be created from its subfolders
  projectsRoot?: string
  // a lab id here that is not a default one is a puesto the person created
  labs?: Record<string, LabOverride>
  // left-to-right drawing order of the puestos; ids missing from it go after, in creation order
  order?: string[]
  removed?: string[]
  skillLabs?: Record<string, string>
  hidden?: string[]
  world?: World
  // name of the PALETTES entry the person picked; new puestos take their colour from it
  palette?: string
}

export const MIN_WIDTH = 4
export const MAX_WIDTH = 14
export const FALLBACK_LAB = 'general'

// A fresh install has only the fallback puesto; the setup (or Layout → Labs) creates the rest from the person's folders.
const DEFAULT_LABS: Omit<Lab, 'custom'>[] = [
  { id: FALLBACK_LAB, name: 'General', accent: '#8C8C84', floor: '#E8E6DF', width: 8, row: 'bottom', theme: 'lab', services: [] },
]
const DEFAULT_ORDER = [FALLBACK_LAB]

// Colours for puestos the person creates, in turn.
export const CUSTOM_ACCENTS = ['#E07A5F', '#3D85C6', '#81B29A', '#F2CC8F', '#9C6ADE', '#2A9D8F', '#E76F51', '#6D9DC5', '#B5838D', '#90BE6D']

const DEFAULT_SKILL_LAB: Record<string, string> = {}

// Live lists, rebuilt in place by applyConfig so every importer sees the change.
export const LABS: Lab[] = DEFAULT_LABS.map(l => ({ ...l, custom: false }))
export const ROOM_ORDER: string[] = [...DEFAULT_ORDER]
export let SKILL_LAB: Record<string, string> = { ...DEFAULT_SKILL_LAB }
export let RETURN_DELAY_MS = 20_000
export let HIDDEN = new Set<string>()
export let PROJECTS_ROOT = ''
export let WORLD: World = 'city'
export let PALETTE_NAME = ''

const floorFor = (accent: string) => {
  const n = parseInt(accent.slice(1), 16)
  const mix = (v: number) => Math.round(v + (255 - v) * 0.82)
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => mix(v).toString(16).padStart(2, '0')).join('')}`
}

const regexOf = (source: string | undefined, fallback?: RegExp) => {
  if (source === undefined) return fallback
  try {
    return source ? new RegExp(source, 'i') : undefined
  } catch {
    return fallback
  }
}

// A folder as a rule for `match`: the path itself, with either kind of slash.
export const folderRule = (folder: string) =>
  '^' + folder.replace(/[\\/]+$/, '').split(/[\\/]+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\\\/]') + '([\\\\/]|$)'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const stringList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined)
// own keys only: a palette called "toString" must not reach Object.prototype
const paletteOf = (name: unknown) => (typeof name === 'string' && Object.prototype.hasOwnProperty.call(PALETTES, name) ? PALETTES[name] : undefined)

function sanitizeOverride(raw: unknown): LabOverride {
  if (!isRecord(raw)) return {}
  const o: LabOverride = {}
  if (typeof raw.name === 'string') o.name = raw.name
  if (typeof raw.accent === 'string') o.accent = raw.accent
  if (typeof raw.match === 'string') o.match = raw.match
  if (typeof raw.width === 'number' || typeof raw.width === 'string') o.width = Number(raw.width)
  if (raw.row === 'top' || raw.row === 'bottom') o.row = raw.row
  if (typeof raw.theme === 'string') o.theme = raw.theme as Theme
  if (Array.isArray(raw.services)) o.services = raw.services.filter(isRecord) as Service[]
  return o
}

// A hand-edited config.json can hold anything: wrong types are dropped (defaults apply) and unknown keys are kept.
export function sanitizeConfig(raw: unknown): LabConfig {
  if (!isRecord(raw)) return {}
  const cfg: LabConfig & Record<string, unknown> = { ...raw }
  const delay = Number(raw.returnDelaySeconds)
  if (raw.returnDelaySeconds === undefined || !Number.isFinite(delay)) delete cfg.returnDelaySeconds
  else cfg.returnDelaySeconds = delay
  if (typeof raw.projectsRoot !== 'string') delete cfg.projectsRoot
  if (isRecord(raw.labs)) cfg.labs = Object.fromEntries(Object.entries(raw.labs).map(([id, o]) => [id, sanitizeOverride(o)]))
  else delete cfg.labs
  for (const key of ['order', 'removed', 'hidden'] as const) {
    const list = stringList(raw[key])
    if (list) cfg[key] = list
    else delete cfg[key]
  }
  if (isRecord(raw.skillLabs)) cfg.skillLabs = Object.fromEntries(Object.entries(raw.skillLabs).filter((e): e is [string, string] => typeof e[1] === 'string'))
  else delete cfg.skillLabs
  if (!WORLDS.includes(raw.world as World)) delete cfg.world
  if (!paletteOf(raw.palette)) delete cfg.palette
  return cfg
}

export function applyConfig(raw: LabConfig) {
  const cfg = sanitizeConfig(raw)
  const removed = new Set((cfg.removed ?? []).filter(id => id !== FALLBACK_LAB))
  const build = (base: Omit<Lab, 'custom'>, o: LabOverride, custom: boolean): Lab => {
    const accent = /^#[0-9a-f]{6}$/i.test(o.accent ?? '') ? o.accent! : base.accent
    return {
      ...base,
      name: o.name || base.name,
      accent,
      floor: accent === base.accent ? base.floor : floorFor(accent),
      match: regexOf(o.match, base.match),
      width: Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(o.width) || base.width))),
      row: o.row === 'top' || o.row === 'bottom' ? o.row : base.row,
      theme: THEMES.includes(o.theme as Theme) ? (o.theme as Theme) : base.theme,
      services: (Array.isArray(o.services) ? o.services : base.services)
        .filter(sv => sv && typeof sv.url === 'string' && /^https?:\/\//i.test(sv.url))
        .slice(0, 6)
        .map(sv => ({ name: String(sv.name || sv.url).slice(0, 40), url: sv.url })),
      custom,
    }
  }
  const defaults = DEFAULT_LABS.filter(l => !removed.has(l.id)).map(l => build(l, cfg.labs?.[l.id] ?? {}, false))
  const customIds = Object.keys(cfg.labs ?? {}).filter(id => !DEFAULT_LABS.some(l => l.id === id) && !removed.has(id))
  const custom = customIds.map((id, i) => {
    const colors = paletteOf(cfg.palette) ?? CUSTOM_ACCENTS
    const accent = colors[i % colors.length]!
    return build({ id, name: id, accent, floor: floorFor(accent), width: 8, row: i % 2 ? 'top' : 'bottom', theme: 'lab', services: [] }, cfg.labs?.[id] ?? {}, true)
  })
  // puestos made from a concrete folder are more specific than the generic default rules: they are tried first
  LABS.splice(0, LABS.length, ...custom, ...defaults)
  const known = (id: string) => LABS.some(l => l.id === id)
  const ordered = [...new Set([...(cfg.order ?? []).filter(known), ...customIds, ...DEFAULT_ORDER.filter(known)])]
  ROOM_ORDER.splice(0, ROOM_ORDER.length, ...ordered)
  SKILL_LAB = Object.fromEntries(Object.entries({ ...DEFAULT_SKILL_LAB, ...(cfg.skillLabs ?? {}) }).filter(([, lab]) => LABS.some(l => l.id === lab)))
  // capped at an hour so a typo can't park a skill in its puesto for good
  RETURN_DELAY_MS = Math.min(3600, Math.max(3, cfg.returnDelaySeconds ?? 20)) * 1000
  HIDDEN = new Set(cfg.hidden ?? [])
  PROJECTS_ROOT = cfg.projectsRoot ?? ''
  WORLD = WORLDS.includes(cfg.world as World) ? (cfg.world as World) : 'city'
  PALETTE_NAME = cfg.palette ?? ''
}

// Paints every puesto with the palette, in drawing order.
export function paintWithPalette(cfg: LabConfig, name: string) {
  const colors = paletteOf(name)
  if (!colors) return
  cfg.palette = name
  const labs = isRecord(cfg.labs) ? cfg.labs : {}
  const ids = [...new Set([...(stringList(cfg.order) ?? []), ...Object.keys(labs)])].filter(id => isRecord(labs[id]))
  ids.forEach((id, i) => (labs[id]!.accent = colors[i % colors.length]))
}

export function defaultConfig(): LabConfig {
  return {
    returnDelaySeconds: 20,
    labs: Object.fromEntries(
      DEFAULT_LABS.map(l => [l.id, { name: l.name, accent: l.accent, match: l.match?.source ?? '', width: l.width, row: l.row, theme: l.theme }]),
    ),
    skillLabs: { ...DEFAULT_SKILL_LAB },
    hidden: [],
  }
}

export const labForDir = (dir: string): string => LABS.find(lab => lab.match?.test(dir))?.id ?? FALLBACK_LAB

export const labForSkill = (skill: string, dir: string): string => SKILL_LAB[skill] ?? labForDir(dir)
