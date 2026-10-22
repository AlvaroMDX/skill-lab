import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'

import { FALLBACK_LAB, HIDDEN, LABS, PALETTES, PALETTE_NAME, PROJECTS_ROOT, RETURN_DELAY_MS, SKILL_LAB, THEMES, WORLD, WORLDS, applyConfig, defaultConfig, folderRule } from './labs'
import type { LabConfig, Theme } from './labs'
import { COATS, SKINS, colorOf, darkness, renderScene } from './scene'
import type { Cat, ClockMode, Skin } from './scene'
import { ServiceMonitor } from './services'
import { Tracker, countPastUses } from './tracker'

const HOME = os.homedir()
const LAB_DIR = path.join(HOME, '.claude', 'skill-lab')
const CONFIG_FILE = path.join(LAB_DIR, 'config.json')
const SKILLS_DIR = path.join(HOME, '.claude', 'skills')
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects')
const USES_KEY = 'skillLab.uses'
const SEEDED_KEY = 'skillLab.usesSeeded'
const MEDALS_KEY = 'skillLab.medals'
const SETUP_KEY = 'skillLab.setupDone'
// a person who never configured anything gets the setup when the panel first opens
let freshInstall = false

// Preferences edited from the panel live in globalState: writing VS Code settings can fail silently
// (a settings.json the editor refuses to touch), and then nothing the panel changed would stick.
let prefs: vscode.Memento | undefined
const PANEL_PREFS = ['sound', 'showPet', 'watchAllSessions', 'skipPermissions', 'cats', 'clockMode', 'skillSkin', 'agentSkin', 'season']

const skin = (key: 'skillSkin' | 'agentSkin'): Skin => {
  const v = setting<string>(key, 'clasico')
  return SKINS.includes(v as Skin) ? (v as Skin) : 'clasico'
}

// set in activate: health of the puestos' deployed services, by URL
let monitor: ServiceMonitor | undefined

function setting<T>(key: string, fallback: T): T {
  const own = PANEL_PREFS.includes(key) ? prefs?.get<T>(`pref.${key}`) : undefined
  return own !== undefined ? own : vscode.workspace.getConfiguration('skillLab').get<T>(key, fallback)
}

const setPref = (key: string, value: unknown) => prefs?.update(`pref.${key}`, value)

function readConfig(): LabConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function writeConfig(change: (cfg: LabConfig) => void) {
  const cfg = fs.existsSync(CONFIG_FILE) ? readConfig() : defaultConfig()
  change(cfg)
  fs.mkdirSync(LAB_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2))
  applyConfig(cfg)
}

const subdirs = (dir: string) => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(e => path.join(dir, e.name))
  } catch {
    return []
  }
}

// Every repo under the projects folder, one level deep and inside groups (Projects/client/web-app).
function projectRepos(): string[] {
  if (!PROJECTS_ROOT) return []
  const repos: string[] = []
  for (const dir of subdirs(PROJECTS_ROOT)) repos.push(dir, ...subdirs(dir))
  return repos
}

// The person's own skills plus each project's .claude/skills (repos under the projects folder and live sessions' folders).
function installedSkills(extraRepos: string[] = []): string[] {
  const names = new Set<string>()
  for (const dir of [SKILLS_DIR, ...[...new Set(extraRepos)].map(repo => path.join(repo, '.claude', 'skills'))]) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isFile() && fs.existsSync(path.join(dir, e.name, 'SKILL.md'))) names.add(e.name)
      }
    } catch {
      // no skills folder in this repo
    }
  }
  return [...names].sort()
}

// set in activate: re-reads every skills folder; called when puestos or repos change
let rescanSkills: (() => void) | undefined

function clockMode(): ClockMode {
  const m = setting<string>('clockMode', 'auto')
  return m === 'day' || m === 'night' ? m : 'auto'
}

// the old single-cat setting becomes the first cat of the list
function catList(): Cat[] {
  const cats = setting<Cat[]>('cats', [])
  if (Array.isArray(cats) && cats.length) return cats.filter(c => c && COATS.includes(c.coat))
  return [{ name: setting('petName', 'Michi'), coat: 'gris' }]
}

