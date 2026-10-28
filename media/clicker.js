// The red button game: the easter egg that opens once every other medal is earned.
// The economy comes first and is pure (tools/ loads it for balance runs); the screen is built only inside the webview.
;(() => {
  const HELPERS = [
    // rate: presses per second each; every: seconds between the visible presses of one sprite
    { id: 'cat', icon: '🐱', name: 'Gato pulsador', verb: 'da un zarpazo', rate: 0.1, base: 40, growth: 1.15, max: 50, every: 2.2 },
    { id: 'skill', icon: '🧪', name: 'Skill becaria', verb: 'salta encima', rate: 0.8, base: 500, growth: 1.15, max: 50, every: 1.7 },
    { id: 'robot', icon: '🤖', name: 'Robot de turno', verb: 'pistón hidráulico', rate: 5, base: 6000, growth: 1.15, max: 50, every: 1.25 },
    { id: 'drone', icon: '🛸', name: 'Escuadrón de drones', verb: 'láser de precisión', rate: 30, base: 60000, growth: 1.15, max: 40, every: 0.95 },
    { id: 'claude', icon: '✴️', name: 'Claude en bucle', verb: 'pulsa sin descanso', rate: 200, base: 800000, growth: 1.15, max: 25, every: 0.6 },
  ]
  const MILESTONES = [10, 25, 50]
  const GOAL = 1e9
  const OFFLINE_MAX_S = 8 * 3600

  // the upgrade tree: each node appears once all the nodes it needs are bought
  const NODE = (id, icon, name, max, base, growth, req, x, y, desc) => ({ id, icon, name, max, base, growth, req, x, y, desc })
  const pct = n => `${Math.round(n * 100)} %`
  const TREE = [
    NODE('core', '🔴', 'El botón', 1, 0, 1, [], 0, 0, () => 'Donde empieza todo.'),
    NODE('f1', '👆', 'Dedo fuerte', 25, 50, 1.35, ['core'], -1.2, 0, l => `+1 por clic por nivel (ahora +${l})`),
    NODE('f2', '🦾', 'Dedo de acero', 10, 5000, 2, ['f1'], -2.3, -0.7, l => `Cada clic suma además el ${l} % de lo que haces por segundo`),
    NODE('f3', '💥', 'Crítico', 10, 2000, 1.8, ['f1'], -2.3, 0.7, l => `${pct(0.03 * l)} de clics críticos`),
    NODE('f4', '☄️', 'Crítico demoledor', 5, 50000, 3, ['f3'], -3.4, 1.1, l => `Los críticos valen ×${10 + 5 * l}`),
    NODE('f5', '✌️', 'Doble toque', 5, 20000, 2.5, ['f2'], -3.4, -1.1, l => `${pct(0.1 * l)} de que un clic cuente doble`),
    NODE('c1', '🔥', 'Combo', 4, 500, 4, ['core'], -0.9, -1.3, l => (l ? `Pulsar rápido llena el combo hasta ×${1 + 0.5 * l}` : 'Pulsar rápido multiplica tus clics')),
    NODE('c2', '⏳', 'Combo largo', 3, 10000, 4, ['c1'], -1.6, -2.3, l => `El combo tarda un ${25 * l} % más en enfriarse`),
    NODE('c3', '🌋', 'Fiebre', 3, 200000, 5, ['c2'], -2.6, -2.6, l => `Con el combo lleno los ayudantes van ×${1 + l}`),
    NODE('l1', '🌟', 'Botón dorado', 1, 1000, 1, ['core'], 0, -1.5, () => 'De vez en cuando cruza un botón dorado: ¡atrápalo!'),
    NODE('l2', '🧲', 'Imán dorado', 4, 25000, 3, ['l1'], -0.5, -2.6, l => `Salen un ${15 * l} % más a menudo`),
    NODE('l3', '⚡', 'Frenesí largo', 4, 60000, 3, ['l1'], 0.6, -2.6, l => `El frenesí dura ${10 + 3 * l} s`),
    NODE('l4', '💰', 'Premio gordo', 3, 300000, 4, ['l2', 'l3'], 0, -3.6, l => `Los premios dorados valen ×${2 ** l}`),
    NODE('k1', '🧰', 'Cofres', 1, 3000, 1, ['core'], 1.0, -1.2, () => 'Cada cierto número de clics cae un cofre'),
    NODE('k2', '🗝️', 'Cofres frecuentes', 4, 30000, 3, ['k1'], 1.7, -2.2, l => `Hacen falta un ${15 * l} % menos de clics`),
    NODE('k3', '💎', 'Mejor botín', 4, 80000, 3, ['k1'], 2.5, -1.5, l => `Más probabilidad de épicos y legendarios (nivel ${l})`),
    NODE('k4', '😼', 'Gato cerrajero', 1, 500000, 1, ['k2', 'catU'], 2.7, -2.7, () => 'Las pulsaciones de los ayudantes también llenan cofres'),
    NODE('catU', '🐾', 'Uñas afiladas', 3, 200, 4, ['core'], 1.3, 0.35, l => `Gatos ×${2 ** l}`),
    NODE('catC', '🏷️', 'Pienso de oferta', 4, 400, 3, ['catU'], 1.2, 1.5, l => `Gatos un ${5 * l} % más baratos`),
    NODE('skillU', '📚', 'Skills con doctorado', 3, 2500, 4, ['catU'], 2.4, 0.5, l => `Skills ×${2 ** l}`),
    NODE('skillC', '🏷️', 'Becas', 4, 5000, 3, ['skillU'], 2.4, 1.6, l => `Skills un ${5 * l} % más baratas`),
    NODE('robotU', '🔩', 'Pistones turbo', 3, 30000, 4, ['skillU'], 3.5, 0.3, l => `Robots ×${2 ** l}`),
    NODE('robotC', '🏷️', 'Chatarrería', 4, 60000, 3, ['robotU'], 3.6, 1.4, l => `Robots un ${5 * l} % más baratos`),
    NODE('droneU', '🔭', 'Láser enfocado', 3, 300000, 4, ['robotU'], 4.6, 0, l => `Drones ×${2 ** l}`),
    NODE('droneC', '🏷️', 'Hangar compartido', 4, 600000, 3, ['droneU'], 4.8, 1.1, l => `Drones un ${5 * l} % más baratos`),
    NODE('claudeU', '🧠', 'Contexto infinito', 3, 2000000, 4, ['droneU'], 5.7, -0.4, l => `Claude ×${2 ** l}`),
    NODE('sing', '🌀', 'Singularidad', 3, 3000000, 5, ['claudeU', 'c3', 'l4'], 4.2, -2.9, l => `Todo ×${2 ** l}`),
  ]
  const TREE_BY_ID = Object.fromEntries(TREE.map(n => [n.id, n]))
  const RARITIES = [
    { id: 'comun', name: 'Común', color: '#C9CED6' },
    { id: 'raro', name: 'Raro', color: '#4FA3FF' },
    { id: 'epico', name: 'Épico', color: '#B46CFF' },
    { id: 'legendario', name: 'Legendario', color: '#FFB020' },
  ]

  const fresh = () => ({ life: 0, coins: 0, helpers: {}, tree: { core: 1 }, at: 0, start: 0, clicks: 0, chestClicks: 0, golden: 0, chests: 0, bestCombo: 1, ended: 0 })
  const lvl = (G, id) => G.tree[id] || 0
  const count = (G, h) => G.helpers[h.id] || 0
  const milestoneMult = n => 2 ** MILESTONES.filter(m => n >= m).length
  const helperMult = (G, h) => milestoneMult(count(G, h)) * 2 ** lvl(G, `${h.id}U`)
  const helperCost = (G, h) => Math.ceil(h.base * h.growth ** count(G, h) * 0.95 ** lvl(G, `${h.id}C`))
  const nodeCost = (G, n) => Math.ceil(n.base * n.growth ** lvl(G, n.id))
  const nodeShown = (G, n) => n.req.every(r => lvl(G, r) > 0)
  const helperShown = (G, i) => i === 0 || count(G, HELPERS[i - 1]) > 0 || count(G, HELPERS[i]) > 0
  const comboMax = G => 1 + 0.5 * lvl(G, 'c1')
  // fx: the moment's boosts that the screen owns (frenzy, combo heat)
  const globalMult = (G, fx) => 2 ** lvl(G, 'sing') * (fx.frenzy || 1)
  const fever = (G, fx) => (fx.comboFull && lvl(G, 'c3') ? 1 + lvl(G, 'c3') : 1)
  const helperRate = (G, h, fx) => h.rate * count(G, h) * helperMult(G, h) * globalMult(G, fx) * fever(G, fx)
  const rate = (G, fx = {}) => HELPERS.reduce((sum, h) => sum + helperRate(G, h, fx), 0)
  const clickValue = (G, fx = {}) => (1 + lvl(G, 'f1') + rate(G, fx) * 0.01 * lvl(G, 'f2')) * (fx.combo || 1) * globalMult(G, fx)
  const chestEvery = G => Math.round(200 * 0.85 ** lvl(G, 'k2'))
  const goldenEvery = G => 90 * 0.85 ** lvl(G, 'l2')
  const frenzySeconds = G => 10 + 3 * lvl(G, 'l3')
  const rarityWeights = G => {
    const k = lvl(G, 'k3')
    return [Math.max(20, 60 - 6.5 * k), 28 + 2 * k, 10 + 3 * k, 2 + 1.5 * k]
  }
  const maxedAll = G => HELPERS.every(h => count(G, h) >= h.max) && TREE.every(n => lvl(G, n.id) >= n.max)

  function buyHelper(G, h, n = 1) {
    let bought = 0
    while (bought < n && count(G, h) < h.max && G.coins >= helperCost(G, h)) {
      G.coins -= helperCost(G, h)
      G.helpers[h.id] = count(G, h) + 1
      bought++
    }
    return bought
  }
  function buyNode(G, n) {
    if (!nodeShown(G, n) || lvl(G, n.id) >= n.max || G.coins < nodeCost(G, n)) return false
    G.coins -= nodeCost(G, n)
    G.tree[n.id] = lvl(G, n.id) + 1
    return true
  }
  // presses count up to the goal and are spent as coins; returns what actually counted
  function earn(G, n) {
    if (G.ended) return 0
    n = Math.max(0, Math.min(n, GOAL - G.life))
    G.life += n
    G.coins += n
    if (!G.start && n) G.start = Date.now()
    return n
  }

  const ECON = { HELPERS, TREE, TREE_BY_ID, MILESTONES, GOAL, RARITIES, fresh, lvl, count, milestoneMult, helperMult, helperCost, nodeCost, nodeShown, helperShown, comboMax, rate, helperRate, clickValue, chestEvery, goldenEvery, frenzySeconds, rarityWeights, maxedAll, buyHelper, buyNode, earn }
  if (typeof module !== 'undefined') module.exports = ECON
  if (typeof window === 'undefined') return

  // ---------------------------------------------------------------------------------------------------------------
  // the screen

  const SVG = 'http://www.w3.org/2000/svg'
  const RED_STEPS = [[10, 'red10'], [100, 'red100'], [1000, 'red1000'], [10000, 'red10000'], [77777, 'red77777']]
  const fmt = n => {
    n = Math.floor(n)
    if (n < 1e6) return n.toLocaleString('es-ES')
    if (n < 1e9) return `${(n / 1e6).toLocaleString('es-ES', { maximumFractionDigits: n < 1e7 ? 2 : 1 })} M`
    return n >= GOAL ? '1.000 M' : `${(n / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 0 })} M`
  }
  const fmtRate = n => (n < 10 ? n.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : fmt(n))
  const SL = () => window.SL
  const calm = () => SL()?.calm() ?? false
  const rnd = (a, b) => a + Math.random() * (b - a)

  let G = null
  const fx = { combo: 1, comboFull: false, frenzy: 1 }
  let combo = 0
  let lastClick = 0
  let frenzyUntil = 0
  let frenzyMult = 1
  let carry = 0
  let ticker = 0
  let root = null
  let ui = null
  let chestReady = 0
  let saveAt = 0

  function load() {
    if (G) return G
    const m = SL().medals
    try {
      G = { ...fresh(), ...JSON.parse(m['~rg'] || 'null') }
    } catch {
      G = fresh()
    }
    if (!m['~rg']) migrate(m)
    return G
  }
  // players of the old in-map shop keep their presses, coins and helpers; the old golden buttons come back as coins
  function migrate(m) {
    G.life = Math.min(GOAL, m['~red'] || 0)
    G.coins = m['~redc'] ?? G.life
    if (m['~redend']) G.ended = m['~redend']
    G.start = m['~redstart'] || 0
    G.clicks = m['~redclicks'] || 0
    let old = {}
    try {
      old = JSON.parse(m['~redup'] || '{}')
    } catch {}
    for (const h of HELPERS) if (old[h.id]) G.helpers[h.id] = Math.min(h.max, old[h.id])
    if (old.finger) G.tree.f1 = Math.min(25, old.finger)
    if (old.gold) G.coins += 50000 * (8 ** old.gold - 1) / 7
    G.at = m['~redat'] || 0
  }
  function save(force) {
    const now = Date.now()
    if (!force && now - saveAt < 1000) return
    saveAt = now
    G.at = now
    const m = { ...SL().medals, '~rg': JSON.stringify(G), '~red': G.life }
    SL().setMedals(m)
  }
  function checkMedals() {
    for (const [k, id] of RED_STEPS) if (G.life >= k) SL().unlock(id)
    if (rate(G, fx) >= 100) SL().unlock('redrate')
    if (maxedAll(G)) SL().unlock('redmax')
  }

  // production keeps going while the panel shows the map; a long gap (panel closed) pays half, up to 8 h
  function start() {
    load()
    if (ticker || G.ended) return
    if (G.at) {
      const gap = Math.min((Date.now() - G.at) / 1000, OFFLINE_MAX_S)
      const away = Math.floor(rate(G) * gap * 0.5)
      if (gap > 30 && away > 0) {
        earn(G, away)
        G.away = away
      }
    }
    G.at = Date.now()
    ticker = setInterval(tick, 200)
  }
  function tick() {
    const now = Date.now()
    const dt = Math.min((now - (G.at || now)) / 1000, OFFLINE_MAX_S)
    G.at = now
    if (frenzyUntil && now > frenzyUntil) {
      frenzyUntil = 0
      frenzyMult = 1
      ui?.stage.classList.remove('frenzy')
    }
    fx.frenzy = frenzyMult
    // the combo cools down when the clicks stop
    const cool = 1.2 * (1 + 0.25 * lvl(G, 'c2'))
    if (combo > 0 && now - lastClick > cool * 1000) combo = Math.max(0, combo - 60 * dt)
    updateCombo()
    carry += rate(G, fx) * (dt <= 5 ? dt : 5 + (dt - 5) * 0.5)
    const whole = Math.floor(carry)
    carry -= whole
    if (whole) earn(G, whole)
    if (G.life >= GOAL) return finish()
    checkMedals()
    save()
    SL().mapLabel()
    if (ui) refresh()
  }
  function updateCombo() {
    const top = comboMax(G)
    const fill = Math.min(1, combo / 50)
    fx.combo = lvl(G, 'c1') ? 1 + fill * (top - 1) : 1
    fx.comboFull = lvl(G, 'c1') > 0 && fill >= 1
    if (fx.comboFull && lvl(G, 'c1') >= 4) SL().unlock('redcombo')
    G.bestCombo = Math.max(G.bestCombo || 1, fx.combo)
  }

  // ---------- building the screen ----------

  const SPRITES = { cat: () => `#pt-${SL().catCoat()}`, skill: () => '#ca', robot: () => '#ag', drone: () => '#sd0', claude: () => '#ag' }
  const COLORS = { skill: '#D97757', robot: '#3D85C6', drone: '#3D85C6', claude: '#F2C230' }
  // each kind stands on its own arc around the button (angles in degrees, 0 = right, 90 = down)
  const ARCS = { cat: [105, 160], skill: [165, 215], robot: [220, 290], drone: [295, 355], claude: [15, 75] }
  // a few sprites stand for the whole crew: more of them as the crew grows
  const SHOWN = 6
  const shownOf = n => (n ? Math.min(SHOWN, Math.ceil(Math.sqrt(n))) : 0)

  function open() {
    start()
    if (root) return
    root = document.createElement('div')
    root.id = 'rg'
    root.innerHTML = `
      <canvas class="rg-bg"></canvas>
      <div class="rg-stage">
        <svg class="rg-arena" viewBox="-270 -175 540 330" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="rg-cap" cx="40%" cy="30%" r="75%"><stop offset="0" stop-color="#FF8A7A"/><stop offset=".45" stop-color="#E8352B"/><stop offset="1" stop-color="#8E1414"/></radialGradient>
            <radialGradient id="rg-gold" cx="40%" cy="30%" r="75%"><stop offset="0" stop-color="#FFF4B0"/><stop offset=".45" stop-color="#F5C02A"/><stop offset="1" stop-color="#9A6A06"/></radialGradient>
            <radialGradient id="rg-halo"><stop offset="0" stop-color="#FF5A4A" stop-opacity=".55"/><stop offset="1" stop-color="#FF5A4A" stop-opacity="0"/></radialGradient>
            <linearGradient id="rg-base" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5A606B"/><stop offset="1" stop-color="#23262C"/></linearGradient>
          </defs>
          <g class="rg-floor"><ellipse cx="0" cy="40" rx="250" ry="110" fill="#000" opacity=".25"/><ellipse class="rg-ring-floor" cx="0" cy="40" rx="200" ry="88" fill="none" stroke="#FFFFFF" stroke-opacity=".08" stroke-width="2" stroke-dasharray="6 10"/></g>
          <g class="rg-beams"></g>
          <g class="rg-back"></g>
          <g class="rg-button">
            <ellipse cx="0" cy="40" rx="120" ry="50" fill="url(#rg-halo)" class="rg-halo"/>
            <ellipse cx="0" cy="52" rx="92" ry="34" fill="#000" opacity=".35"/>
            <path d="M-88 20 v20 a88 32 0 0 0 176 0 v-20 z" fill="url(#rg-base)"/>
            <ellipse cx="0" cy="20" rx="88" ry="32" fill="#646B77"/>
            <ellipse cx="0" cy="20" rx="74" ry="26" fill="#1E2126"/>
            <g class="rg-cap">
              <path d="M-62 -14 v30 a62 22 0 0 0 124 0 v-30 z" fill="#8E1414" class="rg-cap-side"/>
              <ellipse cx="0" cy="-14" rx="62" ry="22" fill="url(#rg-cap)" class="rg-cap-top"/>
              <ellipse cx="-20" cy="-22" rx="22" ry="7" fill="#FFF" opacity=".45"/>
            </g>
          </g>
          <g class="rg-front"></g>
          <g class="rg-chest" style="display:none"></g>
        </svg>
      </div>
      <canvas class="rg-fx"></canvas>
      <header class="rg-top">
        <div class="rg-count"><b class="rg-life">0</b><small>pulsaciones</small></div>
        <div class="rg-meta"><span class="rg-coins"></span><span class="rg-rates"></span></div>
        <div class="rg-combo" title="Combo"><i></i><span>×1</span></div>
        <div class="rg-goal" title="Meta: mil millones"><i></i></div>
        <button class="rg-treebtn">🌳 Árbol</button>
        <button class="rg-close" title="Volver al mapa (Esc)">✕</button>
      </header>
      <aside class="rg-side"><h4>Ayudantes</h4><div class="rg-helpers"></div></aside>
      <footer class="rg-news"><span></span></footer>
      <div class="rg-tree" hidden>
        <svg class="rg-tree-svg"><g class="rg-tree-view"><g class="rg-links"></g><g class="rg-nodes"></g></g></svg>
        <div class="rg-card"></div>
        <button class="rg-tree-close">↩ Volver al botón</button>
      </div>`
    document.body.appendChild(root)
    ui = {
      root,
      stage: root.querySelector('.rg-stage'),
      arena: root.querySelector('.rg-arena'),
      cap: root.querySelector('.rg-cap'),
      button: root.querySelector('.rg-button'),
      back: root.querySelector('.rg-back'),
      front: root.querySelector('.rg-front'),
      beams: root.querySelector('.rg-beams'),
      bg: root.querySelector('.rg-bg'),
      fxc: root.querySelector('.rg-fx'),
      life: root.querySelector('.rg-life'),
      coins: root.querySelector('.rg-coins'),
      rates: root.querySelector('.rg-rates'),
      comboBar: root.querySelector('.rg-combo i'),
      comboTxt: root.querySelector('.rg-combo span'),
      goal: root.querySelector('.rg-goal i'),
      helpers: root.querySelector('.rg-helpers'),
      news: root.querySelector('.rg-news span'),
      tree: root.querySelector('.rg-tree'),
      chest: root.querySelector('.rg-chest'),
      sprites: [],
      lastLife: -1,
      bumpAt: 0,
    }
    root.addEventListener('pointerdown', e => e.stopPropagation())
    root.addEventListener('wheel', e => e.stopPropagation(), { passive: true })
    ui.button.addEventListener('pointerdown', e => {
      e.preventDefault()
      press(e)
    })
    root.querySelector('.rg-close').addEventListener('click', close)
    root.querySelector('.rg-treebtn').addEventListener('click', () => toggleTree(true))
    root.querySelector('.rg-tree-close').addEventListener('click', () => toggleTree(false))
    ui.chest.addEventListener('pointerdown', e => {
      e.stopPropagation()
      openChest()
    })
    document.addEventListener('keydown', onKey)
    buildHelpers()
    buildSprites()
    sizeCanvases()
    ui.ro = new ResizeObserver(sizeCanvases)
    ui.ro.observe(root)
    news(true)
    ui.newsTimer = setInterval(() => news(), 9000)
    ui.raf = requestAnimationFrame(frame)
    root.animate([{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.9,.3,1)' })
    if (G.away) {
      setTimeout(() => bigText(`Mientras no estabas: +${fmt(G.away)}`, '#FFE34F'), 500)
      G.away = 0
    }
    if (chestReady) showChest()
    refresh()
    if (G.ended) setTimeout(showEnd, 300)
  }
  function close() {
    if (!root) return
    cancelAnimationFrame(ui.raf)
    clearInterval(ui.newsTimer)
    ui.ro.disconnect()
    document.removeEventListener('keydown', onKey)
    const r = root
    r.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.97)' }], { duration: 220 }).onfinish = () => r.remove()
    root = null
    ui = null
    save(true)
  }
  function onKey(e) {
    if (e.key === 'Escape') return ui && !ui.tree.hidden ? toggleTree(false) : close()
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && ui && ui.tree.hidden && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault()
      press(null)
    }
  }
  function sizeCanvases() {
    if (!ui) return
    const dpr = window.devicePixelRatio || 1
    for (const c of [ui.bg, ui.fxc]) {
      c.width = Math.round(root.clientWidth * dpr)
      c.height = Math.round(root.clientHeight * dpr)
      c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
    }
  }
  // arena coordinates → pixels on the canvases
  function toScreen(x, y) {
    const pt = ui.arena.createSVGPoint()
    pt.x = x
    pt.y = y
    const p = pt.matrixTransform(ui.arena.getScreenCTM())
    const r = root.getBoundingClientRect()
    return { x: p.x - r.left, y: p.y - r.top }
  }

  // ---------- helpers around the button ----------

  function buildSprites() {
    ui.back.innerHTML = ''
    ui.front.innerHTML = ''
    ui.sprites = []
    for (const h of HELPERS) {
      const n = shownOf(count(G, h))
      const [a0, a1] = ARCS[h.id]
      for (let i = 0; i < n; i++) {
        const a = ((a0 + ((a1 - a0) * (i + 0.5)) / n) * Math.PI) / 180
        const x = Math.cos(a) * 205
        const y = 30 + Math.sin(a) * 92 + (h.id === 'drone' ? -70 : 0)
        const g = document.createElementNS(SVG, 'g')
        g.setAttribute('class', `rg-h rg-${h.id}`)
        const scale = h.id === 'claude' ? 2 : 1.7
        const flip = x > 0 ? -1 : 1
        const color = COLORS[h.id] ? ` color="${COLORS[h.id]}"` : ''
        g.innerHTML =
          (h.id === 'robot' ? '<line class="rg-piston" x1="0" y1="0" x2="0" y2="0" stroke="#9BA6B5" stroke-width="7" stroke-linecap="round"/>' : '') +
          (h.id === 'drone' || h.id === 'claude' ? '<line class="rg-laser" x1="0" y1="0" x2="0" y2="0" stroke-linecap="round"/>' : '') +
          `<g class="rg-body"><ellipse cx="0" cy="2" rx="${10 * scale}" ry="${3 * scale}" fill="#000" opacity="${h.id === 'drone' ? 0.12 : 0.3}"/>` +
          (h.id === 'claude' ? `<circle cx="0" cy="-${18 * scale}" r="${22 * scale}" fill="url(#rg-halo)" class="rg-aura"/>` : '') +
          `<g transform="scale(${flip * scale},${scale})"><use href="${SPRITES[h.id]()}"${color}/></g></g>`
        g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`)
        ;(y < 30 ? ui.back : ui.front).appendChild(g)
        ui.sprites.push({ h, g, x, y, body: g.querySelector('.rg-body'), next: performance.now() + rnd(200, h.every * 1000) })
      }
    }
  }
  // one visible press: what the sprite does depends on its kind; the press lands on the button at the end
  function helperPress(s) {
    const { h, g, x, y } = s
    const toX = -x * 0.6
    const toY = (20 - y) * 0.6
    const body = s.body
    const dur = Math.min(600, h.every * 450)
    const hit = () => {
      if (!ui) return
      const share = (helperRate(G, h, fx) * h.every) / Math.max(1, shownOf(count(G, h)))
      capHit(0.35)
      const p = toScreen(x * 0.25, 10 + (y - 20) * 0.15)
      sparks(p.x, p.y, 6, h.id === 'claude' ? '#FFD84F' : '#FFB35A', 2.4)
      floatNum(toScreen(x * 0.85, y - 50), `+${fmtRate(share)}`, '#FFF4C8', 13)
      if (lvl(G, 'k4')) chestTick()
    }
    if (calm()) return hit()
    if (h.id === 'cat') {
      body.animate([{ transform: 'none' }, { transform: `translate(${toX * 0.35}px,${toY * 0.35}px) rotate(${x > 0 ? 18 : -18}deg)` }, { transform: 'none' }], { duration: dur, easing: 'cubic-bezier(.3,1.6,.5,1)' })
      setTimeout(hit, dur * 0.45)
    } else if (h.id === 'skill') {
      body.animate([{ transform: 'none' }, { transform: `translate(${toX * 0.4}px,${toY * 0.4 - 46}px) scale(1.1,.9)`, offset: 0.45 }, { transform: `translate(${toX * 0.5}px,${toY * 0.5 - 10}px) scale(1.15,.8)`, offset: 0.6 }, { transform: 'none' }], { duration: dur * 1.3, easing: 'ease-out' })
      setTimeout(hit, dur * 0.78)
    } else if (h.id === 'robot') {
      g.querySelector('.rg-piston').setAttribute('y1', '-24')
      // line ends are attributes, not animatable by WAAPI: the frame loop drives the piston
      s.piston = { t0: performance.now(), dur }
      body.animate([{ transform: 'none' }, { transform: `translate(${x > 0 ? 6 : -6}px,0)` }, { transform: 'none' }], { duration: dur })
      setTimeout(hit, dur * 0.5)
    } else if (h.id === 'drone' || h.id === 'claude') {
      s.laser = { t0: performance.now(), dur: dur * 0.9 }
      body.animate([{ transform: 'none' }, { transform: 'translate(0,-6px) scale(1.06)' }, { transform: 'none' }], { duration: dur })
      setTimeout(hit, dur * 0.3)
    }
  }

  // ---------- the player's press ----------

  function press(e) {
    if (G.ended) {
      capHit(1)
      const p = e ? pointer(e) : toScreen(0, -20)
      confetti(p.x, p.y, 20)
      return
    }
    const now = Date.now()
    if (now - lastClick < 1200 * (1 + 0.25 * lvl(G, 'c2'))) combo = Math.min(50, combo + 1)
    else combo = 1
    lastClick = now
    updateCombo()
    let value = clickValue(G, fx)
    const crit = Math.random() < 0.03 * lvl(G, 'f3')
    const dbl = Math.random() < 0.1 * lvl(G, 'f5')
    if (crit) value *= 10 + 5 * lvl(G, 'f4')
    if (dbl) value *= 2
    G.clicks++
    earn(G, Math.max(1, Math.floor(value)))
    if (G.clicks === 1 || G.life >= 10) checkMedals()
    chestTick()
    const p = e ? pointer(e) : toScreen(rnd(-30, 30), rnd(-30, -5))
    capHit(1)
    ring(toScreen(0, 20), crit ? '#FFD84F' : '#FF6A5A')
    sparks(p.x, p.y, crit ? 40 : 12 + Math.round(fx.combo * 4), crit ? '#FFD84F' : '#FF8A6A', crit ? 7 : 4.5)
    floatNum({ x: p.x + rnd(-28, 28), y: p.y - rnd(10, 34) }, `+${fmt(value)}`, crit ? '#FFD84F' : '#FFFFFF', crit ? 26 : 17 + Math.min(8, fx.combo * 2))
    if (crit) {
      bigText(`¡CRÍTICO ×${10 + 5 * lvl(G, 'f4')}!`, '#FFD84F')
      shake(10)
    } else if (dbl) floatNum({ x: p.x, y: p.y - 40 }, '¡DOBLE!', '#7FE3FF', 15)
    shake(1.5 + fx.combo * 1.2)
    SL().beep([180 + combo * 9 + (crit ? 400 : 0)], 0.02)
    if (G.life >= GOAL) finish()
    refresh()
  }
  function pointer(e) {
    const r = root.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function capHit(force) {
    if (!ui || calm()) return
    ui.cap.animate([{ transform: 'none' }, { transform: `translateY(${10 * force}px) scale(${1 + 0.06 * force},${1 - 0.14 * force})` }, { transform: `translateY(${-3 * force}px) scale(.98,1.04)` }, { transform: 'none' }], { duration: 220 + 80 * force, easing: 'ease-out' })
  }
  function shake(px) {
    if (!ui || calm() || px < 2) return
    const k = Math.min(px, 14)
    ui.stage.animate([0, 1, 2, 3, 4].map(i => ({ transform: i === 4 ? 'none' : `translate(${rnd(-k, k)}px,${rnd(-k, k) * 0.6}px)` })), { duration: 180 })
  }

  // ---------- particles, rings and numbers on the canvas ----------

  const parts = []
  function sparks(x, y, n, color, speed) {
    if (calm()) n = Math.min(n, 4)
    for (let i = 0; i < n && parts.length < 600; i++) {
      const a = rnd(0, Math.PI * 2)
      const v = rnd(0.4, 1) * speed
      parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.6, life: 1, decay: rnd(0.018, 0.035), color, size: rnd(1.5, 3.5) })
    }
  }
  function confetti(x, y, n) {
    const colors = ['#FF5A4A', '#FFD84F', '#4FA3FF', '#7FE37F', '#B46CFF', '#FFFFFF']
    for (let i = 0; i < n && parts.length < 700; i++) {
      const a = rnd(-Math.PI, 0)
      const v = rnd(3, 9)
      parts.push({ kind: 'confetti', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: rnd(0.006, 0.012), color: colors[i % colors.length], size: rnd(3, 6), rot: rnd(0, 6), vr: rnd(-0.3, 0.3) })
    }
  }
  function ring(p, color) {
    parts.push({ kind: 'ring', x: p.x, y: p.y, r: 30, life: 1, decay: 0.035, color })
  }
  function floatNum(p, text, color, size) {
    if (parts.filter(q => q.kind === 'text').length > 40) return
    parts.push({ kind: 'text', x: p.x, y: p.y, vx: rnd(-1.1, 1.1), vy: rnd(-2.4, -1.4), life: 1, decay: 0.016, color, size, text })
  }
  function bigText(text, color) {
    if (!ui) return
    const el = document.createElement('div')
    el.className = 'rg-big'
    el.style.color = color
    el.textContent = text
    // several at once stack downwards instead of piling on top of each other
    const busy = root.querySelectorAll('.rg-big').length
    el.style.top = `${42 + (busy % 4) * 11}%`
    root.appendChild(el)
    el.animate([{ transform: 'translate(-50%,-50%) scale(.3) rotate(-8deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.15) rotate(2deg)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%,-90%) scale(.9)', opacity: 0 }], { duration: 1600, easing: 'ease-out' }).onfinish = () => el.remove()
  }

  let rayAngle = 0
  function frame(t) {
    if (!ui) return
    ui.raf = requestAnimationFrame(frame)
    const W = root.clientWidth
    const H = root.clientHeight
    const c = toScreen(0, 0)
    // background: rotating rays and drifting motes, hotter with the combo and gold in a frenzy
    const bg = ui.bg.getContext('2d')
    bg.clearRect(0, 0, W, H)
    const heat = (fx.combo - 1) / 2
    const gold = frenzyUntil > Date.now()
    if (!calm()) rayAngle += 0.002 + heat * 0.01 + (gold ? 0.02 : 0)
    const R = Math.hypot(W, H)
    bg.save()
    bg.translate(c.x, c.y)
    bg.rotate(rayAngle)
    const rays = 14
    for (let i = 0; i < rays; i++) {
      bg.beginPath()
      bg.moveTo(0, 0)
      bg.arc(0, 0, R, (i * 2 * Math.PI) / rays, ((i + 0.5) * 2 * Math.PI) / rays)
      bg.closePath()
      bg.fillStyle = gold ? `rgba(255,200,60,${0.1 + heat * 0.05})` : `rgba(255,${90 - heat * 40},${70 - heat * 40},${0.045 + heat * 0.06})`
      bg.fill()
    }
    bg.restore()
    if (!ui.motes) ui.motes = Array.from({ length: 60 }, () => ({ x: rnd(0, 1), y: rnd(0, 1), v: rnd(0.0004, 0.0016), s: rnd(0.6, 2) }))
    bg.fillStyle = gold ? 'rgba(255,220,120,.8)' : 'rgba(255,255,255,.45)'
    for (const m of ui.motes) {
      if (!calm()) m.y -= m.v * (1 + heat * 3)
      if (m.y < 0) m.y = 1
      bg.fillRect(m.x * W, m.y * H, m.s, m.s)
    }
    // foreground particles
    const ctx = ui.fxc.getContext('2d')
    ctx.clearRect(0, 0, W, H)
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.life -= p.decay
      if (p.life <= 0) {
        parts.splice(i, 1)
        continue
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4))
      if (p.kind === 'spark') {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.18
        p.vx *= 0.98
        ctx.fillStyle = p.color
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      } else if (p.kind === 'confetti') {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.15
        p.vx *= 0.99
        p.rot += p.vr
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      } else if (p.kind === 'ring') {
        p.r += 7
        ctx.strokeStyle = p.color
        ctx.lineWidth = 4 * p.life
        ctx.beginPath()
        ctx.ellipse(p.x, p.y, p.r, p.r * 0.42, 0, 0, Math.PI * 2)
        ctx.stroke()
      } else if (p.kind === 'text') {
        p.x += p.vx
        p.y += p.vy
        p.vy *= 0.97
        ctx.font = `900 ${p.size}px Verdana, sans-serif`
        ctx.textAlign = 'center'
        ctx.lineWidth = 4
        ctx.strokeStyle = '#1a1310'
        ctx.strokeText(p.text, p.x, p.y)
        ctx.fillStyle = p.color
        ctx.fillText(p.text, p.x, p.y)
      }
    }
    ctx.globalAlpha = 1
    // helpers: each sprite presses on its own clock
    const now = performance.now()
    for (const s of ui.sprites) {
      if (!G.ended && now >= s.next) {
        s.next = now + s.h.every * 1000 * rnd(0.85, 1.15)
        helperPress(s)
      }
      if (s.piston) piston(s, now)
      if (s.laser) laser(s, now)
    }
    // the button glows with the combo
    ui.button.querySelector('.rg-halo').setAttribute('opacity', (0.5 + heat * 0.5 + (gold ? 0.4 : 0)).toFixed(2))
    goldenStep(now)
  }
  function piston(s, now) {
    const k = (now - s.piston.t0) / s.piston.dur
    const line = s.g.querySelector('.rg-piston')
    if (k >= 1) {
      line.setAttribute('x2', '0')
      line.setAttribute('y2', '-24')
      s.piston = null
      return
    }
    const ext = Math.sin(Math.min(1, k) * Math.PI)
    line.setAttribute('x2', (-s.x * 0.72 * ext).toFixed(1))
    line.setAttribute('y2', (-24 + (10 - s.y + 24) * 0.9 * ext).toFixed(1))
  }
  function laser(s, now) {
    const k = (now - s.laser.t0) / s.laser.dur
    const line = s.g.querySelector('.rg-laser')
    if (k >= 1) {
      line.setAttribute('stroke-opacity', '0')
      s.laser = null
      return
    }
    const top = s.h.id === 'claude' ? -60 : -30
    line.setAttribute('y1', String(top))
    line.setAttribute('x2', (-s.x * 0.95).toFixed(1))
    line.setAttribute('y2', (-s.y - 4).toFixed(1))
    line.setAttribute('stroke', s.h.id === 'claude' ? '#FFD84F' : '#FF4A6A')
    line.setAttribute('stroke-width', ((s.h.id === 'claude' ? 9 : 4) * (1 - k)).toFixed(1))
    line.setAttribute('stroke-opacity', (1 - k).toFixed(2))
  }

  // ---------- golden buttons: a frenzy or a lump of presses ----------

  let golden = null
  let goldenNext = 0
  function goldenStep(now) {
    if (!lvl(G, 'l1') || G.ended) return
    if (!goldenNext) goldenNext = now + goldenEvery(G) * 1000 * rnd(0.5, 1)
    if (!golden && now >= goldenNext) spawnGolden()
  }
  function spawnGolden() {
    const el = document.createElement('button')
    el.className = 'rg-golden'
    el.title = '¡Atrápalo!'
    el.innerHTML = '<svg viewBox="-20 -16 40 32"><ellipse cy="6" rx="18" ry="8" fill="#6B4A06"/><path d="M-14 -2v8a14 6 0 0 0 28 0v-8z" fill="#B8860B"/><ellipse cy="-2" rx="14" ry="6" fill="url(#rg-gold)"/><ellipse cx="-5" cy="-4" rx="5" ry="1.6" fill="#FFF" opacity=".7"/></svg>'
    // it flies over the stage, not over the list of helpers
    const W = ui.stage.clientWidth
    const H = root.clientHeight
    const fromLeft = Math.random() < 0.5
    const y0 = rnd(0.2, 0.6) * H
    el.style.left = '0'
    el.style.top = '0'
    root.appendChild(el)
    const path = [0, 0.25, 0.5, 0.75, 1].map(k => ({ transform: `translate(${(fromLeft ? k : 1 - k) * (W + 80) - 60}px,${y0 + Math.sin(k * Math.PI * 3) * 40}px) rotate(${k * 720}deg)` }))
    const anim = el.animate(path, { duration: 9000, easing: 'linear' })
    golden = el
    anim.onfinish = () => {
      el.remove()
      golden = null
      goldenNext = performance.now() + goldenEvery(G) * 1000 * rnd(0.7, 1.3)
    }
    el.addEventListener('pointerdown', e => {
      e.stopPropagation()
      const r = el.getBoundingClientRect()
      const box = root.getBoundingClientRect()
      catchGolden(r.left - box.left + r.width / 2, r.top - box.top + r.height / 2)
      anim.cancel()
      el.remove()
      golden = null
      goldenNext = performance.now() + goldenEvery(G) * 1000 * rnd(0.7, 1.3)
    })
  }
  function catchGolden(x, y) {
    G.golden = (G.golden || 0) + 1
    SL().unlock('redgold')
    confetti(x, y, 60)
    sparks(x, y, 50, '#FFD84F', 8)
    SL().beep([784, 988, 1175, 1568], 0.07)
    if (Math.random() < 0.5) frenzy(7, frenzySeconds(G), '¡FRENESÍ ×7!')
    else {
      const lump = Math.max(rate(G, fx) * 60, clickValue(G, fx) * 50) * 2 ** lvl(G, 'l4')
      earn(G, Math.floor(lump))
      bigText(`¡PREMIO! +${fmt(lump)}`, '#FFD84F')
    }
    shake(12)
    refresh()
  }
  function frenzy(mult, seconds, text) {
    frenzyMult = Math.max(frenzyMult, mult)
    frenzyUntil = Math.max(frenzyUntil, Date.now() + seconds * 1000)
    fx.frenzy = frenzyMult
    ui?.stage.classList.add('frenzy')
    bigText(text, '#FFD84F')
  }

  // ---------- chests ----------

  function chestTick() {
    if (!lvl(G, 'k1') || G.ended) return
    G.chestClicks = (G.chestClicks || 0) + 1
    if (G.chestClicks >= chestEvery(G) && !chestReady) {
      G.chestClicks = 0
      chestReady = 1
      showChest()
    }
  }
  function showChest() {
    if (!ui) return
    const c = ui.chest
    c.style.display = ''
    c.setAttribute('transform', 'translate(0,128)')
    c.innerHTML = '<g class="rg-chest-body"><ellipse cx="0" cy="22" rx="30" ry="8" fill="#000" opacity=".3"/><rect x="-26" y="-6" width="52" height="28" rx="3" fill="#8A5A2B" stroke="#3B2410" stroke-width="2"/><path d="M-26 -6 q26 -26 52 0z" fill="#A86F35" stroke="#3B2410" stroke-width="2"/><rect x="-4" y="-4" width="8" height="10" fill="#FFD84F" stroke="#3B2410" stroke-width="1.5"/><text y="-30" text-anchor="middle" class="rg-chest-hint">¡Ábreme!</text></g>'
    if (!calm()) c.firstChild.animate([{ transform: 'translateY(-120px)' }, { transform: 'translateY(0) scale(1.1,.85)', offset: 0.6 }, { transform: 'translateY(-14px)', offset: 0.8 }, { transform: 'none' }], { duration: 700, easing: 'ease-in' })
    if (lvl(G, 'k4')) setTimeout(() => chestReady && openChest(), 2500)
  }
  function openChest() {
    if (!chestReady || !ui) return
    chestReady = 0
    const w = rarityWeights(G)
    let roll = Math.random() * w.reduce((a, b) => a + b, 0)
    let tier = 0
    while (tier < 3 && roll > w[tier]) roll -= w[tier++]
    const rar = RARITIES[tier]
    const base = rate(G, fx)
    const click = clickValue(G, fx)
    const reward = [base * 30 + click * 20, base * 120 + click * 60, base * 400 + click * 150, base * 1200 + click * 400][tier]
    G.chests = (G.chests || 0) + 1
    earn(G, Math.floor(reward))
    const p = toScreen(0, 118)
    sparks(p.x, p.y, 20 + tier * 25, rar.color, 5 + tier * 2)
    if (tier >= 2) confetti(p.x, p.y, 30 * tier)
    if (tier === 3) {
      SL().unlock('redchest')
      frenzy(7, 20, '¡LEGENDARIO! ×7')
    } else if (tier === 2) frenzy(3, 15, '¡ÉPICO! ×3')
    bigText(`${rar.name}: +${fmt(reward)}`, rar.color)
    SL().beep([523, 659, 784, 1047].slice(0, 2 + tier), 0.07)
    const c = ui.chest
    c.firstChild.animate([{ transform: 'none' }, { transform: 'scale(1.3) rotate(-6deg)' }, { transform: 'scale(0) rotate(20deg)', opacity: 0 }], { duration: 420 }).onfinish = () => {
      c.style.display = 'none'
    }
    refresh()
  }

  // ---------- the side list of helpers ----------

  function buildHelpers() {
    ui.helpers.innerHTML = HELPERS.map(
      h => `<div class="rg-hrow" data-h="${h.id}"><span class="ic">${h.icon}</span><span class="tx"><b><span class="nm"></span> <i></i></b><small></small><em class="bar"><u></u></em></span>
        <span class="buy"><button data-n="1"></button><button data-n="10">×10</button><button data-n="max">MÁX</button></span></div>`,
    ).join('')
    ui.helpers.querySelectorAll('[data-h]').forEach(row => {
      const h = HELPERS.find(x => x.id === row.dataset.h)
      row.querySelectorAll('button').forEach(b =>
        b.addEventListener('click', () => {
          const n = b.dataset.n === 'max' ? 1000 : Number(b.dataset.n)
          const got = buyHelper(G, h, n)
          if (!got) return
          SL().unlock('redshop')
          const r = row.getBoundingClientRect()
          const box = root.getBoundingClientRect()
          sparks(r.left - box.left + 20, r.top - box.top + r.height / 2, 14 + got, '#FFD84F', 4)
          row.animate([{ transform: 'scale(1.04)', background: '#5a4a2a' }, { transform: 'none' }], { duration: 300 })
          SL().beep([440, 660 + Math.min(got, 20) * 10], 0.05)
          if (MILESTONES.includes(count(G, h))) bigText(`${h.icon} ×2 · nivel ${count(G, h)}`, '#FFE34F')
          const shown = ui.sprites.filter(s => s.h === h).length
          if (shown < shownOf(count(G, h))) {
            buildSprites()
            const s = ui.sprites.filter(q => q.h === h).at(-1)
            s?.g.animate([{ transform: `translate(${s.x}px,${s.y - 120}px)`, opacity: 0 }, { transform: `translate(${s.x}px,${s.y}px)`, opacity: 1 }], { duration: 500, easing: 'cubic-bezier(.3,1.5,.5,1)' })
          }
          checkMedals()
          save(true)
          refresh()
        }),
      )
    })
  }
  function refresh() {
    if (!ui) return
    if (ui.lastLife !== G.life) {
      ui.life.textContent = fmt(G.life)
      const now = performance.now()
      if (now - ui.bumpAt > 140 && !calm()) {
        ui.bumpAt = now
        ui.life.animate([{ transform: 'scale(1.12)' }, { transform: 'none' }], { duration: 160 })
      }
      ui.lastLife = G.life
    }
    ui.coins.textContent = `🪙 ${fmt(G.coins)} para gastar`
    ui.rates.textContent = `${fmtRate(rate(G, fx))}/s · ${fmtRate(clickValue(G, fx))} por clic`
    ui.goal.style.width = `${Math.min(100, (Math.log10(Math.max(1, G.life)) / 9) * 100).toFixed(1)}%`
    ui.goal.parentElement.title = `Meta: mil millones (${((G.life / GOAL) * 100).toLocaleString('es-ES', { maximumFractionDigits: 4 })} %)`
    ui.helpers.querySelectorAll('[data-h]').forEach((row, i) => {
      const h = HELPERS[i]
      const n = count(G, h)
      const shown = helperShown(G, i)
      row.classList.toggle('locked', !shown)
      const next = MILESTONES.find(m => m > n && m <= h.max)
      row.querySelector('.nm').textContent = shown ? h.name : '???'
      row.querySelector('i').textContent = shown ? `${n}/${h.max}` : ''
      row.querySelector('small').textContent = !shown ? `Compra ${HELPERS[i - 1].name.toLowerCase()} para descubrirlo` : n >= h.max ? `${fmtRate(helperRate(G, h, fx))}/s · al máximo` : `${fmtRate(h.rate * helperMult(G, h))}/s cada uno · ${h.verb}${next ? ` · ×2 en ${next}` : ''}`
      row.querySelector('.bar u').style.width = `${(n / h.max) * 100}%`
      const cost = helperCost(G, h)
      const one = row.querySelector('[data-n="1"]')
      one.textContent = n >= h.max ? 'MÁX' : fmt(cost)
      one.disabled = !shown || n >= h.max || G.coins < cost
      row.querySelector('[data-n="10"]').disabled = one.disabled
      row.querySelector('[data-n="max"]').disabled = one.disabled
      row.classList.toggle('afford', !one.disabled)
    })
    if (!ui.tree.hidden) refreshTree()
  }
  function updateComboBar() {
    if (!ui) return
    const top = comboMax(G)
    ui.comboBar.style.width = `${top > 1 ? ((fx.combo - 1) / (top - 1)) * 100 : 0}%`
    ui.comboTxt.textContent = lvl(G, 'c1') ? `×${fx.combo.toLocaleString('es-ES', { maximumFractionDigits: 1 })}` : 'combo 🔒'
    ui.comboBar.parentElement.classList.toggle('full', fx.comboFull)
  }
  setInterval(updateComboBar, 100)

  // ---------- the upgrade tree ----------

  const UNIT = 120
  let treeView = { x: 0, y: 0, k: 1 }
  let selected = 'core'
  function toggleTree(show) {
    ui.tree.hidden = !show
    if (show) {
      buildTree()
      fitTree()
      ui.tree.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' })
    }
  }
  function buildTree() {
    const svg = ui.tree.querySelector('.rg-tree-svg')
    const links = svg.querySelector('.rg-links')
    const nodes = svg.querySelector('.rg-nodes')
    links.innerHTML = TREE.flatMap(n => n.req.map(r => `<line data-from="${r}" data-to="${n.id}" x1="${TREE_BY_ID[r].x * UNIT}" y1="${TREE_BY_ID[r].y * UNIT}" x2="${n.x * UNIT}" y2="${n.y * UNIT}"/>`)).join('')
    nodes.innerHTML = TREE.map(
      n => `<g class="rg-node" data-node="${n.id}" transform="translate(${n.x * UNIT},${n.y * UNIT})"><circle class="glow" r="40"/><circle class="disc" r="30"/><circle class="prog" r="34" transform="rotate(-90)"/><text class="ic" y="11" text-anchor="middle">${n.icon}</text><text class="lv" y="52" text-anchor="middle"></text></g>`,
    ).join('')
    nodes.querySelectorAll('.rg-node').forEach(g =>
      g.addEventListener('click', () => {
        selected = g.dataset.node
        refreshTree()
      }),
    )
    nodes.querySelectorAll('.rg-node').forEach(g => g.addEventListener('dblclick', () => buyTree(g.dataset.node)))
    if (!svg.dataset.wired) {
      svg.dataset.wired = '1'
      let drag = null
      svg.addEventListener('pointerdown', e => {
        if (e.target.closest('.rg-node')) return
        drag = { x: e.clientX, y: e.clientY, vx: treeView.x, vy: treeView.y }
        svg.setPointerCapture(e.pointerId)
      })
      svg.addEventListener('pointermove', e => {
        if (!drag) return
        treeView.x = drag.vx + e.clientX - drag.x
        treeView.y = drag.vy + e.clientY - drag.y
        applyTreeView()
      })
      svg.addEventListener('pointerup', () => (drag = null))
      svg.addEventListener('wheel', e => {
        e.preventDefault()
        const r = svg.getBoundingClientRect()
        const mx = e.clientX - r.left
        const my = e.clientY - r.top
        const k = Math.max(0.35, Math.min(2, treeView.k * (e.deltaY < 0 ? 1.12 : 0.89)))
        treeView.x = mx - ((mx - treeView.x) * k) / treeView.k
        treeView.y = my - ((my - treeView.y) * k) / treeView.k
        treeView.k = k
        applyTreeView()
      })
    }
    refreshTree()
  }
  function fitTree() {
    const svg = ui.tree.querySelector('.rg-tree-svg')
    const vis = TREE.filter(n => nodeShown(G, n))
    const xs = vis.map(n => n.x * UNIT)
    const ys = vis.map(n => n.y * UNIT)
    const pad = 90
    const w = Math.max(...xs) - Math.min(...xs) + pad * 2
    const h = Math.max(...ys) - Math.min(...ys) + pad * 2
    const W = svg.clientWidth || 600
    const H = svg.clientHeight || 300
    treeView.k = Math.max(0.35, Math.min(1.2, W / w, H / h))
    treeView.x = W / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * treeView.k
    treeView.y = H / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * treeView.k
    applyTreeView()
  }
  function applyTreeView() {
    ui.tree.querySelector('.rg-tree-view').setAttribute('transform', `translate(${treeView.x.toFixed(1)},${treeView.y.toFixed(1)}) scale(${treeView.k.toFixed(3)})`)
  }
  function refreshTree() {
    const svg = ui.tree.querySelector('.rg-tree-svg')
    for (const g of svg.querySelectorAll('.rg-node')) {
      const n = TREE_BY_ID[g.dataset.node]
      const l = lvl(G, n.id)
      const shown = nodeShown(G, n)
      g.style.display = shown ? '' : 'none'
      g.classList.toggle('owned', l > 0)
      g.classList.toggle('maxed', l >= n.max)
      g.classList.toggle('afford', shown && l < n.max && G.coins >= nodeCost(G, n))
      g.classList.toggle('sel', n.id === selected)
      g.querySelector('.lv').textContent = n.max > 1 ? `${l}/${n.max}` : l ? '✓' : ''
      const C = 2 * Math.PI * 34
      const prog = g.querySelector('.prog')
      prog.setAttribute('stroke-dasharray', `${((C * l) / n.max).toFixed(1)} ${C.toFixed(1)}`)
    }
    for (const line of svg.querySelectorAll('.rg-links line')) {
      const to = TREE_BY_ID[line.dataset.to]
      line.style.display = nodeShown(G, to) ? '' : 'none'
      line.classList.toggle('lit', lvl(G, line.dataset.to) > 0)
    }
    const n = TREE_BY_ID[selected]
    const l = lvl(G, n.id)
    const cost = nodeCost(G, n)
    const card = ui.tree.querySelector('.rg-card')
    const done = l >= n.max
    // rebuilt only when something on it changes, so a click on its button is never lost to a redraw
    const key = `${n.id}:${l}:${G.coins >= cost}`
    if (card.dataset.key === key) return
    card.dataset.key = key
    card.innerHTML = `<span class="ic">${n.icon}</span><span class="tx"><b>${n.name} <i>${n.max > 1 ? `nivel ${l}/${n.max}` : done ? 'comprado' : ''}</i></b><small>${n.desc(done ? l : l + 1)}</small></span>${
      n.id === 'core' ? '' : `<button class="rg-buy"${done || G.coins < cost ? ' disabled' : ''}>${done ? 'MÁX' : `Comprar · ${fmt(cost)}`}</button>`
    }`
    card.querySelector('.rg-buy')?.addEventListener('click', () => buyTree(n.id))
  }
  function buyTree(id) {
    const n = TREE_BY_ID[id]
    const before = TREE.filter(x => nodeShown(G, x)).length
    if (!buyNode(G, n)) return
    SL().unlock('redshop')
    const svg = ui.tree.querySelector('.rg-tree-svg')
    const g = svg.querySelector(`[data-node="${id}"]`)
    g.querySelector('.disc').animate([{ transform: 'scale(1.5)' }, { transform: 'scale(.9)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.3,1.6,.5,1)' })
    const r = g.getBoundingClientRect()
    const box = root.getBoundingClientRect()
    sparks(r.left - box.left + r.width / 2, r.top - box.top + r.height / 2, 40, '#FFD84F', 6)
    for (const line of svg.querySelectorAll(`.rg-links line[data-to="${id}"]`)) {
      const len = Math.hypot(line.x2.baseVal.value - line.x1.baseVal.value, line.y2.baseVal.value - line.y1.baseVal.value)
      line.animate([{ strokeDasharray: `${len}`, strokeDashoffset: `${len}`, stroke: '#FFF' }, { strokeDasharray: `${len}`, strokeDashoffset: '0', stroke: '#FFD84F' }], { duration: 500, easing: 'ease-out' })
    }
    SL().beep([523, 784, 1047], 0.06)
    if (TREE.filter(x => nodeShown(G, x)).length > before) {
      refreshTree()
      for (const x of TREE.filter(q => q.req.includes(id) && nodeShown(G, q))) {
        const ng = svg.querySelector(`[data-node="${x.id}"]`)
        ng.animate([{ opacity: 0, transform: `translate(${n.x * UNIT}px,${n.y * UNIT}px) scale(.2)` }, { opacity: 1, transform: `translate(${x.x * UNIT}px,${x.y * UNIT}px)` }], { duration: 600, easing: 'cubic-bezier(.3,1.4,.5,1)' })
      }
      bigText('¡Nuevas mejoras!', '#7FE3FF')
    }
    if (id === 'l1') goldenNext = performance.now() + 8000
    checkMedals()
    save(true)
    refresh()
    refreshTree()
  }

  // ---------- the news ticker ----------

  function news(first) {
    if (!ui) return
    const n = c => count(G, HELPERS.find(h => h.id === c))
    const pool = [
      'Última hora: el botón rojo sigue sin decir qué hace.',
      'Expertos recomiendan no pulsar el botón. Nadie les hace caso.',
      'Un gato del pasillo afirma que «solo pasaba por aquí».',
      'Las skills del laboratorio piden horas extra por pulsar.',
      'Se agota el stock de dedos en el Mercadona del barrio.',
      'El cuartel desmiente que la Operación Bigotes tenga que ver con el botón.',
      'Wally fue visto cerca del botón. Luego ya no.',
      'Un robot pide el día libre: «llevo 10.000 pistonazos».',
      'Estudio: pulsar botones rojos mejora el ánimo un 77,7 %.',
      'Rumor en el patio: hay un botón dorado que cruza la pantalla.',
    ]
    if (n('cat') >= 10) pool.push('Los gatos pulsadores fundan un sindicato. Exigen atún.')
    if (n('skill') >= 10) pool.push('Las skills becarias publican un paper: «Pulsar como servicio».')
    if (n('robot') >= 10) pool.push('Escasez mundial de aceite hidráulico. Los robots no dicen nada.')
    if (n('drone') >= 1) pool.push('Aviación Civil investiga el láser que apunta siempre al mismo sitio.')
    if (n('claude') >= 1) pool.push('Claude se ofrece a pulsar «solo una vez más». Van millones.')
    if (G.life >= 1e6) pool.push('El botón rojo supera el millón de pulsaciones. Sigue sin hacer nada.')
    if (G.life >= 1e8) pool.push('Los economistas ya hablan de la «burbuja del botón».')
    if (lvl(G, 'sing')) pool.push('La Singularidad llega al laboratorio. Lo primero que hace: pulsar el botón.')
    const text = first ? 'Bienvenido al juego del botón. Pulsa. Pulsa más. Todo lo que ves pulsa contigo.' : pool[Math.floor(Math.random() * pool.length)]
    ui.news.textContent = `📰 ${text}`
    ui.news.animate([{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400, easing: 'ease-out' })
  }

  // ---------- the end ----------

  function finish() {
    if (G.ended) return
    G.life = GOAL
    G.ended = Date.now()
    save(true)
    SL().unlock('redend')
    SL().mapLabel()
    if (!ui) return
    SL().beep([523, 659, 784, 1047, 1319, 1568], 0.12)
    let k = 0
    const burst = setInterval(() => {
      if (!ui || k++ > 8) return clearInterval(burst)
      confetti(rnd(0.1, 0.9) * root.clientWidth, rnd(0.2, 0.6) * root.clientHeight, 80)
    }, 250)
    bigText('🏁 ¡MIL MILLONES!', '#FFD84F')
    setTimeout(showEnd, 2400)
  }
  function showEnd() {
    if (!ui) return
    root.querySelector('.rg-end')?.remove()
    const mins = Math.max(1, Math.round(((G.ended || Date.now()) - (G.start || Date.now())) / 60000))
    const took = mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${Math.floor(mins / 1440)} d ${Math.floor((mins % 1440) / 60)} h`
    const card = document.createElement('div')
    card.className = 'rg-end'
    card.innerHTML = `<div class="big">🏁</div><h3>¡Mil millones!</h3><p>Has terminado el juego del botón rojo.</p>
      <ul><li><span>Pulsaciones</span><b>1.000.000.000</b></li><li><span>Clics a mano</span><b>${fmt(G.clicks)}</b></li><li><span>Tiempo</span><b>${took}</b></li>
      <li><span>Botones dorados</span><b>${fmt(G.golden || 0)}</b></li><li><span>Cofres</span><b>${fmt(G.chests || 0)}</b></li><li><span>Combo máximo</span><b>×${(G.bestCombo || 1).toLocaleString('es-ES', { maximumFractionDigits: 1 })}</b></li>
      <li><span>Árbol y ayudantes</span><b>${maxedAll(G) ? 'completos' : 'a medias'}</b></li></ul>
      <div class="row"><button class="again">🔁 Volver a empezar</button><button class="primary done">Cerrar</button></div>`
    card.querySelector('.done').addEventListener('click', () => card.remove())
    card.querySelector('.again').addEventListener('click', () => {
      G = fresh()
      combo = 0
      chestReady = 0
      frenzyUntil = 0
      frenzyMult = 1
      save(true)
      card.remove()
      buildSprites()
      start()
      refresh()
      SL().mapLabel()
    })
    root.appendChild(card)
    card.animate([{ opacity: 0, transform: 'translate(-50%,-46%) scale(.9)' }, { opacity: 1, transform: 'translate(-50%,-50%)' }], { duration: 400, easing: 'cubic-bezier(.2,.9,.3,1)' })
  }

  // ---------- the way in: once every other medal is earned, the lab gives way to the game ----------

  function intro() {
    if (document.querySelector('.rg-intro')) return
    const el = document.createElement('div')
    el.className = 'rg-intro'
    el.innerHTML = `<div class="lines"><p>Has completado todas las misiones.</p><p>Todas las medallas.</p><p>Todos los secretos.</p><p class="q">¿O no?</p></div>
      <button class="rg-intro-btn" title="Pulsa"><svg viewBox="-60 -40 120 80"><ellipse cy="22" rx="56" ry="16" fill="#000" opacity=".4"/><path d="M-50 4v14a50 16 0 0 0 100 0v-14z" fill="#2E3238"/><ellipse cy="4" rx="50" ry="16" fill="#4A4F57"/><path d="M-34 -10v12a34 11 0 0 0 68 0v-12z" fill="#8E1414"/><ellipse cy="-10" rx="34" ry="11" fill="#E8352B"/><ellipse cx="-11" cy="-13" rx="11" ry="3.4" fill="#FFF" opacity=".5"/></svg><span>PULSAR</span></button>`
    el.addEventListener('pointerdown', e => e.stopPropagation())
    document.body.appendChild(el)
    const lines = [...el.querySelectorAll('.lines p')]
    lines.forEach((p, i) => p.animate([{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: 700, delay: 400 + i * 900, fill: 'backwards', easing: 'ease-out' }))
    const btn = el.querySelector('.rg-intro-btn')
    btn.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 400 + lines.length * 900, fill: 'backwards', easing: 'cubic-bezier(.3,1.6,.5,1)' })
    btn.addEventListener('click', () => {
      SL().setMedals({ ...SL().medals, '~rgintro': Date.now() })
      SL().beep([196, 262, 392, 523, 784], 0.08)
      const flash = document.createElement('div')
      flash.className = 'rg-flash'
      document.body.appendChild(flash)
      flash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 900 }).onfinish = () => flash.remove()
      setTimeout(() => {
        el.remove()
        open()
        bigText('¡Bienvenido al juego del botón!', '#FFFFFF')
      }, 300)
    })
  }

  // ---------- what the rest of the panel uses ----------

  window.RedGame = {
    start,
    open,
    close,
    intro,
    isOpen: () => !!root,
    label: () => {
      load()
      return (G.ended ? '🏁 ' : '') + fmt(G.life)
    },
    ended: () => !!load().ended,
    // for the headless checks in tools/
    debug: { golden: () => spawnGolden(), chest: () => { chestReady = 1; showChest() } },
    addPresses: n => {
      load()
      earn(G, n)
      if (G.life >= GOAL) finish()
      checkMedals()
      save(true)
      refresh()
    },
    reset: () => {
      close()
      clearInterval(ticker)
      ticker = 0
      G = null
      combo = 0
      chestReady = 0
      frenzyUntil = 0
      frenzyMult = 1
      carry = 0
    },
  }
})()
