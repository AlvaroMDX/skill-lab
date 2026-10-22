import * as fs from 'fs'
import * as path from 'path'

import { HIDDEN, RETURN_DELAY_MS, labForDir, labForSkill } from './labs'
import type { Activity, AgentView, CrewMember } from './scene'

const RECENT_MS = 30 * 60_000
const REPLAY_BYTES = 512 * 1024
const MAX_READ_BYTES = 4 * 1024 * 1024
const MAX_LINE_BYTES = 8 * 1024 * 1024
const SEED_HEAD_BYTES = 64 * 1024
const DONE_BUBBLE_MS = 8_000
const WAIT_GUESS_MS = 7_000
const SESSION_TTL_MS = 20 * 60_000
const STALE_MS = 5 * 60_000
const LIST_EVERY_WATCHED_MS = 60_000
const LIST_EVERY_POLLED_MS = 5_000
const WALK_DEPTH = 3
const NOT_PERMISSION = new Set(['Agent', 'Task', 'Workflow', 'Monitor', 'ScheduleWakeup', 'TaskStop'])
const COMMAND_RE = /<command-name>\/?([^<\s]+)<\/command-name>/
// <project>/<sessionId>/subagents/agent-<agentId>.jsonl: a subagent's own transcript, next to its .meta.json
const SUBAGENT_FILE_RE = /[\\/]([^\\/]+)[\\/]subagents[\\/]agent-([^\\/]+)\.jsonl$/
// a finished subagent lingers a moment: its last text line may be followed by a tool call still being written
const SUBAGENT_ENDED_GRACE_MS = 15_000
const SUBAGENT_LABEL_CHARS = 22
const NEWLINE = 0x0a

const TOOL_ACTIVITY: Record<string, Activity> = {
  Edit: 'escribiendo', Write: 'escribiendo', NotebookEdit: 'escribiendo', MultiEdit: 'escribiendo',
  Read: 'leyendo', Grep: 'leyendo', Glob: 'leyendo', WebFetch: 'leyendo', WebSearch: 'leyendo', ToolSearch: 'leyendo',
  Bash: 'ejecutando', PowerShell: 'ejecutando', Monitor: 'ejecutando',
  Agent: 'delegando', Task: 'delegando', Workflow: 'delegando',
  AskUserQuestion: 'pregunta', ExitPlanMode: 'pregunta',
}

type PendingTool = { name: string; at: number }
type Subagent = { label: string; since: number }

// A subagent seen through its own transcript: background agents return their tool_result at launch, so this is how they stay visible.
type SubagentFile = {
  sessionId: string
  // the launching tool_use id when the meta file names it, so a foreground agent is not shown twice
  id: string
  label?: string
  mtime: number
  // its latest assistant message called no tool: the agent has answered
  ended: boolean
}

type Session = {
  id: string
  cwd: string
  lastEvent: number
  activity: Activity
  doneAt?: number
  // set once the finished turn's skills have walked back, so tick stops rescanning the crew for it
  released?: boolean
  pending: Map<string, PendingTool>
  subagents: Map<string, Subagent>
  hiddenAt?: number
}

// The parts of a transcript line the tracker reads; everything else is ignored.
type ContentBlock = {
  type?: string
  id?: string
  name?: string
  input?: { skill?: unknown; subagent_type?: unknown; description?: unknown }
  tool_use_id?: string
  text?: unknown
}
type TranscriptLine = {
  type?: string
  sessionId?: string
  cwd?: string
  timestamp?: string
  isSidechain?: boolean
  isMeta?: boolean
  message?: { content?: string | ContentBlock[]; stop_reason?: string }
}

export type TrackerHooks = {
  sound: (kind: 'done' | 'ask') => void
  knownSkill: (name: string) => boolean
}

// Every transcript under root, at most WALK_DEPTH folders down (project / session / subagents).
export function walkTranscripts(root: string, onFile: (file: string) => void) {
  const visit = (dir: string, depth: number) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (depth < WALK_DEPTH) visit(full, depth + 1)
      } else if (e.isFile() && e.name.endsWith('.jsonl')) onFile(full)
    }
  }
  visit(root, 0)
}

export class Tracker {
  readonly crew: Record<string, CrewMember> = {}
  readonly extraSkills: string[] = []
  private sessions = new Map<string, Session>()
  private offsets = new Map<string, number>()
  private carry = new Map<string, Buffer>()
  // files whose next read starts mid-line: everything up to the first newline is dropped
  private resync = new Set<string>()
  private files = new Set<string>()
  private lastListing = 0
  private dirty = new Set<string>()
  private seeds = new Map<string, string>()
  private subagentFiles = new Map<string, SubagentFile>()
  private watcher?: fs.FSWatcher