function claudeExecutable(): string {
  const custom = setting('claudeCommand', '')
  if (custom) return custom
  const extDir = path.join(HOME, '.vscode', 'extensions')
  try {
    const candidates = fs
      .readdirSync(extDir)
      .filter(n => n.startsWith('anthropic.claude-code-'))
      .map(n => path.join(extDir, n, 'resources', 'native-binary', process.platform === 'win32' ? 'claude.exe' : 'claude'))
      .filter(p => fs.existsSync(p))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    if (candidates[0]) return candidates[0]
  } catch {
    // no Claude Code extension installed
  }
  return 'claude'
}

class LabView implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView
  private lastSignature = ''
  private roster: string[] = []

  constructor(private ctx: vscode.ExtensionContext, private tracker: Tracker) {}

  setRoster(list: string[]) {
    this.roster = list
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view
    const media = vscode.Uri.joinPath(this.ctx.extensionUri, 'media')
    view.webview.options = { enableScripts: true, localResourceRoots: [media] }
    const nonce = Math.random().toString(36).slice(2)
    const js = view.webview.asWebviewUri(vscode.Uri.joinPath(media, 'main.js'))
    const css = view.webview.asWebviewUri(vscode.Uri.joinPath(media, 'main.css'))
    view.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"></head><body>
<div id="viewport"><div id="world"><div id="scene"><p class="wait">Esperando a Claude Code…</p></div><svg id="overlay" viewBox="0 0 850 530" width="850" height="530"></svg></div></div>
<div id="clock" class="panel" title="Reloj · clic: automático → siempre de día → siempre de noche"><svg viewBox="-24 -24 48 48"><g id="clockDisc"><path d="M-20 0 A20 20 0 0 1 20 0 Z" fill="#7CC6F2"/><path d="M-20 0 A20 20 0 0 0 20 0 Z" fill="#1B2350"/><path d="M-20 0 H20" stroke="#E8DFA8" stroke-width="1"/><circle cx="0" cy="-12" r="5" fill="#FFD84F"/><path d="M0 -19.5v2M0 -6.5v2M-7.5 -12h2M5.5 -12h2" stroke="#FFD84F" stroke-width="1.2"/><circle cx="0" cy="12" r="4.5" fill="#E8ECF5"/><circle cx="2.2" cy="10.8" r="3.8" fill="#1B2350"/><circle cx="-11" cy="6" r=".8" fill="#fff"/><circle cx="10" cy="5" r=".8" fill="#fff"/><circle cx="-7" cy="15" r=".7" fill="#fff"/><circle cx="12" cy="13" r=".6" fill="#fff"/></g><circle r="21" fill="none" stroke="#14110F" stroke-width="3"/><circle r="22.5" fill="none" stroke="#8C857C" stroke-width="1"/><path d="M-3.5 -24 L3.5 -24 L0 -17.5 Z" fill="#D97757" stroke="#14110F" stroke-width=".8"/></svg><span id="clockLabel">auto</span></div>
<div id="stats" class="chip"></div>
<div id="zoom" class="panel">
  <button class="icon" data-act="zoomIn" title="Acercar (rueda del ratón)"><svg viewBox="0 0 16 16"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg></button>
  <span id="zoomLevel">100%</span>
  <button class="icon" data-act="zoomOut" title="Alejar"><svg viewBox="0 0 16 16"><path d="M3 7h10v2H3z"/></svg></button>
  <button class="icon" data-act="fit" title="Encajar en el panel"><svg viewBox="0 0 16 16"><path d="M2 2h5v2H4v3H2zm7 0h5v5h-2V4H9zM2 9h2v3h3v2H2zm10 0h2v5H9v-2h3z"/></svg></button>
</div>
<div id="toolbar" class="panel">
  <button class="primary" data-act="newAgent" title="Lanzar Claude Code en una carpeta"><svg viewBox="0 0 16 16"><path d="M7 2h2v5h5v2H9v5H7V9H2V7h5z"/></svg>Agent</button>
  <button data-act="layout" data-tab="labs" title="Editar labs y skills"><svg viewBox="0 0 16 16"><path d="M2 2h5v5H2zm7 0h5v5H9zM2 9h5v5H2zm7 0h5v5H9z"/></svg>Layout</button>
  <button data-act="layout" data-tab="settings" title="Ajustes"><svg viewBox="0 0 16 16"><path d="M7 1h2v2h2v2h2v2h2v2h-2v2h-2v2H9v2H7v-2H5v-2H3V9H1V7h2V5h2V3h2zm0 5v4h2V6z"/></svg>Settings</button>
  <button data-act="layout" data-tab="medals" title="Medallas: los easter eggs que has encontrado">🏅 <span class="count">0/21</span></button>
</div>
<aside id="drawer" class="panel" aria-hidden="true">
  <header><h2>Layout</h2><button class="icon ghost" data-act="close" title="Cerrar"><svg viewBox="0 0 16 16"><path d="M3 3h2v2h2v2h2V5h2V3h2v2h-2v2h-2v2h2v2h2v2h-2v-2h-2V9H7v2H5v2H3v-2h2V9h2V7H5V5H3z"/></svg></button></header>
  <nav><button data-tab="labs">Labs</button><button data-tab="skills">Skills</button><button data-tab="medals">Medallas</button><button data-tab="settings">Ajustes</button></nav>
  <div id="drawerBody"></div>
</aside>
<script nonce="${nonce}" src="${js}"></script></body></html>`
    view.webview.onDidReceiveMessage(msg => this.onMessage(msg))
    view.onDidChangeVisibility(() => view.visible && this.push(true))
  }

  push(force = false) {
    // hidden panel: skip the render, becoming visible forces a fresh one
    if (!this.view || (!force && !this.view.visible)) return
    const now = Date.now()
    const roster = this.allSkills().filter(s => !HIDDEN.has(s))
    const watchAll = setting('watchAllSessions', true)
    const folders = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath)
    const agents = this.tracker.agents(watchAll ? undefined : folders)
    const crew = this.tracker.crew
    const night = darkness(new Date(now), clockMode()) >= 0.5
    const cats = catList()
    const services = monitor?.status ?? {}
    const skins = { skillSkin: skin('skillSkin'), agentSkin: skin('agentSkin'), season: setting<string>('season', 'auto') }
    const signature = JSON.stringify([roster, crew, agents, LABS.map(l => [l.name, l.accent, l.width, l.row, l.theme, l.services]), setting('showPet', true), cats, night, WORLD, services, skins])
    if (!force && signature === this.lastSignature) return
    this.lastSignature = signature
    const { svg, asleep, working, strolling, sessions, geo } = renderScene({ roster, crew, agents, now, pet: setting('showPet', true), cats, night, services, ...skins })
    void this.view.webview.postMessage({ type: 'scene', svg, geo, clockMode: clockMode(), stats: { asleep, working, strolling, sessions } })
  }

  private allSkills() {
    return [...this.roster, ...this.tracker.extraSkills.filter(s => !this.roster.includes(s))]
  }

  pushModel() {
    if (!this.view) return
    const model = {
      labs: LABS.map(l => ({ id: l.id, name: l.name, accent: l.accent, match: l.match?.source ?? '', width: l.width, row: l.row, theme: l.theme, services: l.services, custom: l.custom, removable: l.id !== FALLBACK_LAB })),
      services: monitor?.status ?? {},
      world: WORLD,
      worlds: WORLDS,
      palette: PALETTE_NAME,
      palettes: PALETTES,
      skins: SKINS,
      projectsRoot: PROJECTS_ROOT,
      medals: this.ctx.globalState.get<Record<string, number>>(MEDALS_KEY, {}),
      needsSetup: freshInstall && !this.ctx.globalState.get(SETUP_KEY),
      skills: this.allSkills().map(name => ({
        name,
        color: colorOf(name),
        fixed: SKILL_LAB[name] ?? null,
        hidden: HIDDEN.has(name),
        uses: this.tracker.uses[name] ?? 0,
        lab: this.tracker.crew[name]?.lab ?? null,
      })),
      settings: {
        returnDelay: RETURN_DELAY_MS / 1000,
        sound: setting('sound', true),
        showPet: setting('showPet', true),
        cats: catList(),
        coats: COATS,
        clockMode: clockMode(),
        watchAllSessions: setting('watchAllSessions', true),
        skipPermissions: setting('skipPermissions', false),
        skillSkin: skin('skillSkin'),
        agentSkin: skin('agentSkin'),
        season: setting<string>('season', 'auto'),
      },
    }
    void this.view.webview.postMessage({ type: 'model', model })
  }

  private async trash(kind: string, id: string) {
    if (kind === 'skill') return this.tracker.stopSkill(id)
    if (kind !== 'session') return
    const cwd = this.tracker.sessionCwd(id) ?? ''
    const term = launched.find(t => t.exitStatus === undefined && sameDir(launchedCwd.get(t), cwd))
    if (term) {
      const ok = await vscode.window.showWarningMessage(`¿Parar la sesión de Claude en ${path.basename(cwd)}? Se cerrará su terminal.`, { modal: true }, 'Parar')
      if (ok !== 'Parar') return
      term.dispose()
    } else {
      void vscode.window.showInformationMessage('Esa sesión no la lanzó Skill Lab (chat de VS Code u otra terminal), así que no puedo pararla: la saco del laboratorio hasta que vuelva a trabajar.')
    }
    this.tracker.hideSession(id, Date.now())
  }

  // One puesto per subfolder of the projects folder the person picked; folders a puesto already covers start unticked.
  private async detectLabs() {
    if (!PROJECTS_ROOT || !fs.existsSync(PROJECTS_ROOT)) {
      void vscode.window.showInformationMessage('Elige primero tu carpeta de proyectos.')
      return
    }
    let dirs: string[] = []
    try {
      dirs = fs
        .readdirSync(PROJECTS_ROOT, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
        .map(e => path.join(PROJECTS_ROOT, e.name))
    } catch (err) {
      throw new Error(`No puedo leer ${PROJECTS_ROOT}: ${err instanceof Error ? err.message : err}`)
    }
    if (!dirs.length) {
      void vscode.window.showInformationMessage(`${PROJECTS_ROOT} no tiene subcarpetas.`)
      return
    }
    const covered = (dir: string) => LABS.find(l => l.match?.test(path.join(dir, 'x')))
    type Item = vscode.QuickPickItem & { dir: string }
    const items: Item[] = dirs.map(dir => {
      const by = covered(dir)
      return { label: path.basename(dir), description: by ? `ya va a ${by.name}` : dir, dir, picked: !by }
    })
    const picks = await vscode.window.showQuickPick(items, { canPickMany: true, title: `Puestos desde ${PROJECTS_ROOT}`, placeHolder: 'Marca las carpetas que quieres como puesto' })
    if (!picks?.length) return
    writeConfig(cfg => {
      for (const pick of picks) addCustomLab(cfg, path.basename(pick.dir), folderRule(pick.dir))
    })
    void vscode.window.showInformationMessage(`${picks.length} puesto${picks.length === 1 ? '' : 's'} creado${picks.length === 1 ? '' : 's'}. Ajusta tema, fila y ancho en Layout → Labs.`)
    this.refreshAll()
  }

  private refreshAll() {
    rescanSkills?.()
    this.pushModel()
    this.push(true)
  }

  sound(kind: 'done' | 'ask') {
    if (setting('sound', true)) void this.view?.webview.postMessage({ type: 'sound', kind })
  }

  private async onMessage(msg: any) {
    try {
      await this.handle(msg)
    } catch (err) {
      console.error('[skill-lab]', err)
      void vscode.window.showErrorMessage(`Skill Lab: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async handle(msg: any) {
    switch (msg?.type) {
      case 'ready':
        return this.refreshAll()
      case 'newAgent':
        return newAgent()
      case 'model':
        return this.pushModel()
      case 'trash':
        await this.trash(String(msg.kind), String(msg.id))
        return this.refreshAll()
      case 'openJson':
        return openLayout()
      case 'vscodeSettings':
        return vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${this.ctx.extension.id}`)
      case 'setLab':
        writeConfig(cfg => {
          cfg.labs ??= {}
          const entry = (cfg.labs[msg.id] ??= {})
          if (typeof msg.name === 'string' && msg.name.trim()) entry.name = msg.name.trim()
          if (typeof msg.accent === 'string' && /^#[0-9a-f]{6}$/i.test(msg.accent)) entry.accent = msg.accent
          if (typeof msg.match === 'string') entry.match = msg.match
          if (msg.width !== undefined) entry.width = Number(msg.width)
          if (msg.row === 'top' || msg.row === 'bottom') entry.row = msg.row
          if (typeof msg.theme === 'string') entry.theme = msg.theme
        })
        return this.refreshAll()
      case 'setupPickRoot': {
        const chosen = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Usar como carpeta de proyectos' })
        const root = chosen?.[0]?.fsPath
        if (!root) return
        const folders = fs
          .readdirSync(root, { withFileTypes: true })
          .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
          .map(e => ({ name: e.name, path: path.join(root, e.name), covered: !!LABS.find(l => l.custom && l.match?.test(path.join(root, e.name, 'x'))) }))
        void this.view?.webview.postMessage({ type: 'setupFolders', root, folders })
        return
      }
      case 'setupCreateLabs': {
        const folders: { name: string; path: string; theme?: string }[] = Array.isArray(msg.folders) ? msg.folders : []
        writeConfig(cfg => {
          if (typeof msg.root === 'string' && msg.root) cfg.projectsRoot = msg.root
          for (const f of folders) {
            if (!f?.path) continue
            addCustomLab(cfg, String(f.name || path.basename(f.path)).slice(0, 40), folderRule(String(f.path)))
            const id = Object.keys(cfg.labs ?? {}).pop()!
            if (THEMES.includes(f.theme as Theme)) cfg.labs![id]!.theme = f.theme as Theme
          }
        })
        return this.refreshAll()
      }
      case 'setupSkills': {
        const map: Record<string, string> = msg.map && typeof msg.map === 'object' ? msg.map : {}
        writeConfig(cfg => {
          cfg.skillLabs ??= {}
          const hidden = new Set(cfg.hidden ?? [])
          for (const [skill, lab] of Object.entries(map)) {
            hidden.delete(skill)
            if (lab === 'hidden') hidden.add(skill)
            else if (lab === 'auto') delete cfg.skillLabs[skill]
            else cfg.skillLabs[skill] = String(lab)
          }
          cfg.hidden = [...hidden]
        })
        return this.refreshAll()
      }
      case 'setupDone':
        await this.ctx.globalState.update(SETUP_KEY, true)
        return this.pushModel()
      case 'medal': {
        const got = this.ctx.globalState.get<Record<string, number>>(MEDALS_KEY, {})
        if (typeof msg.id === 'string' && !got[msg.id]) await this.ctx.globalState.update(MEDALS_KEY, { ...got, [msg.id]: Date.now() })
        return
      }
      case 'pickRoot': {
        const chosen = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Usar como carpeta de proyectos', defaultUri: PROJECTS_ROOT ? vscode.Uri.file(PROJECTS_ROOT) : undefined })
        const root = chosen?.[0]?.fsPath
        if (!root) return
        writeConfig(cfg => {
          cfg.projectsRoot = root
        })
        this.refreshAll()
        return this.detectLabs()
      }
      case 'detectLabs':
        return this.detectLabs()
      case 'pickLabFolder': {
        const lab = LABS.find(l => l.id === msg.id)
        if (!lab) return
        const chosen = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: `Carpeta de ${lab.name}`, defaultUri: PROJECTS_ROOT ? vscode.Uri.file(PROJECTS_ROOT) : undefined })
        const folder = chosen?.[0]?.fsPath
        if (!folder) return
        writeConfig(cfg => {
          cfg.labs ??= {}
          ;(cfg.labs[lab.id] ??= {}).match = folderRule(folder)
        })
        return this.refreshAll()
      }
      case 'addLab': {
        const name = await vscode.window.showInputBox({ title: 'Nuevo puesto', prompt: 'Nombre del puesto (luego le eliges su carpeta con 📁)', validateInput: v => (v.trim() ? undefined : 'Ponle un nombre') })
        if (!name) return
        writeConfig(cfg => addCustomLab(cfg, name.trim()))
        return this.refreshAll()
      }
      case 'removeLab': {
        const lab = LABS.find(l => l.id === msg.id)
        if (!lab || lab.id === FALLBACK_LAB) return
        const ok = await vscode.window.showWarningMessage(`¿Quitar el puesto ${lab.name}? Sus skills y sesiones pasarán a General.`, { modal: true }, 'Quitar')
        if (ok !== 'Quitar') return
        writeConfig(cfg => {
          if (lab.custom) delete cfg.labs?.[lab.id]
          else cfg.removed = [...new Set([...(cfg.removed ?? []), lab.id])]
          for (const [skill, to] of Object.entries(cfg.skillLabs ?? {})) if (to === lab.id) delete cfg.skillLabs![skill]
        })
        return this.refreshAll()
      }
      case 'setSkill':
        writeConfig(cfg => {
          const skill = String(msg.skill)
          cfg.skillLabs ??= {}
          cfg.hidden = (cfg.hidden ?? []).filter(s => s !== skill)
          if (msg.lab === 'hidden') cfg.hidden.push(skill)
          else if (msg.lab === 'auto') delete cfg.skillLabs[skill]
          else cfg.skillLabs[skill] = String(msg.lab)
        })
        return this.refreshAll()
      case 'setDelay':
        writeConfig(cfg => {
          cfg.returnDelaySeconds = Math.max(3, Math.min(600, Number(msg.seconds) || 20))
        })
        return this.pushModel()
      case 'setSetting':
        if (['sound', 'showPet', 'watchAllSessions', 'skipPermissions'].includes(msg.key)) {
          await setPref(msg.key, Boolean(msg.value))
        } else if (msg.key === 'cats' && Array.isArray(msg.value)) {
          const cats: Cat[] = msg.value.slice(0, 8).map((c: any, i: number) => ({
            name: String(c?.name ?? '').trim().slice(0, 24) || `Gato ${i + 1}`,
            coat: COATS.includes(c?.coat) ? c.coat : 'gris',
          }))
          await setPref('cats', cats)
        } else if (msg.key === 'clockMode' && ['auto', 'day', 'night'].includes(msg.value)) {
          await setPref('clockMode', msg.value)
        }
        return this.refreshAll()
      case 'exportLayout': {
        const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(path.join(HOME, 'skill-lab-layout.json')), filters: { JSON: ['json'] } })
        if (target) fs.writeFileSync(target.fsPath, JSON.stringify(fs.existsSync(CONFIG_FILE) ? readConfig() : defaultConfig(), null, 2))
        return
      }
      case 'importLayout': {
        const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { JSON: ['json'] } })
        if (!picked?.[0]) return
        try {
          const cfg = JSON.parse(fs.readFileSync(picked[0].fsPath, 'utf8')) as LabConfig
          writeConfig(current => Object.assign(current, cfg))
          void vscode.window.showInformationMessage('Layout importado.')
        } catch {
          void vscode.window.showErrorMessage('Ese fichero no es un layout válido.')
        }
        return this.refreshAll()
      }
      case 'resetLayout': {
        const ok = await vscode.window.showWarningMessage('¿Restablecer labs, colores y asignaciones de skills?', { modal: true }, 'Restablecer')
        if (ok) writeConfig(cfg => Object.assign(cfg, defaultConfig()))
        return this.refreshAll()
      }
      case 'session': {
        const cwd = this.tracker.sessionCwd(String(msg.session))
        const pick = await vscode.window.showQuickPick(['Abrir transcripción', 'Lanzar otro Claude en esta carpeta'], { title: `Sesión en ${cwd ?? '?'}` })
        if (pick === 'Abrir transcripción') {
          const file = findTranscript(String(msg.session))
          if (file) await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: true })
        } else if (pick && cwd) launchClaude(cwd)
        return
      }
    }
  }
}

function findTranscript(session: string): string | undefined {
  try {
    for (const dir of fs.readdirSync(PROJECTS_DIR)) {
      const file = path.join(PROJECTS_DIR, dir, `${session}.jsonl`)
      if (fs.existsSync(file)) return file
    }
  } catch {
    // no projects folder yet
  }
  return undefined
}

// terminals opened by + Agent, so the bin can stop the session they run
const launched: vscode.Terminal[] = []
const launchedCwd = new WeakMap<vscode.Terminal, string>()
const sameDir = (a: string | undefined, b: string) => !!a && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()

// a new puesto goes to the shorter row so the building stays balanced
function addCustomLab(cfg: LabConfig, name: string, match = '') {
  cfg.labs ??= {}
  const base = 'p-' + (name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'puesto')
  let id = base
  for (let n = 2; cfg.labs[id] || LABS.some(l => l.id === id); n++) id = `${base}-${n}`
  const width = (row: 'top' | 'bottom') => LABS.filter(l => l.row === row).reduce((sum, l) => sum + l.width, row === 'top' ? 12 : 0)
  const pending = Object.values(cfg.labs).filter(o => o.row)
  const top = width('top') + pending.filter(o => o.row === 'top').length * 8
  const bottom = width('bottom') + pending.filter(o => o.row === 'bottom').length * 8
  cfg.labs[id] = { name, match, width: 8, row: top <= bottom ? 'top' : 'bottom', theme: 'lab' }
}

function launchClaude(cwd: string) {
  const args = setting('skipPermissions', false) ? ['--dangerously-skip-permissions'] : []
  const term = vscode.window.createTerminal({ name: `Claude · ${path.basename(cwd)}`, cwd, shellPath: claudeExecutable(), shellArgs: args })
  launched.push(term)
  launchedCwd.set(term, cwd)
  term.show()
}

async function newAgent() {
  type Item = vscode.QuickPickItem & { dir?: string; browse?: boolean }
  const saved = setting<{ name: string; path: string }[]>('directories', [])
  const items: Item[] = [
    ...(vscode.workspace.workspaceFolders ?? []).map(f => ({ label: f.name, description: f.uri.fsPath, dir: f.uri.fsPath })),
    ...saved.map(d => ({ label: d.name, description: d.path, dir: d.path })),
    { label: '$(folder-opened) Elegir carpeta…', browse: true },
  ]
  const pick = await vscode.window.showQuickPick(items, { title: 'Lanzar Claude Code en…' })
  if (!pick) return
  let dir = pick.dir
  if (pick.browse) {
    const chosen = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Lanzar Claude aquí' })
    dir = chosen?.[0]?.fsPath
    if (!dir) return
    if (!saved.some(d => d.path === dir)) {
      await vscode.workspace.getConfiguration('skillLab').update('directories', [...saved, { name: path.basename(dir), path: dir }], vscode.ConfigurationTarget.Global)
    }
  }
  if (dir) launchClaude(dir)
}

async function openLayout() {
  if (!fs.existsSync(CONFIG_FILE)) writeConfig(() => undefined)
  await vscode.window.showTextDocument(vscode.Uri.file(CONFIG_FILE))
}

export function activate(ctx: vscode.ExtensionContext) {
  prefs = ctx.globalState
  freshInstall = !fs.existsSync(CONFIG_FILE)
  applyConfig(readConfig())
  const uses = ctx.globalState.get<Record<string, number>>(USES_KEY, {})
  let view: LabView | undefined
  const tracker = new Tracker(PROJECTS_DIR, uses, {
    sound: kind => view?.sound(kind),
    knownSkill: name => roster.includes(name),
  })
  let roster = installedSkills(projectRepos())
  view = new LabView(ctx, tracker)
  monitor = new ServiceMonitor(() => view?.push(true))
  monitor.start()
  ctx.subscriptions.push({ dispose: () => monitor?.dispose() })
  view.setRoster(roster)
  rescanSkills = () => {
    const next = installedSkills([...projectRepos(), ...tracker.sessionCwds()])
    if (next.join('|') === roster.join('|')) return
    roster = next
    view?.setRoster(roster)
    view?.push(true)
  }
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider('skillLab.view', view, { webviewOptions: { retainContextWhenHidden: true } }))
  ctx.subscriptions.push(
    vscode.window.onDidCloseTerminal(t => {
      const i = launched.indexOf(t)
      if (i >= 0) launched.splice(i, 1)
    }),
  )
  ctx.subscriptions.push(vscode.commands.registerCommand('skillLab.refresh', () => view?.push(true)))
  ctx.subscriptions.push(vscode.commands.registerCommand('skillLab.newAgent', newAgent))
  ctx.subscriptions.push(vscode.commands.registerCommand('skillLab.layout', openLayout))

  // seed the counters once from history (1.5 GB of transcripts), late enough not to slow VS Code's start
  if (!ctx.globalState.get(SEEDED_KEY)) {
    const seed = setTimeout(() => {
      void countPastUses(PROJECTS_DIR, past => {
        for (const [k, v] of Object.entries(past)) uses[k] = Math.max(uses[k] ?? 0, v)
        void ctx.globalState.update(USES_KEY, uses)
        void ctx.globalState.update(SEEDED_KEY, true)
        for (const [k, c] of Object.entries(tracker.crew)) tracker.crew[k] = { ...c, uses: uses[k] ?? c.uses }
        view?.push(true)
      })
    }, 20_000)
    ctx.subscriptions.push({ dispose: () => clearTimeout(seed) })
  }

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50)
  status.command = 'skillLab.view.focus'
  ctx.subscriptions.push(status)
  let lastStatus = ''
  const updateStatus = () => {
    const working = Object.entries(tracker.crew).filter(([, c]) => c.lab)
    const sessions = tracker.agents().length
    const text = `$(beaker) ${working.length}${sessions ? `  $(hubot) ${sessions}` : ''}`
    const tip = working.length
      ? working.map(([s, c]) => `${s} → ${LABS.find(l => l.id === c.lab)?.name ?? c.lab}`).join('\n')
      : 'Todas las skills durmiendo'
    if (text + tip === lastStatus) return
    lastStatus = text + tip
    status.text = text
    status.tooltip = `Skill Lab\n${tip}`
    status.show()
  }

  let tickCount = 0
  const saveUses = () => ctx.globalState.update(USES_KEY, uses)
  const timer = setInterval(() => {
    const now = Date.now()
    try {
      tracker.poll(now)
      tracker.tick(now)
      // new repos and new skills show up within 15 s even with nothing else changing
      if (++tickCount % 15 === 0) rescanSkills?.()
      if (tickCount % 60 === 0) void saveUses()
      updateStatus()
      view?.push()
    } catch (err) {
      console.error('[skill-lab]', err)
    }
  }, 1000)
  ctx.subscriptions.push({ dispose: () => clearInterval(timer) })
  ctx.subscriptions.push({ dispose: () => tracker.dispose() })
  onDeactivate = saveUses

  fs.mkdirSync(LAB_DIR, { recursive: true })
  const watcher = fs.watch(LAB_DIR, (_e, file) => {
    if (file !== 'config.json') return
    applyConfig(readConfig())
    tracker.relocate(Date.now())
    rescanSkills?.()
    view?.push(true)
  })
  ctx.subscriptions.push({ dispose: () => watcher.close() })
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => e.affectsConfiguration('skillLab') && view?.push(true)))
}

let onDeactivate: (() => Thenable<void>) | undefined

export function deactivate() {
  return onDeactivate?.()
}
