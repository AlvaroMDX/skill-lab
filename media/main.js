(() => {
  const vscode = acquireVsCodeApi()
  const $ = id => document.getElementById(id)
  const viewport = $('viewport')
  const world = $('world')
  const scene = $('scene')
  const overlay = $('overlay')
  const drawer = $('drawer')
  const drawerBody = $('drawerBody')
  const SVG_NS = 'http://www.w3.org/2000/svg'
  const MIN = 0.25
  const MAX = 4
  const WALK_SPEED = 75
  const COATS = ['gris', 'naranja', 'negro', 'blanco', 'siames', 'tricolor', 'militar']
  const THEMES = [
    ['lab', '🧪 Laboratorio'],
    ['gym', '🏋️ Gimnasio'],
    ['cafe', '☕ Cafetería'],
    ['library', '📚 Biblioteca'],
    ['arcade', '🕹️ Arcade'],
    ['military', '🎖️ Cuartel'],
    ['smoking', '🚬 Fumadores'],
    ['greenhouse', '🌱 Invernadero'],
    ['music', '🎸 Estudio de música'],
    ['space', '🚀 Estación espacial'],
    ['kitchen', '🍳 Cocina'],
    ['beach', '🏖️ Chiringuito'],
    ['casino', '🎰 Casino'],
  ]

  // tiny event bus: features announce what the person did (emit), achievements listen (on)
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(`sl:${name}`, { detail }))
  const on = (name, fn) => window.addEventListener(`sl:${name}`, e => fn(e.detail))

  const saved = vscode.getState() || {}
  let view = saved.view || null
  // the view follows the panel's size only until the person zooms or pans by hand
  let autoFit = !saved.view
  let tab = saved.tab || 'labs'
  let bags = Array.isArray(saved.bags) ? saved.bags : []
  let thrown = saved.thrown || 0
  let medals = saved.medals || {}
  let model = null
  let focus = null
  let filter = ''
  let lastSvg = ''
  let geo = null
  let clockMode = 'auto'
  let stats = null

  const persist = () => vscode.setState({ view, tab, bags, thrown, medals })
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

  // ---------- geometry (mirrors scene.ts, sizes come with every scene) ----------

  const iso = (x, y) => ({ x: (x - y) * 18 + geo.ox, y: (x + y) * 9 + geo.oy })
  const tileOf = p => {
    const a = (p.x - geo.ox) / 18
    const b = (p.y - geo.oy) / 9
    return { x: Math.min(geo.W + 3, Math.max(-3, (a + b) / 2)), y: Math.min(geo.H + 5.5, Math.max(0.3, (b - a) / 2)) }
  }
  const corridorY = () => geo.D + 0.5
  const roomAt = t => geo.rooms.find(r => t.x >= r.x0 && t.x < r.x1 && t.y >= r.y0 && t.y < r.y1) || null
  const outside = t => t.y > geo.H || t.x > geo.W || t.x < 0
  const entryY = r => (r.top ? geo.D - 0.5 : geo.D + 1.5)
  const doorX = r => (r.x0 + r.x1) / 2

  // through doors, the corridor and the street door, the way scene.ts walks them
  function route(from, to) {
    const cy = corridorY()
    const rf = outside(from) ? null : roomAt(from)
    const rt = roomAt(to)
    const pts = [from]
    // street to street (a cat rejoining the sidewalk) stays outside instead of cutting through the building
    if (outside(from) && outside(to)) pts.push({ x: from.x, y: to.y })
    else if (!(rf && rf === rt)) {
      if (outside(from)) pts.push({ x: geo.W + 0.8, y: from.y }, { x: geo.W + 0.8, y: cy }, { x: geo.W - 0.4, y: cy })
      else if (rf && rf.kind === 'dorm') pts.push({ x: geo.aisle, y: from.y }, { x: geo.aisle, y: cy })
      else if (rf) pts.push({ x: doorX(rf), y: entryY(rf) }, { x: doorX(rf), y: cy })
      else pts.push({ x: from.x, y: cy })
      if (rt && rt.kind === 'dorm') pts.push({ x: geo.aisle, y: cy }, { x: geo.aisle, y: to.y })
      else if (rt) pts.push({ x: doorX(rt), y: cy }, { x: doorX(rt), y: entryY(rt) }, { x: rt.x1 - 0.5, y: entryY(rt) }, { x: rt.x1 - 0.5, y: to.y })
      else if (outside(to)) pts.push({ x: geo.W - 0.4, y: cy }, { x: geo.W + 0.8, y: cy }, { x: geo.W + 0.8, y: to.y })
    }
    pts.push(to)
    return pts.map(p => iso(p.x, p.y))
  }

  function zoneOf(t) {
    if (outside(t)) return 'street'
    const r = roomAt(t)
    if (!r) return 'corridor'
    return r.kind === 'lab' ? r.theme || 'lab' : r.kind
  }

  // ---------- zoom & pan ----------

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const calm = () => reducedMotion.matches
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
  const sceneW = () => (geo ? geo.vw : 850)
  const sceneH = () => (geo ? geo.vh : 530)
  // setState on every animation frame is wasteful: the view is saved once it settles
  let persistTimer = 0
  const apply = () => {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
    const pct = `${Math.round(view.scale * 100)}%`
    if ($('zoomLevel').textContent !== pct) $('zoomLevel').textContent = pct
    clearTimeout(persistTimer)
    persistTimer = setTimeout(persist, 200)
  }
  const fitView = () => {
    const w = viewport.clientWidth - (drawer.classList.contains('open') ? drawer.offsetWidth : 0)
    const scale = Math.min(w / sceneW(), viewport.clientHeight / sceneH()) * 0.97
    return { scale, x: (w - sceneW() * scale) / 2, y: (viewport.clientHeight - sceneH() * scale) / 2 }
  }
  const fit = () => {
    stopCamera()
    view = fitView()
    apply()
  }

  // one camera animation at a time: wheel zoom (exponential approach), fit (eased tween) or pan inertia
  let cam = null
  let camFrame = 0
  const stopCamera = () => {
    cam = null
    cancelAnimationFrame(camFrame)
  }
  function runCamera(next) {
    cancelAnimationFrame(camFrame)
    cam = next
    let last = performance.now()
    const step = now => {
      if (cam !== next) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (next.tick(dt, now) === false) cam = null
      apply()
      if (cam === next) camFrame = requestAnimationFrame(step)
    }
    camFrame = requestAnimationFrame(step)
  }

  // the scene point under (cx, cy) stays under it on every frame; the scale eases in log space so steps feel even
  const zoomAt = (factor, cx, cy) => {
    autoFit = false
    const base = cam && cam.kind === 'zoom' ? cam.target : view.scale
    const target = clamp(base * factor, MIN, MAX)
    if (calm()) {
      stopCamera()
      const k = target / view.scale
      view = { scale: target, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k }
      return apply()
    }
    const z = cam && cam.kind === 'zoom' ? cam : { kind: 'zoom' }
    z.target = target
    z.cx = cx
    z.cy = cy
    z.wx = (cx - view.x) / view.scale
    z.wy = (cy - view.y) / view.scale
    z.tick = dt => {
      const ls = Math.log(view.scale)
      const lt = Math.log(z.target)
      const scale = Math.abs(lt - ls) < 0.002 ? z.target : Math.exp(ls + (lt - ls) * (1 - Math.exp(-dt / 0.06)))
      view = { scale, x: z.cx - z.wx * scale, y: z.cy - z.wy * scale }
      return scale !== z.target
    }
    if (cam !== z) runCamera(z)
  }

  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  // "encajar": glide to the fitted view, tweening the centre point and the log of the scale
  function fitAnimated() {
    autoFit = true
    const to = fitView()
    if (calm() || !view) return fit()
    const from = view
    const vw = viewport.clientWidth / 2
    const vh = viewport.clientHeight / 2
    const c0 = { x: (vw - from.x) / from.scale, y: (vh - from.y) / from.scale }
    const c1 = { x: (vw - to.x) / to.scale, y: (vh - to.y) / to.scale }
    const ms = 420
    const start = performance.now()
    runCamera({
      kind: 'fit',
      tick: (_dt, now) => {
        const k = easeInOut(Math.min(1, (now - start) / ms))
        const scale = Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * k)
        const cx = c0.x + (c1.x - c0.x) * k
        const cy = c0.y + (c1.y - c0.y) * k
        view = k >= 1 ? to : { scale, x: vw - cx * scale, y: vh - cy * scale }
        return k < 1
      },
    })
  }

  // a flung map glides on and slows down exponentially, measured in real time
  function fling(vx, vy) {
    if (calm() || Math.hypot(vx, vy) < 120) return
    runCamera({
      kind: 'inertia',
      tick: dt => {
        const decay = Math.exp(-dt / 0.2)
        view = { ...view, x: view.x + vx * dt, y: view.y + vy * dt }
        vx *= decay
        vy *= decay
        return Math.hypot(vx, vy) > 12
      },
    })
  }

  if (view) apply()

  const scenePoint = e => {
    const rect = world.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / view.scale, y: (e.clientY - rect.top) / view.scale }
  }

  viewport.addEventListener('wheel', e => {
    e.preventDefault()
    if (!view) return
    const rect = viewport.getBoundingClientRect()
    // trackpads send many small deltas, wheels ~100 per notch (or lines): scale by the amount, not the event count
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1)
    const factor = clamp(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.00113)), 0.5, 2)
    zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top)
  }, { passive: false })

  // ---------- pointer: pan, click, grab ----------

  let press = null
  let grab = null
  const held = new Set()

  // belt and braces next to user-select: a mousedown or double click would still start a text selection
  viewport.addEventListener('mousedown', e => e.preventDefault())
  viewport.addEventListener('selectstart', e => e.preventDefault())

  // bunk rails and mattresses are drawn over the sleepers: look through the whole stack under the pointer
  function pick(e, selector) {
    for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
      const hit = el.closest?.(selector)
      if (hit && (scene.contains(hit) || overlay.contains(hit))) return hit
    }
    return nearest(e, selector)
  }

  // pixel-art sprites are a few px wide in the bottom panel and full of gaps: a near miss still picks them
  const NEAR_PX = 12
  function nearest(e, selector) {
    let best = null
    let bestD = NEAR_PX
    for (const el of [...scene.querySelectorAll(selector), ...overlay.querySelectorAll(selector)]) {
      if (el.dataset.lab || el.style.visibility === 'hidden') continue
      const r = (el.querySelector('use') || el).getBoundingClientRect()
      if (!r.width) continue
      const d = Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom))
      if (d < bestD) {
        best = el
        bestD = d
      }
    }
    return best
  }
  const DRAGGABLE = '[data-home],[data-pet],[data-bag]'

  viewport.addEventListener('pointerdown', e => {
    window.getSelection()?.removeAllRanges()
    unlockAudio()
    if (cam && cam.kind !== 'zoom') stopCamera()
    if (!view) return
    const hit = pick(e, DRAGGABLE)
    press = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, hit, at: scenePoint(e), feet: hit ? feetOf(hit) : null, samples: [] }
    viewport.setPointerCapture?.(e.pointerId)
  })

  viewport.addEventListener('pointermove', e => {
    if (!press) return
    const dx = e.clientX - press.x
    const dy = e.clientY - press.y
    if (!press.moved && Math.hypot(dx, dy) < 5) return
    if (!press.moved) {
      press.moved = true
      if (press.hit) startGrab(press.hit, e, press)
      else viewport.classList.add('dragging')
    }
    if (grab) moveGrab(e)
    else {
      autoFit = false
      const mx = e.clientX - press.lx
      const my = e.clientY - press.ly
      view = { ...view, x: view.x + mx, y: view.y + my }
      // a zoom still easing keeps its anchor under the same scene point
      if (cam && cam.kind === 'zoom') {
        cam.cx += mx
        cam.cy += my
      }
      apply()
      const now = performance.now()
      press.samples.push({ t: now, x: e.clientX, y: e.clientY })
      while (press.samples.length > 2 && now - press.samples[0].t > 90) press.samples.shift()
    }
    press.lx = e.clientX
    press.ly = e.clientY
  })

  const endPress = e => {
    if (!press) return
    const p = press
    press = null
    viewport.classList.remove('dragging')
    if (grab) return releaseGrab(e)
    if (p.moved && e.type === 'pointerup') {
      const s = p.samples
      const a = s[0]
      const b = s[s.length - 1]
      // a pause before letting go means no fling
      if (a && b && b.t > a.t && performance.now() - b.t < 60) fling(((b.x - a.x) / (b.t - a.t)) * 1000, ((b.y - a.y) / (b.t - a.t)) * 1000)
    }
    if (!p.moved && e.type === 'pointerup') click(e)
  }
  viewport.addEventListener('pointerup', endPress)
  viewport.addEventListener('pointercancel', endPress)

  // double click: the character's menu (drawer row, session menu, petting the cat). Never the zoom: fast clicking
  // (the cats' easter eggs) fires double clicks that can land on the floor as the cat walks away.
  viewport.addEventListener('dblclick', e => {
    const hit = pick(e, '[data-skill],[data-session],[data-pet]')
    if (!hit) return
    if (hit.dataset.pet !== undefined) hearts(e)
    else if (hit.dataset.skill) openDrawer('skills', hit.dataset.skill)
    else vscode.postMessage({ type: 'session', session: hit.dataset.session })
  })

  function click(e) {
    const hit = pick(e, '[data-egg],[data-skill],[data-session],[data-lab],[data-pet],[data-bag],[data-slot]')
    if (!hit) return
    if (hit.dataset.egg) return eggClick(hit, e)
    if (hit.dataset.slot) return playSlot(hit)
    if (hit.dataset.lab) return openDrawer('labs', hit.dataset.lab)
    if (hit.dataset.bag) return floatText(scenePoint(e), '🪰 ¡a la papelera!')
    if (hit.dataset.pet !== undefined) catClicks(hit, e)
    flashTag(keyOf(hit))
  }

  // hidden characters: Wally among the strollers, Santa crossing the Christmas night sky
  function eggClick(hit, e) {
    const p = scenePoint(e)
    if (hit.dataset.egg === 'wally') {
      floatText(p, '🔍 ¡Encontrado Wally!', 'big')
      beep([659, 784, 988], 0.09)
      return unlock('wally')
    }
    if (hit.dataset.egg === 'santa') {
      floatText(p, '🎅 ¡Jo, jo, jo!', 'big')
      beep([392, 494, 587, 784], 0.1)
      return unlock('santa')
    }
  }

  // the red button: it appears in the middle of nowhere (the path out of the side door) once every other medal is earned
  const RED_STEPS = [[10, 'red10'], [100, 'red100'], [1000, 'red1000'], [10000, 'red10000'], [77777, 'red77777']]
  // every medal but the button's own and the platinum one, which needs them
  const earnedAll = () => MEDALS.every(m => m[4] === 'button' || m[0] === 'all' || medals[m[0]])
  function renderRedButton() {
    let btn = overlay.querySelector('[data-redbutton]')
    if (!geo || !earnedAll()) return btn?.remove()
    if (!btn) {
      btn = document.createElementNS(SVG_NS, 'g')
      btn.setAttribute('data-redbutton', '1')
      btn.style.cursor = 'pointer'
      btn.innerHTML =
        '<title>No lo pulses</title><ellipse rx="15" ry="7" fill="#000" opacity=".28"/>' +
        '<path d="M-12 -1 v-5 a12 6 0 0 0 24 0 v5 a12 6 0 0 1 -24 0z" fill="#2E3238"/><ellipse cy="-6" rx="12" ry="6" fill="#4A4F57"/>' +
        '<g class="cap"><path d="M-8 -7 v-4 a8 4 0 0 0 16 0 v4 a8 4 0 0 1 -16 0z" fill="#9E1C1C"/><ellipse cy="-11" rx="8" ry="4" fill="#E23B3B"/><ellipse cx="-3" cy="-12" rx="3" ry="1.2" fill="#FFF" opacity=".55"/></g>' +
        '<text class="presses" y="-22" text-anchor="middle"></text>'
      // its own pointer handling: a press must not start a pan of the map
      btn.addEventListener('pointerdown', e => {
        e.stopPropagation()
        pressRed(btn)
      })
      overlay.appendChild(btn)
    }
    const p = iso(geo.W + 1.7, geo.H - 0.6)
    btn.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`)
    btn.querySelector('.presses').textContent = (medals['~red'] || 0).toLocaleString('es-ES')
  }
  function pressRed(btn) {
    const n = tally('red')
    btn.querySelector('.presses').textContent = n.toLocaleString('es-ES')
    const cap = btn.querySelector('.cap')
    cap.classList.remove('down')
    void cap.getBoundingClientRect()
    cap.classList.add('down')
    beep([RED_STEPS.some(([k]) => k === n) ? 880 : 196], 0.03)
    for (const [k, id] of RED_STEPS) if (n >= k) unlock(id)
    if (n === 77777) {
      const p = iso(geo.W + 1.7, geo.H - 0.6)
      floatText({ x: p.x, y: p.y - 40 }, '🎆 ¡77.777!', 'big')
      coinRain(p.x, p.y + 10)
    }
  }

  // casino slot machines: a click spins three reels over the machine; 777 is the jackpot (1 in 27)
  const REEL = ['🍒', '★', 'BAR', '🍋', '🔔']
  const spinning = new Set()
  function playSlot(machine) {
    const id = machine.dataset.slot
    if (spinning.has(id)) return
    spinning.add(id)
    const x = Number(machine.dataset.x)
    const y = Number(machine.dataset.y)
    const roll = () => (Math.random() < 1 / 3 ? '7' : REEL[Math.floor(Math.random() * REEL.length)])
    const result = [roll(), roll(), roll()]
    const g = document.createElementNS(SVG_NS, 'g')
    g.setAttribute('class', 'slotpop')
    g.setAttribute('pointer-events', 'none')
    g.setAttribute('transform', `translate(${x},${y - 30})`)
    g.innerHTML =
      '<g class="slot-in"><rect x="-33" y="-17" width="66" height="27" rx="4" fill="#2A211C" stroke="#E0B04A" stroke-width="2"/>' +
      [-21, 0, 21].map(cx => `<rect x="${cx - 9}" y="-13" width="18" height="19" rx="2" fill="#FFF8EE"/><text class="reel" x="${cx}" y="1" text-anchor="middle" font-size="11" font-weight="900" fill="#C8423A">7</text>`).join('') +
      '<path d="M-33 -4 h66" stroke="#C8423A" stroke-opacity=".25"/></g>'
    overlay.appendChild(g)
    const reels = [...g.querySelectorAll('.reel')]
    const show = (k, sym) => {
      reels[k].textContent = sym
      reels[k].setAttribute('font-size', sym === 'BAR' ? '7' : '11')
    }
    // two sevens on the first reels: the last one takes its time
    const near = result[0] === '7' && result[1] === '7'
    const stops = [650, 1050, near ? 2300 : 1450]
    const started = performance.now()
    // each reel flicks symbols on real time and slows down over its last 400 ms, then clicks into place
    const next = [0, 0, 0]
    const stopped = [false, false, false]
    reels.forEach(r => r.classList.add('spin'))
    const tick = now => {
      if (!g.isConnected) return
      const t = now - started
      reels.forEach((reel, k) => {
        if (stopped[k]) return
        if (t >= stops[k]) {
          stopped[k] = true
          show(k, result[k])
          reel.classList.remove('spin')
          reel.classList.add('stop')
          beep([660 + k * 110], 0.04)
          return
        }
        if (t < next[k]) return
        const slow = clamp((t - (stops[k] - 400)) / 400, 0, 1)
        next[k] = t + 60 + slow * slow * 160
        show(k, k === 2 && near && t > 1450 && Math.random() < 0.5 ? '7' : roll())
      })
      if (stopped.some(s => !s)) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    setTimeout(() => {
      const spins = tally('spins')
      if (spins >= 50) unlock('slot50')
      const jackpot = result.every(s => s === '7')
      if (jackpot) {
        g.classList.add('jackpot')
        floatText({ x, y: y - 52 }, '🎰 ¡¡777 · JACKPOT!!', 'big')
        coinRain(x, y)
        beep([523, 659, 784, 1047, 784, 1047, 1319], 0.1)
        unlock('slot777')
      } else if (result[0] === result[1] && result[1] === result[2]) {
        floatText({ x, y: y - 52 }, '¡Premio!')
        beep([784, 988], 0.08)
      } else {
        floatText({ x, y: y - 52 }, result.filter(s => s === '7').length === 2 ? '¡Casi! Dos sietes…' : 'Otra vez…')
      }
      setTimeout(() => {
        g.classList.add('out')
        setTimeout(() => {
          g.remove()
          spinning.delete(id)
        }, 220)
      }, jackpot ? 4000 : 1600)
    }, stops[2] + 120)
  }

  function coinRain(x, y) {
    if (calm()) return
    for (let k = 0; k < 18; k++) {
      const c = document.createElementNS(SVG_NS, 'circle')
      c.setAttribute('class', 'coin')
      c.setAttribute('cx', (x + (Math.random() - 0.5) * 20).toFixed(1))
      c.setAttribute('cy', (y - 30).toFixed(1))
      c.setAttribute('r', '2.6')
      c.setAttribute('fill', '#FFD34F')
      c.setAttribute('stroke', '#B8860B')
      c.style.setProperty('--dx', `${((Math.random() - 0.5) * 70).toFixed(1)}px`)
      c.style.animationDelay = `${(k * 0.07).toFixed(2)}s`
      overlay.appendChild(c)
      c.addEventListener('animationend', () => c.remove())
      setTimeout(() => c.remove(), 3200)
    }
  }

  // names stay hidden; a click shows one for a moment and the CSS transition fades it out
  const TAG_MS = 2500
  const shown = new Map()
  function flashTag(key) {
    clearTimeout(shown.get(key))
    shown.set(key, setTimeout(() => {
      shown.delete(key)
      findEl(key)?.querySelector('.tag')?.classList.remove('show')
    }, TAG_MS))
    findEl(key)?.querySelector('.tag')?.classList.add('show')
  }
  const reapplyTags = () => shown.forEach((_t, key) => findEl(key)?.querySelector('.tag')?.classList.add('show'))

  const keyOf = el =>
    el.dataset.bag ? `bag:${el.dataset.bag}` : el.dataset.pet !== undefined ? `pet:${el.dataset.pet}` : el.dataset.skill ? `skill:${el.dataset.skill}` : `session:${el.dataset.session}`
  const findEl = key => {
    const [kind, ...rest] = key.split(':')
    const id = CSS.escape(rest.join(':'))
    if (kind === 'bag') return overlay.querySelector(`[data-bag="${id}"]`)
    if (kind === 'pet') return scene.querySelector(`[data-pet="${id}"]`)
    return scene.querySelector(kind === 'skill' ? `[data-skill="${id}"]` : `[data-session="${id}"]`)
  }
  const hideHeld = () => held.forEach(k => findEl(k)?.style.setProperty('visibility', 'hidden'))
  const release = (key, seamless = false) => {
    held.delete(key)
    const el = findEl(key)
    if (!el) return
    el.style.removeProperty('visibility')
    if (seamless) return
    el.classList.remove('reappear')
    void el.getBoundingClientRect()
    el.classList.add('reappear')
    setTimeout(() => el.classList.remove('reappear'), 400)
  }

  const BAG_BODY = '<path d="M-7 0 q-2 -10 7 -12 q9 2 7 12 z" fill="#2B2B2E"/><path d="M-2.5 -11.5 l2.5 -4 l2.5 4" stroke="#2B2B2E" stroke-width="2.2" fill="none"/><path d="M-3.5 -6 q3.5 2 7 0" stroke="#5A5A60" stroke-width="1" fill="none"/>'
  const bagShape = `<ellipse rx="8" ry="3" fill="#000" opacity=".2"/>${BAG_BODY}`

  // the sprite without its own floor shadow, so the carried one can leave its shadow on the ground
  function spriteOf(kind, el) {
    if (kind === 'bag') return BAG_BODY
    const id = kind === 'pet' ? `pt-${el.dataset.coat || 'gris'}` : kind === 'session' ? 'ag' : 'ca'
    const color = kind === 'pet' ? '' : el.dataset.color || '#D97757'
    const def = scene.querySelector(`#${id}`)
    if (!def) return `<use href="#${id}"${color ? ` color="${color}"` : ''}></use>`
    const copy = def.cloneNode(true)
    copy.removeAttribute('id')
    const first = copy.firstElementChild
    if (first && first.tagName === 'ellipse' && first.getAttribute('fill') === '#000') first.remove()
    if (color) copy.setAttribute('color', color)
    return copy.outerHTML
  }

  // a carried character: .shadow stays on the ground, .lift/.tilt/.grow are driven from JS (attributes), .face holds
  // the facing, .body the CSS animations, .props the scene's accessories; one transform per element, none overridden
  const ghostInner = (sprite, alert = '!', alertY = -30) =>
    `<ellipse class="shadow" rx="10" ry="3.5"/><g class="lift"><g class="tilt"><g class="grow"><g class="face"><g class="body">${sprite}</g><g class="props"></g></g></g></g>` +
    `<text class="alert" y="${alertY}" text-anchor="middle">${alert}</text></g>`
  function makeGhost(kind, el, sprite) {
    const g = document.createElementNS(SVG_NS, 'g')
    g.setAttribute('class', `carry ${kind}`)
    g.innerHTML = ghostInner(sprite)
    overlay.appendChild(g)
    if (kind === 'pet') setFace(g, facingOf(el))
    return g
  }
  const place = (g, p) => g.setAttribute('transform', `translate(${p.x.toFixed(2)},${p.y.toFixed(2)})`)
  const LIFT = 9
  // height over the floor: the body rises, the shadow shrinks and fades
  function setLift(ghost, h) {
    ghost.querySelector('.lift')?.setAttribute('transform', `translate(0,${(-h).toFixed(2)})`)
    const sh = ghost.querySelector('.shadow')
    if (!sh) return
    const k = clamp(h / (LIFT * 2), 0, 1)
    sh.setAttribute('rx', (10 * (1 - 0.4 * k)).toFixed(2))
    sh.setAttribute('ry', (3.5 * (1 - 0.4 * k)).toFixed(2))
    sh.style.opacity = (0.24 - 0.12 * k).toFixed(3)
  }
  // where a scene sprite's feet are, in scene units, and how big it is drawn
  function feetOf(el) {
    const anchor = el.dataset.bag ? el : el.querySelector('use') || el
    const m = anchor.getScreenCTM?.()
    if (!m) return null
    return { ...scenePoint({ clientX: m.e, clientY: m.f }), s: Math.hypot(m.a, m.b) / view.scale || 1 }
  }
  const setFace = (g, dir) => {
    g.dataset.dir = dir < 0 ? '-1' : '1'
    g.querySelector('.face')?.setAttribute('transform', dir < 0 ? 'scale(-1,1)' : 'scale(1,1)')
  }
  // which way a patrolling cat looks right now: the sign of its facing group's current matrix
  function facingOf(el) {
    const m = el.querySelector(':scope > g')?.getCTM?.()
    return m && m.a < 0 ? -1 : 1
  }

  // picked up where it was grabbed: the feet keep their offset from the pointer, so nothing jumps on the first move
  function startGrab(el, e, p) {
    const kind = el.dataset.bag ? 'bag' : el.dataset.pet !== undefined ? 'pet' : el.dataset.skill ? 'skill' : 'session'
    const key = keyOf(el)
    const feet = p.feet || { ...p.at, s: 1 }
    const off = { x: feet.x - p.at.x, y: feet.y - p.at.y }
    const sprite = spriteOf(kind, el)
    const ptr = scenePoint(e)
    grab = {
      key,
      kind,
      id: el.dataset.bag || el.dataset.skill || el.dataset.session || el.dataset.pet,
      home: el.dataset.home ? el.dataset.home.split(',').map(Number) : null,
      asleep: el.dataset.asleep === '1',
      ghost: makeGhost(kind, el, sprite),
      sprite,
      name: el.dataset.name || '',
      held: true,
      off,
      // the body swings from the grabbed point
      pivot: { x: -off.x, y: -off.y },
      ptr,
      prev: ptr,
      lift: 0,
      liftV: 0,
      ang: 0,
      angV: 0,
      vx: 0,
      grow: feet.s,
    }
    grab.ghost.classList.add('held')
    held.add(key)
    hideHeld()
    pose(grab)
    physics(grab)
    beep(kind === 'bag' ? [220, 180] : [660, 990], 0.05)
    if (kind === 'skill' && grab.asleep) unlock('wake')
  }

  function pose(g) {
    if (g.held) place(g.ghost, { x: g.ptr.x + g.off.x, y: g.ptr.y + g.off.y + g.lift })
    setLift(g.ghost, g.lift)
    g.ghost.querySelector('.tilt')?.setAttribute('transform', `rotate(${g.ang.toFixed(2)} ${g.pivot.x.toFixed(1)} ${g.pivot.y.toFixed(1)})`)
    g.ghost.querySelector('.grow')?.setAttribute('transform', `scale(${g.grow.toFixed(3)})`)
  }

  // lift, pendulum swing from the pointer's speed, then the fall with a small bounce; all on real time (dt)
  function physics(g) {
    let last = performance.now()
    let landed = false
    const step = now => {
      if (!g.ghost.isConnected || g.frozen) return
      const dt = Math.min(0.04, (now - last) / 1000)
      last = now
      if (dt <= 0) return requestAnimationFrame(step)
      const ease = 1 - Math.exp(-dt * 16)
      g.grow += (1 - g.grow) * ease
      if (g.held) {
        g.lift += (LIFT - g.lift) * ease
        g.vx += ((g.ptr.x - g.prev.x) / dt - g.vx) * (1 - Math.exp(-dt * 14))
        g.prev = g.ptr
      } else {
        g.vx *= Math.exp(-dt * 10)
        if (!landed) {
          g.liftV -= 2400 * dt
          g.lift += g.liftV * dt
          if (g.lift <= 0) {
            g.lift = 0
            g.liftV = -g.liftV * 0.3
            if (g.liftV < 40 || calm()) {
              g.liftV = 0
              landed = true
              g.onLand?.()
            }
          }
        }
      }
      const target = g.held && !calm() ? clamp(g.vx * 0.06, -28, 28) : 0
      for (let k = 0; k < 2; k++) {
        const h = dt / 2
        g.angV += (140 * (target - g.ang) - 9 * g.angV) * h
        g.ang += g.angV * h
      }
      if (calm()) g.ang = g.angV = 0
      pose(g)
      if (landed && Math.abs(g.ang) < 0.2 && Math.abs(g.angV) < 4) {
        g.ang = 0
        return pose(g)
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  function binUnder(e) {
    for (const bin of scene.querySelectorAll('[data-bin]')) {
      const r = bin.getBoundingClientRect()
      const pad = 14 * view.scale
      if (e.clientX >= r.left - pad && e.clientX <= r.right + pad && e.clientY >= r.top - pad && e.clientY <= r.bottom + pad) return bin
    }
    return null
  }

  function moveGrab(e) {
    grab.ptr = scenePoint(e)
    pose(grab)
    const bin = binUnder(e)
    scene.querySelectorAll('[data-bin]').forEach(b => b.classList.toggle('hot', b === bin))
  }

  function releaseGrab(e) {
    const g = grab
    grab = null
    scene.querySelectorAll('[data-bin].hot').forEach(b => b.classList.remove('hot'))
    g.ghost.classList.remove('held')
    g.ptr = scenePoint(e)
    pose(g)
    g.held = false
    const bin = binUnder(e)
    if (bin) return binIt(g, bin)
    // it lands right on its shadow
    const drop = posOf(g.ghost)
    g.onLand = () => {
      beep([g.kind === 'bag' ? 160 : 520], 0.04)
      g.ghost.classList.add('landed')
      setTimeout(() => afterLanding(g, drop), calm() ? 0 : 300)
    }
  }

  function afterLanding(g, drop) {
    if (!g.ghost.isConnected) return
    if (g.kind === 'bag') {
      const tile = tileOf(drop)
      bags = bags.map(b => (b.id === g.id ? { ...b, x: tile.x, y: tile.y } : b))
      persist()
      g.ghost.remove()
      held.delete(g.key)
      return renderBags()
    }
    if (g.kind === 'pet') return catReaction(g, drop)
    if (!g.home) return finish(g)
    const path = route(tileOf(drop), { x: g.home[0], y: g.home[1] })
    // tileOf clamps to the map: start from where it really stands
    path[0] = drop
    walk(g, path, () => finish(g))
  }

  // the ghost fades out while the scene's own character fades back in
  function finish(g, seamless = false) {
    release(g.key, seamless)
    if (seamless || calm()) return g.ghost.remove()
    g.ghost.classList.add('leaving')
    setTimeout(() => g.ghost.remove(), 260)
  }

  const posOf = el => {
    const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(el.getAttribute('transform') || '')
    return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 }
  }
  // where the hidden scene cat is right now: its patrol keeps running while the ghost is out
  function petPos(key) {
    const m = findEl(key)?.getScreenCTM?.()
    return m ? scenePoint({ clientX: m.e, clientY: m.f }) : null
  }

  // a loose cat walks back to its patrolling self and swaps with it on the spot, so it never jumps
  function rejoin(g) {
    if (!g.ghost.isConnected) return
    const to = petPos(g.key)
    if (!to) return finish(g)
    g.ghost.setAttribute('class', 'carry pet')
    g.ghost.querySelector('.props').innerHTML = ''
    const from = posOf(g.ghost)
    const path = route(tileOf(from), tileOf(to))
    path[0] = from
    walk(g, path, () => chase(g))
  }

  // the patrol moved on while we walked: catch up in a straight line, or route again if it turned a corner
  function chase(g) {
    g.ghost.classList.add('walking')
    let last = performance.now()
    const step = now => {
      if (!g.ghost.isConnected) return
      const to = petPos(g.key)
      if (!to) return finish(g)
      const p = posOf(g.ghost)
      const dx = to.x - p.x
      const dy = to.y - p.y
      const d = Math.hypot(dx, dy)
      const max = WALK_SPEED * Math.min(0.05, (now - last) / 1000)
      last = now
      if (d <= Math.max(max, 1)) {
        place(g.ghost, to)
        return finish(g, true)
      }
      if (d > 60) return rejoin(g)
      if (Math.abs(dx) > 0.5) setFace(g.ghost, Math.sign(dx))
      place(g.ghost, { x: p.x + (dx / d) * max, y: p.y + (dy / d) * max })
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  function walk(g, path, done, speed = WALK_SPEED) {
    g.ghost.classList.remove('landed')
    g.ghost.classList.add('walking')
    const segs = []
    let total = 0
    for (let i = 1; i < path.length; i++) {
      const len = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
      segs.push({ a: path[i - 1], b: path[i], len })
      total += len
    }
    const start = performance.now()
    let facingNow = Number(g.ghost.dataset.dir || 1)
    const step = now => {
      if (!g.ghost.isConnected) return
      let d = ((now - start) / 1000) * speed
      if (d >= total) {
        place(g.ghost, path[path.length - 1])
        g.ghost.classList.remove('walking')
        if (g.asleep) beep([392, 330], 0.1)
        return done()
      }
      for (const s of segs) {
        if (d <= s.len) {
          const k = s.len ? d / s.len : 1
          const dx = s.b.x - s.a.x
          if (Math.abs(dx) > 0.5 && Math.sign(dx) !== facingNow) setFace(g.ghost, (facingNow = Math.sign(dx)))
          place(g.ghost, { x: s.a.x + dx * k, y: s.a.y + (s.b.y - s.a.y) * k })
          break
        }
        d -= s.len
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  // into a bin: skills and sessions stop, bags are gone, cats make a scene of it
  function binIt(g, bin) {
    const r = bin.getBoundingClientRect()
    const target = scenePoint({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })
    // the swing stops where it is; the bin's mouth is mapped into the body's own (tilted, maybe flipped) frame
    g.frozen = true
    const face = g.ghost.querySelector('.face')
    const body = g.ghost.querySelector('.body')
    const m = face?.getCTM?.()
    const to = m ? new DOMPoint(target.x, target.y).matrixTransform(m.inverse()) : { x: 0, y: 0 }
    const bb = body?.getBBox?.() || { x: 0, y: 0, width: 0, height: 0 }
    g.ghost.style.setProperty('--tx', `${(to.x - (bb.x + bb.width / 2)).toFixed(1)}px`)
    g.ghost.style.setProperty('--ty', `${(to.y - (bb.y + bb.height)).toFixed(1)}px`)
    g.ghost.classList.add('binned')
    bin.classList.add('gulp')
    setTimeout(() => bin.classList.remove('gulp'), 700)
    if (g.kind === 'bag') {
      bags = bags.filter(b => b.id !== g.id)
      thrown++
      persist()
      unlock('bag')
      if (thrown >= 10) unlock('bags10')
      beep([523, 784], 0.07)
      floatText(target, `+1 🗑 (${thrown})`)
      updateStats()
      setTimeout(() => {
        g.ghost.remove()
        held.delete(g.key)
        renderBags()
      }, 450)
      return
    }
    if (g.kind !== 'pet') {
      unlock('stop')
      beep([300, 200], 0.09)
      vscode.postMessage({ type: 'trash', kind: g.kind, id: g.id })
      setTimeout(() => finish(g), 450)
      return
    }
    // the cat rattles the bin, then bursts out and lands nearby
    unlock('bin-cat')
    setTimeout(() => {
      bin.classList.add('rattle')
      beep([520, 700, 520, 700], 0.07)
    }, 450)
    setTimeout(() => {
      bin.classList.remove('rattle')
      g.ghost.classList.remove('binned')
      g.ghost.innerHTML = ghostInner(g.sprite, '¡miau!', -26)
      setFace(g.ghost, 1)
      const out = bin.dataset.bin === 'out'
      const land = iso(out ? Math.round(geo.W * 0.55) + 2.5 : 3, out ? geo.H + 1.2 : corridorY())
      g.ghost.style.setProperty('--fx', `${(target.x - land.x).toFixed(1)}px`)
      g.ghost.style.setProperty('--fy', `${(target.y - land.y).toFixed(1)}px`)
      place(g.ghost, land)
      g.ghost.classList.add('popout')
      beep([880, 660, 990], 0.08)
      // shakes the rubbish off, then walks back to its round
      setTimeout(() => {
        g.ghost.classList.replace('popout', 'shakeoff')
        g.ghost.querySelector('.props').innerHTML = '<g class="p-crumbs"><rect x="-9" y="-12" width="2" height="2" fill="#8C857C"/><rect x="8" y="-14" width="2" height="2" fill="#6E6A66"/><rect x="-2" y="-17" width="2" height="1.6" fill="#B9B2A8"/></g>'
        beep([1200, 1000, 1200], 0.05)
      }, 1150)
      setTimeout(() => rejoin(g), 1900)
    }, 1500)
  }

  // ---------- cats ----------

  const REACTIONS = {
    gym: {
      text: '💪 ¡a sudar!', cls: 'r-gym', ms: 2800, sound: [523, 659, 523, 659],
      props: '<g class="p-lift"><rect x="-9" y="-24.5" width="22" height="2.6" fill="#55595F"/><rect x="-12" y="-28" width="4.5" height="9.5" fill="#1C1E22"/><rect x="11.5" y="-28" width="4.5" height="9.5" fill="#1C1E22"/></g>' +
        '<ellipse class="p-drip" cx="-4" cy="-14" rx="1.2" ry="1.9" fill="#7FD0FF"/><ellipse class="p-drip d2" cx="12" cy="-13" rx="1.1" ry="1.7" fill="#7FD0FF"/>',
    },
    cafe: {
      text: '🥛 slurp…', cls: 'r-sip', ms: 2800, sound: [660, 620, 660],
      props: '<ellipse cx="16" cy="-0.5" rx="6.5" ry="2.6" fill="#FFFFFF" stroke="#8FA7B8" stroke-width=".8"/><ellipse class="p-milk" cx="16" cy="-1.2" rx="4.6" ry="1.4" fill="#EEF3F7"/>' +
        '<circle class="p-splash" cx="14" cy="-4" r="1" fill="#FFFFFF"/><circle class="p-splash d2" cx="18" cy="-4" r=".8" fill="#FFFFFF"/>',
    },
    library: {
      text: '📚 ¡plof!', cls: 'r-knock', ms: 2600, sound: [784, 392],
      props: '<g class="p-fall"><rect x="-14" y="-10" width="10" height="7" fill="#4F8FCB"/><rect x="-14" y="-10" width="10" height="1.6" fill="#FFFFFF"/><rect x="-14" y="-10" width="1.6" height="7" fill="#2F5F8B"/></g>' +
        '<g class="p-dust"><circle cx="-12" cy="-1" r="3" fill="#CFC7BA"/><circle cx="-6" cy="-2" r="2.4" fill="#CFC7BA"/><circle cx="-16" cy="-2" r="2" fill="#CFC7BA"/></g>',
    },
    arcade: {
      text: '🌈 nyan~', cls: 'r-nyan', ms: 2600, sound: [1047, 1175, 1319, 1175], move: 70,
      props: '<g class="p-rainbow">' + ['#FF4F4F', '#FF9F3D', '#FFE34F', '#6BE36B', '#4FB8FF', '#A06BFF'].map((c, k) => `<rect x="-34" y="${-12 + k * 1.6}" width="26" height="1.7" fill="${c}"/>`).join('') + '</g>' +
        '<text class="p-star" x="-30" y="-18" font-size="6" fill="#FFE34F">★</text><text class="p-star d2" x="-18" y="-20" font-size="5" fill="#FFFFFF">✦</text>',
    },
    lab: {
      text: '🧪 ¡bum!', cls: 'r-boom', ms: 2600, sound: [196, 147, 110],
      props: '<g class="p-puff"><circle cx="4" cy="-12" r="9" fill="#B8D8B0"/><circle cx="-4" cy="-8" r="7" fill="#9FC79A"/><circle cx="11" cy="-7" r="6" fill="#CFE6C8"/></g>',
    },
    dorm: {
      text: '😴 zzz', cls: 'r-nap', ms: 4200, sound: [330, 262, 196],
      props: '<text class="p-z" x="10" y="-14" font-size="7" fill="#8C7A66">z</text><text class="p-z d2" x="13" y="-18" font-size="8" fill="#8C7A66">z</text><text class="p-z d3" x="16" y="-22" font-size="9" fill="#8C7A66">Z</text>',
    },
    patio: {
      text: '🌸 ¡mariposa!', cls: 'r-pounce', ms: 2800, sound: [880, 988, 1175],
      props: '<text class="p-butterfly" x="14" y="-26" font-size="9">🦋</text>',
    },
    corridor: {
      text: '🐾 …', cls: 'r-groom', ms: 2400, sound: [660, 784],
      props: '<ellipse class="p-lick" cx="11" cy="-6" rx="1.6" ry="1" fill="#F2A3A3"/>',
    },
    street: {
      text: '', cls: 'r-street', ms: 0, sound: [660], props: '', run: (g, at, done) => passCar(g, at, done),
    },
    smoking: {
      text: '😮‍💨 ¡cof, cof!', cls: 'r-cough', ms: 2600, sound: [220, 196, 220, 196],
      props: '<g class="p-smog"><circle cx="-6" cy="-14" r="6" fill="#CFC9BF"/><circle cx="4" cy="-18" r="7" fill="#DAD5CC"/><circle cx="12" cy="-12" r="5" fill="#C7C1B6"/></g>',
    },
    joseluis: {
      text: '🚬 ¡Hombre, José Luis!', cls: 'r-chill', ms: 3600, sound: [392, 330, 392, 494, 392],
      props: '<rect x="10" y="-9.4" width="6" height="1.6" fill="#F4F1EA"/><rect x="16" y="-9.4" width="1.4" height="1.6" fill="#FF8A3D"/>' +
        '<ellipse class="p-ring" cx="18" cy="-14" rx="3" ry="1.6" fill="none" stroke="#E2DDD4" stroke-width="1.2"/><ellipse class="p-ring d2" cx="18" cy="-14" rx="3" ry="1.6" fill="none" stroke="#E2DDD4" stroke-width="1.2"/>',
    },
    military: {
      text: '🎖️ ¡a sus órdenes!', cls: 'r-salute', ms: 2800, sound: [392, 523, 659, 784],
      props: '<g class="p-helmet"><rect x="5" y="-18" width="9" height="2.6" fill="#3F4A2A"/><rect x="5.8" y="-20.2" width="7.4" height="2.4" fill="#4A5535"/></g><rect class="p-paw" x="12" y="-14" width="2" height="5" fill="#6B7A4A"/>',
    },
    greenhouse: {
      text: '🌼 ¡a-a-achís!', cls: 'r-sneeze', ms: 2800, sound: [523, 587, 659, 196],
      props: '<g class="p-plant"><rect x="15" y="-6" width="7" height="6" fill="#B8643A"/><rect x="14" y="-7" width="9" height="1.8" fill="#D07A4A"/><rect x="18" y="-15" width="1.2" height="9" fill="#4E9A3E"/><rect x="15.5" y="-11" width="3" height="1.4" fill="#6BBF4E"/><circle cx="18.6" cy="-16.5" r="2.6" fill="#FFD84F"/><circle cx="18.6" cy="-16.5" r="1.1" fill="#C8742A"/></g>' +
        '<circle class="p-pollen" cx="15" cy="-17" r=".9" fill="#FFE98A"/><circle class="p-pollen d2" cx="13" cy="-15" r=".8" fill="#FFE98A"/><circle class="p-pollen d3" cx="16" cy="-13" r=".7" fill="#FFE98A"/>',
    },
    music: {
      text: '🎸 ¡miau-rock!', cls: 'r-rock', ms: 3000, sound: [330, 392, 440, 392, 494, 440],
      props: '<g class="p-guitar"><rect x="-3" y="-9" width="7" height="5" rx="2" fill="#C8423A"/><rect x="-1" y="-8" width="2" height="2" fill="#2E2B2A"/><rect x="4" y="-8" width="10" height="1.4" fill="#8C5A2E"/><rect x="13" y="-9" width="2.4" height="3" fill="#2E2B2A"/></g>' +
        '<text class="p-note" x="12" y="-20" font-size="7" fill="#FFE34F">♪</text><text class="p-note d2" x="4" y="-22" font-size="6" fill="#7FD0FF">♫</text><text class="p-note d3" x="16" y="-24" font-size="6" fill="#FF8AC8">♪</text>',
    },
    space: {
      text: '🚀 un pequeño paso gatuno', cls: 'r-float', ms: 3400, sound: [262, 392, 523, 784],
      props: '<g class="p-bubble"><circle cx="9" cy="-12" r="6.5" fill="#CFE8F5" fill-opacity=".28" stroke="#E8F4FA" stroke-width="1"/><rect x="5.5" y="-16" width="2" height="1.2" fill="#FFFFFF" opacity=".7"/></g>' +
        '<text class="p-star" x="-16" y="-20" font-size="5" fill="#FFFFFF">✦</text><text class="p-star d2" x="18" y="-26" font-size="4" fill="#FFE34F">★</text><text class="p-star d3" x="-6" y="-28" font-size="4" fill="#FFFFFF">✦</text>',
    },
    kitchen: {
      text: '🐟 ¡pescado robado!', cls: 'r-steal', ms: 2600, sound: [784, 988, 784, 1175], move: 60,
      props: '<g class="p-fish"><ellipse cx="14" cy="-9" rx="4" ry="1.8" fill="#9DB8C8"/><path d="M17.5,-9 L21,-11.4 L21,-6.6 Z" fill="#7F9DB0"/><rect x="11.4" y="-9.8" width="1" height="1" fill="#1C1E22"/></g>' +
        '<text class="p-star" x="-10" y="-18" font-size="6" fill="#FFFFFF">💨</text>',
    },
    beach: {
      text: '🍹 modo vacaciones', cls: 'r-tan', ms: 3600, sound: [392, 494, 587, 494, 392],
      props: '<g class="p-parasol"><rect x="-12.6" y="-24" width="1.2" height="24" fill="#E8D8BE"/><path d="M-26,-22 Q-12,-34 2,-22 Z" fill="#FF6B5A"/><path d="M-19,-22 Q-12,-32 -5,-22 Z" fill="#FFF3D6"/></g>' +
        '<g class="p-shades"><rect x="6.5" y="-13" width="2.8" height="1.8" fill="#1C1E22"/><rect x="9.8" y="-13" width="2.8" height="1.8" fill="#1C1E22"/><rect x="9" y="-12.6" width="1" height=".6" fill="#1C1E22"/></g>' +
        '<g class="p-drink"><path d="M15,-7 L21,-7 L18.6,-3 L17.4,-3 Z" fill="#FF9F3D"/><rect x="17.6" y="-3" width=".8" height="3" fill="#E8F4FA"/><rect x="19" y="-10" width=".7" height="3.5" fill="#4FB8FF"/><circle cx="15.6" cy="-7.4" r="1.1" fill="#6BE36B"/></g>',
    },
    casino: {
      text: '🎰 ¡JACKPOT!', cls: 'r-jackpot', ms: 3000, sound: [784, 988, 1175, 1568, 1175, 1568],
      props: [[-12, 0], [-4, 0.3], [5, 0.6], [13, 0.15], [-8, 0.75], [9, 0.45]].map(([x, d]) => `<circle class="p-coin" cx="${x}" cy="-26" r="2.3" fill="#FFD84F" stroke="#C8962A" stroke-width=".7" style="animation-delay:${d}s"/>`).join('') +
        '<text class="p-star" x="-16" y="-20" font-size="6" fill="#FFE34F">$</text><text class="p-star d2" x="16" y="-22" font-size="6" fill="#FFE34F">$</text>',
    },
  }

  // where the scene makes sense: a free piece of furniture in the room, a lower bunk, the corridor's middle line,
  // the kerb (so the car passes in front of the cat, on the road)
  function spotFor(drop) {
    const t = tileOf(drop)
    if (outside(t)) return iso(Math.min(geo.W + 2, Math.max(-2, t.x)), geo.H + 1.25)
    const room = roomAt(t)
    if (!room) return iso(Math.min(geo.W - 1, Math.max(1, t.x)), corridorY())
    const spots = (geo.catSpots || []).filter(sp => sp.room === room.id)
    if (!spots.length) return drop
    return spots.reduce((best, sp) => (Math.hypot(sp.x - drop.x, sp.y - drop.y) < Math.hypot(best.x - drop.x, best.y - drop.y) ? sp : best))
  }

  // a short arc from where the cat was let go to its spot
  function hop(g, from, to, done) {
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    if (dist < 2) return done()
    if (Math.abs(to.x - from.x) > 1) setFace(g.ghost, Math.sign(to.x - from.x))
    const ms = Math.min(650, 220 + dist * 2.2)
    const height = Math.min(34, 10 + dist * 0.25)
    const start = performance.now()
    g.ghost.classList.remove('landed')
    // the shadow glides along the floor while the cat arcs over it
    const step = now => {
      if (!g.ghost.isConnected) return
      const k = Math.min(1, (now - start) / ms)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      place(g.ghost, { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e })
      setLift(g.ghost, Math.sin(Math.PI * k) * height)
      if (k < 1) return requestAnimationFrame(step)
      g.ghost.classList.add('landed')
      beep([700], 0.05)
      setTimeout(done, calm() ? 0 : 300)
    }
    requestAnimationFrame(step)
  }

  function catReaction(g, drop) {
    const zone = zoneOf(tileOf(drop))
    const spot = spotFor(drop)
    hop(g, drop, spot, () => playReaction(g, { x: spot.x, y: spot.y }, zone))
  }

  const isJoseLuis = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim() === 'jose luis'

  function playReaction(g, drop, zone) {
    // José Luis knows this room: he lights up instead of coughing
    if (zone === 'smoking' && isJoseLuis(g.name || '')) {
      unlock('joseluis')
      zone = 'joseluis'
    }
    const r = REACTIONS[zone] || REACTIONS.corridor
    g.ghost.querySelector('.alert').textContent = r.text
    g.ghost.querySelector('.props').innerHTML = r.props
    g.ghost.classList.remove('landed')
    g.ghost.classList.add('react', r.cls)
    beep(r.sound, 0.09)
    unlock(`r-${zone === 'joseluis' ? 'smoking' : REACTIONS[zone] ? zone : 'corridor'}`)
    const leave = () => rejoin(g)
    if (r.run) return r.run(g, drop, leave)
    if (!r.move) return setTimeout(leave, r.ms)
    // the nyan cat dashes along, rainbow and all, in the way it faces
    const dir = Number(g.ghost.dataset.dir || 1)
    setTimeout(() => walk(g, [drop, { x: drop.x + dir * r.move, y: drop.y }], leave, 60), 350)
  }

  // the street scare: a vehicle that fits the world comes down its lane, brakes and swerves with its horn, the cat
  // jumps, it drives off. Vehicles are drawn in true isometric (length along x, width along y, height in px)
  const smooth = t => {
    const k = Math.min(1, Math.max(0, t))
    return k * k * (3 - 2 * k)
  }
  const TILE_PX = Math.hypot(18, 9)
  const vp = (x, y, z = 0) => `${((x - y) * 18).toFixed(1)},${((x + y) * 9 - z).toFixed(1)}`
  const vpoly = (pts, fill, extra = '') => `<polygon points="${pts.map(p => vp(...p)).join(' ')}" fill="${fill}"${extra}/>`
  // an axis-aligned block: only the faces this view sees (near side, front end, top)
  const vbox = (x0, x1, y0, y1, z0, z1, top, side, end, extra = '') =>
    vpoly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], side, extra) +
    vpoly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], end, extra) +
    vpoly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top, extra)
  const vshadow = (x0, x1, y0, y1) => vpoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], '#000', ' opacity=".24"')
  const ring = (x, y, r, zc, k = 1) => Array.from({ length: 16 }, (_v, i) => [x + ((r * k) / TILE_PX) * Math.cos((i / 16) * Math.PI * 2), y, zc + r * k * Math.sin((i / 16) * Math.PI * 2)])
  // a wheel standing along the road; its spokes are redrawn every frame from the distance driven
  const vwheel = (x, y, r, tire = '#232323', rim = '#9A9A9A') =>
    vpoly(ring(x, y, r, r), tire) + vpoly(ring(x, y, r, r, 0.55), rim) +
    `<path class="spokes" data-w="${x},${y},${r}" stroke="${tire}" stroke-width="${Math.max(0.8, r * 0.22).toFixed(1)}" fill="none"/>`
  function spinWheels(car, turn) {
    car.querySelectorAll('.spokes').forEach(s => {
      const [x, y, r] = s.dataset.w.split(',').map(Number)
      let d = ''
      for (let k = 0; k < 3; k++) {
        const a = turn + (k * Math.PI) / 3
        const dx = ((r * 0.52) / TILE_PX) * Math.cos(a)
        const dz = r * 0.52 * Math.sin(a)
        d += `M${vp(x + dx, y, r + dz)}L${vp(x - dx, y, r - dz)}`
      }
      s.setAttribute('d', d)
    })
  }
  const person = (x, y, z, jacket, head = '#F2C29B', hat = '') =>
    vbox(x - 0.1, x + 0.1, y - 0.12, y + 0.12, z, z + 6, jacket, jacket, jacket, ' stroke="#00000033" stroke-width=".4"') +
    vbox(x - 0.07, x + 0.07, y - 0.08, y + 0.08, z + 6, z + 10, head, head, head) + (hat ? vbox(x - 0.09, x + 0.09, y - 0.1, y + 0.1, z + 9.4, z + 11.4, hat, hat, hat) : '')

  function carShape() {
    const y0 = -0.5
    const y1 = 0.5
    let s = vshadow(-1.3, 1.3, -0.62, 0.66)
    s += vwheel(-0.72, y0, 3.4) + vwheel(0.72, y0, 3.4)
    s += vbox(-1.15, 1.15, y0, y1, 2.6, 8, '#E2685C', '#C8423A', '#A9352E')
    // trim: dark sill, light shoulder line, door seams and handles
    s += vpoly([[-1.15, y1, 2.6], [1.15, y1, 2.6], [1.15, y1, 3.8], [-1.15, y1, 3.8]], '#8E2F29')
    s += vpoly([[-1.15, y1, 7.3], [1.15, y1, 7.3], [1.15, y1, 8], [-1.15, y1, 8]], '#E9806F')
    s += `<path d="M${vp(-0.12, y1, 3.8)}L${vp(-0.12, y1, 7.3)}M${vp(0.62, y1, 3.8)}L${vp(0.62, y1, 7.3)}" stroke="#8E2F29" stroke-width=".7"/>`
    s += vpoly([[0.18, y1, 6.2], [0.36, y1, 6.2], [0.36, y1, 6.8], [0.18, y1, 6.8]], '#F4F1EA') + vpoly([[-0.62, y1, 6.2], [-0.44, y1, 6.2], [-0.44, y1, 6.8], [-0.62, y1, 6.8]], '#F4F1EA')
    // front: bumper, grille, headlights; rear light on the side
    s += vpoly([[1.15, y0, 2.6], [1.15, y1, 2.6], [1.15, y1, 3.8], [1.15, y0, 3.8]], '#5E211D')
    s += vpoly([[1.15, -0.18, 4.4], [1.15, 0.18, 4.4], [1.15, 0.18, 6], [1.15, -0.18, 6]], '#3A1A17')
    s += vpoly([[1.15, -0.44, 5], [1.15, -0.24, 5], [1.15, -0.24, 6.6], [1.15, -0.44, 6.6]], '#FFF3B0') + vpoly([[1.15, 0.24, 5], [1.15, 0.44, 5], [1.15, 0.44, 6.6], [1.15, 0.24, 6.6]], '#FFF3B0')
    s += vpoly([[-1.15, y1, 5.4], [-1.02, y1, 5.4], [-1.02, y1, 7], [-1.15, y1, 7]], '#FF5B4E')
    // cabin with a raked windscreen, glass inset in the side
    const cy0 = -0.42
    const cy1 = 0.42
    s += vpoly([[-0.7, cy1, 8], [0.45, cy1, 8], [0.18, cy1, 13.6], [-0.56, cy1, 13.6]], '#C8423A')
    s += vpoly([[-0.6, cy1, 8.6], [-0.12, cy1, 8.6], [-0.12, cy1, 12.9], [-0.5, cy1, 12.9]], '#7FB2D1') + vpoly([[-0.02, cy1, 8.6], [0.36, cy1, 8.6], [0.14, cy1, 12.9], [-0.02, cy1, 12.9]], '#7FB2D1')
    s += vpoly([[0.45, cy0, 8], [0.45, cy1, 8], [0.18, cy1, 13.6], [0.18, cy0, 13.6]], '#BFE0F2')
    s += vpoly([[0.42, cy0 + 0.05, 8.6], [0.42, cy0 + 0.2, 8.6], [0.22, cy0 + 0.2, 12.8], [0.22, cy0 + 0.05, 12.8]], '#FFFFFF', ' opacity=".55"')
    s += vpoly([[-0.56, cy0, 13.6], [0.18, cy0, 13.6], [0.18, cy1, 13.6], [-0.56, cy1, 13.6]], '#E2685C')
    s += vwheel(-0.72, y1 + 0.01, 3.4) + vwheel(0.72, y1 + 0.01, 3.4)
    return s
  }

  function boatShape() {
    // deck outline (pointed bow at +x) and a narrower waterline below it
    const deck = [[-1.25, -0.46], [0.55, -0.46], [1.35, 0], [0.55, 0.46], [-1.25, 0.46]]
    const water = [[-1.15, -0.38], [0.5, -0.38], [1.1, 0], [0.5, 0.38], [-1.15, 0.38]]
    const D = 6
    let s = vpoly(water.map(([x, y]) => [x * 1.12, y * 1.3, 0]), '#F4FBFF', ' opacity=".75"')
    s += vpoly([[water[4][0], water[4][1], 0], [water[3][0], water[3][1], 0], [deck[3][0], deck[3][1], D], [deck[4][0], deck[4][1], D]], '#F4F1EA')
    s += vpoly([[water[3][0], water[3][1], 0], [water[2][0], water[2][1], 0], [deck[2][0], deck[2][1], D], [deck[3][0], deck[3][1], D]], '#DCD6CB')
    // a coloured stripe under the gunwale
    const at = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, k * D]
    const w4 = [...water[4], 0]
    const w3 = [...water[3], 0]
    const w2 = [...water[2], 0]
    const d4 = [...deck[4], D]
    const d3 = [...deck[3], D]
    const d2 = [...deck[2], D]
    s += vpoly([at(w4, d4, 0.62), at(w3, d3, 0.62), at(w3, d3, 0.82), at(w4, d4, 0.82)], '#2F6FB0') + vpoly([at(w3, d3, 0.62), at(w2, d2, 0.62), at(w2, d2, 0.82), at(w3, d3, 0.82)], '#245A92')
    s += vpoly(deck.map(([x, y]) => [x, y, D]), '#C8A06A') + vpoly(deck.map(([x, y]) => [x * 0.86, y * 0.78, D]), '#B58C58')
    // outboard motor, console with its screen, the skipper in a life jacket
    s += vbox(-1.5, -1.25, -0.13, 0.13, 3, 10, '#4A4642', '#2E2B2A', '#3A3634')
    s += vbox(-0.15, 0.2, -0.24, 0.24, D, D + 5, '#F4F1EA', '#E2DDD4', '#CFC9BF')
    s += vpoly([[0.2, -0.22, D + 5], [0.2, 0.22, D + 5], [0.05, 0.22, D + 9], [0.05, -0.22, D + 9]], '#BFE0F2', ' opacity=".8"')
    s += person(-0.4, 0, D, '#FF8A3D', '#F2C29B', '#F4F1EA')
    return s
  }

  function roverShape() {
    const y0 = -0.55
    const y1 = 0.55
    let s = vshadow(-1.05, 1.05, -0.65, 0.7)
    for (const x of [-0.72, 0, 0.72]) s += vwheel(x, y0, 3, '#4A4A50', '#B8B8C0')
    s += vbox(-0.95, 0.95, -0.45, 0.45, 5, 9.5, '#F0F0F2', '#C9C9D0', '#B3B3BC')
    s += vpoly([[-0.95, 0.45, 5.6], [0.95, 0.45, 5.6], [0.95, 0.45, 7], [-0.95, 0.45, 7]], '#D9A93A')
    // rocker arms down to the near wheels
    s += `<path d="M${vp(-0.72, y1, 3)}L${vp(0, 0.45, 6)}L${vp(0.72, y1, 3)}M${vp(0, 0.45, 6)}L${vp(0, y1, 3)}" stroke="#6E6E78" stroke-width="1.2" fill="none"/>`
    // solar deck, mast and a camera head with two lenses: half rover, half robot
    s += vbox(-0.92, 0.3, -0.62, 0.62, 10, 11, '#2F4F9E', '#22396F', '#22396F')
    s += `<path d="M${vp(-0.6, -0.62, 11)}L${vp(-0.6, 0.62, 11)}M${vp(-0.3, -0.62, 11)}L${vp(-0.3, 0.62, 11)}M${vp(0, -0.62, 11)}L${vp(0, 0.62, 11)}M${vp(-0.92, 0, 11)}L${vp(0.3, 0, 11)}" stroke="#7FA0E0" stroke-width=".5"/>`
    s += vbox(0.55, 0.65, -0.05, 0.05, 9.5, 19, '#9A9AA2', '#7C7C84', '#8A8A92')
    s += vbox(0.42, 0.82, -0.24, 0.24, 19, 24, '#F0F0F2', '#C9C9D0', '#B3B3BC')
    s += vpoly(ring(0.82, -0.1, 1.3, 21.5).map(([x, y, z]) => [0.82, -0.1 + (x - 0.82), z]), '#1C1E22') + vpoly(ring(0.82, 0.12, 1.3, 21.5).map(([x, y, z]) => [0.82, 0.12 + (x - 0.82), z]), '#1C1E22')
    s += `<circle class="eye" cx="${vp(0.82, -0.1, 21.5).split(',')[0]}" cy="${vp(0.82, -0.1, 21.5).split(',')[1]}" r=".8" fill="#7FE3FF"/><circle class="eye" cx="${vp(0.82, 0.12, 21.5).split(',')[0]}" cy="${vp(0.82, 0.12, 21.5).split(',')[1]}" r=".8" fill="#7FE3FF"/>`
    s += `<path d="M${vp(-0.7, 0, 11)}L${vp(-0.7, 0, 17)}" stroke="#9A9AA2" stroke-width=".8"/><circle cx="${vp(-0.7, 0, 17.5).split(',')[0]}" cy="${vp(-0.7, 0, 17.5).split(',')[1]}" r="1.2" fill="#FF3B30"/>`
    for (const x of [-0.72, 0, 0.72]) s += vwheel(x, y1, 3, '#4A4A50', '#B8B8C0')
    return s
  }

  function tractorShape() {
    const y0 = -0.5
    const y1 = 0.5
    let s = vshadow(-1.2, 1.25, -0.6, 0.66)
    s += vwheel(-0.5, y0, 7, '#2A2A2A', '#E0B04A') + vwheel(0.78, y0, 3.8, '#2A2A2A', '#E0B04A')
    // chassis and hood, grille and lamps in front
    s += vbox(-0.95, 0.2, -0.36, 0.36, 4, 9, '#5DB24A', '#4E9A3E', '#3F7F32')
    s += vbox(0.2, 1.15, -0.3, 0.3, 4.5, 11, '#5DB24A', '#4E9A3E', '#3F7F32')
    s += vpoly([[1.15, -0.2, 5.5], [1.15, 0.2, 5.5], [1.15, 0.2, 10], [1.15, -0.2, 10]], '#2E3A27')
    s += vpoly([[1.15, -0.3, 9], [1.15, -0.2, 9], [1.15, -0.2, 10.5], [1.15, -0.3, 10.5]], '#FFF3B0') + vpoly([[1.15, 0.2, 9], [1.15, 0.3, 9], [1.15, 0.3, 10.5], [1.15, 0.2, 10.5]], '#FFF3B0')
    s += vbox(0.75, 0.83, -0.18, -0.1, 11, 19, '#444', '#2A2A2A', '#333')
    // cab: farmer behind glass, posts and a roof
    s += person(-0.45, 0, 9, '#3F6FB0', '#F2C29B', '#E8C547')
    s += vpoly([[-0.95, 0.4, 9], [0.15, 0.4, 9], [0.15, 0.4, 19.5], [-0.95, 0.4, 19.5]], '#CFE8F5', ' opacity=".35"')
    s += vpoly([[0.15, -0.4, 9], [0.15, 0.4, 9], [0.15, 0.4, 19.5], [0.15, -0.4, 19.5]], '#CFE8F5', ' opacity=".45"')
    s += `<path d="M${vp(-0.95, 0.4, 9)}L${vp(-0.95, 0.4, 19.5)}M${vp(0.15, 0.4, 9)}L${vp(0.15, 0.4, 19.5)}M${vp(0.15, -0.4, 9)}L${vp(0.15, -0.4, 19.5)}" stroke="#3F7F32" stroke-width="1.2"/>`
    s += vbox(-1.02, 0.22, -0.46, 0.46, 19.5, 21, '#F4F1EA', '#D8D2C6', '#C9C2B4')
    s += vwheel(-0.5, y1 + 0.02, 7, '#2A2A2A', '#E0B04A') + vwheel(0.78, y1 + 0.02, 3.8, '#2A2A2A', '#E0B04A')
    return s
  }

  function sledShape() {
    const ski = y => vbox(0.35, 1.2, y - 0.05, y + 0.05, 0, 0.8, '#3A3634', '#2E2B2A', '#2E2B2A') + vpoly([[1.2, y - 0.05, 0.8], [1.2, y + 0.05, 0.8], [1.32, y + 0.05, 2.6], [1.32, y - 0.05, 2.6]], '#2E2B2A')
    let s = vshadow(-1.05, 1.3, -0.45, 0.5)
    s += ski(-0.3)
    // the track at the back, on two bogie wheels that turn
    s += vbox(-1, 0.05, -0.28, 0.28, 0, 3.4, '#3A3634', '#2A2725', '#2A2725')
    s += vwheel(-0.75, 0.29, 1.7, '#1C1A19', '#6E6A66') + vwheel(-0.2, 0.29, 1.7, '#1C1A19', '#6E6A66')
    s += vbox(-0.85, 0.75, -0.32, 0.32, 3.4, 7.5, '#4F8FCB', '#2F6FB0', '#245A92')
    s += vpoly([[0.75, -0.32, 3.4], [0.75, 0.32, 3.4], [1.05, 0.2, 5], [1.05, -0.2, 5]], '#245A92') + vpoly([[0.75, 0.32, 3.4], [1.05, 0.2, 5], [0.75, 0.32, 7.5]], '#2F6FB0')
    s += vpoly([[0.75, -0.32, 7.5], [0.75, 0.32, 7.5], [1.05, 0.2, 5], [1.05, -0.2, 5]], '#4F8FCB')
    s += vpoly([[0.5, -0.25, 7.5], [0.5, 0.25, 7.5], [0.35, 0.25, 11], [0.35, -0.25, 11]], '#CFE8F5', ' opacity=".7"')
    s += vbox(-0.8, 0.05, -0.2, 0.2, 7.5, 9, '#2A2725', '#1C1A19', '#1C1A19')
    s += vpoly([[1.05, -0.08, 5.2], [1.05, 0.08, 5.2], [1.05, 0.08, 6.4], [1.05, -0.08, 6.4]], '#FFF3B0')
    s += person(-0.35, 0, 9, '#C8423A', '#F2C29B', '#FFE34F')
    s += ski(0.3)
    return s
  }

  // lane and swerve lane (tiles from the building's front), horn, how far up the shout goes, and what it leaves behind
  const VEHICLES = {
    city: { draw: carShape, lane: 2.65, swerve: 3.6, horn: '¡PIIII!', sound: [880, 440, 880, 440], top: 16, trail: null },
    beach: { draw: boatShape, lane: 2.95, swerve: 3.55, horn: '¡PUUUH!', sound: [196, 196, 147], top: 20, trail: 'foam', rock: true, speed: 0.8 },
    moon: { draw: roverShape, lane: 2.7, swerve: 3.55, horn: '¡BIP-BIP-BIP!', sound: [1319, 988, 1319, 988, 1319], top: 27, trail: 'dust', speed: 0.7 },
    forest: { draw: tractorShape, lane: 2.7, swerve: 3.55, horn: '¡MEEEC!', sound: [330, 262, 330, 262], top: 24, trail: 'smoke', speed: 0.6 },
    snow: { draw: sledShape, lane: 2.7, swerve: 3.55, horn: '¡RIIIN-RIIIN!', sound: [784, 659, 784, 659], top: 23, trail: 'snow', speed: 0.9 },
  }
  // particles per trail: where they come from (local tiles/px), how they drift, grow and fade
  const TRAILS = {
    foam: { every: 0.06, at: [[-1.3, 0.25, 0], [-1.3, -0.25, 0], [0.9, 0.42, 0]], color: '#FFFFFF', r: [1.4, 4.5], life: 0.8, o: 0.7, drift: [0, 1.5] },
    dust: { every: 0.05, at: [[-0.95, 0.55, 0.5], [-0.25, 0.55, 0.5]], color: '#B6B6BD', r: [1.5, 5], life: 0.8, o: 0.7, drift: [-4, -6] },
    smoke: { every: 0.14, at: [[0.79, -0.14, 19.5]], color: '#5E5A55', r: [1.6, 6], life: 1.4, o: 0.65, drift: [-8, -16] },
    snow: { every: 0.03, at: [[-1.05, 0.15, 1], [-1.05, -0.15, 1]], color: '#FFFFFF', r: [1.2, 4], life: 0.7, o: 0.9, drift: [-14, -10] },
  }

  function passCar(g, at, done) {
    const catX = tileOf(at).x
    const kind = VEHICLES[model && model.world] ? model.world : 'city'
    const veh = VEHICLES[kind]
    const car = document.createElementNS(SVG_NS, 'g')
    car.setAttribute('class', `car car-${kind}`)
    car.innerHTML = `<g class="rock"><g class="car-body">${veh.draw()}</g></g><g class="honk"><text y="${-veh.top - 8}" text-anchor="middle">${veh.horn}</text></g>`
    const trail = document.createElementNS(SVG_NS, 'g')
    trail.setAttribute('class', 'trail')
    trail.setAttribute('pointer-events', 'none')
    overlay.appendChild(trail)
    overlay.appendChild(car)
    const rock = car.querySelector('.rock')
    const spec = calm() ? null : TRAILS[veh.trail]
    const bits = []
    setFace(g.ghost, -1)
    const speed = veh.speed || 1
    let x = -7
    let v = 15 * speed
    let last = performance.now()
    let t = 0
    let turn = 0
    let emit = 0
    let honked = false
    let left = false
    spinWheels(car, 0)
    const step = now => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      t += dt
      // the trail outlives the vehicle a moment and then goes too
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i]
        b.age += dt
        const k = b.age / spec.life
        if (k >= 1) {
          b.el.remove()
          bits.splice(i, 1)
          continue
        }
        b.x += spec.drift[0] * dt * b.s
        b.y += spec.drift[1] * dt
        b.el.setAttribute('cx', b.x.toFixed(1))
        b.el.setAttribute('cy', b.y.toFixed(1))
        b.el.setAttribute('r', (spec.r[0] + (spec.r[1] - spec.r[0]) * Math.sqrt(k)).toFixed(2))
        b.el.setAttribute('opacity', (spec.o * (1 - k)).toFixed(3))
      }
      if (!car.isConnected) {
        if (bits.length) return requestAnimationFrame(step)
        return trail.remove()
      }
      const gap = catX - x
      v += ((gap > 6 ? 15 : gap > -2 ? 4 : 20) * speed - v) * Math.min(1, dt * 5)
      x += v * dt
      turn -= (v * dt * TILE_PX) / 3.4
      spinWheels(car, turn)
      car.classList.toggle('brake', gap < 6 && gap > -1)
      if (!honked && gap < 4.5) {
        honked = true
        car.classList.add('honking')
        beep(veh.sound, 0.09)
        setTimeout(() => {
          if (!g.ghost.isConnected) return
          const alert = g.ghost.querySelector('.alert')
          alert.textContent = '🙀 ¡bip bip!'
          alert.style.animation = 'none'
          void alert.getBBox()
          alert.style.removeProperty('animation')
          g.ghost.classList.add('r-scared')
          beep([1047, 1319], 0.06)
        }, 120)
      }
      // it eases into the far lane round the cat and back into its own
      const swerve = smooth((x - catX + 5) / 4) * (1 - smooth((x - catX - 3) / 4))
      const pos = iso(x, geo.H + veh.lane + (veh.swerve - veh.lane) * swerve)
      place(car, pos)
      if (veh.rock && !calm()) rock.setAttribute('transform', `translate(0,${(Math.sin(t * 4.2) * 0.9).toFixed(2)}) rotate(${(Math.sin(t * 2.7) * 1.6).toFixed(2)})`)
      if (spec) {
        emit += dt
        while (emit >= spec.every) {
          emit -= spec.every
          for (const [lx, ly, lz] of spec.at) {
            const [px, py] = vp(lx, ly, lz).split(',').map(Number)
            const el = document.createElementNS(SVG_NS, 'circle')
            el.setAttribute('fill', spec.color)
            trail.appendChild(el)
            bits.push({ el, age: 0, x: pos.x + px + (Math.random() - 0.5) * 3, y: pos.y + py + (Math.random() - 0.5) * 2, s: 0.5 + Math.random() })
          }
        }
      }
      if (!left && gap < -4) {
        left = true
        setTimeout(done, 500)
      }
      if (x > geo.W + 7) car.remove()
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  // 15 clicks on a camouflaged cat, or on any cat inside a barracks, call in the tanks
  const DEPLOY_CLICKS = 15
  const drill = new Map()
  function militaryClick(el, e) {
    const key = el.dataset.pet
    const now = Date.now()
    const prev = drill.get(key)
    const n = prev && now - prev.at < 4000 ? prev.n + 1 : 1
    drill.set(key, { n, at: now })
    if (n % 5 === 0 && n < DEPLOY_CLICKS) floatText(scenePoint(e), `🎖 ${n}/${DEPLOY_CLICKS}`)
    if (n < DEPLOY_CLICKS) return
    drill.delete(key)
    deploy()
  }

  const clickLog = new Map()
  function catClicks(el, e) {
    const r = el.getBoundingClientRect()
    if (el.dataset.coat === 'militar' || zoneOf(tileOf(scenePoint({ clientX: r.left + r.width / 2, clientY: r.bottom }))) === 'military') return militaryClick(el, e)
    const key = el.dataset.pet
    const now = Date.now()
    const log = (clickLog.get(key) || []).filter(t => now - t < 1800)
    log.push(now)
    clickLog.set(key, log)
    if (log.length < 5) return
    clickLog.set(key, [])
    const use = el.querySelector('use')
    use?.classList.remove('flip')
    void use?.getBoundingClientRect()
    use?.classList.add('flip')
    setTimeout(() => use?.classList.remove('flip'), 950)
    floatText(scenePoint(e), '¡voltereta!')
    unlock('flip')
    beep([523, 659, 784, 1047], 0.06)
  }

  function hearts(e) {
    const p = scenePoint(e)
    for (let i = 0; i < 3; i++) setTimeout(() => floatText({ x: p.x + (i - 1) * 8, y: p.y }, '❤', 'heart'), i * 120)
    unlock('pet')
    beep([880, 1320], 0.06)
  }

  function floatText(p, text, cls = '') {
    const t = document.createElementNS(SVG_NS, 'text')
    t.setAttribute('class', `float ${cls}`)
    t.setAttribute('x', p.x.toFixed(1))
    t.setAttribute('y', p.y.toFixed(1))
    t.setAttribute('text-anchor', 'middle')
    t.textContent = text
    overlay.appendChild(t)
    // the big jackpot text lasts longer than the default: go when the animation does
    t.addEventListener('animationend', () => t.remove())
    setTimeout(() => t.remove(), 4000)
  }

  // Operación Bigotes: helmeted cats roll tanks along the street, firing tracers that burst into explosions
  let deploying = false
  function deploy() {
    if (!geo || deploying) return
    deploying = true
    unlock('military')
    beep([392, 392, 392, 523, 659, 523, 784], 0.13)
    const lanes = [geo.H + 2.6, geo.H + 3.7]
    let gone = 0
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        const g = document.createElementNS(SVG_NS, 'g')
        g.setAttribute('class', 'carry tank')
        // the rumble animates an inner group: a CSS transform on this one would override the translate that moves it
        g.innerHTML =
          '<g class="hull"><ellipse rx="22" ry="6" fill="#000" opacity=".25"/><rect x="-21" y="-5" width="42" height="7" rx="3" fill="#2F3324"/>' +
          '<circle cx="-15" cy="-1.5" r="2.4" fill="#55594A"/><circle cx="-5" cy="-1.5" r="2.4" fill="#55594A"/><circle cx="5" cy="-1.5" r="2.4" fill="#55594A"/><circle cx="15" cy="-1.5" r="2.4" fill="#55594A"/>' +
          '<rect x="-18" y="-13" width="36" height="9" fill="#5B6B3A"/><rect x="-18" y="-13" width="36" height="2" fill="#6E7F48"/>' +
          '<rect x="-9" y="-20" width="17" height="8" fill="#4E5C31"/><rect x="7" y="-18" width="19" height="2.6" fill="#2F3324"/>' +
          '<use href="#pt-militar" transform="translate(-4,-19) scale(.85)"></use><text x="-14" y="-6" font-size="6" fill="#F2D16B">★</text></g>' +
          shout(TANK_SHOUTS[i % TANK_SHOUTS.length], -32, i * 0.7)
        overlay.appendChild(g)
        const lane = lanes[i % 2]
        // each tank stops firing as it leaves; the operation ends with the last one
        const timer = setInterval(() => g.isConnected && shoot(g), 650 + Math.random() * 600)
        walk({ ghost: g }, [iso(-4, lane), iso(geo.W + 4, lane)], () => {
          clearInterval(timer)
          g.remove()
          if (++gone === 6) deploying = false
        }, 55)
      }, i * 900)
    }
    // infantry cats running ahead of the tanks
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        const g = document.createElementNS(SVG_NS, 'g')
        g.setAttribute('class', 'carry walking')
        g.innerHTML = '<g class="face"><g class="body"><use href="#pt-militar"></use></g><g class="props"></g></g>' + shout(CAT_SHOUTS[i % CAT_SHOUTS.length], -18, 0.3 + i * 0.5)
        overlay.appendChild(g)
        walk({ ghost: g }, [iso(-3, geo.H + 1.2), iso(geo.W + 3, geo.H + 1.2)], () => g.remove(), 95)
      }, 400 + i * 650)
    }
  }

  const CAT_SHOUTS = ['¡OPERACIÓN BIGOTES!', '¡Miau-rcha!', '¡Bigotes al frente!', '¡Por el atún!', '¡Sin cuartel!', '¡Zarpas arriba!']
  const TANK_SHOUTS = ['¡Fuego!', '¡OPERACIÓN BIGOTES!', '¡Cargad la lata!', '¡Rrrrrr!', '¡A por ellos!', '¡Miau!']

  // a speech bubble that pops in and out over the cat while it marches
  function shout(text, y, delay) {
    const w = Math.round(text.length * 5.2 + 14)
    return `<g class="shout" transform="translate(0,${y})"><g style="animation-delay:${delay.toFixed(2)}s">` +
      `<rect x="${-w / 2}" y="-16" width="${w}" height="14" rx="5" fill="#FFF8EE" stroke="#3F4A2A" stroke-width="1.2"/>` +
      `<path d="M-3 -2.4 L0 3 L3 -2.4 Z" fill="#FFF8EE" stroke="#3F4A2A" stroke-width="1.2" stroke-linejoin="round"/><rect x="-3.6" y="-3.4" width="7.2" height="2" fill="#FFF8EE"/>` +
      `<text y="-6" font-size="8" font-weight="900" text-anchor="middle" fill="#3F4A2A">${esc(text)}</text></g></g>`
  }

  function shoot(tank) {
    const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(tank.getAttribute('transform') || '')
    if (!m) return
    const x = Number(m[1]) + 26
    const y = Number(m[2]) - 17
    const tx = x + 70 + Math.random() * 150
    const ty = y - 40 + Math.random() * 80
    const fx = document.createElementNS(SVG_NS, 'g')
    fx.setAttribute('pointer-events', 'none')
    fx.innerHTML =
      `<circle class="flash" cx="${x}" cy="${y}" r="6" fill="#FFE34F"/>` +
      `<line class="tracer" x1="${x}" y1="${y}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#FFD36B" stroke-width="2" stroke-linecap="round"/>` +
      `<g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)})"><g class="boom"><circle r="10" fill="#FF8A3D"/><circle r="6" fill="#FFE34F"/><circle cx="7" cy="-5" r="5" fill="#8C857C" opacity=".8"/><text y="4" font-size="14" text-anchor="middle">💥</text></g></g>`
    overlay.appendChild(fx)
    beep([1400, 700], 0.03)
    setTimeout(() => beep([120, 70], 0.06), 220)
    setTimeout(() => fx.remove(), 900)
  }

  // ↑↑↓↓←→←→BA: a parade of every coat along the sidewalk
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
  let konami = 0
  function parade() {
    if (!geo) return
    unlock('konami')
    beep([523, 659, 784, 659, 784, 1047], 0.09)
    const coats = [...COATS, ...COATS]
    coats.forEach((coat, i) => {
      setTimeout(() => {
        const g = document.createElementNS(SVG_NS, 'g')
        g.setAttribute('class', 'carry walking parade')
        g.innerHTML = `<g class="face"><g class="body"><use href="#pt-${coat}"></use></g><g class="props"></g></g>${i === 0 ? '<text class="alert" y="-22" text-anchor="middle">¡desfile!</text>' : ''}`
        overlay.appendChild(g)
        walk({ ghost: g }, [iso(-3, geo.H + 1.15), iso(geo.W + 3, geo.H + 1.15)], () => g.remove(), 120)
      }, i * 380)
    })
  }

  // ---------- trash bags ----------

  const MAX_BAGS = 6
  function spawnBag() {
    if (!geo || bags.length >= MAX_BAGS) return
    const zones = [...geo.rooms.filter(r => r.kind !== 'dorm'), { x0: 0.8, x1: geo.W - 0.8, y0: geo.D + 0.2, y1: geo.D + 0.8 }, { x0: 0, x1: geo.W, y0: geo.H + 0.4, y1: geo.H + 1.6 }]
    const z = zones[Math.floor(Math.random() * zones.length)]
    const x = z.x0 + 0.6 + Math.random() * Math.max(0.2, z.x1 - z.x0 - 1.2)
    const y = z.y0 + 0.6 + Math.random() * Math.max(0.2, z.y1 - z.y0 - 1.2)
    bags.push({ id: Math.random().toString(36).slice(2, 8), x, y, born: Date.now() })
    persist()
    renderBags()
  }
  function renderBags() {
    overlay.querySelectorAll('[data-bag]').forEach(b => b.remove())
    if (!geo) return
    for (const b of bags) {
      const p = iso(Math.min(geo.W + 2, b.x), Math.min(geo.H + 5, b.y))
      const g = document.createElementNS(SVG_NS, 'g')
      g.setAttribute('class', 'bag')
      g.dataset.bag = b.id
      g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`)
      const old = Date.now() - b.born > 5 * 60_000
      g.innerHTML = `<title>Bolsa de basura · arrástrala a la papelera o al contenedor</title>${bagShape}${old ? '<circle class="fly" r="1.2" cx="0" cy="-18" fill="#222"/><circle class="fly f2" r="1" cx="0" cy="-18" fill="#222"/>' : ''}`
      overlay.appendChild(g)
    }
    hideHeld()
  }
  setInterval(() => Math.random() < 0.4 && spawnBag(), 45_000)

  // ---------- day & night ----------

  function darkness(date) {
    if (clockMode === 'day') return 0
    if (clockMode === 'night') return 1
    const h = date.getHours() + date.getMinutes() / 60
    if (h >= 8 && h < 19.5) return 0
    if (h >= 21 || h < 6.5) return 1
    return h < 12 ? (8 - h) / 1.5 : (h - 19.5) / 1.5
  }
  function updateSky() {
    const now = new Date()
    const dark = darkness(now)
    world.classList.toggle('night', dark >= 0.5)
    document.body.classList.toggle('night', dark >= 0.5)
    const shade = scene.querySelector('#shade')
    if (shade) shade.style.opacity = (dark * 0.55).toFixed(3)
    const h = now.getHours() + now.getMinutes() / 60
    const angle = clockMode === 'day' ? 0 : clockMode === 'night' ? 180 : ((h - 12) / 24) * 360
    $('clockDisc').style.transform = `rotate(${-angle}deg)`
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    $('clockLabel').textContent = clockMode === 'auto' ? `${hh}:${mm}` : clockMode === 'day' ? 'día' : 'noche'
  }
  setInterval(updateSky, 30_000)
  $('clock').addEventListener('click', () => {
    clockMode = clockMode === 'auto' ? 'day' : clockMode === 'day' ? 'night' : 'auto'
    updateSky()
    if (clockMode === 'night') unlock('night')
    vscode.postMessage({ type: 'setSetting', key: 'clockMode', value: clockMode })
  })

  function updateStats() {
    if (!stats) return
    const item = (icon, n, tip) => `<span data-tip="${esc(tip)}">${icon} ${n}</span>`
    $('stats').innerHTML =
      item('💤', stats.asleep, 'Skills durmiendo en las literas: nadie las está usando ahora') +
      item('⚗️', stats.working, 'Skills trabajando en el puesto de su proyecto') +
      item('🚶', stats.strolling, 'Skills libres que han salido a pasear (solo de día)') +
      item('🧑‍🔬', stats.sessions, 'Sesiones de Claude Code abiertas: los robots') +
      item('🗑', thrown, 'Bolsas de basura que has tirado a la papelera o al contenedor')
  }

  window.addEventListener('keydown', e => {
    konami = e.key === KONAMI[konami] || e.key.toLowerCase() === KONAMI[konami] ? konami + 1 : e.key === KONAMI[0] ? 1 : 0
    if (konami === KONAMI.length) {
      konami = 0
      return parade()
    }
    if (e.target.closest?.('input, select, textarea')) return
    const cx = viewport.clientWidth / 2
    const cy = viewport.clientHeight / 2
    if (e.key === '+' || e.key === '=') zoomAt(1.25, cx, cy)
    else if (e.key === '-') zoomAt(0.8, cx, cy)
    else if (e.key === '0') {
      fitAnimated()
    }
    else if (e.key === 'Escape') closeDrawer()
    else if (e.key.toLowerCase() === 'l') drawer.classList.contains('open') ? closeDrawer() : openDrawer(tab)
    else return
    e.preventDefault()
  })

  // ---------- toolbar ----------

  document.querySelectorAll('#zoom button, #toolbar button, #drawer header button').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act
      const cx = viewport.clientWidth / 2
      const cy = viewport.clientHeight / 2
      if (act === 'zoomIn') zoomAt(1.25, cx, cy)
      else if (act === 'zoomOut') zoomAt(0.8, cx, cy)
      else if (act === 'fit') {
        fitAnimated()
      }
      else if (act === 'layout') drawer.classList.contains('open') && tab === btn.dataset.tab ? closeDrawer() : openDrawer(btn.dataset.tab)
      else if (act === 'close') closeDrawer()
      else vscode.postMessage({ type: act })
    })
  })
  document.querySelectorAll('#drawer nav button').forEach(btn => btn.addEventListener('click', () => openDrawer(btn.dataset.tab)))

  // ---------- drawer ----------

  function openDrawer(which, target) {
    // a short slide-in when the content really changes, never on the model's re-renders
    if (which !== tab || !drawer.classList.contains('open')) {
      drawerBody.classList.remove('swap')
      void drawerBody.offsetWidth
      drawerBody.classList.add('swap')
    }
    tab = which
    focus = target || null
    if (target && which === 'skills') filter = ''
    drawer.classList.add('open')
    drawer.setAttribute('aria-hidden', 'false')
    document.querySelectorAll('#toolbar button[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab))
    persist()
    vscode.postMessage({ type: 'model' })
    renderDrawer()
  }

  function closeDrawer() {
    drawer.classList.remove('open')
    drawer.setAttribute('aria-hidden', 'true')
    document.querySelectorAll('#toolbar button[data-tab]').forEach(b => b.classList.remove('on'))
  }

  const debounce = (fn, ms) => {
    let t
    return (...a) => {
      clearTimeout(t)
      t = setTimeout(() => fn(...a), ms)
    }
  }
  const sendLab = debounce((id, patch) => vscode.postMessage({ type: 'setLab', id, ...patch }), 350)
  const sendDelay = debounce(seconds => vscode.postMessage({ type: 'setDelay', seconds }), 300)
  const sendCats = debounce(cats => vscode.postMessage({ type: 'setSetting', key: 'cats', value: cats }), 450)

  function renderDrawer() {
    document.querySelectorAll('#drawer nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab))
    if (!model) {
      drawerBody.innerHTML = '<p class="muted">Cargando…</p>'
      return
    }
    if (tab === 'labs') renderLabs()
    else if (tab === 'skills') renderSkills()
    else if (tab === 'medals') renderMedals()
    else renderSettings()
  }

  function renderLabs() {
    const working = id => model.skills.filter(sk => sk.lab === id).length
    const themeOptions = sel => THEMES.map(([v, label]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${label}</option>`).join('')
    const root = model.projectsRoot
    const palettes = model.palettes || {}
    if (!palettes[pickedPalette]) pickedPalette = palettes[model.palette] ? model.palette : Object.keys(palettes)[0] || ''
    const paletteRows = Object.entries(palettes)
      .map(([id, colors]) => `<button class="palette${id === pickedPalette ? ' on' : ''}" data-palette="${id}" aria-pressed="${id === pickedPalette}"><span class="pname">${PALETTE_NAMES[id] || id}${id === model.palette ? ' <b title="Paleta actual">✓</b>' : ''}</span><span class="chips">${colors.map(c => `<i style="background:${c}"></i>`).join('')}</span></button>`)
      .join('')
    drawerBody.innerHTML =
      (paletteRows
        ? `<section class="card plain look"><span class="field"><span>Paleta de colores</span></span><div class="palettes">${paletteRows}</div>
        <button id="applyPalette" class="primary wide">🎨 Pintar todos los puestos</button>
        <small class="muted">Repinta los carteles en orden; los puestos nuevos también la usarán.</small></section>`
        : '') +
      `<section class="card plain root"><span class="field"><span>Carpeta de proyectos</span></span>
        <div class="row"><span class="path${root ? '' : ' empty'}" title="${esc(root || '')}">${esc(root || 'sin elegir')}</span><button data-msg="pickRoot">📁 Elegir…</button></div>
        <div class="row two"><button data-msg="detectLabs"${root ? '' : ' disabled'}>🔍 Crear puestos</button><button data-msg="addLab">+ Puesto vacío</button></div>
        <small class="muted">Cada subcarpeta puede ser un puesto: las sesiones de Claude que abras dentro trabajarán en él. Los puestos de una carpeta concreta mandan sobre las reglas genéricas.</small></section>` +
      model.labs
        .map(
          l => `<section class="card${focus === l.id ? ' focus' : ''}" data-id="${l.id}" style="--accent:${l.accent}">
        <div class="row"><label class="swatch" title="Color del cartel"><input type="color" data-f="accent" value="${l.accent}"></label>
        <input class="name" data-f="name" value="${esc(l.name)}" spellcheck="false"><span class="badge">${working(l.id) || ''}</span>
        ${l.removable ? `<button class="mini" data-remove="${l.id}" title="Quitar puesto">✕</button>` : ''}</div>
        <div class="row two"><label class="field"><span>Tema</span><select data-f="theme">${themeOptions(l.theme)}</select></label>
        <label class="field"><span>Fila</span><select data-f="row"><option value="top"${l.row === 'top' ? ' selected' : ''}>Arriba</option><option value="bottom"${l.row === 'bottom' ? ' selected' : ''}>Abajo</option></select></label></div>
        <label class="field"><span>Ancho <b class="wval">${l.width}</b> casillas</span><input type="range" data-f="width" min="4" max="14" step="1" value="${l.width}"></label>
        <label class="field"><span>Carpeta (regla)</span><span class="row"><input data-f="match" value="${esc(l.match)}" placeholder="${l.removable ? 'sin carpeta: solo skills fijas' : 'lo que no encaje en otro puesto'}" spellcheck="false"><button class="mini" data-folder="${l.id}" title="Elegir carpeta">📁</button></span></label>
        <label class="field svc-field"><span>Servicios <small class="muted">Nombre = https://url, uno por línea</small></span>
        <span class="svc-row"><textarea data-services="${l.id}" rows="${Math.max(2, (l.services || []).length + 1)}" spellcheck="false" placeholder="Portal = https://mi.ejemplo.es">${esc(svcDrafts[l.id] ?? (l.services || []).map(sv => `${sv.name} = ${sv.url}`).join('\n'))}</textarea>
        <span class="svc-dots">${(l.services || []).map(sv => svcDot(sv)).join('')}</span></span></label>
      </section>`,
        )
        .join('')
    drawerBody.querySelectorAll('.card[data-id]').forEach(card => {
      card.querySelectorAll('input, select').forEach(input =>
        input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
          if (input.dataset.f === 'accent') card.style.setProperty('--accent', input.value)
          if (input.dataset.f === 'width') card.querySelector('.wval').textContent = input.value
          sendLab(card.dataset.id, { [input.dataset.f]: input.dataset.f === 'width' ? Number(input.value) : input.value })
        }),
      )
    })
    drawerBody.querySelectorAll('textarea[data-services]').forEach(ta => {
      const id = ta.dataset.services
      const restore = svcFocus && svcFocus.id === id ? svcFocus : null
      const track = () => (svcFocus = { id, start: ta.selectionStart, end: ta.selectionEnd })
      ta.addEventListener('input', () => {
        track()
        svcDrafts[id] = ta.value
        sendLab(id, { services: parseServices(ta.value) })
      })
      for (const ev of ['focus', 'keyup', 'click', 'select']) ta.addEventListener(ev, track)
      ta.addEventListener('blur', () => {
        // the drawer re-renders on every model push: keep focus and caret if this textarea was being edited
        if (!ta.isConnected) return
        svcFocus = null
        delete svcDrafts[id]
      })
      if (restore) {
        ta.focus()
        ta.setSelectionRange(restore.start, restore.end)
        svcFocus = restore
      }
    })
    drawerBody.querySelectorAll('[data-palette]').forEach(b =>
      b.addEventListener('click', () => {
        pickedPalette = b.dataset.palette
        drawerBody.querySelectorAll('[data-palette]').forEach(x => {
          x.classList.toggle('on', x === b)
          x.setAttribute('aria-pressed', String(x === b))
        })
      }),
    )
    const apply = $('applyPalette')
    if (apply)
      apply.addEventListener('click', () => {
        vscode.postMessage({ type: 'applyPalette', name: pickedPalette })
        emit('palette', pickedPalette)
      })
    drawerBody.querySelectorAll('[data-folder]').forEach(b => b.addEventListener('click', () => vscode.postMessage({ type: 'pickLabFolder', id: b.dataset.folder })))
    drawerBody.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => vscode.postMessage({ type: 'removeLab', id: b.dataset.remove })))
    drawerBody.querySelectorAll('button[data-msg]').forEach(b => b.addEventListener('click', () => vscode.postMessage({ type: b.dataset.msg })))
    scrollToFocus()
  }

  // ---------- services (server racks) ----------

  const svcDrafts = {}
  let svcFocus = null
  // "Name = https://url" per line; a bare URL takes its host as the name
  const parseServices = text =>
    text
      .split(/\r?\n/)
      .map(line => {
        const m = line.match(/^\s*(?:(.*?)\s*=\s*)?(https?:\/\/\S+)\s*$/i)
        if (!m) return null
        let name = (m[1] || '').trim()
        if (!name) {
          try {
            name = new URL(m[2]).host
          } catch {
            name = m[2]
          }
        }
        return { name, url: m[2] }
      })
      .filter(Boolean)
      .slice(0, 6)
  const svcDot = sv => {
    const st = model && model.services ? model.services[sv.url] : undefined
    const cls = !st ? 'unknown' : st.up ? 'up' : 'down'
    const info = !st ? 'sin comprobar' : st.up ? `en pie (${st.code}, ${st.ms} ms)` : `caído${st.code ? ` (${st.code})` : ''}`
    return `<i class="svc-dot ${cls}" title="${esc(sv.name)} · ${info}"></i>`
  }

  let svcHover = null
  scene.addEventListener('mouseover', e => {
    const rack = e.target.closest && e.target.closest('[data-service]')
    if (rack === svcHover) return
    svcHover = rack
    if (rack) emit('service-hover', { name: rack.dataset.service, up: rack.dataset.up === '1' ? true : rack.dataset.up === '0' ? false : null })
  })
  let svcDown = new Set()
  window.addEventListener('message', e => {
    if (!e.data || e.data.type !== 'scene' || typeof e.data.svg !== 'string') return
    const down = new Set()
    const unesc = s => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    for (const m of e.data.svg.matchAll(/<g data-service="([^"]*)" data-up="0"/g)) down.add(unesc(m[1]))
    for (const name of down) if (!svcDown.has(name)) emit('service-down', { name })
    svcDown = down
  })

  // ---------- medals ----------

  const MEDAL_GROUPS = [
    ['cats', '🐈 Gatos por las salas'],
    ['eggs', '🥚 Easter eggs'],
    ['world', '🌍 Mundo y estilo'],
    ['chores', '🧹 Faenas y manías'],
    ['button', '🔴 El botón rojo'],
  ]
  const MEDALS = [
    ['pet', '💕', 'Mimos', 'Doble clic a un gato', 'eggs'],
    ['flip', '🤸', 'Acróbata', 'Cinco clics rápidos a un gato', 'eggs'],
    ['bin-cat', '🗑️', 'Gato al cubo', 'Echa un gato a la papelera o al contenedor', 'eggs'],
    ['konami', '🎉', 'Desfile gatuno', '↑↑↓↓←→←→BA', 'eggs'],
    ['military', '🎖️', 'Operación Bigotes', '15 clics a un gato militar o en un cuartel', 'eggs'],
    ['r-gym', '💪', 'Gato fitness', 'Suelta un gato en un gimnasio', 'cats'],
    ['r-cafe', '🥛', 'Barista', 'Suelta un gato en una cafetería', 'cats'],
    ['r-library', '📚', 'Ratón de biblioteca', 'Suelta un gato en una biblioteca', 'cats'],
    ['r-arcade', '🌈', 'Nyan', 'Suelta un gato en un arcade', 'cats'],
    ['r-lab', '🧪', 'Experimento fallido', 'Suelta un gato en un laboratorio', 'cats'],
    ['r-military', '🪖', 'Recluta', 'Suelta un gato en un cuartel', 'cats'],
    ['r-smoking', '😮‍💨', 'Fumador pasivo', 'Suelta un gato en la sala de fumadores', 'cats'],
    ['joseluis', '🚬', 'José Luis', 'Llama a un gato José Luis y suéltalo en la sala de fumadores', 'eggs'],
    ['r-dorm', '😴', 'Siesta', 'Suelta un gato en las literas', 'cats'],
    ['r-patio', '🦋', 'Cazamariposas', 'Suelta un gato en el patio', 'cats'],
    ['r-corridor', '🐾', 'Patrulla', 'Suelta un gato en el pasillo', 'cats'],
    ['r-street', '🚗', 'Susto', 'Suelta un gato en la calle', 'cats'],
    ['r-greenhouse', '🤧', 'Alergia primaveral', 'Suelta un gato en un invernadero', 'cats'],
    ['r-music', '🎸', 'Gato rockero', 'Suelta un gato en un estudio de música', 'cats'],
    ['r-space', '🧑‍🚀', 'Gatonauta', 'Suelta un gato en una estación espacial', 'cats'],
    ['r-kitchen', '🐟', 'Ladrón de sardinas', 'Suelta un gato en una cocina', 'cats'],
    ['r-beach', '🕶️', 'Gato de chiringuito', 'Suelta un gato en un chiringuito', 'cats'],
    ['r-casino', '🎰', 'Gato con suerte', 'Suelta un gato en un casino', 'cats'],
    ['bag', '🧹', 'Barrendero', 'Tira una bolsa de basura', 'chores'],
    ['bags10', '♻️', 'Ecohéroe', 'Tira 10 bolsas de basura', 'chores'],
    ['bags25', '🚛', 'Camión de la basura', 'Tira 25 bolsas de basura', 'chores'],
    ['diogenes', '🪰', 'Síndrome de Diógenes', 'Deja que se junten 6 bolsas sin tirar', 'chores'],
    ['wake', '⏰', 'Despertador', 'Arrastra una skill que duerme', 'chores'],
    ['wake10', '🐓', 'Gallo madrugador', 'Despierta 10 skills arrastrándolas', 'chores'],
    ['stop', '✋', 'Alto el fuego', 'Echa una skill o un agente a la papelera', 'chores'],
    ['cats3', '😼', 'Gatocalipsis', 'Echa 3 gatos a la papelera en menos de 20 s', 'eggs'],
    ['pet20', '🧶', 'Rascador oficial', 'Haz 20 mimos a los gatos', 'eggs'],
    ['night', '🌙', 'Noctámbulo', 'Haz que sea de noche con el reloj', 'chores'],
    ['zoom-max', '🔍', 'Lupa de Sherlock', 'Acerca el zoom al máximo', 'chores'],
    ['zoom-min', '🦅', 'Vista de pájaro', 'Aleja el zoom al mínimo', 'chores'],
    ['robots5', '🤖', 'Granja de robots', 'Ten 5 sesiones de Claude abiertas a la vez', 'chores'],
    ['world', '🧳', 'Turista', 'Cambia de mundo', 'world'],
    ['worlds5', '🗺️', 'Trotamundos', 'Visita los 5 mundos', 'world'],
    ['palette', '🎨', 'Pintor', 'Aplica una paleta de colores', 'world'],
    ['skin', '🥸', 'Disfraces', 'Cambia un disfraz', 'world'],
    ['season', '🎃', 'Fiestero', 'Cambia de temporada', 'world'],
    ['sysadmin', '🖥️', 'Sysadmin', 'Pasa el ratón por un servidor', 'world'],
    ['down', '🚨', 'Alerta roja', 'Pilla un servidor caído', 'world'],
    ['slot777', '🎰', 'Triple siete', 'Saca 777 en una tragaperras del casino', 'eggs'],
    ['slot50', '🪙', 'Ludópata', 'Juega 50 tiradas en la tragaperras', 'eggs'],
    ['wally', '🔍', '¿Dónde está Wally?', 'Encuentra a Wally entre los paseantes y pínchale', 'eggs'],
    ['santa', '🎅', 'Jo, jo, jo', 'Pincha a Papá Noel cuando cruce el cielo en Navidad', 'eggs'],
    ['all', '🏆', '¡Platinéalo!', 'Consigue todas las demás medallas, botón rojo incluido', 'eggs'],
    ['red10', '🔴', 'Curiosidad', 'Pulsa 10 veces el botón que no se debe pulsar', 'button'],
    ['red100', '👆', 'Insistente', '100 pulsaciones', 'button'],
    ['red1000', '💪', 'Dedo de hierro', '1.000 pulsaciones', 'button'],
    ['red10000', '🦾', 'Leyenda del botón', '10.000 pulsaciones', 'button'],
    ['red77777', '🎆', '77.777', 'Llega a 77.777 pulsaciones', 'button'],
  ]

  // counters and sets behind the medals that need more than one go, kept with the medals as '~' keys
  const tally = (key, add = 1) => {
    medals = { ...medals, [`~${key}`]: (medals[`~${key}`] || 0) + add }
    persist()
    return medals[`~${key}`]
  }
  const collect = (key, item) => {
    const seen = new Set(String(medals[`~${key}`] || '').split(',').filter(Boolean)).add(String(item))
    medals = { ...medals, [`~${key}`]: [...seen].join(',') }
    persist()
    return seen.size
  }
  const binnedCats = []
  on('act', id => {
    if (id === 'bag' && thrown >= 25) unlock('bags25')
    if (id === 'wake' && tally('wake') >= 10) unlock('wake10')
    if (id === 'pet' && tally('pet') >= 20) unlock('pet20')
    if (id === 'bin-cat') {
      const now = Date.now()
      binnedCats.push(now)
      if (binnedCats.filter(t => now - t < 20_000).length >= 3) unlock('cats3')
    }
  })
  on('world', id => {
    unlock('world')
    if (collect('worlds', id) >= 5) unlock('worlds5')
  })
  on('palette', () => unlock('palette'))
  on('skin', () => unlock('skin'))
  on('season', () => unlock('season'))
  on('service-hover', s => {
    unlock('sysadmin')
    if (s && s.up === false) unlock('down')
  })
  on('service-down', () => unlock('down'))
  new MutationObserver(() => {
    if (!view) return
    // the eased zoom reaches the limit after the shown % stops changing: compare the rounded value
    const pct = Math.round(view.scale * 100)
    if (pct >= Math.round(MAX * 100)) unlock('zoom-max')
    if (pct <= Math.round(MIN * 100)) unlock('zoom-min')
  }).observe($('zoomLevel'), { childList: true, characterData: true, subtree: true })
  window.addEventListener('message', e => {
    if (e.data && e.data.type === 'scene' && e.data.stats && e.data.stats.sessions >= 5) unlock('robots5')
  })
  setInterval(() => bags.length >= MAX_BAGS && unlock('diogenes'), 20_000)

  function unlock(id) {
    emit('act', id)
    if (medals[id]) return
    const def = MEDALS.find(m => m[0] === id)
    if (!def) return
    medals = { ...medals, [id]: Date.now() }
    persist()
    vscode.postMessage({ type: 'medal', id })
    medalToast(def)
    updateMedalButton()
    if (id !== 'all' && MEDALS.every(m => m[0] === 'all' || medals[m[0]])) setTimeout(() => unlock('all'), 1800)
    renderRedButton()
    if (drawer.classList.contains('open') && tab === 'medals') renderDrawer()
  }

  const toasts = []
  function medalToast([, icon, name, hint]) {
    toasts.push({ icon, name, hint })
    if (toasts.length === 1) showNextToast()
  }
  function showNextToast() {
    const t = toasts[0]
    if (!t) return
    const el = document.createElement('div')
    el.className = 'medal-toast'
    el.innerHTML = `<span class="mi">${t.icon}</span><span><b>¡Medalla desbloqueada!</b><small>${esc(t.name)} · ${esc(t.hint)}</small></span>`
    document.body.appendChild(el)
    beep([523, 659, 784, 1047, 784, 1047], 0.08)
    setTimeout(() => {
      el.remove()
      toasts.shift()
      showNextToast()
    }, 3200)
  }

  function updateMedalButton() {
    const btn = document.querySelector('#toolbar [data-tab="medals"] .count')
    if (btn) btn.textContent = `${Object.keys(medals).filter(id => MEDALS.some(m => m[0] === id)).length}/${MEDALS.length}`
  }

  function renderMedals() {
    const got = MEDALS.filter(m => medals[m[0]]).length
    drawerBody.innerHTML =
      `<section class="card plain"><div class="medal-progress"><b>${got} / ${MEDALS.length}</b><span class="bar"><i style="width:${((got / MEDALS.length) * 100).toFixed(1)}%"></i></span></div>
       <small class="muted">Los easter eggs del laboratorio. Las bloqueadas muestran una pista.</small></section>
       ${MEDAL_GROUPS.map(([group, title]) => {
         const list = MEDALS.filter(m => m[4] === group)
         return `<div class="medal-group"><span>${title}</span><small>${list.filter(m => medals[m[0]]).length} / ${list.length}</small></div>
         <div class="medals">${list.map(([id, icon, name, hint]) => {
           const at = medals[id]
           return `<div class="medal${at ? ' got' : ''}" title="${at ? `Conseguida el ${new Date(at).toLocaleDateString()}` : 'Bloqueada'}"><span class="mi">${at ? icon : '🔒'}</span><b>${at ? esc(name) : '???'}</b><small>${esc(hint)}</small></div>`
         }).join('')}</div>`
       }).join('')}`
  }

  function renderSkills() {
    const options = sel =>
      `<option value="auto"${sel === 'auto' ? ' selected' : ''}>Auto (carpeta)</option>` +
      model.labs.map(l => `<option value="${l.id}"${sel === l.id ? ' selected' : ''}>${esc(l.name)}</option>`).join('') +
      `<option value="hidden"${sel === 'hidden' ? ' selected' : ''}>Oculta</option>`
    const rows = model.skills
      .filter(s => !filter || s.name.includes(filter))
      .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name))
      .map(s => {
        const sel = s.hidden ? 'hidden' : s.fixed || 'auto'
        const lab = model.labs.find(l => l.id === s.lab)
        return `<div class="skill${focus === s.name ? ' focus' : ''}${s.hidden ? ' off' : ''}" data-name="${esc(s.name)}">
        <span class="dot" style="background:${lab ? lab.accent : s.color}"></span>
        <span class="sname" title="${esc(s.name)}">${esc(s.name)}</span><span class="uses" title="usos">${s.uses}</span>
        <select>${options(sel)}</select></div>`
      })
      .join('')
    drawerBody.innerHTML = `<input id="search" class="search" placeholder="Buscar skill…" value="${esc(filter)}" spellcheck="false"><div class="skills">${rows || '<p class="muted">Ninguna coincide.</p>'}</div>`
    const search = $('search')
    search.addEventListener('input', () => {
      filter = search.value.trim().toLowerCase()
      const pos = search.selectionStart
      renderSkills()
      const again = $('search')
      again.focus()
      again.setSelectionRange(pos, pos)
    })
    drawerBody.querySelectorAll('.skill select').forEach(sel =>
      sel.addEventListener('change', () => vscode.postMessage({ type: 'setSkill', skill: sel.closest('.skill').dataset.name, lab: sel.value })),
    )
    scrollToFocus()
  }

  const WORLD_NAMES = { city: ['🏙️', 'Ciudad'], beach: ['🏖️', 'Playa'], forest: ['🌲', 'Bosque'], snow: ['❄️', 'Nieve'], moon: ['🌙', 'Luna'] }
  const SKIN_NAMES = { clasico: ['🙂', 'Clásico'], pirata: ['🏴‍☠️', 'Pirata'], alien: ['👽', 'Alien'], astronauta: ['🧑‍🚀', 'Astronauta'], mago: ['🧙', 'Mago'], vaquero: ['🤠', 'Vaquero'], ninja: ['🥷', 'Ninja'], chef: ['👨‍🍳', 'Chef'], vikingo: ['🪓', 'Vikingo'] }
  const SEASON_NAMES = { auto: '📅 Automática (según la fecha)', off: '🚫 Ninguna', halloween: '🎃 Halloween', navidad: '🎄 Navidad', verano: '☀️ Verano', primavera: '🌸 Primavera', otono: '🍂 Otoño', invierno: '⛄ Invierno', carnaval: '🎭 Carnaval', sanvalentin: '💘 San Valentín', pascua: '🐣 Pascua', feria: '💃 Feria' }
  // seasons added later still get a readable name
  const seasonName = v => (v !== 'auto' && v !== 'off' && model && model.seasonNames && model.seasonNames[v]) || SEASON_NAMES[v] || v.charAt(0).toUpperCase() + v.slice(1)
  const PALETTE_NAMES = { calidos: 'Cálidos', pasteles: 'Pasteles', multicolor: 'Multicolor', frios: 'Fríos', neon: 'Neón', tierra: 'Tierra' }
  let pickedPalette = ''

  function renderSettings() {
    const s = model.settings
    const toggle = (key, label, hint, warn) => `<label class="toggle${warn ? ' warn' : ''}"><input type="checkbox" data-key="${key}"${s[key] ? ' checked' : ''}><span class="sw"></span><span><b>${label}</b><small>${hint}</small></span></label>`
    const coatOptions = sel => COATS.map(c => `<option value="${c}"${c === sel ? ' selected' : ''}>${c}</option>`).join('')
    const cats = s.cats.map((c, i) => `<div class="catrow" data-i="${i}"><select data-f="coat">${coatOptions(c.coat)}</select><input data-f="name" value="${esc(c.name)}" maxlength="24" spellcheck="false"><button class="icon ghost-btn" data-del="${i}" title="Quitar">✕</button></div>`).join('')
    const worlds = (model.worlds || []).map(w => { const [icon, name] = WORLD_NAMES[w] || ['🌍', w]; return `<button class="pick${w === model.world ? ' on' : ''}" data-world="${w}" title="${name}"><i>${icon}</i><span>${name}</span></button>` }).join('')
    const seasonOptions = (model.seasons || ['auto', 'off']).map(v => `<option value="${v}"${v === s.season ? ' selected' : ''}>${seasonName(v)}</option>`).join('')
    const skinPicker = (kind, key, sprite, color) => `<div class="skin-pick" data-kind="${kind}"><svg class="skin-preview" viewBox="-17 -40 34 44" aria-hidden="true"><use href="#${sprite}" color="${color}"/></svg>
      <div class="skin-grid">${(model.skins || []).map(v => { const [icon, name] = SKIN_NAMES[v] || ['🙂', v]; return `<button class="pick${v === s[key] ? ' on' : ''}" data-skin="${v}" title="${name}"><i>${icon}</i><span>${name}</span></button>` }).join('')}</div></div>`
    drawerBody.innerHTML = `
      <section class="card plain look"><span class="field"><span>Mundo</span></span><div class="world-grid">${worlds}</div>
        <small class="muted">Lo que rodea al edificio.</small></section>
      <section class="card plain look"><label class="field"><span>Temporada</span><select id="season">${seasonOptions}</select></label>
        <small class="muted">Adornos de temporada para todo el laboratorio.</small></section>
      <section class="card plain look"><span class="field"><span>Disfraz de las skills</span></span>${skinPicker('skill', 'skillSkin', 'ca', '#D97757')}
        <span class="field"><span>Disfraz de los robots (agentes)</span></span>${skinPicker('agent', 'agentSkin', 'ag', '#3D85C6')}
        <span class="field"><span>Disfraz de los drones (subagentes)</span></span>${skinPicker('drone', 'droneSkin', 'sd0', '#3D85C6')}
        <small class="muted">El cuerpo sigue tomando el color de su puesto.</small></section>
      <section class="card plain">
        <label class="field"><span>Vuelta a la litera <b id="delayVal">${s.returnDelay} s</b></span>
        <input id="delay" type="range" min="3" max="120" step="1" value="${s.returnDelay}"></label>
        <small class="muted">Tiempo tras terminar el turno antes de que las skills vuelvan a dormir.</small>
      </section>
      <section class="card plain"><label class="field"><span>Día y noche</span><select id="clockMode">
        <option value="auto"${s.clockMode === 'auto' ? ' selected' : ''}>Según la hora real</option><option value="day"${s.clockMode === 'day' ? ' selected' : ''}>Siempre de día</option><option value="night"${s.clockMode === 'night' ? ' selected' : ''}>Siempre de noche</option>
      </select></label><small class="muted">De día una parte de las skills libres sale a pasear; de noche todos duermen y se encienden las farolas.</small></section>
      ${toggle('sound', 'Sonidos', 'Aviso al terminar un turno o cuando Claude espera.')}
      ${toggle('showPet', 'Gatos', 'Los gatos que pasean por el pasillo y la acera.')}
      <section class="card plain"><span class="field"><span>Gatos (nombre y pelaje)</span></span>${cats}<button id="addCat"${s.cats.length >= 8 ? ' disabled' : ''}>+ Añadir gato</button>
        <small class="muted">Sus nombres salen al hacerles clic. Prueba a soltarlos en cada tema…</small></section>
      ${toggle('watchAllSessions', 'Todas las sesiones', 'Mostrar sesiones de cualquier carpeta, no solo del workspace.')}
      ${toggle('skipPermissions', 'Saltar permisos en + Agent', 'Lanza con --dangerously-skip-permissions. Solo si aceptas el riesgo.', true)}
      <p class="hint">Clic en un muñeco: su nombre. Doble clic: su menú. Arrastra para despertarlo; a la papelera o al contenedor, se para. Tira las bolsas de basura que aparezcan.</p>
      <button id="openSetup" class="wide">🧭 Asistente de configuración</button>
      <div class="actions">
        <button data-msg="exportLayout">Exportar layout</button><button data-msg="importLayout">Importar</button>
        <button data-msg="openJson">Editar JSON</button><button data-msg="vscodeSettings" title="Ajustes de la extensión en VS Code">VS Code</button>
        <button class="danger" data-msg="resetLayout">Restablecer</button>
      </div>`
    const delay = $('delay')
    delay.addEventListener('input', () => {
      $('delayVal').textContent = `${delay.value} s`
      sendDelay(Number(delay.value))
    })
    $('clockMode').addEventListener('change', e => {
      clockMode = e.target.value
      updateSky()
      if (clockMode === 'night') unlock('night')
      vscode.postMessage({ type: 'setSetting', key: 'clockMode', value: clockMode })
    })
    const readCats = () => [...drawerBody.querySelectorAll('.catrow')].map(row => ({ name: row.querySelector('[data-f=name]').value, coat: row.querySelector('[data-f=coat]').value }))
    drawerBody.querySelectorAll('.catrow input, .catrow select').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => sendCats(readCats())))
    drawerBody.querySelectorAll('[data-del]').forEach(b =>
      b.addEventListener('click', () => {
        const list = readCats().filter((_c, i) => i !== Number(b.dataset.del))
        vscode.postMessage({ type: 'setSetting', key: 'cats', value: list.length ? list : [{ name: 'Michi', coat: 'gris' }] })
      }),
    )
    $('addCat').addEventListener('click', () => {
      const list = readCats()
      const names = ['Tigre', 'Luna', 'Nube', 'Pixel', 'Bigotes', 'Canela', 'Sombra']
      list.push({ name: names[list.length % names.length], coat: COATS[list.length % COATS.length] })
      vscode.postMessage({ type: 'setSetting', key: 'cats', value: list })
    })
    $('openSetup').addEventListener('click', () => {
      closeDrawer()
      openSetup()
    })
    drawerBody.querySelectorAll('[data-world]').forEach(b =>
      b.addEventListener('click', () => {
        const world = b.dataset.world
        drawerBody.querySelectorAll('[data-world]').forEach(x => x.classList.toggle('on', x === b))
        vscode.postMessage({ type: 'setWorld', world })
        emit('world', world)
      }),
    )
    $('season').addEventListener('change', e => {
      vscode.postMessage({ type: 'setSetting', key: 'season', value: e.target.value })
      emit('season', e.target.value)
    })
    drawerBody.querySelectorAll('.skin-pick').forEach(pick =>
      pick.querySelectorAll('[data-skin]').forEach(b =>
        b.addEventListener('click', () => {
          const kind = pick.dataset.kind
          pick.querySelectorAll('[data-skin]').forEach(x => x.classList.toggle('on', x === b))
          vscode.postMessage({ type: 'setSetting', key: kind === 'skill' ? 'skillSkin' : kind === 'agent' ? 'agentSkin' : 'droneSkin', value: b.dataset.skin })
          emit('skin', { kind, skin: b.dataset.skin })
        }),
      ),
    )
    drawerBody.querySelectorAll('input[data-key]').forEach(cb => cb.addEventListener('change', () => vscode.postMessage({ type: 'setSetting', key: cb.dataset.key, value: cb.checked })))
    drawerBody.querySelectorAll('button[data-msg]').forEach(b => b.addEventListener('click', () => vscode.postMessage({ type: b.dataset.msg })))
  }

  function scrollToFocus() {
    const el = drawerBody.querySelector('.focus')
    if (el) el.scrollIntoView({ block: 'center' })
  }


  // ---------- first-run setup: projects folder → puestos → skills ----------

  let setup = null
  let setupSeen = false

  function openSetup() {
    setup = { step: 0, root: '', folders: [], skills: {} }
    renderSetup()
  }

  function closeSetup(done) {
    document.getElementById('setup')?.remove()
    setup = null
    if (done) vscode.postMessage({ type: 'setupDone' })
  }

  function renderSetup() {
    if (!setup) return
    let el = document.getElementById('setup')
    if (!el) {
      el = document.createElement('div')
      el.id = 'setup'
      document.body.appendChild(el)
    }
    const steps = ['Bienvenida', 'Proyectos', 'Skills', 'Listo']
    const dots = steps.map((name, i) => `<span class="${i === setup.step ? 'on' : i < setup.step ? 'done' : ''}">${i + 1}. ${name}</span>`).join('')
    const themeOptions = sel => THEMES.map(([v, label]) => `<option value="${v}"${v === sel ? ' selected' : ''}>${label}</option>`).join('')
    let body = ''
    let actions = ''
    if (setup.step === 0) {
      body = `<h2>🧪 Bienvenido a Skill Lab</h2>
        <p>Cada <b>skill</b> de Claude Code es un muñeco que duerme en las literas y va a trabajar al <b>puesto</b> de su proyecto cuando la usas. Cada <b>sesión</b> de Claude es un robot.</p>
        <p>En dos pasos le dices dónde están tus proyectos y dónde trabaja cada skill. Todo se puede cambiar luego en <b>Layout</b>.</p>`
      actions = `<button data-setup="skip">Ahora no</button><button class="primary" data-setup="next">Empezar</button>`
    } else if (setup.step === 1) {
      const list = setup.folders.length
        ? `<div class="setup-list">${setup.folders.map((f, i) => `<label class="setup-row${f.covered ? ' off' : ''}"><input type="checkbox" data-i="${i}"${f.on ? ' checked' : ''}>
            <input class="name" data-name="${i}" value="${esc(f.name)}" spellcheck="false"><select data-theme="${i}">${themeOptions(f.theme)}</select></label>`).join('')}</div>
           <small class="muted">${setup.folders.filter(f => f.on).length} puestos marcados. Las sesiones que abras dentro de cada carpeta trabajarán en su puesto; lo demás va a «General».</small>`
        : '<p class="muted">Elige la carpeta donde guardas tus repos (por ejemplo <code>C:\\Proyectos</code>). Cada subcarpeta puede ser un puesto.</p>'
      body = `<h2>📁 Tus proyectos</h2>
        <div class="row"><span class="path${setup.root ? '' : ' empty'}">${esc(setup.root || 'sin elegir')}</span><button data-setup="pick">📁 Elegir carpeta…</button></div>${list}`
      actions = `<button data-setup="back">Atrás</button><button data-setup="skipStep">Saltar</button><button class="primary" data-setup="createLabs"${setup.folders.some(f => f.on) ? '' : ' disabled'}>Crear puestos</button>`
    } else if (setup.step === 2) {
      const labs = model ? model.labs : []
      const options = sel => `<option value="auto"${sel === 'auto' ? ' selected' : ''}>Auto (según la carpeta)</option>` + labs.map(l => `<option value="${l.id}"${sel === l.id ? ' selected' : ''}>${esc(l.name)}</option>`).join('') + `<option value="hidden"${sel === 'hidden' ? ' selected' : ''}>Ocultar</option>`
      const skills = model ? model.skills : []
      body = `<h2>🧑‍🔬 Tus skills</h2>
        <p class="muted">«Auto» manda cada skill al puesto de la carpeta donde la uses. Fija un puesto solo para las skills que siempre van al mismo sitio.</p>
        <div class="setup-list">${skills.length ? skills.map(sk => `<div class="setup-row"><span class="dot" style="background:${sk.color}"></span><span class="sname">${esc(sk.name)}</span>
          <select data-skill="${esc(sk.name)}">${options(setup.skills[sk.name] || (sk.hidden ? 'hidden' : sk.fixed || 'auto'))}</select></div>`).join('') : '<p class="muted">No he encontrado skills en ~/.claude/skills. Aparecerán solas cuando uses alguna.</p>'}</div>`
      actions = `<button data-setup="back">Atrás</button><button class="primary" data-setup="saveSkills">Guardar</button>`
    } else {
      body = `<h2>🎉 ¡Listo!</h2>
        <ul class="tips"><li><b>Clic</b> en un muñeco: su nombre. <b>Doble clic</b>: su menú.</li><li><b>Arrástralo</b> para despertarlo; a la papelera o al contenedor, se para.</li>
        <li><b>Layout</b>: puestos, temas, colores y skills. <b>Settings</b>: gatos, día/noche, sonidos.</li><li>Hay <b>🏅 medallas</b> escondidas. Empieza por acariciar al gato…</li></ul>`
      actions = `<button class="primary" data-setup="finish">Abrir el laboratorio</button>`
    }
    el.innerHTML = `<div class="setup-card panel"><nav class="setup-steps">${dots}</nav><div class="setup-body">${body}</div><div class="setup-actions">${actions}</div></div>`
    el.querySelectorAll('[data-setup]').forEach(b => b.addEventListener('click', () => setupAction(b.dataset.setup)))
    el.querySelectorAll('input[type=checkbox][data-i]').forEach(cb => cb.addEventListener('change', () => {
      setup.folders[Number(cb.dataset.i)].on = cb.checked
      renderSetup()
    }))
    el.querySelectorAll('input[data-name]').forEach(inp => inp.addEventListener('input', () => (setup.folders[Number(inp.dataset.name)].name = inp.value)))
    el.querySelectorAll('select[data-theme]').forEach(sel => sel.addEventListener('change', () => (setup.folders[Number(sel.dataset.theme)].theme = sel.value)))
    el.querySelectorAll('select[data-skill]').forEach(sel => sel.addEventListener('change', () => (setup.skills[sel.dataset.skill] = sel.value)))
  }

  function setupAction(act) {
    if (act === 'skip') return closeSetup(true)
    if (act === 'next' || act === 'skipStep') setup.step++
    else if (act === 'back') setup.step = Math.max(0, setup.step - 1)
    else if (act === 'pick') return vscode.postMessage({ type: 'setupPickRoot' })
    else if (act === 'createLabs') {
      const folders = setup.folders.filter(f => f.on).map(f => ({ name: f.name.trim() || f.path, path: f.path, theme: f.theme }))
      vscode.postMessage({ type: 'setupCreateLabs', root: setup.root, folders })
      setup.step = 2
    } else if (act === 'saveSkills') {
      if (Object.keys(setup.skills).length) vscode.postMessage({ type: 'setupSkills', map: setup.skills })
      setup.step = 3
    } else if (act === 'finish') return closeSetup(true)
    renderSetup()
  }

  // ---------- sound ----------

  let audio = null
  let soundOn = true
  function unlockAudio() {
    if (!audio) audio = new AudioContext()
    if (audio.state === 'suspended') audio.resume()
  }
  function beep(freqs, step = 0.12) {
    if (!audio || !soundOn) return
    const t0 = audio.currentTime
    freqs.forEach((f, i) => {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'triangle'
      osc.frequency.value = f
      gain.gain.setValueAtTime(0.0001, t0 + i * step)
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + i * step + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * step + 0.25)
      osc.connect(gain).connect(audio.destination)
      osc.start(t0 + i * step)
      osc.stop(t0 + i * step + 0.3)
    })
  }

  // ---------- messages ----------

  window.addEventListener('message', e => {
    const msg = e.data
    if (msg.type === 'scene') {
      const sizeChanged = !geo || geo.vw !== msg.geo.vw || geo.vh !== msg.geo.vh
      geo = msg.geo
      clockMode = msg.clockMode || 'auto'
      if (sizeChanged) {
        for (const el of [world, overlay]) {
          el.style.width = `${geo.vw}px`
          el.style.height = `${geo.vh}px`
        }
        overlay.setAttribute('viewBox', `0 0 ${geo.vw} ${geo.vh}`)
        overlay.setAttribute('width', geo.vw)
        overlay.setAttribute('height', geo.vh)
      }
      if (msg.svg !== lastSvg) {
        scene.innerHTML = lastSvg = msg.svg
        hideHeld()
        reapplyTags()
      }
      if (!view || (sizeChanged && autoFit)) fit()
      stats = msg.stats
      updateStats()
      updateSky()
      renderBags()
      renderRedButton()
    } else if (msg.type === 'model') {
      model = msg.model
      if (model.needsSetup && !setupSeen && !setup) {
        setupSeen = true
        openSetup()
      } else if (setup && setup.step === 2) renderSetup()
      if (model.medals) {
        medals = { ...model.medals, ...medals }
        updateMedalButton()
        renderRedButton()
      }
      soundOn = model.settings.sound
      const typing = document.activeElement && drawer.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !['checkbox', 'range', 'color'].includes(document.activeElement.type)
      if (drawer.classList.contains('open') && !typing) renderDrawer()
    } else if (msg.type === 'setupFolders' && setup) {
      setup.root = msg.root
      setup.folders = msg.folders.map(f => ({ ...f, on: !f.covered, theme: 'lab' }))
      renderSetup()
    } else if (msg.type === 'sound') beep(msg.kind === 'done' ? [523, 659, 784] : [988, 740, 988])
  })
  // a resized panel refits while the view is automatic; a hand-placed view keeps its centre where it was
  let box = { w: viewport.clientWidth, h: viewport.clientHeight }
  new ResizeObserver(() => {
    const w = viewport.clientWidth
    const h = viewport.clientHeight
    if (w === box.w && h === box.h) return
    const dw = w - box.w
    const dh = h - box.h
    box = { w, h }
    if (!view || !geo) return
    if (autoFit) return fit()
    if (cam && cam.kind === 'zoom') {
      cam.cx += dw / 2
      cam.cy += dh / 2
    }
    view = { ...view, x: view.x + dw / 2, y: view.y + dh / 2 }
    apply()
  }).observe(viewport)
  updateMedalButton()
  vscode.postMessage({ type: 'ready' })
})()
