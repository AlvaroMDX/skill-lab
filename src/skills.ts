import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as zlib from 'zlib'
import * as vscode from 'vscode'

// The skill manager: every SKILL.md the person has (user level and per repo), editable, movable and exportable.

const HOME = os.homedir()
const CLAUDE_DIR = path.join(HOME, '.claude')
export const USER_SKILLS = path.join(CLAUDE_DIR, 'skills')
// skills the account syncs: they come back on the next sync, so they are read-only here and left out of exports
const SYNCED_DIR = path.join(USER_SKILLS, 'synced')
const SKIP = new Set(['node_modules', '.git', '__pycache__', '.venv', '.DS_Store'])
const EXTRA_REPOS_KEY = 'skillManager.extraRepos'
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

type PlaceKind = 'user' | 'repo' | 'synced'
type Place = { id: string; kind: PlaceKind; label: string; dir: string; root: string; extra?: boolean }
type Skill = { id: string; folder: string; name: string; description: string; place: string; files: number; bytes: number; mtime: number; readonly: boolean }
type Entry = { key: string; raw: string[] }

const same = (a: string, b: string) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
const inside = (child: string, parent: string) => {
  const rel = path.relative(parent, child)
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function walk(dir: string, base = dir, out: { rel: string; abs: string; size: number }[] = []) {
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) walk(abs, base, out)
    else if (e.isFile()) out.push({ rel: path.relative(base, abs).split(path.sep).join('/'), abs, size: fs.statSync(abs).size })
  }
  return out
}

// ---------- SKILL.md: frontmatter kept line by line so untouched keys are written back exactly as they were ----------

function splitDoc(text: string) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  if (lines[0] !== '---') return { eol, entries: [] as Entry[], body: lines.join('\n'), hasFm: false }
  const end = lines.findIndex((l, i) => i > 0 && (l === '---' || l === '...'))
  if (end < 0) return { eol, entries: [] as Entry[], body: lines.join('\n'), hasFm: false }
  return { eol, entries: parseEntries(lines.slice(1, end)), body: lines.slice(end + 1).join('\n'), hasFm: true }
}

function parseEntries(lines: string[]): Entry[] {
  const entries: Entry[] = []
  for (const line of lines) {
    const key = /^([A-Za-z0-9_-]+)\s*:/.exec(line)?.[1]
    if (key) entries.push({ key, raw: [line] })
    else if (entries.length) entries[entries.length - 1].raw.push(line)
    else if (line.trim()) entries.push({ key: '', raw: [line] })
  }
  return entries
}

// the value of one key, whatever YAML style it was written in (plain, quoted, | or >)
function decode(e: Entry): string {
  const first = e.raw[0].slice(e.raw[0].indexOf(':') + 1).trim()
  const rest = e.raw.slice(1)
  const block = /^([|>])([+-]?)\d*$/.exec(first)
  if (block) {
    const indent = Math.min(...rest.filter(l => l.trim()).map(l => l.length - l.trimStart().length), 99)
    const body = rest.map(l => l.slice(indent))
    while (body.length && !body[body.length - 1].trim()) body.pop()
    if (block[1] === '|') return body.join('\n')
    return body.reduce((acc, l) => (!l.trim() ? acc + '\n' : acc && !acc.endsWith('\n') ? `${acc} ${l}` : acc + l), '')
  }
  const joined = [first, ...rest.map(l => l.trim())].filter(Boolean).join(' ')
  if (joined.startsWith('"')) {
    try {
      return JSON.parse(joined)
    } catch {
      return joined.slice(1, -1)
    }
  }
  if (joined.startsWith("'")) return joined.slice(1, -1).replace(/''/g, "'")
  return joined
}

