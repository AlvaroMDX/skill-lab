import * as http from 'http'
import * as https from 'https'
import { LABS } from './labs'
import type { ServiceStatus } from './scene'

const CHECK_EVERY_MS = 60_000
const WATCH_EVERY_MS = 5_000
const TIMEOUT_MS = 8_000

// One GET without following redirects: anything under 500 counts as up.
export function probe(url: string): Promise<ServiceStatus> {
  return new Promise(resolve => {
    const started = Date.now()
    let done = false
    const finish = (s: ServiceStatus) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(s)
    }
    let req: http.ClientRequest
    try {
      const lib = url.startsWith('https:') ? https : http
      req = lib.get(url, { headers: { 'User-Agent': 'SkillLab-monitor' } }, res => {
        const code = res.statusCode ?? 0
        res.resume()
        req.destroy()
        finish({ up: code > 0 && code < 500, code, ms: Date.now() - started })
      })
    } catch {
      return resolve({ up: false })
    }
    const timer = setTimeout(() => {
      req.destroy()
      finish({ up: false })
    }, TIMEOUT_MS)
    req.on('error', () => finish({ up: false }))
  })
}

// Checks the services configured in each puesto every minute, and right away when the list of URLs changes.
export class ServiceMonitor {
  readonly status: Record<string, ServiceStatus> = {}
  private timers: NodeJS.Timeout[] = []
  private urlsKey = ''
  private running: Promise<void> | undefined
  private again = false

  constructor(private readonly onChange: () => void) {}

  private urls() {
    return [...new Set(LABS.flatMap(l => l.services.map(s => s.url)))]
  }

  start() {
    void this.check()
    this.timers.push(setInterval(() => void this.check(), CHECK_EVERY_MS))
    // config edits outside the panel: a cheap look at the URL list, a real check only if it changed
    this.timers.push(setInterval(() => this.urls().join('\n') !== this.urlsKey && void this.check(), WATCH_EVERY_MS))
  }

  check(): Promise<void> {
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.run().finally(() => {
      this.running = undefined
      if (this.again) {
        this.again = false
        void this.check()
      }
    })
    return this.running
  }

  private async run() {
    const urls = this.urls()
    this.urlsKey = urls.join('\n')
    let changed = false
    for (const url of Object.keys(this.status)) {
      if (urls.includes(url)) continue
      delete this.status[url]
      changed = true
    }
    const results = await Promise.all(urls.map(probe))
    urls.forEach((url, i) => {
      const next = results[i]!
      const prev = this.status[url]
      // the latency alone moving is not a change worth a redraw
      if (!prev || prev.up !== next.up || prev.code !== next.code) changed = true
      this.status[url] = next
    })
    if (changed) this.onChange()
  }

  dispose() {
    this.timers.forEach(clearInterval)
    this.timers = []
  }
}
