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
    if (!(rf && rf === rt)) {
      if (outside(from)) pts.push({ x: geo.W + 0.8, y: from.y }, { x: geo.W + 0.8, y: cy }, { x: geo.W - 0.4, y: cy })
      else if (rf && rf.kind === 'dorm') pts.push({ x: geo.aisle, y: from.y }, { x: geo.aisle, y: cy })
      else if (rf) pts.push({ x: doorX(rf), y: entryY(rf) }, { x: doorX(rf), y: cy })
      else pts.push({ x: from.x, y: cy })
      if (rt && rt.kind === 'dorm') pts.push({ x: geo.aisle, y: cy }, { x: geo.aisle, y: to.y })
      else if (rt) pts.push({ x: doorX(rt), y: cy }, { x: doorX(rt), y: entryY(rt) }, { x: rt.x1 - 0.5, y: entryY(rt) }, { x: rt.x1 - 0.5, y: to.y })
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

  const sceneW = () => (geo ? geo.vw : 850)
  const sceneH = () => (geo ? geo.vh : 530)
  const apply = () => {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
    $('zoomLevel').textContent = `${Math.round(view.scale * 100)}%`
    persist()
  }
  const fit = () => {
    const w = viewport.clientWidth - (drawer.classList.contains('open') ? drawer.offsetWidth : 0)
    const scale = Math.min(w / sceneW(), viewport.clientHeight / sceneH()) * 0.97
    view = { scale, x: (w - sceneW() * scale) / 2, y: (viewport.clientHeight - sceneH() * scale) / 2 }
    apply()
  }
  const zoomAt = (factor, cx, cy) => {
    autoFit = false
    const scale = Math.min(MAX, Math.max(MIN, view.scale * factor))
    const k = scale / view.scale
    view = { scale, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k }
    world.classList.add('smooth')
    apply()
    clearTimeout(zoomAt.t)
    zoomAt.t = setTimeout(() => world.classList.remove('smooth'), 160)
  }
  if (view) apply()

  const scenePoint = e => {
    const rect = world.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / view.scale, y: (e.clientY - rect.top) / view.scale }
  }

  viewport.addEventListener('wheel', e => {
    e.preventDefault()
    const rect = viewport.getBoundingClientRect()
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top)
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
    press = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, hit: pick(e, DRAGGABLE) }
    viewport.setPointerCapture?.(e.pointerId)
  })

  viewport.addEventListener('pointermove', e => {
    if (!press) return
    const dx = e.clientX - press.x
    const dy = e.clientY - press.y
    if (!press.moved && Math.hypot(dx, dy) < 5) return
    if (!press.moved) {
      press.moved = true
      if (press.hit) startGrab(press.hit, e)
      else viewport.classList.add('dragging')
    }
    if (grab) moveGrab(e)
    else {
      autoFit = false
      view = { ...view, x: press.vx + dx, y: press.vy + dy }
      apply()
    }
  })

  const endPress = e => {
    if (!press) return
    const p = press
    press = null
    viewport.classList.remove('dragging')
    if (grab) return releaseGrab(e)
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
    const hit = pick(e, '[data-skill],[data-session],[data-lab],[data-pet],[data-bag]')
    if (!hit) return
    if (hit.dataset.lab) return openDrawer('labs', hit.dataset.lab)
    if (hit.dataset.bag) return floatText(scenePoint(e), '🪰 ¡a la papelera!')
    if (hit.dataset.pet !== undefined) catClicks(hit, e)
    flashTag(keyOf(hit))
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
  const release = key => {
    held.delete(key)
    const el = findEl(key)
    if (!el) return
    el.style.removeProperty('visibility')
    el.classList.add('reappear')
    setTimeout(() => el.classList.remove('reappear'), 500)
  }

  const bagShape = '<ellipse rx="8" ry="3" fill="#000" opacity=".2"/><path d="M-7 0 q-2 -10 7 -12 q9 2 7 12 z" fill="#2B2B2E"/><path d="M-2.5 -11.5 l2.5 -4 l2.5 4" stroke="#2B2B2E" stroke-width="2.2" fill="none"/><path d="M-3.5 -6 q3.5 2 7 0" stroke="#5A5A60" stroke-width="1" fill="none"/>'

  // a carried character: .face holds the facing (an attribute), .body the CSS animations, .props the scene's
  // accessories; keeping them on separate elements stops one transform from overriding another
  function makeGhost(kind, el) {
    const g = document.createElementNS(SVG_NS, 'g')
    g.setAttribute('class', `carry ${kind}`)
    let body
    if (kind === 'bag') body = bagShape
    else if (kind === 'pet') body = `<use href="#pt-${el.dataset.coat || 'gris'}"></use>`
    else body = `<use href="#${kind === 'session' ? 'ag' : 'ca'}" color="${el.dataset.color || '#D97757'}"></use>`
    g.innerHTML = `<g class="face"><g class="body">${body}</g><g class="props"></g></g><text class="alert" y="-30" text-anchor="middle">!</text>`
    overlay.appendChild(g)
    if (kind === 'pet') setFace(g, facingOf(el))
    return g
  }
  const place = (g, p) => g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`)
  const setFace = (g, dir) => {
    g.dataset.dir = dir < 0 ? '-1' : '1'
    g.querySelector('.face')?.setAttribute('transform', dir < 0 ? 'scale(-1,1)' : 'scale(1,1)')
  }
  // which way a patrolling cat looks right now: the sign of its facing group's current matrix
  function facingOf(el) {
    const m = el.querySelector(':scope > g')?.getCTM?.()
    return m && m.a < 0 ? -1 : 1
  }

  function startGrab(el, e) {
    const kind = el.dataset.bag ? 'bag' : el.dataset.pet !== undefined ? 'pet' : el.dataset.skill ? 'skill' : 'session'
    const key = keyOf(el)
    grab = {
      key,
      kind,
      id: el.dataset.bag || el.dataset.skill || el.dataset.session || el.dataset.pet,
      home: el.dataset.home ? el.dataset.home.split(',').map(Number) : null,
      asleep: el.dataset.asleep === '1',
      ghost: makeGhost(kind, el),
      name: el.dataset.name || '',
    }
    grab.ghost.classList.add('held')
    held.add(key)
    hideHeld()
    moveGrab(e)
    beep(kind === 'bag' ? [220, 180] : [660, 990], 0.05)
    if (kind === 'skill' && grab.asleep) unlock('wake')
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
    const p = scenePoint(e)
    place(grab.ghost, { x: p.x, y: p.y + 14 })
    const bin = binUnder(e)
    scene.querySelectorAll('[data-bin]').forEach(b => b.classList.toggle('hot', b === bin))
  }

  function releaseGrab(e) {
    const g = grab
    grab = null
    scene.querySelectorAll('[data-bin].hot').forEach(b => b.classList.remove('hot'))
    g.ghost.classList.remove('held')
    const p = scenePoint(e)
    const bin = binUnder(e)
    if (bin) return binIt(g, p, bin)
    const drop = { x: p.x, y: p.y + 14 }
    place(g.ghost, drop)
    g.ghost.classList.add('landed')
    if (g.kind === 'bag') {
      const tile = tileOf(drop)
      bags = bags.map(b => (b.id === g.id ? { ...b, x: tile.x, y: tile.y } : b))
      persist()
      g.ghost.remove()
      held.delete(g.key)
      return renderBags()
    }
    if (g.kind === 'pet') return catReaction(g, drop)
    if (!g.home) return setTimeout(() => finish(g), 450)
    const path = route(tileOf(drop), { x: g.home[0], y: g.home[1] })
    setTimeout(() => walk(g, path, () => finish(g)), 420)
  }

  function finish(g) {
    g.ghost.remove()
    release(g.key)
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
  function binIt(g, p, bin) {
    const r = bin.getBoundingClientRect()
    const target = scenePoint({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })
    g.ghost.style.setProperty('--tx', `${(target.x - p.x).toFixed(1)}px`)
    g.ghost.style.setProperty('--ty', `${(target.y - p.y - 14).toFixed(1)}px`)
    place(g.ghost, { x: p.x, y: p.y + 14 })
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
      const sprite = g.ghost.querySelector('use')?.outerHTML || ''
      g.ghost.innerHTML = `<g class="face"><g class="body">${sprite}</g><g class="props"></g></g><text class="alert" y="-26" text-anchor="middle">¡miau!</text>`
      setFace(g.ghost, 1)
      const out = bin.dataset.bin === 'out'
      const land = iso(out ? Math.round(geo.W * 0.55) + 2.5 : 3, out ? geo.H + 1.2 : corridorY())
      g.ghost.style.setProperty('--fx', `${(target.x - land.x).toFixed(1)}px`)
      g.ghost.style.setProperty('--fy', `${(target.y - land.y).toFixed(1)}px`)
      place(g.ghost, land)
      g.ghost.classList.add('popout')
      beep([880, 660, 990], 0.08)
      setTimeout(() => finish(g), 1300)
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
      text: '🚗 ¡bip bip!', cls: 'r-scared', ms: 2400, sound: [880, 440, 880, 440],
      props: '<g class="p-car"><rect x="-14" y="10" width="28" height="9" rx="3" fill="#C8423A"/><rect x="-8" y="5" width="15" height="6" rx="2" fill="#E2685C"/><rect x="-6" y="6" width="5" height="4" fill="#CFE8F5"/><rect x="0" y="6" width="5" height="4" fill="#CFE8F5"/><circle cx="-8" cy="19" r="3" fill="#222"/><circle cx="8" cy="19" r="3" fill="#222"/><rect x="12" y="12" width="3" height="2" fill="#FFE34F"/></g>',
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
    const step = now => {
      if (!g.ghost.isConnected) return
      const k = Math.min(1, (now - start) / ms)
      place(g.ghost, { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * height })
      if (k < 1) return requestAnimationFrame(step)
      g.ghost.classList.add('landed')
      beep([700], 0.05)
      setTimeout(done, 220)
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
    const leave = () => {
      g.ghost.classList.add('leaving')
      setTimeout(() => finish(g), 380)
    }
    if (!r.move) return setTimeout(leave, r.ms)
    // the nyan cat dashes along, rainbow and all, in the way it faces
    const dir = Number(g.ghost.dataset.dir || 1)
    setTimeout(() => walk(g, [drop, { x: drop.x + dir * r.move, y: drop.y }], leave, 60), 350)
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
    setTimeout(() => t.remove(), 1400)
  }

  // Operación Bigotes: helmeted cats roll tanks along the street, firing tracers that burst into explosions
  let deploying = false
  function deploy() {
    if (!geo || deploying) return
    deploying = true
    unlock('military')
    beep([392, 392, 392, 523, 659, 523, 784], 0.13)
    const lanes = [geo.H + 2.6, geo.H + 3.7]
    const fires = []
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
        walk({ ghost: g }, [iso(-4, lane), iso(geo.W + 4, lane)], () => g.remove(), 55)
        const timer = setInterval(() => {
          if (!g.isConnected) return clearInterval(timer)
          shoot(g)
        }, 650 + Math.random() * 600)
        fires.push(timer)
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
    setTimeout(() => {
      fires.forEach(clearInterval)
      deploying = false
    }, 22_000)
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
      autoFit = true
      fit()
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
        autoFit = true
        fit()
      }
      else if (act === 'layout') drawer.classList.contains('open') && tab === btn.dataset.tab ? closeDrawer() : openDrawer(btn.dataset.tab)
      else if (act === 'close') closeDrawer()
      else vscode.postMessage({ type: act })
    })
  })
  document.querySelectorAll('#drawer nav button').forEach(btn => btn.addEventListener('click', () => openDrawer(btn.dataset.tab)))

  // ---------- drawer ----------

  function openDrawer(which, target) {
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

  // ---------- medals ----------

  const MEDALS = [
    ['pet', '💕', 'Mimos', 'Doble clic a un gato'],
    ['flip', '🤸', 'Acróbata', 'Cinco clics rápidos a un gato'],
    ['bin-cat', '🗑️', 'Gato al cubo', 'Echa un gato a la papelera o al contenedor'],
    ['konami', '🎉', 'Desfile gatuno', '↑↑↓↓←→←→BA'],
    ['military', '🎖️', 'Operación Bigotes', '15 clics a un gato militar o en un cuartel'],
    ['r-gym', '💪', 'Gato fitness', 'Suelta un gato en un gimnasio'],
    ['r-cafe', '🥛', 'Barista', 'Suelta un gato en una cafetería'],
    ['r-library', '📚', 'Ratón de biblioteca', 'Suelta un gato en una biblioteca'],
    ['r-arcade', '🌈', 'Nyan', 'Suelta un gato en un arcade'],
    ['r-lab', '🧪', 'Experimento fallido', 'Suelta un gato en un laboratorio'],
    ['r-military', '🪖', 'Recluta', 'Suelta un gato en un cuartel'],
    ['r-smoking', '😮‍💨', 'Fumador pasivo', 'Suelta un gato en la sala de fumadores'],
    ['joseluis', '🚬', 'José Luis', 'Llama a un gato José Luis y suéltalo en la sala de fumadores'],
    ['r-dorm', '😴', 'Siesta', 'Suelta un gato en las literas'],
    ['r-patio', '🦋', 'Cazamariposas', 'Suelta un gato en el patio'],
    ['r-corridor', '🐾', 'Patrulla', 'Suelta un gato en el pasillo'],
    ['r-street', '🚗', 'Susto', 'Suelta un gato en la calle'],
    ['bag', '🧹', 'Barrendero', 'Tira una bolsa de basura'],
    ['bags10', '♻️', 'Ecohéroe', 'Tira 10 bolsas de basura'],
    ['wake', '⏰', 'Despertador', 'Arrastra una skill que duerme'],
    ['stop', '✋', 'Alto el fuego', 'Echa una skill o un agente a la papelera'],
    ['night', '🌙', 'Noctámbulo', 'Haz que sea de noche con el reloj'],
    ['all', '🏆', 'Coleccionista', 'Consigue todas las demás medallas'],
  ]
  function unlock(id) {
    if (medals[id]) return
    const def = MEDALS.find(m => m[0] === id)
    if (!def) return
    medals = { ...medals, [id]: Date.now() }
    persist()
    vscode.postMessage({ type: 'medal', id })
    medalToast(def)
    updateMedalButton()
    if (id !== 'all' && MEDALS.every(m => m[0] === 'all' || medals[m[0]])) setTimeout(() => unlock('all'), 1800)
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
       <div class="medals">${MEDALS.map(([id, icon, name, hint]) => {
         const at = medals[id]
         return `<div class="medal${at ? ' got' : ''}" title="${at ? `Conseguida el ${new Date(at).toLocaleDateString()}` : 'Bloqueada'}"><span class="mi">${at ? icon : '🔒'}</span><b>${at ? esc(name) : '???'}</b><small>${esc(hint)}</small></div>`
       }).join('')}</div>`
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
  const seasonName = v => SEASON_NAMES[v] || v.charAt(0).toUpperCase() + v.slice(1)
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
        <span class="field"><span>Disfraz de los robots</span></span>${skinPicker('agent', 'agentSkin', 'ag', '#3D85C6')}
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
          vscode.postMessage({ type: 'setSetting', key: kind === 'skill' ? 'skillSkin' : 'agentSkin', value: b.dataset.skin })
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
    } else if (msg.type === 'model') {
      model = msg.model
      if (model.needsSetup && !setupSeen && !setup) {
        setupSeen = true
        openSetup()
      } else if (setup && setup.step === 2) renderSetup()
      if (model.medals) {
        medals = { ...model.medals, ...medals }
        updateMedalButton()
      }
      soundOn = model.settings.sound
      const typing = document.activeElement && drawer.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && !['checkbox', 'range', 'color'].includes(document.activeElement.type)
      if (drawer.classList.contains('open') && !typing) renderDrawer()
    } else if (msg.type === 'setupFolders' && setup) {
      setup.root = msg.root
      setup.folders = msg.folders.map(f => ({ ...f, on: !f.covered, theme: 'lab' }))
      renderSetup()
    } else if (msg.type === 'sound') beep(msg.kind === 'done' ? [523, 659, 784] : [988, 740, 988])
  })
  window.addEventListener('resize', () => autoFit && geo && fit())
  updateMedalButton()
  vscode.postMessage({ type: 'ready' })
})()
