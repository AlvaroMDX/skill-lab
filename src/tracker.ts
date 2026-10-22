import * as fs from 'fs'
import * as path from 'path'

import { HIDDEN, RETURN_DELAY_MS, labForDir, labForSkill } from './labs'
import type { Activity, AgentView, CrewMember } from './scene'

const RECENT_MS = 30 * 60_000
const REPLAY_BYTES = 512 * 1024
const MAX_READ_BYTES = 4 * 1024 * 1024
const MAX_LINE_BYTES = 8 * 1024 * 1024
const DONE_BUBBLE_MS = 8_000
const WAIT_GUESS_MS = 7_000
const SESSION_TTL_MS = 20 * 60_000
const STALE_MS = 5 * 60_000
const NOT_PERMISSION = new Set(['Agent', 'Task', 'Workflow', 'Monitor', 'ScheduleWakeup', 'TaskStop'])

const TOOL_ACTIVITY: Record<string, Activity> = {
  Edit: 'escribiendo', Write: 'escribiendo', NotebookEdit: 'escribiendo', MultiEdit: 'escribiendo',
  Read: 'leyendo', Grep: 'leyendo', Glob: 'leyendo', WebFetch: 'leyendo', WebSearch: 'leyendo', ToolSearch: 'leyendo',
  Bash: 'ejecutando', PowerShell: 'ejecutando', Monitor: 'ejecutando',
  Agent: 'delegando', Task: 'delegando', Workflow: 'delegando',
  AskUserQuestion: 'pregunta', ExitPlanMode: 'pregunta',
}

type Session = {
  id: string
  cwd: string
  lastEvent: number
  activity: Activity
  doneAt?: number
  pending: Map<string, { name: string; at: number }>
  subagents: Map<string, { label: string; since: number }>
  hiddenAt?: number
}

export type TrackerHooks = {
  sound: (kind: 'done' | 'ask') => void
  knownSkill: (name: string) => boolean
}

export class Tracker {
  readonly crew: Record<string, CrewMember> = {}
  readonly extraSkills: string[] = []
  private sessions = new Map<string, Session>()
  private offsets = new Map<string, number>()
  private carry = new Map<string, Buffer>()
  private files: string[] = []
  private lastListing = 0
  private dirty = new Set<string>()
  private seeds = new Map<string, string>()
  private watcher?: fs.FSWatcher

  constructor(private root: string, readonly uses: Record<string, number>, private hooks: TrackerHooks) {
    try {
      this.watcher = fs.watch(root, { recursive: true }, (_event, name) => {
        if (name && name.toString().endsWith('.jsonl')) this.dirty.add(path.join(root, name.toString()))
      })
      this.watcher.on('error', () => this.stopWatching())
    } catch {
      this.watcher = undefined
    }
  }

  private stopWatching() {
    this.watcher?.close()
    this.watcher = undefined
  }

  dispose() {
    this.stopWatching()
  }

  // With a watcher only changed files are read; the full listing (stat of every transcript) is a safety net.
  poll(now: number) {
    const listEvery = this.watcher ? 60_000 : 5_000
    if (now - this.lastListing > listEvery) {
      this.files = this.listRecent(now)
      this.lastListing = now
      const recent = new Set(this.files)
      for (const file of this.carry.keys()) if (!recent.has(file)) this.carry.delete(file)
      for (const file of this.files) this.readFile(file, now)
      this.dirty.clear()
      return
    }
    if (!this.watcher) {
      for (const file of this.files) this.readFile(file, now)
      return
    }
    const batch = [...this.dirty]
    this.dirty.clear()
    for (const file of batch) {
      if (!this.files.includes(file)) this.files.push(file)
      this.readFile(file, now)
    }
  }