// new text for a key, in the style it already had when possible
function encode(key: string, value: string, before?: Entry): string[] {
  const style = before ? /^([|>])/.exec(before.raw[0].slice(before.raw[0].indexOf(':') + 1).trim())?.[1] : undefined
  const plain = !value.includes('\n') && !/^[\s>|'"&*!%@`{[\-?,:#]/.test(value) && !/: |\s#/.test(value) && !/\s$/.test(value)
  if (!style && plain && value.length < 200) return [`${key}: ${value}`]
  if (style === '|' || value.includes('\n')) {
    if (style === '>') return [`${key}: >-`, ...fold(value)]
    return [`${key}: |-`, ...value.split('\n').map(l => (l ? `  ${l}` : ''))]
  }
  if (style === '>' || value.length >= 200) return [`${key}: >-`, ...fold(value)]
  return [`${key}: ${JSON.stringify(value)}`]
}

function fold(value: string) {
  const out: string[] = []
  value.split('\n').forEach((para, i) => {
    if (i) out.push('')
    let line = ''
    for (const word of para.split(' ')) {
      if (line && line.length + word.length + 1 > 78) {
        out.push(`  ${line}`)
        line = word
      } else line = line ? `${line} ${word}` : word
    }
    out.push(`  ${line}`)
  })
  return out
}

function readSkill(dir: string) {
  const file = path.join(dir, 'SKILL.md')
  const text = fs.readFileSync(file, 'utf8')
  const doc = splitDoc(text)
  const get = (k: string) => doc.entries.find(e => e.key === k)
  return { ...doc, name: get('name') ? decode(get('name')!) : '', description: get('description') ? decode(get('description')!) : '', mtime: fs.statSync(file).mtimeMs }
}

function writeSkill(dir: string, data: { name: string; description: string; extra: string; body: string; lead?: number }) {
  const file = path.join(dir, 'SKILL.md')
  const old = fs.existsSync(file) ? splitDoc(fs.readFileSync(file, 'utf8')) : { eol: os.EOL, entries: [] as Entry[], body: '', hasFm: false }
  const extra = parseEntries(data.extra.split(/\r?\n/))
  const clash = extra.find(e => e.key === 'name' || e.key === 'description')
  if (clash) throw new Error(`«${clash.key}» va en su propio campo, no en «Otros campos».`)
  const dup = extra.find((e, i) => e.key && extra.findIndex(x => x.key === e.key) !== i)
  if (dup) throw new Error(`El campo «${dup.key}» está repetido en «Otros campos».`)
  const prev = (k: string) => old.entries.find(e => e.key === k)
  const keep = (k: string, v: string) => (prev(k) && decode(prev(k)!) === v ? prev(k)!.raw : encode(k, v, prev(k)))
  const oldExtra = old.entries.filter(e => e.key !== 'name' && e.key !== 'description')
  // untouched extra fields keep their place among name and description
  const fm =
    old.hasFm && extra.flatMap(e => e.raw).join('\n') === oldExtra.flatMap(e => e.raw).join('\n')
      ? old.entries.flatMap(e => (e.key === 'name' ? keep('name', data.name) : e.key === 'description' ? keep('description', data.description) : e.raw)).concat(prev('name') ? [] : keep('name', data.name), prev('description') ? [] : keep('description', data.description))
      : [...keep('name', data.name), ...keep('description', data.description), ...extra.flatMap(e => e.raw)]
  const body = '\n'.repeat(data.lead ?? 1) + data.body.replace(/^\n+/, '')
  let text = ['---', ...fm, '---'].join('\n') + '\n' + body
  if (!text.endsWith('\n')) text += '\n'
  // nothing changed: leave the file alone, mixed line endings included
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') === text) return
  fs.writeFileSync(file, text.split('\n').join(old.eol))
}

// ---------- zip, with Node's own deflate: no dependencies ----------

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const dos = (d: Date) => [((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff]

function zip(files: { name: string; data: Buffer; mtime?: Date }[]) {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8')
    const packed = zlib.deflateRawSync(f.data)
    const stored = packed.length >= f.data.length
    const data = stored ? f.data : packed
    const [time, date] = dos(f.mtime ?? new Date())
    const crc = crc32(f.data)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(0x0800, 6)
    head.writeUInt16LE(stored ? 0 : 8, 8)
    head.writeUInt16LE(time, 10)
    head.writeUInt16LE(date, 12)
    head.writeUInt32LE(crc, 14)
    head.writeUInt32LE(data.length, 18)
    head.writeUInt32LE(f.data.length, 22)
    head.writeUInt16LE(name.length, 26)
    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4)
    dir.writeUInt16LE(20, 6)
    dir.writeUInt16LE(0x0800, 8)
    dir.writeUInt16LE(stored ? 0 : 8, 10)
    dir.writeUInt16LE(time, 12)
    dir.writeUInt16LE(date, 14)
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(data.length, 20)
    dir.writeUInt32LE(f.data.length, 24)
    dir.writeUInt16LE(name.length, 28)
    dir.writeUInt32LE(offset, 42)
    parts.push(head, name, data)
    central.push(dir, name)
    offset += head.length + name.length + data.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cd, end])
}

