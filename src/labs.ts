export type Theme = 'lab' | 'gym' | 'cafe' | 'library' | 'arcade' | 'military' | 'smoking'
export const THEMES: Theme[] = ['lab', 'gym', 'cafe', 'library', 'arcade', 'military', 'smoking']

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
}

type LabOverride = { name?: string; accent?: string; match?: string; width?: number; row?: 'top' | 'bottom'; theme?: Theme }

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
}

export const MIN_WIDTH = 4
export const MAX_WIDTH = 14
export const FALLBACK_LAB = 'general'

// A fresh install has only the fallback puesto; the setup (or Layout → Labs) creates the rest from the person's folders.
const DEFAULT_LABS: Omit<Lab, 'custom'>[] = [
  { id: FALLBACK_LAB, name: 'General', accent: '#8C8C84', floor: '#E8E6DF', width: 8, row: 'bottom', theme: 'lab' },
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

export function applyConfig(cfg: LabConfig) {
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
      custom,
    }
  }
  const defaults = DEFAULT_LABS.filter(l => !removed.has(l.id)).map(l => build(l, cfg.labs?.[l.id] ?? {}, false))
  const customIds = Object.keys(cfg.labs ?? {}).filter(id => !DEFAULT_LABS.some(l => l.id === id) && !removed.has(id))
  const custom = customIds.map((id, i) => {
    const accent = CUSTOM_ACCENTS[i % CUSTOM_ACCENTS.length]!
    return build({ id, name: id, accent, floor: floorFor(accent), width: 8, row: i % 2 ? 'top' : 'bottom', theme: 'lab' }, cfg.labs?.[id] ?? {}, true)
  })
  // puestos made from a concrete folder are more specific than the generic default rules: they are tried first
  LABS.splice(0, LABS.length, ...custom, ...defaults)
  const known = (id: string) => LABS.some(l => l.id === id)
  const ordered = [...new Set([...(cfg.order ?? []).filter(known), ...customIds, ...DEFAULT_ORDER.filter(known)])]
  ROOM_ORDER.splice(0, ROOM_ORDER.length, ...ordered)
  SKILL_LAB = Object.fromEntries(Object.entries({ ...DEFAULT_SKILL_LAB, ...(cfg.skillLabs ?? {}) }).filter(([, lab]) => LABS.some(l => l.id === lab)))
  RETURN_DELAY_MS = Math.max(3, cfg.returnDelaySeconds ?? 20) * 1000
  HIDDEN = new Set(cfg.hidden ?? [])
  PROJECTS_ROOT = cfg.projectsRoot ?? ''
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