  private listRecent(now: number): string[] {
    const found: string[] = []
    const visit = (dir: string, depth: number) => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory() && depth < 3) visit(full, depth + 1)
        else if (e.isFile() && e.name.endsWith('.jsonl')) {
          try {
            if (now - fs.statSync(full).mtimeMs < RECENT_MS) found.push(full)
          } catch {
            // vanished between readdir and stat
          }
        }
      }
    }
    visit(this.root, 0)
    return found
  }

  private readFile(file: string, now: number) {
    let size: number
    try {
      size = fs.statSync(file).size
    } catch {
      return
    }
    const known = this.offsets.get(file)
    const replay = known === undefined
    if (replay) this.seedCwd(file)
    let start = known ?? Math.max(0, size - REPLAY_BYTES)
    if (size < start) start = 0
    if (size === start) {
      this.offsets.set(file, start)
      return
    }
    // a huge burst is read in slices so one poll never blocks the extension host
    const end = Math.min(size, start + MAX_READ_BYTES)
    const buf = Buffer.alloc(end - start)
    let fd: number
    try {
      fd = fs.openSync(file, 'r')
    } catch {
      return
    }
    try {
      fs.readSync(fd, buf, 0, buf.length, start)
    } finally {
      fs.closeSync(fd)
    }
    this.offsets.set(file, end)
    if (end < size) this.dirty.add(file)
    const data = Buffer.concat([this.carry.get(file) ?? Buffer.alloc(0), buf])
    let from = 0
    if (replay && start > 0) from = data.indexOf(0x0a) + 1
    for (;;) {
      const nl = data.indexOf(0x0a, from)
      if (nl < 0) break
      this.handleLine(data.subarray(from, nl).toString('utf8'), !replay, now)
      from = nl + 1
    }
    // copy the unfinished line: a subarray would keep the whole read buffer alive
    const rest = data.length - from
    if (rest > 0 && rest < MAX_LINE_BYTES) this.carry.set(file, Buffer.from(data.subarray(from)))
    else this.carry.delete(file)
  }

  // The session's own directory is on its first lines; later lines carry wherever a command cd'd to.
  private seedCwd(file: string) {
    let fd: number | undefined
    try {
      fd = fs.openSync(file, 'r')
      const head = Buffer.alloc(64 * 1024)
      const n = fs.readSync(fd, head, 0, head.length, 0)
      for (const raw of head.subarray(0, n).toString('utf8').split('\n')) {
        const id = /"sessionId":"([^"]+)"/.exec(raw)?.[1]
        const cwd = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(raw)?.[1]
        if (id && cwd) {
          if (!this.seeds.has(id)) this.seeds.set(id, JSON.parse(`"${cwd}"`))
          return
        }
      }
    } catch {
      // unreadable head: fall back to the cwd of the lines we read
    } finally {
      if (fd !== undefined) fs.closeSync(fd)
    }
  }

  private session(id: string, cwd: string, ts: number): Session {
    let s = this.sessions.get(id)
    if (!s) {
      s = { id, cwd: this.seeds.get(id) ?? cwd, lastEvent: ts, activity: 'pensando', pending: new Map(), subagents: new Map() }
      this.sessions.set(id, s)
    }
    // keep the first directory: commands that cd elsewhere change later lines' cwd
    if (cwd && !s.cwd) s.cwd = cwd
    s.lastEvent = Math.max(s.lastEvent, ts)
    if (s.hiddenAt !== undefined && ts > s.hiddenAt) s.hiddenAt = undefined
    return s
  }

  // Thrown in the bin: a skill stops at once (back in bed, no walk); a session leaves the lab until it acts again.
  stopSkill(name: string) {
    const c = this.crew[name]
    if (c) this.crew[name] = { ...c, lab: null, from: null }
  }

  // The puesto rules changed: skills already at work move to where the new rules send them.
  relocate(now: number) {
    for (const [skill, c] of Object.entries(this.crew)) {
      if (!c.lab) continue
      const lab = labForSkill(skill, this.sessions.get(c.session ?? '')?.cwd ?? '')
      if (lab !== c.lab) this.crew[skill] = { ...c, lab, from: null, since: now }
    }
  }

  hideSession(id: string, now: number) {
    const s = this.sessions.get(id)
    if (!s) return
    s.hiddenAt = now
    for (const [skill, c] of Object.entries(this.crew)) if (c.lab && c.session === id) this.stopSkill(skill)
  }

  private handleLine(raw: string, live: boolean, now: number) {
    if (!raw.trim()) return
    let line: any
    try {
      line = JSON.parse(raw)
    } catch {
      return
    }
    const id: string | undefined = line.sessionId
    if (!id || (line.type !== 'assistant' && line.type !== 'user')) return
    const ts = Date.parse(line.timestamp) || now
    const s = this.session(id, line.cwd ?? '', ts)
    const content = line.message?.content
    const sidechain = line.isSidechain === true

    if (line.type === 'assistant') {
      if (!Array.isArray(content)) return
      for (const block of content) {
        if (block?.type !== 'tool_use') continue
        if (block.name === 'Skill' && typeof block.input?.skill === 'string') this.goToLab(block.input.skill, s, ts, live)
        if (sidechain) continue
        s.pending.set(block.id, { name: block.name, at: ts })
        s.doneAt = undefined
        s.activity = TOOL_ACTIVITY[block.name] ?? 'pensando'
        if (block.name === 'Agent' || block.name === 'Task') {
          s.subagents.set(block.id, { label: String(block.input?.subagent_type ?? block.input?.description ?? 'agente').slice(0, 18), since: ts })
        }
        if (s.activity === 'pregunta' && live) this.hooks.sound('ask')
      }
      if (!sidechain && line.message?.stop_reason === 'end_turn') this.finishTurn(s, ts, live)
      return
    }

    if (sidechain || line.isMeta) return
    if (typeof content === 'string') {
      const cmd = /<command-name>\/?([^<\s]+)<\/command-name>/.exec(content)
      if (cmd) {
        if (this.hooks.knownSkill(cmd[1]!)) {
          this.goToLab(cmd[1]!, s, ts, live)
          this.startTurn(s)
        }
        return
      }
      if (content.startsWith('<local-command') || content.startsWith('<command-')) return
      if (content.includes('[Request interrupted')) return this.finishTurn(s, ts, live)
      this.startTurn(s)
      return
    }
    if (!Array.isArray(content)) return
    let prompt = false
    for (const block of content) {
      if (block?.type === 'tool_result') {
        s.pending.delete(block.tool_use_id)
        s.subagents.delete(block.tool_use_id)
      } else if (block?.type === 'text') {
        if (String(block.text).includes('[Request interrupted')) return this.finishTurn(s, ts, live)
        prompt = true
      }
    }
    if (prompt) this.startTurn(s)
    else if (s.pending.size === 0 && !s.doneAt) s.activity = 'pensando'
  }

  private startTurn(s: Session) {
    s.doneAt = undefined
    s.activity = 'pensando'
  }

  private finishTurn(s: Session, ts: number, live: boolean) {
    s.doneAt = ts
    s.activity = 'listo'
    s.pending.clear()
    s.subagents.clear()
    if (live) this.hooks.sound('done')
  }

  private goToLab(skill: string, s: Session, ts: number, live: boolean) {
    if (HIDDEN.has(skill)) return
    if (!this.hooks.knownSkill(skill) && !this.extraSkills.includes(skill)) this.extraSkills.push(skill)
    const lab = labForSkill(skill, s.cwd)
    const prev = this.crew[skill]
    if (live) this.uses[skill] = (this.uses[skill] ?? 0) + 1
    this.crew[skill] = { lab, from: null, since: prev?.lab === lab ? prev.since : ts, uses: this.uses[skill] ?? 0, session: s.id }
  }

  tick(now: number) {
    for (const s of this.sessions.values()) {
      if (s.doneAt !== undefined) {
        const back = s.doneAt + RETURN_DELAY_MS
        if (now >= back) {
          for (const [skill, c] of Object.entries(this.crew)) {
            if (c.lab && c.session === s.id) this.crew[skill] = { ...c, lab: null, from: c.lab, since: Math.max(back, c.since) }
          }
        }
        if (s.activity === 'listo' && now - s.doneAt > DONE_BUBBLE_MS) s.activity = 'idle'
      } else if (s.pending.size > 0 && now - s.lastEvent > STALE_MS) {
        // a session that died mid-tool: rest, don't ask for attention
        s.activity = 'idle'
      } else if (s.pending.size > 0) {
        const waiting = [...s.pending.values()].every(p => !NOT_PERMISSION.has(p.name) && now - p.at > WAIT_GUESS_MS)
        if (waiting && s.activity !== 'pregunta' && s.activity !== 'esperando' && now - s.lastEvent > WAIT_GUESS_MS) {
          s.activity = 'esperando'
          this.hooks.sound('ask')
        }
      }
      if (now - s.lastEvent > SESSION_TTL_MS && (s.doneAt !== undefined || s.pending.size === 0)) this.sessions.delete(s.id)
    }
  }

  agents(onlyUnder?: string[]): AgentView[] {
    const list: AgentView[] = []
    for (const s of this.sessions.values()) {
      if (s.hiddenAt !== undefined) continue
      if (onlyUnder?.length && !onlyUnder.some(dir => s.cwd.toLowerCase().startsWith(dir.toLowerCase()))) continue
      list.push({
        id: s.id,
        label: `Claude · ${path.basename(s.cwd) || 'sesión'}`,
        lab: labForDir(s.cwd),
        activity: s.activity,
        subagents: [...s.subagents.entries()].map(([id, sub]) => ({ id, label: sub.label })),
      })
    }
    return list.sort((a, b) => a.id.localeCompare(b.id))
  }

  sessionCwds(): string[] {
    return [...this.sessions.values()].map(s => s.cwd).filter(Boolean)
  }

  sessionCwd(id: string) {
    return this.sessions.get(id)?.cwd
  }
}