function unzip(buf: Buffer) {
  let eocd = buf.length - 22
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('No es un fichero zip.')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out: { name: string; data: Buffer }[] = []
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('El zip está dañado.')
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const nlen = buf.readUInt16LE(p + 28)
    const xlen = buf.readUInt16LE(p + 30)
    const clen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nlen).replace(/\\/g, '/')
    p += 46 + nlen + xlen + clen
    if (name.endsWith('/')) continue
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(start, start + size)
    if (method !== 0 && method !== 8) throw new Error(`${name}: compresión no soportada.`)
    out.push({ name, data: method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw) })
  }
  return out
}

// ---------- the manager ----------

export class SkillManager {
  private panel?: vscode.WebviewPanel
  private places: Place[] = []
  private skills: Skill[] = []
  private watcher?: fs.FSWatcher
  private pending?: ReturnType<typeof setTimeout>

  constructor(
    private ctx: vscode.ExtensionContext,
    private candidates: () => string[],
    private changed: () => void,
  ) {}

  open() {
    if (this.panel) return this.panel.reveal()
    const media = vscode.Uri.joinPath(this.ctx.extensionUri, 'media')
    const panel = vscode.window.createWebviewPanel('skillLab.skills', 'Gestor de skills', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [media] })
    this.panel = panel
    panel.iconPath = vscode.Uri.joinPath(media, 'icon.png')
    const nonce = Math.random().toString(36).slice(2)
    const js = panel.webview.asWebviewUri(vscode.Uri.joinPath(media, 'skills.js'))
    const css = panel.webview.asWebviewUri(vscode.Uri.joinPath(media, 'skills.css'))
    panel.webview.html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; img-src ${panel.webview.cspSource} data:; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"></head><body><div id="app"></div><script nonce="${nonce}" src="${js}"></script></body></html>`
    panel.webview.onDidReceiveMessage(msg => this.onMessage(msg))
    panel.onDidChangeViewState(() => panel.visible && this.pushList())
    panel.onDidDispose(() => {
      this.panel = undefined
      this.watcher?.close()
      this.watcher = undefined
    })
    try {
      fs.mkdirSync(USER_SKILLS, { recursive: true })
      this.watcher = fs.watch(USER_SKILLS, { recursive: true }, () => {
        clearTimeout(this.pending)
        this.pending = setTimeout(() => this.pushList(), 400)
      })
    } catch {
      // no recursive watch on this platform: the list refreshes on focus and after each action
    }
  }

  dispose() {
    this.panel?.dispose()
  }

  private post(msg: unknown) {
    void this.panel?.webview.postMessage(msg)
  }

  // the repo a folder belongs to: the nearest parent with .git, or the folder itself if it already has skills
  private repoRoot(dir: string): string | undefined {
    let d = path.resolve(dir)
    for (let i = 0; i < 12; i++) {
      if (same(d, HOME) || same(d, CLAUDE_DIR) || inside(d, path.join(CLAUDE_DIR, 'projects'))) return undefined
      if (fs.existsSync(path.join(d, '.git'))) return d
      const up = path.dirname(d)
      if (up === d) break
      d = up
    }
    return fs.existsSync(path.join(dir, '.claude', 'skills')) ? path.resolve(dir) : undefined
  }

  private scan() {
    const extra = this.ctx.globalState.get<string[]>(EXTRA_REPOS_KEY, [])
    const roots: string[] = []
    for (const c of [...this.candidates(), ...(vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath), ...extra]) {
      const root = c && fs.existsSync(c) ? this.repoRoot(c) : undefined
      if (root && !roots.some(r => same(r, root))) roots.push(root)
    }
    const base = roots.map(r => path.basename(r))
    const places: Place[] = [{ id: 'user', kind: 'user', label: 'Usuario', dir: USER_SKILLS, root: CLAUDE_DIR }]
    roots.forEach((root, i) => {
      const twin = base.filter(b => b.toLowerCase() === base[i].toLowerCase()).length > 1
      places.push({ id: `repo:${root}`, kind: 'repo', label: twin ? `${path.basename(path.dirname(root))}/${base[i]}` : base[i], dir: path.join(root, '.claude', 'skills'), root, extra: extra.some(x => same(x, root)) })
    })
    if (fs.existsSync(SYNCED_DIR)) places.push({ id: 'synced', kind: 'synced', label: 'Sincronizadas con tu cuenta', dir: SYNCED_DIR, root: SYNCED_DIR })
    const skills: Skill[] = []
    const add = (dir: string, place: Place) => {
      try {
        const s = readSkill(dir)
        const files = walk(dir)
        skills.push({ id: dir, folder: path.basename(dir), name: s.name || path.basename(dir), description: s.description, place: place.id, files: files.length, bytes: files.reduce((n, f) => n + f.size, 0), mtime: s.mtime, readonly: place.kind === 'synced' })
      } catch {
        // unreadable SKILL.md: left out
      }
    }
    for (const place of places) {
      const dirs = place.kind === 'synced' ? fs.readdirSync(SYNCED_DIR).flatMap(g => this.subdirs(path.join(SYNCED_DIR, g))) : this.subdirs(place.dir)
      for (const d of dirs) if (fs.existsSync(path.join(d, 'SKILL.md')) && !same(d, SYNCED_DIR)) add(d, place)
    }
    this.places = places
    this.skills = skills.sort((a, b) => a.name.localeCompare(b.name))
  }

  private subdirs(dir: string) {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => path.join(dir, e.name))
    } catch {
      return []
    }
  }

  private pushList() {
    if (!this.panel) return
    this.scan()
    this.post({ type: 'list', places: this.places.map(p => ({ id: p.id, kind: p.kind, label: p.label, root: p.root, extra: !!p.extra })), skills: this.skills, home: HOME })
  }

  private skill(id: string) {
    const s = this.skills.find(x => same(x.id, String(id)))
    if (!s) throw new Error('Esa skill ya no está ahí: actualiza la lista.')
    return s
  }

  private place(id: string) {
    const p = this.places.find(x => x.id === id)
    if (!p) throw new Error('Ubicación desconocida.')
    return p
  }

  private pushSkill(id: string) {
    const s = this.skill(id)
    const doc = readSkill(s.id)
    const extra = doc.entries.filter(e => e.key !== 'name' && e.key !== 'description').flatMap(e => e.raw).join('\n')
    const files = walk(s.id).map(f => ({ rel: f.rel, size: f.size }))
    const twins = this.skills.filter(x => x.name === s.name && !same(x.id, s.id)).map(x => x.place)
    this.post({ type: 'skill', skill: { ...s, description: doc.description, name: doc.name, folderName: s.folder, extra, body: doc.body.replace(/^\n+/, ''), lead: /^\n*/.exec(doc.body)![0].length, files, twins, path: s.id, mtime: doc.mtime } })
  }

  private async onMessage(msg: any) {
    try {
      await this.handle(msg)
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      this.post({ type: 'error', message: text })
      void vscode.window.showErrorMessage(`Gestor de skills: ${text}`)
    }
  }

  private async handle(msg: any) {
    switch (msg?.type) {
      case 'ready':
      case 'refresh':
        return this.pushList()
      case 'open':
        return this.pushSkill(msg.id)
      case 'save':
        return this.save(msg)
      case 'create':
        return this.create(String(msg.place), String(msg.name ?? '').trim())
      case 'move':
        return this.move(String(msg.id), String(msg.to), !!msg.copy)
      case 'delete':
        return this.remove(String(msg.id))
      case 'openFile':
        return vscode.commands.executeCommand('vscode.open', vscode.Uri.file(this.fileIn(msg.id, msg.rel)))
      case 'addFile': {
        const file = this.fileIn(msg.id, msg.rel)
        if (fs.existsSync(file)) throw new Error(`Ya existe ${msg.rel}.`)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, '')
        this.pushList()
        this.pushSkill(msg.id)
        return vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file))
      }
      case 'deleteFile': {
        const file = this.fileIn(msg.id, msg.rel)
        if (path.basename(file) === 'SKILL.md' && same(path.dirname(file), this.skill(msg.id).id)) throw new Error('SKILL.md no se puede borrar: borra la skill entera.')
        const ok = await vscode.window.showWarningMessage(`¿Mandar ${msg.rel} a la papelera?`, { modal: true }, 'Borrar')
        if (ok !== 'Borrar') return
        await vscode.workspace.fs.delete(vscode.Uri.file(file), { useTrash: true })
        this.pushList()
        return this.pushSkill(msg.id)
      }
      case 'reveal':
        return vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.join(this.skill(msg.id).id, 'SKILL.md')))
      case 'addRepo': {
        const chosen = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Añadir este repo' })
        const dir = chosen?.[0]?.fsPath
        if (!dir) return
        const extra = this.ctx.globalState.get<string[]>(EXTRA_REPOS_KEY, [])
        if (!extra.some(x => same(x, dir))) await this.ctx.globalState.update(EXTRA_REPOS_KEY, [...extra, dir])
        fs.mkdirSync(path.join(dir, '.claude', 'skills'), { recursive: true })
        this.pushList()
        return this.post({ type: 'select', place: `repo:${this.repoRoot(dir) ?? dir}` })
      }
      case 'forgetRepo': {
        const p = this.place(String(msg.place))
        await this.ctx.globalState.update(EXTRA_REPOS_KEY, this.ctx.globalState.get<string[]>(EXTRA_REPOS_KEY, []).filter(x => !same(x, p.root)))
        return this.pushList()
      }
      case 'export':
        return this.exportZip(String(msg.scope), msg.id)
      case 'import':
        return this.importZip()
    }
  }

  private fileIn(id: string, rel: string) {
    const dir = this.skill(id).id
    const file = path.resolve(dir, String(rel))
    if (!inside(file, dir)) throw new Error('Ruta fuera de la skill.')
    return file
  }

  private writable(s: Skill) {
    if (s.readonly) throw new Error('Las skills sincronizadas con tu cuenta no se editan aquí: cópiala a Usuario o a un repo y edita la copia.')
  }

  private async save(msg: any) {
    const s = this.skill(msg.id)
    this.writable(s)
    const name = String(msg.name ?? '').trim()
    const description = String(msg.description ?? '').trim()
    if (!NAME_RE.test(name)) throw new Error('El nombre va en minúsculas, números y guiones (máx. 64), p. ej. «revision-pro».')
    if (!description) throw new Error('La descripción no puede quedar vacía: es lo que usa Claude para saber cuándo cargarla.')
    const file = path.join(s.id, 'SKILL.md')
    if (msg.mtime && Math.abs(fs.statSync(file).mtimeMs - Number(msg.mtime)) > 1) {
      const ok = await vscode.window.showWarningMessage(`${s.name} ha cambiado fuera del gestor desde que la abriste. ¿Guardar encima?`, { modal: true }, 'Guardar encima')
      if (ok !== 'Guardar encima') return this.pushSkill(s.id)
    }
    let dir = s.id
    // the folder follows the name, as Claude Code expects
    if (name !== s.folder) {
      const target = path.join(path.dirname(s.id), name)
      if (fs.existsSync(target) && !same(target, s.id)) throw new Error(`Ya hay una carpeta ${name} en esta ubicación.`)
      fs.renameSync(s.id, target)
      dir = target
    }
    writeSkill(dir, { name, description, extra: String(msg.extra ?? ''), body: String(msg.body ?? ''), lead: Number(msg.lead ?? 1) })
    this.pushList()
    this.pushSkill(dir)
    this.post({ type: 'saved', id: dir })
    this.changed()
  }

  private async create(placeId: string, name: string) {
    const p = this.place(placeId)
    if (p.kind === 'synced') throw new Error('Las sincronizadas son de solo lectura.')
    if (!NAME_RE.test(name)) throw new Error('El nombre va en minúsculas, números y guiones (máx. 64).')
    const dir = path.join(p.dir, name)
    if (fs.existsSync(dir)) throw new Error(`Ya existe ${name} en ${p.label}.`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Qué hace y cuándo usarla, con las frases que dirías para pedirla.\n---\n\n# ${name}\n\nInstrucciones paso a paso.\n`)
    this.pushList()
    this.post({ type: 'select', place: p.id, skill: dir })
    this.pushSkill(dir)
    this.changed()
  }

  private async move(id: string, to: string, copy: boolean) {
    const s = this.skill(id)
    if (!copy) this.writable(s)
    let target: Place | undefined
    if (to === '@pick') {
      const chosen = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: copy ? 'Copiar a este repo' : 'Mover a este repo' })
      const dir = chosen?.[0]?.fsPath
      if (!dir) return
      const extra = this.ctx.globalState.get<string[]>(EXTRA_REPOS_KEY, [])
      if (!extra.some(x => same(x, dir))) await this.ctx.globalState.update(EXTRA_REPOS_KEY, [...extra, dir])
      this.scan()
      const root = this.repoRoot(dir) ?? dir
      target = this.places.find(p => p.kind === 'repo' && same(p.root, root))
    } else target = this.place(to)
    if (!target || target.kind === 'synced') throw new Error('No se puede mover ahí.')
    if (same(path.dirname(s.id), target.dir)) return
    const dest = path.join(target.dir, s.folder)
    if (fs.existsSync(dest)) {
      const ok = await vscode.window.showWarningMessage(`${target.label} ya tiene una skill ${s.folder}. ¿Reemplazarla? La que hay irá a la papelera.`, { modal: true }, 'Reemplazar')
      if (ok !== 'Reemplazar') return
      await vscode.workspace.fs.delete(vscode.Uri.file(dest), { recursive: true, useTrash: true })
    }
    fs.mkdirSync(target.dir, { recursive: true })
    if (copy) fs.cpSync(s.id, dest, { recursive: true, filter: src => !SKIP.has(path.basename(src)) })
    else {
      try {
        fs.renameSync(s.id, dest)
      } catch {
        fs.cpSync(s.id, dest, { recursive: true })
        fs.rmSync(s.id, { recursive: true, force: true })
      }
    }
    this.pushList()
    this.post({ type: 'select', place: target.id, skill: dest })
    this.pushSkill(dest)
    void vscode.window.showInformationMessage(`${s.name} ${copy ? 'copiada' : 'movida'} a ${target.label}.`)
    this.changed()
  }

  private async remove(id: string) {
    const s = this.skill(id)
    this.writable(s)
    const ok = await vscode.window.showWarningMessage(`¿Mandar la skill ${s.name} a la papelera? Se va la carpeta entera (${s.files} fichero${s.files === 1 ? '' : 's'}).`, { modal: true }, 'Mandar a la papelera')
    if (ok !== 'Mandar a la papelera') return
    await vscode.workspace.fs.delete(vscode.Uri.file(s.id), { recursive: true, useTrash: true })
    this.pushList()
    this.post({ type: 'removed', id: s.id })
    this.changed()
  }

  // ---------- export and import: one zip that rebuilds the same layout on another PC ----------

  private async exportZip(scope: string, id?: string) {
    this.scan()
    const chosen =
      scope === 'skill' ? this.skills.filter(s => same(s.id, String(id))) : scope.startsWith('place:') ? this.skills.filter(s => s.place === scope.slice(6)) : this.skills.filter(s => s.place !== 'synced' && (scope === 'all' || s.place === 'user'))
    if (!chosen.length) throw new Error('No hay skills que descargar con esa selección.')
    const labels = new Map<string, string>()
    const folderFor = (p: Place) => {
      if (p.kind === 'user') return 'usuario'
      if (p.kind === 'synced') return 'sincronizadas'
      if (!labels.has(p.id)) {
        let label = p.label.replace(/[\\/:*?"<>|]+/g, '-')
        for (let n = 2; [...labels.values()].includes(label); n++) label = `${p.label}-${n}`
        labels.set(p.id, label)
      }
      return `repos/${labels.get(p.id)}`
    }
    const files: { name: string; data: Buffer; mtime: Date }[] = []
    const manifest = { tool: 'skill-lab', version: 1, exportedAt: new Date().toISOString(), skills: [] as { name: string; folder: string; scope: PlaceKind; repo?: string; repoPath?: string; path: string }[] }
    for (const s of chosen) {
      const p = this.place(s.place)
      const base = `${folderFor(p)}/${s.folder}`
      manifest.skills.push({ name: s.name, folder: s.folder, scope: p.kind, repo: p.kind === 'repo' ? p.label : undefined, repoPath: p.kind === 'repo' ? p.root : undefined, path: base })
      for (const f of walk(s.id)) files.push({ name: `${base}/${f.rel}`, data: fs.readFileSync(f.abs), mtime: fs.statSync(f.abs).mtime })
    }
    files.unshift(
      { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)), mtime: new Date() },
      {
        name: 'LEEME.txt',
        data: Buffer.from(
          [
            'Skills exportadas con Skill Lab.',
            '',
            'Para restaurarlas en otro PC: abre Skill Lab → 📚 Skills → Importar y elige este zip.',
            'Las de usuario van a ~/.claude/skills; las de cada repo, a <repo>/.claude/skills',
            '(si el repo no está en la misma ruta, el gestor te pregunta dónde ponerlas).',
            '',
            'A mano: copia el contenido de «usuario» en ~/.claude/skills y el de cada',
            'carpeta de «repos» en la carpeta .claude/skills de su repo.',
            '',
            ...manifest.skills.map(s => `- ${s.path}${s.repoPath ? `  (repo original: ${s.repoPath})` : ''}`),
          ].join(os.EOL),
        ),
        mtime: new Date(),
      },
    )
    const stamp = new Date().toISOString().slice(0, 10)
    const fileName = scope === 'skill' ? `skill-${chosen[0].folder}-${stamp}.zip` : `skills-${scope === 'user' ? 'usuario-' : scope.startsWith('place:') ? `${this.place(scope.slice(6)).label.replace(/[\\/:*?"<>|]+/g, '-')}-` : ''}${stamp}.zip`
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(path.join(HOME, 'Downloads', fileName)), filters: { Zip: ['zip'] }, saveLabel: 'Descargar' })
    if (!target) return
    fs.writeFileSync(target.fsPath, zip(files))
    const kb = Math.max(1, Math.round(fs.statSync(target.fsPath).size / 1024))
    const pick = await vscode.window.showInformationMessage(`${chosen.length} skill${chosen.length === 1 ? '' : 's'} descargada${chosen.length === 1 ? '' : 's'} en ${path.basename(target.fsPath)} (${kb.toLocaleString('es-ES')} KB).`, 'Mostrar en la carpeta')
    if (pick) await vscode.commands.executeCommand('revealFileInOS', target)
  }

  private async importZip() {
    const chosen = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, filters: { Zip: ['zip'] }, openLabel: 'Importar' })
    const file = chosen?.[0]?.fsPath
    if (!file) return
    const entries = unzip(fs.readFileSync(file))
    const safe = (rel: string) => rel.split('/').every(part => part && part !== '..' && part !== '.' && !/[:]/.test(part))
    type Group = { scope: PlaceKind; repo?: string; repoPath?: string; path: string; folder: string }
    let groups: Group[] = []
    const manifest = entries.find(e => e.name === 'manifest.json')
    if (manifest) groups = (JSON.parse(manifest.data.toString('utf8')).skills ?? []).filter((g: Group) => g?.path && g.folder && safe(g.path))
    else {
      // a zip without manifest: every folder holding a SKILL.md is a skill
      for (const e of entries) {
        if (!/(^|\/)SKILL\.md$/.test(e.name)) continue
        const dir = e.name.split('/').slice(0, -1).join('/')
        const folder = dir.split('/').pop() || path.basename(file, '.zip')
        groups.push({ scope: 'user', path: dir, folder })
      }
    }
    groups = groups.filter(g => g.scope !== 'synced')
    if (!groups.length) throw new Error('Ese zip no trae skills.')
    // where each original repo goes on this PC
    this.scan()
    const repoTarget = new Map<string, string | null>()
    for (const g of groups) {
      if (g.scope !== 'repo' || repoTarget.has(g.repo ?? '')) continue
      if (g.repoPath && fs.existsSync(g.repoPath)) {
        repoTarget.set(g.repo ?? '', g.repoPath)
        continue
      }
      type Item = vscode.QuickPickItem & { dir?: string | null; pick?: boolean }
      const items: Item[] = [
        ...this.places.filter(p => p.kind === 'repo').map(p => ({ label: `$(repo) ${p.label}`, description: p.root, dir: p.root })),
        { label: '$(folder-opened) Elegir carpeta…', pick: true },
        { label: '$(account) Ponerlas a nivel de usuario', dir: CLAUDE_DIR },
        { label: '$(close) No importar las de este repo', dir: null },
      ]
      const pick = await vscode.window.showQuickPick(items, { title: `¿Dónde van las skills del repo «${g.repo}»?`, placeHolder: g.repoPath ? `En el PC original estaba en ${g.repoPath}` : undefined, ignoreFocusOut: true })
      if (!pick) return
      let dir = pick.dir
      if (pick.pick) dir = (await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: `Skills de ${g.repo}` }))?.[0]?.fsPath
      if (dir === undefined) return
      repoTarget.set(g.repo ?? '', dir)
    }
    const destOf = (g: Group) => {
      if (g.scope !== 'repo') return path.join(USER_SKILLS, g.folder)
      const root = repoTarget.get(g.repo ?? '')
      if (!root) return null
      return same(root, CLAUDE_DIR) ? path.join(USER_SKILLS, g.folder) : path.join(root, '.claude', 'skills', g.folder)
    }
    const plan = groups.map(g => ({ g, dest: destOf(g) })).filter((x): x is { g: Group; dest: string } => !!x.dest && safe(x.g.folder))
    const clashes = plan.filter(x => fs.existsSync(x.dest))
    let replace = false
    if (clashes.length) {
      const ok = await vscode.window.showWarningMessage(
        `${clashes.length} de las ${plan.length} skills ya existen aquí (${clashes.slice(0, 4).map(x => x.g.folder).join(', ')}${clashes.length > 4 ? '…' : ''}).`,
        { modal: true },
        'Reemplazarlas',
        'Saltarlas',
      )
      if (!ok) return
      replace = ok === 'Reemplazarlas'
    }
    let done = 0
    for (const { g, dest } of plan) {
      if (fs.existsSync(dest)) {
        if (!replace) continue
        await vscode.workspace.fs.delete(vscode.Uri.file(dest), { recursive: true, useTrash: true })
      }
      for (const e of entries) {
        if (!e.name.startsWith(`${g.path}/`)) continue
        const rel = e.name.slice(g.path.length + 1)
        if (!safe(rel)) continue
        const out = path.join(dest, ...rel.split('/'))
        fs.mkdirSync(path.dirname(out), { recursive: true })
        fs.writeFileSync(out, e.data)
      }
      done++
    }
    this.pushList()
    this.changed()
    void vscode.window.showInformationMessage(`${done} skill${done === 1 ? '' : 's'} importada${done === 1 ? '' : 's'} de ${path.basename(file)}.`)
  }
}

// exported for the tests in tools/
export const __test = { splitDoc, decode, encode, writeSkill, readSkill, zip, unzip }