  constructor(private root: string, readonly uses: Record<string, number>, private hooks: TrackerHooks) {
    try {
      this.watcher = fs.watch(root, { recursive: true }, (_event, name) => {
        const rel = name?.toString()
        if (rel?.endsWith('.jsonl')) this.dirty.add(path.join(root, rel))
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
    const listEvery = this.watcher ? LIST_EVERY_WATCHED_MS : LIST_EVERY_POLLED_MS
    // taken before reading: a file read only in part puts itself back in dirty and must stay there
    const batch = [...this.dirty]
    this.dirty.clear()
    if (now - this.lastListing > listEvery) {
      this.lastListing = now
      this.files = this.listRecent(now)
      for (const file of this.carry.keys()) if (!this.files.has(file)) this.forget(file)
      for (const file of this.subagentFiles.keys()) if (!this.files.has(file)) this.subagentFiles.delete(file)
      for (const file of batch) this.files.add(file)
      for (const file of this.files) this.readFile(file, now)
      return
    }
    if (!this.watcher) {
      for (const file of this.files) this.readFile(file, now)
      return
    }
    for (const file of batch) {
      this.files.add(file)
      this.readFile(file, now)
    }
  }

  private forget(file: string) {
    this.carry.delete(file)
    this.resync.delete(file)
  }

  private listRecent(now: number): Set<string> {
    const found = new Set<string>()
    walkTranscripts(this.root, file => {
      try {
        if (now - fs.statSync(file).mtimeMs < RECENT_MS) found.add(file)
      } catch {
        // vanished between readdir and stat
      }
    })
    return found
  }

  private readFile(file: string, now: number) {
    let size: number
    let mtime: number
    try {
      ;({ size, mtimeMs: mtime } = fs.statSync(file))
    } catch {
      this.files.delete(file)
      this.forget(file)
      this.subagentFiles.delete(file)
      return
    }
    const subagent = this.trackSubagent(file, mtime)
    const known = this.offsets.get(file)
    // a file that shrank was rewritten: read it again from the start, without sounds or counters
    const replay = known === undefined || size < known
    if (known === undefined) this.seedCwd(file)
    if (size < (known ?? 0)) this.forget(file)
    const start = replay ? Math.max(0, size - REPLAY_BYTES) : known!
    if (replay && start > 0) this.resync.add(file)
    if (size === start) {
      this.offsets.set(file, start)
      return
    }
    // a huge burst is read in slices so one poll never blocks the extension host
    const chunk = this.readRange(file, start, Math.min(size, start + MAX_READ_BYTES))
    if (!chunk) {
      // locked or gone for a moment (Windows): try again on the next poll
      this.dirty.add(file)
      return
    }
    const end = start + chunk.length
    this.offsets.set(file, end)
    if (end < size) this.dirty.add(file)
    this.parseChunk(file, chunk, !replay, now, subagent)
  }

  // Only the mtime and the small meta file are used: the transcript itself is read like any other.
  private trackSubagent(file: string, mtime: number): SubagentFile | undefined {
    const m = SUBAGENT_FILE_RE.exec(file)
    if (!m) return undefined
    let entry = this.subagentFiles.get(file)
    if (!entry) {
      entry = { sessionId: m[1]!, id: `agent-${m[2]}`, mtime, ended: false }
      this.subagentFiles.set(file, entry)
    }
    entry.mtime = mtime
    if (entry.label === undefined) this.readSubagentMeta(file, entry)
    return entry
  }

  private readSubagentMeta(file: string, entry: SubagentFile) {
    let meta: { description?: unknown; agentType?: unknown; toolUseId?: unknown }
    try {
      meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'))
    } catch {
      // not written yet: retried on the next read of the transcript
      return
    }
    if (!meta || typeof meta !== 'object') return
    if (typeof meta.toolUseId === 'string' && meta.toolUseId) entry.id = meta.toolUseId
    entry.label = String(meta.description || meta.agentType || 'agente').slice(0, SUBAGENT_LABEL_CHARS)
  }

  private subagentActive(entry: SubagentFile, now: number) {
    return now - entry.mtime < (entry.ended ? SUBAGENT_ENDED_GRACE_MS : STALE_MS)
  }

  private readRange(file: string, start: number, end: number): Buffer | undefined {
    let fd: number | undefined
    try {
      fd = fs.openSync(file, 'r')
      const buf = Buffer.alloc(end - start)
      const n = fs.readSync(fd, buf, 0, buf.length, start)
      return n > 0 ? buf.subarray(0, n) : undefined
    } catch {
      return undefined
    } finally {
      if (fd !== undefined) fs.closeSync(fd)
    }
  }

  private parseChunk(file: string, chunk: Buffer, live: boolean, now: number, subagent?: SubagentFile) {
    const carried = this.carry.get(file)
    const data = carried ? Buffer.concat([carried, chunk]) : chunk
    let from = 0
    if (this.resync.has(file)) {
      const nl = data.indexOf(NEWLINE)
      if (nl < 0) {
        this.carry.delete(file)
        return
      }
      this.resync.delete(file)
      from = nl + 1
    }
    for (let nl = data.indexOf(NEWLINE, from); nl >= 0; nl = data.indexOf(NEWLINE, from)) {
      this.handleLine(data.toString('utf8', from, nl), live, now, subagent)
      from = nl + 1
    }
    const rest = data.length - from
    if (rest === 0) this.carry.delete(file)
    // copy the unfinished line: a subarray would keep the whole read buffer alive
    else if (rest < MAX_LINE_BYTES) this.carry.set(file, Buffer.from(data.subarray(from)))
    else {
      // an absurdly long line is dropped, and so is the rest of it in the next read
      this.carry.delete(file)
      this.resync.add(file)
    }
  }

  // The session's own directory is on its first lines; later lines carry wherever a command cd'd to.
  private seedCwd(file: string) {
    const head = this.readRange(file, 0, SEED_HEAD_BYTES)
    if (!head) return
    for (const raw of head.toString('utf8').split('\n')) {
      const id = /"sessionId":"([^"]+)"/.exec(raw)?.[1]
      const cwd = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(raw)?.[1]
      if (!id || !cwd) continue
      try {
        if (!this.seeds.has(id)) this.seeds.set(id, JSON.parse(`"${cwd}"`))
      } catch {
        // malformed escape: fall back to the cwd of the lines we read
      }
      return
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

  private handleLine(raw: string, live: boolean, now: number, subagent?: SubagentFile) {
    if (!raw.trim()) return
    let line: TranscriptLine
    try {
      line = JSON.parse(raw)
    } catch {
      return
    }
    if (!line || typeof line !== 'object') return
    const id = line.sessionId
    if (typeof id !== 'string' || !id || (line.type !== 'assistant' && line.type !== 'user')) return
    const ts = Date.parse(line.timestamp ?? '') || now
    const s = this.session(id, typeof line.cwd === 'string' ? line.cwd : '', ts)
    const content = line.message?.content
    if (subagent && line.type === 'assistant' && Array.isArray(content)) subagent.ended = !content.some(b => b?.type === 'tool_use')
    if (line.type === 'assistant') this.handleAssistant(line, s, ts, live)
    else this.handleUser(line, s, ts, live)
  }

  private handleAssistant(line: TranscriptLine, s: Session, ts: number, live: boolean) {
    const content = line.message?.content
    if (!Array.isArray(content)) return
    const sidechain = line.isSidechain === true
    for (const block of content) {
      if (block?.type !== 'tool_use' || typeof block.name !== 'string') continue
      if (block.name === 'Skill' && typeof block.input?.skill === 'string') this.goToLab(block.input.skill, s, ts, live)
      if (sidechain || typeof block.id !== 'string') continue
      s.pending.set(block.id, { name: block.name, at: ts })
      this.reopen(s)
      s.activity = TOOL_ACTIVITY[block.name] ?? 'pensando'
      if (block.name === 'Agent' || block.name === 'Task') {
        const label = block.input?.subagent_type ?? block.input?.description ?? 'agente'
        s.subagents.set(block.id, { label: String(label).slice(0, 18), since: ts })
      }
      if (s.activity === 'pregunta' && live) this.hooks.sound('ask')
    }
    if (!sidechain && line.message?.stop_reason === 'end_turn') this.finishTurn(s, ts, live)
  }

  private handleUser(line: TranscriptLine, s: Session, ts: number, live: boolean) {
    if (line.isSidechain === true || line.isMeta) return
    const content = line.message?.content
    if (typeof content === 'string') {
      const cmd = COMMAND_RE.exec(content)?.[1]
      if (cmd) {
        if (this.hooks.knownSkill(cmd)) {
          this.goToLab(cmd, s, ts, live)
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
        if (typeof block.tool_use_id !== 'string') continue
        s.pending.delete(block.tool_use_id)
        s.subagents.delete(block.tool_use_id)
      } else if (block?.type === 'text') {
        if (String(block.text).includes('[Request interrupted')) return this.finishTurn(s, ts, live)
        prompt = true
      }
    }
    if (prompt) this.startTurn(s)
    else if (s.pending.size === 0 && s.doneAt === undefined) s.activity = 'pensando'
  }

  private reopen(s: Session) {
    s.doneAt = undefined
    s.released = undefined
  }

  private startTurn(s: Session) {
    this.reopen(s)
    s.activity = 'pensando'
  }

  private finishTurn(s: Session, ts: number, live: boolean) {
    s.doneAt = ts
    s.released = undefined
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

  // Skills working for the session walk back to bed.
  private sendHome(sessionId: string, since: number) {
    for (const [skill, c] of Object.entries(this.crew)) {
      if (c.lab && c.session === sessionId) this.crew[skill] = { ...c, lab: null, from: c.lab, since: Math.max(since, c.since) }
    }
  }

  tick(now: number) {
    for (const s of this.sessions.values()) {
      if (s.doneAt !== undefined) {
        const back = s.doneAt + RETURN_DELAY_MS
        if (now >= back && !s.released) {
          this.sendHome(s.id, back)
          s.released = true
        }
        if (s.activity === 'listo' && now - s.doneAt > DONE_BUBBLE_MS) s.activity = 'idle'
      } else if (s.pending.size > 0 && now - s.lastEvent > STALE_MS) {
        // a session that died mid-tool: rest, don't ask for attention
        s.activity = 'idle'
      } else if (s.pending.size > 0 && s.activity !== 'pregunta' && s.activity !== 'esperando' && now - s.lastEvent > WAIT_GUESS_MS) {
        if (this.looksLikePermission(s, now)) {
          s.activity = 'esperando'
          // a session hidden in the bin waits quietly
          if (s.hiddenAt === undefined) this.hooks.sound('ask')
        }
      }
      // long silent, even mid-tool (a closed terminal never writes its result): it leaves, and so do its skills
      if (now - s.lastEvent > SESSION_TTL_MS) {
        this.sendHome(s.id, now)
        this.sessions.delete(s.id)
      }
    }
  }

  // Every open tool is one that asks permission and has been waiting a while.
  private looksLikePermission(s: Session, now: number) {
    for (const p of s.pending.values()) if (NOT_PERMISSION.has(p.name) || now - p.at <= WAIT_GUESS_MS) return false
    return true
  }

  agents(onlyUnder?: string[]): AgentView[] {
    const roots = onlyUnder?.length ? onlyUnder.map(dir => dir.toLowerCase()) : undefined
    const now = Date.now()
    const background = new Map<string, SubagentFile[]>()
    for (const entry of this.subagentFiles.values()) {
      if (!this.subagentActive(entry, now)) continue
      const list = background.get(entry.sessionId)
      if (list) list.push(entry)
      else background.set(entry.sessionId, [entry])
    }
    const list: AgentView[] = []
    for (const s of this.sessions.values()) {
      if (s.hiddenAt !== undefined) continue
      if (roots) {
        const cwd = s.cwd.toLowerCase()
        if (!roots.some(dir => cwd.startsWith(dir))) continue
      }
      list.push({
        id: s.id,
        label: `Claude · ${path.basename(s.cwd) || 'sesión'}`,
        lab: labForDir(s.cwd),
        activity: s.activity,
        subagents: [
          ...[...s.subagents.entries()].map(([id, sub]) => ({ id, label: sub.label })),
          ...(background.get(s.id) ?? []).filter(b => !s.subagents.has(b.id)).map(b => ({ id: b.id, label: b.label ?? 'agente' })),
        ],
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
  walkTranscripts(root, file => files.push(file))
  const patterns = [/"name":"Skill","input":\{"skill":"([^"]+)"/g, new RegExp(COMMAND_RE.source, 'g')]
  for (const file of files) {
    await new Promise<void>(resolve => {
      let tail = ''
      const stream = fs.createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 20 })
      stream.on('data', chunk => {
        const text = tail + chunk
        for (const re of patterns) {
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