// One pass over every transcript to know how often each skill was used before the extension existed.
export async function countPastUses(root: string, onDone: (uses: Record<string, number>) => void) {
  const uses: Record<string, number> = {}
  const files: string[] = []
  const visit = (dir: string, depth: number) => {
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory() && depth < 3) visit(full, depth + 1)
      else if (e.isFile() && e.name.endsWith('.jsonl')) files.push(full)
    }
  }
  visit(root, 0)
  const skillRe = /"name":"Skill","input":\{"skill":"([^"]+)"/g
  const cmdRe = /<command-name>\/?([^<\s]+)<\/command-name>/g
  for (const file of files) {
    await new Promise<void>(resolve => {
      let tail = ''
      const stream = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 })
      stream.on('data', chunk => {
        const text = tail + chunk
        for (const re of [skillRe, cmdRe]) {
          re.lastIndex = 0
          let m: RegExpExecArray | null
          // a match lying wholly in the carried tail was counted with the previous chunk
          while ((m = re.exec(text))) if (m.index + m[0].length > tail.length) uses[m[1]!] = (uses[m[1]!] ?? 0) + 1
        }
        tail = text.slice(-200)
      })
      stream.on('end', () => resolve())
      stream.on('error', () => resolve())
    })
  }
  onDone(uses)
}
