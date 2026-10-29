// The red button game: the easter egg that opens once every other medal is earned.
// The economy comes first and is pure (tools/ loads it for balance runs); the screen is built only inside the webview.
;(() => {
  const HELPERS = [
    // rate: presses per second each; every: seconds between the visible presses of one sprite
    { id: 'cat', icon: '🐱', name: 'Gato pulsador', verb: 'da un zarpazo', rate: 0.1, base: 50, growth: 1.15, max: 50, every: 2.2 },
    { id: 'skill', icon: '🧪', name: 'Skill becaria', verb: 'salta encima', rate: 0.8, base: 700, growth: 1.15, max: 50, every: 1.7 },
    { id: 'robot', icon: '🤖', name: 'Robot de turno', verb: 'pistón hidráulico', rate: 5, base: 8500, growth: 1.15, max: 50, every: 1.25 },
    { id: 'drone', icon: '🛸', name: 'Escuadrón de drones', verb: 'láser de precisión', rate: 30, base: 85000, growth: 1.15, max: 40, every: 0.95 },
    { id: 'claude', icon: '✴️', name: 'Claude en bucle', verb: 'pulsa sin descanso', rate: 200, base: 1100000, growth: 1.15, max: 25, every: 0.6 },
    // second act: past the thousand millions, each crew is worth hundreds of thousands of the one before; milestones ×4
    { id: 'factory', icon: '🏭', name: 'Fábrica de gatos', verb: 'estampa el botón', rate: 2e6, base: 6e10, growth: 1.3, max: 50, every: 1.6, act: 2, ms: 4 },
    { id: 'mech', icon: '🦾', name: 'Mecha pulsador', verb: 'puñetazo de titanio', rate: 5e10, base: 1.5e16, growth: 1.3, max: 50, every: 1.5, act: 2, ms: 4 },
    { id: 'sat', icon: '🛰️', name: 'Satélite de pulsar', verb: 'rayo orbital', rate: 1.3e15, base: 3.8e21, growth: 1.3, max: 50, every: 1.3, act: 2, ms: 4 },
    { id: 'portal', icon: '🌀', name: 'Portal dimensional', verb: 'manos de otros mundos', rate: 3.1e19, base: 9.4e26, growth: 1.3, max: 50, every: 1.2, act: 2, ms: 4 },
    { id: 'hole', icon: '🕳️', name: 'Agujero negro', verb: 'gravedad que pulsa', rate: 7.8e23, base: 2.3e32, growth: 1.3, max: 50, every: 1.1, act: 2, ms: 4 },
    { id: 'galaxy', icon: '🌌', name: 'Galaxia de botones', verb: 'lluvia de estrellas', rate: 2e28, base: 5.9e37, growth: 1.3, max: 50, every: 1, act: 2, ms: 4 },
    { id: 'cosmic', icon: '😺', name: 'Gato cósmico', verb: 'zarpazo estelar', rate: 4.9e32, base: 1.5e43, growth: 1.3, max: 50, every: 0.9, act: 2, ms: 4 },
  ]
  const MILESTONES = [10, 25, 50]
  // the first act ends at a thousand millions; the game goes on to one octillion (10^48)
  const ACT1 = 1e9
  const GOAL = 1e48
  const OFFLINE_MAX_S = 8 * 3600
  // simulated with tools: about 35 min on average from the first press to the end, 12–19 min playing hard
  const SPEEDRUN_MS = 20 * 60000
  const AVERAGE_MIN = 35
  // the whole game, rebirths included: about 25 min playing hard, 35 active, an hour at an easy pace
  const AVERAGE_TOTAL_MIN = 40

  // the upgrade tree: each node appears once all the nodes it needs are bought
  const NODE = (id, icon, name, max, base, growth, req, x, y, desc, act = 1) => ({ id, icon, name, max, base, growth, req, x, y, desc, act })
  const pct = n => `${Math.round(n * 100)} %`
  const TREE = [
    NODE('core', '🔴', 'El botón', 1, 0, 1, [], 0, 0, () => 'Donde empieza todo.'),
    NODE('f1', '👆', 'Dedo fuerte', 25, 50, 1.35, ['core'], -1.2, 0, l => `+1 por clic por nivel (ahora +${l})`),
    NODE('f2', '🦾', 'Dedo de acero', 10, 5000, 2, ['f1'], -2.3, -0.7, l => `Cada clic suma además el ${(l * 0.5).toLocaleString('es-ES')} % de lo que haces por segundo`),
    NODE('f3', '💥', 'Crítico', 10, 2000, 1.8, ['f1'], -2.3, 0.7, l => `${pct(0.03 * l)} de clics críticos`),
    NODE('f4', '☄️', 'Crítico demoledor', 5, 50000, 3, ['f3'], -3.4, 1.1, l => `Los críticos valen ×${10 + 3 * l}`),
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
    // second act
    NODE('act2', '🌌', 'Más allá', 1, 1e9, 1, ['core'], 1.5, 2.7, () => 'Abre la segunda mitad del árbol', 2),
    NODE('f6', '🖐️', 'Mano cósmica', 10, 2e10, 30, ['act2'], 0.2, 3.1, l => `Cada clic suma además el ${(l * 0.2).toLocaleString('es-ES')} % de lo que haces por segundo`, 2),
    NODE('c4', '🌪️', 'Combo infinito', 4, 1e12, 1e4, ['f6'], -1.0, 3.5, l => `El combo llega a ×${1 + 0.5 * l} más`, 2),
    NODE('bang', '🎆', 'Big Bang', 5, 1e15, 1e6, ['act2'], 1.5, 3.9, l => `Todo ×${3 ** l}`, 2),
    NODE('k5', '🎁', 'Cofres cósmicos', 3, 1e13, 1e5, ['bang'], 0.3, 4.5, l => `Los cofres dan ×${1 + l}`, 2),
    NODE('l5', '🌠', 'Lluvia dorada', 3, 1e14, 1e5, ['bang'], -1.0, 4.7, l => `El frenesí de los dorados es ×${7 + 3 * l}`, 2),
    ...[
      ['factory', '⚙️', 'Prensas hidráulicas', 2.8, 3.0],
      ['mech', '🔋', 'Reactor de fusión', 3.6, 3.6],
      ['sat', '📡', 'Antenas de fase', 4.4, 3.1],
      ['portal', '🧿', 'Estabilizador', 5.2, 3.7],
      ['hole', '🌑', 'Horizonte de sucesos', 6.0, 3.1],
      ['galaxy', '💫', 'Brazos espirales', 6.8, 3.7],
      ['cosmic', '👑', 'Coronación felina', 7.6, 3.1],
    ].flatMap(([id, icon, name, x, y], i, all) => {
      const h = HELPERS.find(q => q.id === id)
      const label = h.name.split(' ')[0]
      return [
        NODE(`${id}U`, icon, name, 5, h.base * 300, 25, [i ? `${all[i - 1][0]}U` : 'act2'], x, y, l => `${label}s ×${2 ** l}`, 2),
        NODE(`${id}C`, '🏷️', `${label}s de saldo`, 4, h.base * 50, 20, [`${id}U`], x + 0.1, y + 1.05, l => `${label}s un ${5 * l} % más baratos`, 2),
      ]
    }),
  ]
  const TREE_BY_ID = Object.fromEntries(TREE.map(n => [n.id, n]))
  const RARITIES = [
    { id: 'comun', name: 'Común', color: '#C9CED6' },
    { id: 'raro', name: 'Raro', color: '#4FA3FF' },
    { id: 'epico', name: 'Épico', color: '#B46CFF' },
    { id: 'legendario', name: 'Legendario', color: '#FFB020' },
  ]

  // artifacts: one-off relics bought with shards (💠) from rare chests, golden buttons and goals
  const ARTS = [
    { id: 'pillow', icon: '🛏️', name: 'Almohada viscoelástica', desc: 'Mientras no estás, los ayudantes pulsan a ritmo completo (no a la mitad)', cost: 2 },
    { id: 'glove', icon: '🧤', name: 'Guante de seda', desc: 'Tus clics valen ×1,5', cost: 3 },
    { id: 'hourglass', icon: '⌛', name: 'Reloj de arena roto', desc: 'El combo tarda el doble en enfriarse', cost: 3 },
    { id: 'tuna', icon: '🐟', name: 'Lata de atún eterna', desc: 'Gatos ×3', cost: 4 },
    { id: 'magnet', icon: '🧲', name: 'Imán de oro', desc: 'Los botones dorados salen un 30 % más a menudo', cost: 4 },
    { id: 'clover', icon: '🍀', name: 'Trébol de cuatro hojas', desc: '+5 % de probabilidad de crítico', cost: 5 },
    { id: 'key', icon: '🗝️', name: 'Llave maestra', desc: 'Los cofres necesitan un 40 % menos de clics', cost: 5 },
    { id: 'scroll', icon: '📜', name: 'Pergamino del prompt perfecto', desc: 'Skills ×3', cost: 6 },
    { id: 'oil', icon: '🛢️', name: 'Aceite de motor premium', desc: 'Robots ×3', cost: 8 },
    { id: 'battery', icon: '🔋', name: 'Batería de grafeno', desc: 'Drones ×3', cost: 10 },
    { id: 'crown', icon: '👑', name: 'Corona del botón', desc: 'Cada clic suma además el 2 % de lo que haces por segundo', cost: 10 },
    { id: 'chip', icon: '💾', name: 'Chip de contexto de 1M', desc: 'Claude ×3', cost: 12 },
    { id: 'relic', icon: '🪐', name: 'Fragmento de singularidad', desc: 'Todo ×1,5', cost: 18 },
    // second act
    { id: 'gear', icon: '⚙️', name: 'Engranaje de oro', desc: 'Fábricas ×3', cost: 8, act: 2 },
    { id: 'dice', icon: '🎲', name: 'Dado trucado', desc: 'Los críticos valen el doble', cost: 10, act: 2 },
    { id: 'fusion', icon: '☢️', name: 'Núcleo de fusión', desc: 'Mechas ×3', cost: 10, act: 2 },
    { id: 'bell', icon: '🔔', name: 'Cascabel de Zarpas', desc: 'El combo llega un ×1 más lejos', cost: 12, act: 2 },
    { id: 'antenna', icon: '📡', name: 'Antena cuántica', desc: 'Satélites ×3', cost: 12, act: 2 },
    { id: 'tesseract', icon: '🧊', name: 'Teseracto', desc: 'Portales ×3', cost: 14, act: 2 },
    { id: 'lens', icon: '🔭', name: 'Lente gravitatoria', desc: 'Agujeros negros ×3', cost: 16, act: 2 },
    { id: 'starmap', icon: '🗺️', name: 'Mapa estelar', desc: 'Galaxias ×3', cost: 18, act: 2 },
    { id: 'yarn', icon: '🧶', name: 'Ovillo infinito', desc: 'Gatos cósmicos ×3', cost: 20, act: 2 },
    { id: 'egg', icon: '🥚', name: 'Huevo cósmico', desc: 'Todo ×2', cost: 30, act: 2 },
    { id: 'compass', icon: '🧭', name: 'Brújula del patio', desc: 'Los botones dorados salen un 20 % más a menudo', cost: 6 },
    { id: 'mirror', icon: '🪞', name: 'Espejo de feria', desc: '+10 % de que un clic cuente doble', cost: 7 },
    { id: 'sock', icon: '🧦', name: 'Calcetín de la suerte', desc: 'Los cofres raros o mejores dan +1 fragmento', cost: 8 },
    { id: 'alarm', icon: '⏰', name: 'Despertador loco', desc: 'El frenesí dura la mitad más', cost: 9 },
    { id: 'trophy', icon: '🏆', name: 'Trofeo de Zarpas', desc: 'Los Zarpas tienen un 25 % menos de vida', cost: 12 },
    { id: 'medal', icon: '🎖️', name: 'Medalla del laboratorio', desc: 'Todo +2 % por cada medalla del laboratorio', cost: 14, act: 2 },
    { id: 'rocket', icon: '🚀', name: 'Cohete de feria', desc: 'Satélites, portales y agujeros negros ×2', cost: 22, act: 2 },
    { id: 'feather', icon: '🪶', name: 'Pluma de fénix', desc: 'Al renacer ganas un 50 % más de almas', cost: 25, act: 2 },
  ]
  const ART_OF = { cat: 'tuna', skill: 'scroll', robot: 'oil', drone: 'battery', claude: 'chip', factory: 'gear', mech: 'fusion', sat: 'antenna', portal: 'tesseract', hole: 'lens', galaxy: 'starmap', cosmic: 'yarn' }

  const fresh = () => ({ life: 0, coins: 0, helpers: {}, tree: { core: 1 }, arts: {}, shards: 0, chapter: 0, beaten: {}, at: 0, start: 0, clicks: 0, chestClicks: 0, golden: 0, chests: 0, bestCombo: 1, ended: 0, souls: 0, rebirths: 0 })
  // souls of the button: one at a million millions presses, growing with the square of the digits; each one is +5 % to everything
  const SOUL_PCT = 0.05
  const REBIRTH_AT = 1e12
  const soulsFor = (G, life) => (life < REBIRTH_AT ? 0 : Math.floor((Math.log10(life) - 11) ** 2 * (art(G, 'feather') ? 1.5 : 1)))
  const pendingSouls = G => Math.max(0, soulsFor(G, G.life) - (G.souls || 0))
  const soulMult = G => 1 + SOUL_PCT * (G.souls || 0)
  function rebirth(G) {
    const gain = pendingSouls(G)
    if (!G.act1 || gain < 1) return 0
    G.souls = (G.souls || 0) + gain
    G.rebirths = (G.rebirths || 0) + 1
    G.coins = 0
    G.helpers = {}
    G.tree = { core: 1 }
    G.chestClicks = 0
    return gain
  }
  const lvl = (G, id) => G.tree[id] || 0
  const count = (G, h) => G.helpers[h.id] || 0
  const art = (G, id) => !!(G.arts && G.arts[id])
  const milestoneMult = (n, ms = 2) => ms ** MILESTONES.filter(m => n >= m).length
  const ROCKET = ['sat', 'portal', 'hole']
  const helperMult = (G, h) => (art(G, 'rocket') && ROCKET.includes(h.id) ? 2 : 1) * milestoneMult(count(G, h), h.ms) * 2 ** lvl(G, `${h.id}U`) * (art(G, ART_OF[h.id]) ? 3 : 1)
  const helperCost = (G, h) => Math.ceil(h.base * h.growth ** count(G, h) * 0.95 ** lvl(G, `${h.id}C`))
  const nodeCost = (G, n) => Math.ceil(n.base * n.growth ** lvl(G, n.id))
  const nodeShown = (G, n) => (n.act !== 2 || !!G.act1) && n.req.every(r => lvl(G, r) > 0)
  const helperShown = (G, i) => count(G, HELPERS[i]) > 0 || (HELPERS[i].act === 2 ? !!G.act1 && (HELPERS[i - 1].act !== 2 || count(G, HELPERS[i - 1]) > 0) : i === 0 || count(G, HELPERS[i - 1]) > 0)
  const artShown = (G, a) => a.act !== 2 || !!G.act1
  const comboMax = G => 1 + 0.5 * lvl(G, 'c1') + 0.5 * lvl(G, 'c4') + (art(G, 'bell') ? 1 : 0)
  // fx: the moment's boosts that the screen owns (frenzy, combo heat)
  const globalMult = (G, fx) => 2 ** lvl(G, 'sing') * 3 ** lvl(G, 'bang') * (art(G, 'relic') ? 1.5 : 1) * (art(G, 'egg') ? 2 : 1) * (art(G, 'medal') ? 1 + 0.02 * (G.labMedals || 0) : 1) * soulMult(G) * (fx.frenzy || 1)
  const fever = (G, fx) => (fx.comboFull && lvl(G, 'c3') ? 1 + lvl(G, 'c3') : 1)
  const helperRate = (G, h, fx) => h.rate * count(G, h) * helperMult(G, h) * globalMult(G, fx) * fever(G, fx)
  const rate = (G, fx = {}) => HELPERS.reduce((sum, h) => sum + helperRate(G, h, fx), 0)
  // the share of production a click adds already carries the global multipliers: they are not applied twice
  const clickValue = (G, fx = {}) => ((1 + lvl(G, 'f1')) * globalMult(G, fx) + rate(G, fx) * (0.005 * lvl(G, 'f2') + 0.002 * lvl(G, 'f6') + (art(G, 'crown') ? 0.02 : 0))) * (art(G, 'glove') ? 1.5 : 1) * (fx.combo || 1)
  const critChance = G => 0.03 * lvl(G, 'f3') + (art(G, 'clover') ? 0.05 : 0)
  const critMult = G => (10 + 3 * lvl(G, 'f4')) * (art(G, 'dice') ? 2 : 1)
  const comboCool = G => 1.2 * (1 + 0.25 * lvl(G, 'c2')) * (art(G, 'hourglass') ? 2 : 1)
  const chestEvery = G => Math.round(200 * 0.85 ** lvl(G, 'k2') * (art(G, 'key') ? 0.6 : 1))
  const goldenEvery = G => 90 * 0.85 ** lvl(G, 'l2') * (art(G, 'magnet') ? 0.7 : 1) * (art(G, 'compass') ? 0.8 : 1)
  const offlineShare = G => (art(G, 'pillow') ? 1 : 0.5)
  const frenzySeconds = G => (10 + 3 * lvl(G, 'l3')) * (art(G, 'alarm') ? 1.5 : 1)
  const doubleChance = G => 0.1 * lvl(G, 'f5') + (art(G, 'mirror') ? 0.1 : 0)
  const goldenFrenzy = G => 7 + 3 * lvl(G, 'l5')
  const chestBonus = G => 1 + lvl(G, 'k5')
  const rarityWeights = G => {
    const k = lvl(G, 'k3')
    return [Math.max(20, 60 - 6.5 * k), 28 + 2 * k, 10 + 3 * k, 2 + 1.5 * k]
  }
  const CHEST_SHARDS = [0, 1, 3, 8]
  const treeLevels = G => TREE.reduce((sum, n) => sum + (n.id === 'core' ? 0 : lvl(G, n.id)), 0)
  const artCount = G => ARTS.filter(a => art(G, a.id)).length
  const helpersOf = (G, act) => HELPERS.filter(h => (h.act || 1) === act).reduce((sum, h) => sum + count(G, h), 0)
  const maxedAll = G => HELPERS.every(h => count(G, h) >= h.max) && TREE.every(n => lvl(G, n.id) >= n.max)
  const maxedAct1 = G => HELPERS.every(h => h.act === 2 || count(G, h) >= h.max) && TREE.every(n => n.act === 2 || lvl(G, n.id) >= n.max)

  // the story: chapters of three clear objectives; some end in a fight against Doctor Zarpas, the evil cat
  const OBJ = (text, target, cur) => ({ text, target, cur })
  const helperCount = id => G => G.helpers[id] || 0
  const CHAPTERS = [
    {
      title: 'El botón despierta',
      intro: 'Un botón rojo en mitad de la nada. Nadie sabe qué hace. Dicen que quien lo pulse mil millones de veces… Bueno, nadie lo ha conseguido. Empieza tú.',
      objs: [OBJ('Pulsa el botón 50 veces', 50, G => G.clicks), OBJ('Contrata a tu primer gato pulsador', 1, helperCount('cat')), OBJ('Reúne 500 pulsaciones', 500, G => G.life)],
      shards: 1,
    },
    {
      title: 'Ojos rojos entre los arbustos',
      intro: 'Algo se mueve en el patio. Un gato negro con monóculo vigila el botón: el Doctor Zarpas. Quiere el botón para él. Reúne a tu equipo.',
      objs: [OBJ('Ten 10 gatos pulsadores', 10, helperCount('cat')), OBJ('Contrata 3 skills becarias', 3, helperCount('skill')), OBJ('Compra 3 mejoras del árbol', 3, G => treeLevels(G))],
      shards: 2,
      boss: 0,
    },
    {
      title: 'El mapa del tesoro',
      intro: 'Zarpas huyó, pero se le cayó un mapa: cofres, botones dorados y artefactos antiguos escondidos por el laboratorio.',
      objs: [OBJ('Abre 3 cofres', 3, G => G.chests || 0), OBJ('Atrapa un botón dorado', 1, G => G.golden || 0), OBJ('Consigue un artefacto', 1, G => artCount(G))],
      shards: 3,
    },
    {
      title: 'La fábrica de pulsar',
      intro: 'Zarpas vuelve con armadura de lata. Para atravesarla hace falta producción industrial… y dedos rápidos.',
      objs: [OBJ('Llega a 1.000 pulsaciones por segundo', 1000, G => rate(G)), OBJ('Ten 10 robots de turno', 10, helperCount('robot')), OBJ('Llena el combo hasta ×1,5', 1.5, G => G.bestCombo || 1)],
      shards: 4,
      boss: 1,
    },
    {
      title: 'Asalto aéreo',
      intro: 'Zarpas se ha subido a un dirigible con forma de ovillo. Que despeguen los drones.',
      objs: [OBJ('Ten 5 drones', 5, helperCount('drone')), OBJ('Consigue 4 artefactos', 4, G => artCount(G)), OBJ('Reúne 20 millones', 2e7, G => G.life)],
      shards: 5,
    },
    {
      title: 'Contexto infinito',
      intro: 'Zarpas Omega ha fusionado todos los gatos callejeros en uno. Solo Claude, con su contexto infinito, puede con él.',
      objs: [OBJ('Contrata a Claude en bucle', 1, helperCount('claude')), OBJ('Compra «Contexto infinito» en el árbol', 1, G => lvl(G, 'claudeU')), OBJ('Reúne 200 millones', 2e8, G => G.life)],
      shards: 6,
      boss: 2,
    },
    {
      title: 'Mil millones',
      intro: 'Zarpas está vencido y se ha quedado a vivir en el patio (le gusta el atún). Solo queda una cosa: llevar el botón a los mil millones.',
      objs: [OBJ('Llega a 1.000 millones de pulsaciones', ACT1, G => G.life)],
      shards: 4,
    },
    // second act
    {
      title: 'Más allá del botón',
      intro: 'Mil millones… y el botón sigue pidiendo más. Al fondo del patio se abre una grieta violeta. Zarpas la mira, con el atún a medio comer: «Eso no lo he hecho yo». Hay que fabricar gatos a escala industrial.',
      objs: [OBJ('Compra «Más allá» en el árbol', 1, G => lvl(G, 'act2')), OBJ('Ten 10 fábricas de gatos', 10, helperCount('factory')), OBJ('Llega a 1 billón (10¹²)', 1e12, G => G.life)],
      shards: 5,
    },
    {
      title: 'Titanes de titanio',
      intro: 'De la grieta sale un gato de metal del tamaño de un edificio: Zarpas Mecha, el primo lejano de Zarpas. Antes de pelear, la grieta te susurra un trato: «Suéltalo todo y vuelve más fuerte». Abre la pestaña 🔆 Renacer: pierdes ayudantes, árbol y monedas, pero no lo que llevas pulsado, y cada alma de botón te da +5 % para siempre.',
      objs: [OBJ('Renace una vez (pestaña 🔆 Renacer)', 1, G => G.rebirths || 0), OBJ('Ten 10 mechas pulsadores', 10, helperCount('mech')), OBJ('Llega a 1.000 billones', 1e15, G => G.life)],
      shards: 6,
      boss: 3,
    },
    {
      title: 'En órbita',
      intro: 'La grieta no se cierra: crece hacia el cielo. Hay que pulsar desde el espacio. Zarpas (el de verdad) se ha hecho un casco con una pecera y quiere ir.',
      objs: [OBJ('Ten 10 satélites', 10, helperCount('sat')), OBJ('Consigue 3 artefactos cósmicos', 3, G => ARTS.filter(a => a.act === 2 && art(G, a.id)).length), OBJ('Llega a 1 trillón (10¹⁸)', 1e18, G => G.life)],
      shards: 7,
    },
    {
      title: 'Otras dimensiones',
      intro: 'Al otro lado de la grieta hay otros botones rojos, en otros mundos. Y en cada uno, un Zarpas. El Zarpas Dimensional los quiere todos.',
      objs: [OBJ('Ten 10 portales', 10, helperCount('portal')), OBJ('Llena el combo hasta ×4', 4, G => G.bestCombo || 1), OBJ('Llega a 1 cuatrillón (10²⁴)', 1e24, G => G.life)],
      shards: 8,
      boss: 4,
    },
    {
      title: 'El horizonte de sucesos',
      intro: 'Tantas pulsaciones juntas han doblado el espacio. Nace un agujero negro… y pulsa. Nadie sabe cómo. Zarpas dice que es culpa del atún.',
      objs: [OBJ('Ten 10 agujeros negros', 10, helperCount('hole')), OBJ('Abre 60 cofres', 60, G => G.chests || 0), OBJ('Llega a 1 quintillón (10³⁰)', 1e30, G => G.life)],
      shards: 9,
    },
    {
      title: 'Galaxias de botones',
      intro: 'Cada estrella de la galaxia es un botón rojo. Y en el centro, en un trono de ovillos, te espera el Emperador Zarpas.',
      objs: [OBJ('Ten 10 galaxias de botones', 10, helperCount('galaxy')), OBJ('Consigue 8 artefactos cósmicos', 8, G => ARTS.filter(a => a.act === 2 && art(G, a.id)).length), OBJ('Llega a 1 sextillón (10³⁶)', 1e36, G => G.life)],
      shards: 10,
      boss: 5,
    },
    {
      title: 'Un octillón',
      intro: 'El Emperador ha caído y se ha unido al patio (ahora hay dos Zarpas peleándose por el atún). Despierta al Gato cósmico y lleva el botón al octillón: un 1 con 48 ceros.',
      objs: [OBJ('Despierta al Gato cósmico', 1, helperCount('cosmic')), OBJ('Llega a 1 octillón (10⁴⁸)', GOAL, G => G.life)],
      shards: 0,
    },
  ]
  const BOSSES = [
    { name: 'Doctor Zarpas', seconds: 30, k: 0.5, floor: 400, shards: 3, taunts: ['¡Ese botón es MÍO!', '¡Miaaau-ja-ja!', '¿Eso es todo lo que pulsas?'], lose: '¡Volveré con armadura!' },
    { name: 'Zarpas Acorazado', seconds: 35, k: 0.55, floor: 0, shards: 5, taunts: ['¡Mi armadura es de lata de atún premium!', '¡Pulsa, pulsa, que no me haces nada!', '¡Bola de pelo va!'], lose: '¡Esto no ha terminado, humano!' },
    { name: 'Zarpas Omega', seconds: 45, k: 0.48, floor: 0, shards: 10, taunts: ['¡SOY TODOS LOS GATOS!', '¡El botón será mi rascador!', '¡Siete vidas, siete botones!'], lose: 'Vale, vale… ¿me dejas quedarme si me das atún?' },
    { name: 'Zarpas Mecha', seconds: 45, k: 0.58, floor: 0, shards: 12, taunts: ['¡TITANIO CON BIGOTES!', '¡Bip bup… MIAU!', '¡Mis pistones son más grandes!'], lose: 'Error 404: dignidad no encontrada.' },
    { name: 'Zarpas Dimensional', seconds: 50, k: 0.64, floor: 0, shards: 15, taunts: ['¡En otro mundo ya he ganado!', '¡Soy mil Zarpas a la vez!', '¡Tu botón es MI botón en otra dimensión!'], lose: 'En alguna dimensión esto ha salido bien…' },
    { name: 'Emperador Zarpas', seconds: 55, k: 0.66, floor: 0, shards: 25, taunts: ['¡ARRODÍLLATE ANTE EL OVILLO!', '¡Las galaxias son mi caja de arena!', '¡Un octillón de zarpazos te esperan!'], lose: 'Está bien… el patio es grande. ¿Hay atún para dos?' },
  ]
  // a fight scales with how hard you hit right now (crits and doubles included; frenzies do not hurt him): helpers plus three clicks a second at a fair combo
  const bossHp = (G, b) => Math.max(b.floor, Math.round((rate(G) + clickValue(G, { combo: Math.min(3, comboMax(G)) }) * (1 + critChance(G) * (critMult(G) - 1)) * (1 + doubleChance(G)) * 3) * b.seconds * b.k * (art(G, 'trophy') ? 0.75 : 1)))
  const chapter = G => CHAPTERS[Math.min(G.chapter || 0, CHAPTERS.length - 1)]
  const chapterDone = G => chapter(G).objs.every(o => o.cur(G) >= o.target)
  // moves on to the next chapter once its objectives (and its fight) are done; returns the shards it paid
  function advance(G) {
    const ch = chapter(G)
    if (!chapterDone(G) || (ch.boss !== undefined && !(G.beaten || {})[ch.boss]) || (G.chapter || 0) >= CHAPTERS.length - 1) return 0
    G.chapter = (G.chapter || 0) + 1
    G.shards = (G.shards || 0) + ch.shards
    return ch.shards
  }
  function buyArt(G, a) {
    if (art(G, a.id) || (G.shards || 0) < a.cost) return false
    G.shards -= a.cost
    G.arts = { ...G.arts, [a.id]: Date.now() }
    return true
  }

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
  // the button stalls until the story catches up: half of the first goal until Zarpas Omega falls, then 1000 short of the octillion until the Emperor does
  const ACT1_LAST = 6
  const storyCap = G => {
    const c = G.chapter || 0
    if (!G.act1) return c >= ACT1_LAST ? ACT1 : ACT1 / 2
    return c >= CHAPTERS.length - 1 ? GOAL : GOAL / 1000
  }
  // presses count up to the goal and are spent as coins; returns what actually counted
  function earn(G, n) {
    if (G.ended) return 0
    // the count towards the goal stalls until the story catches up, but the coins keep coming
    n = Math.max(0, n)
    G.coins += n
    const counted = Math.min(n, Math.max(0, storyCap(G) - G.life))
    G.life += counted
    if (!G.start && n) G.start = Date.now()
    return counted
  }

  const ECON = { SOUL_PCT, REBIRTH_AT, soulsFor, pendingSouls, soulMult, rebirth, doubleChance, ACT1, ACT1_LAST, artShown, goldenFrenzy, chestBonus, maxedAct1, helpersOf, HELPERS, TREE, TREE_BY_ID, ARTS, CHAPTERS, BOSSES, MILESTONES, GOAL, RARITIES, CHEST_SHARDS, fresh, lvl, count, art, milestoneMult, helperMult, helperCost, nodeCost, nodeShown, helperShown, comboMax, rate, helperRate, clickValue, critChance, critMult, comboCool, chestEvery, goldenEvery, offlineShare, frenzySeconds, rarityWeights, treeLevels, artCount, maxedAll, chapter, chapterDone, bossHp, advance, storyCap, buyArt, buyHelper, buyNode, earn }
  if (typeof module !== 'undefined') module.exports = ECON
  if (typeof window === 'undefined') return

  // ---------------------------------------------------------------------------------------------------------------
  // the screen

  const SVG = 'http://www.w3.org/2000/svg'
  const RED_STEPS = [[10, 'red10'], [100, 'red100'], [1000, 'red1000'], [10000, 'red10000'], [77777, 'red77777']]
  const UNITS = [
    [1e48, 'Oc', 'octillones'],
    [1e42, 'Sp', 'septillones'],
    [1e36, 'Sx', 'sextillones'],
    [1e30, 'Qi', 'quintillones'],
    [1e24, 'Ct', 'cuatrillones'],
    [1e18, 'T', 'trillones'],
    [1e12, 'B', 'billones'],
    [1e6, 'M', 'millones'],
  ]
  const fmt = n => {
    n = Math.floor(n)
    if (n < 1e6) return n.toLocaleString('es-ES', { useGrouping: 'always' })
    const [u, sym] = UNITS.find(([x]) => n >= x)
    const v = n / u
    return `${v.toLocaleString('es-ES', { maximumFractionDigits: v < 10 ? 2 : v < 100 ? 1 : 0, useGrouping: 'always' })} ${sym}`
  }
  const unitOf = n => UNITS.find(([x]) => n >= x)
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

  const labMedals = () => Object.keys(SL().medals || {}).filter(k => !k.startsWith('~')).length
  function load() {
    if (G) {
      G.labMedals = labMedals()
      return G
    }
    const m = SL().medals
    try {
      G = { ...fresh(), ...JSON.parse(m['~rg'] || 'null') }
    } catch {
      G = fresh()
    }
    if (!m['~rg']) migrate(m)
    G.labMedals = labMedals()
    if (G.ended && !G.act1 && G.life < GOAL) {
      G.act1 = G.ended
      G.ended = 0
    }
    return G
  }
  // players of the old in-map shop keep their presses, coins and helpers; the old golden buttons come back as coins
  function migrate(m) {
    G.life = Math.min(ACT1, m['~red'] || 0)
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
    if (maxedAct1(G)) SL().unlock('redmax')
  }

  // production keeps going while the panel shows the map; a long gap (panel closed) pays half, up to 8 h
  function start() {
    load()
    if (ticker || G.ended) return
    if (G.at) {
      const gap = Math.min((Date.now() - G.at) / 1000, OFFLINE_MAX_S)
      const away = Math.floor(rate(G) * gap * offlineShare(G))
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
    if (combo > 0 && now - lastClick > comboCool(G) * 1000) combo = Math.max(0, combo - 60 * dt)
    updateCombo()
    carry += rate(G, fx) * (dt <= 5 ? dt : 5 + (dt - 5) * offlineShare(G))
    const whole = Math.floor(carry)
    carry -= whole
    if (whole) earn(G, whole)
    if (fight && whole) hurtBoss(whole, false)
    if (fight && now > fight.until) loseFight(false)
    if (checkEnds()) return
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

  const SPRITES = { cat: () => `#pt-${SL().catCoat()}`, skill: () => '#ca', robot: () => '#ag', drone: () => '#sd0', claude: () => '#ag', factory: () => '#ag', mech: () => '#ag', sat: () => '#sd0', portal: () => '#sd0', hole: () => '#sd0', galaxy: () => '#sd0', cosmic: () => `#pt-${SL().catCoat()}` }
  const COLORS = { skill: '#D97757', robot: '#3D85C6', drone: '#3D85C6', claude: '#F2C230' }
  // each kind stands on its own arc around the button (angles in degrees, 0 = right, 90 = down)
  const ARCS = { cat: [105, 160], skill: [165, 215], robot: [220, 290], drone: [285, 335], claude: [15, 75], factory: [100, 145], mech: [150, 195], sat: [200, 245], portal: [250, 295], hole: [300, 345], galaxy: [350, 395], cosmic: [40, 85] }
  // a few sprites stand for the whole crew: more of them as the crew grows
  const SHOWN = 6
  const shownOf = n => (n ? Math.min(SHOWN, Math.ceil(Math.sqrt(n))) : 0)
  // a crew at its maximum merges into one fat king with a crown: fewer sprites, same presses
  const isKing = h => count(G, h) >= h.max
  const shownFor = h => (isKing(h) ? 1 : shownOf(count(G, h)))

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
            <g class="rg-leds"></g>
            <ellipse cx="0" cy="20" rx="66" ry="23.5" fill="#1E2126"/>
            <g class="rg-cap">
              <path d="M-62 -14 v30 a62 22 0 0 0 124 0 v-30 z" fill="#8E1414" class="rg-cap-side"/>
              <ellipse cx="0" cy="-14" rx="62" ry="22" fill="url(#rg-cap)" class="rg-cap-top"/>
              <ellipse cx="-20" cy="-22" rx="22" ry="7" fill="#FFF" opacity=".45" class="rg-shine"/>
              <ellipse cx="0" cy="-14" rx="62" ry="22" fill="#FFF" opacity="0" class="rg-cap-flash"/>
            </g>
          </g>
          <g class="rg-front"></g>
          <g class="rg-chest" style="display:none"></g>
          <g class="rg-boss" style="display:none"></g>
          <g class="rg-hint" style="display:none"><text text-anchor="middle" y="-62">¡Púlsame!</text><path d="M-8 -54 L8 -54 L0 -42 Z"/></g>
        </svg>
      </div>
      <canvas class="rg-fx"></canvas>
      <div class="rg-vignette"></div>
      <div class="rg-white"></div>
      <header class="rg-top">
        <div class="rg-count"><b class="rg-life">0</b><small class="rg-rates"></small></div>
        <div class="rg-wallet"><span class="rg-coins" title="Pulsaciones para gastar en ayudantes y en el árbol"></span><span class="rg-shards" title="Fragmentos: se gastan en artefactos"></span></div>
        <div class="rg-combo" title="Combo: pulsa rápido para llenarlo"><i></i><span>×1</span></div>
        <span class="rg-spacer"></span>
        <button class="rg-treebtn" title="Árbol de mejoras">🌳 Árbol</button>
        <button class="rg-restart" title="Empezar el juego de cero">🔁</button>
        <button class="rg-close" title="Volver al mapa (Esc)">✕</button>
      </header>
      <section class="rg-mission"></section>
      <div class="rg-bosshud" hidden><b class="name"></b><div class="hp"><i></i><span></span></div><div class="time"></div></div>
      <div class="rg-talk" hidden><div class="who"></div><p></p><button>Continuar ▸</button></div>
      <aside class="rg-side">
        <nav class="rg-tabs"><button data-tab="helpers" class="on">🐾 Ayudantes</button><button data-tab="arts">🏺 Artefactos</button><button data-tab="story">📖 Historia</button><button data-tab="rebirth" class="rg-rebirth-tab">🔆 Renacer</button></nav>
        <div class="rg-pane rg-helpers" data-pane="helpers"></div>
        <div class="rg-pane rg-arts" data-pane="arts" hidden></div>
        <div class="rg-pane rg-story" data-pane="story" hidden></div>
        <div class="rg-pane rg-rebirth" data-pane="rebirth" hidden></div>
      </aside>
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
      shards: root.querySelector('.rg-shards'),
      mission: root.querySelector('.rg-mission'),
      bossHud: root.querySelector('.rg-bosshud'),
      boss: root.querySelector('.rg-boss'),
      hint: root.querySelector('.rg-hint'),
      talk: root.querySelector('.rg-talk'),
      arts: root.querySelector('.rg-arts'),
      story: root.querySelector('.rg-story'),
      rebirth: root.querySelector('.rg-rebirth'),
      rebirthTab: root.querySelector('.rg-rebirth-tab'),
      helpers: root.querySelector('.rg-helpers'),
      news: root.querySelector('.rg-news span'),
      tree: root.querySelector('.rg-tree'),
      chest: root.querySelector('.rg-chest'),
      capFlash: root.querySelector('.rg-cap-flash'),
      vignette: root.querySelector('.rg-vignette'),
      white: root.querySelector('.rg-white'),
      sprites: [],
      leds: [],
      lastLife: -1,
      shownLife: G.life,
      bumpAt: 0,
    }
    // the ring of lights round the base: a chase that speeds up with production, all lit on a press
    const ledG = root.querySelector('.rg-leds')
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2
      const c = document.createElementNS(SVG, 'circle')
      c.setAttribute('cx', (Math.cos(a) * 77).toFixed(1))
      c.setAttribute('cy', (20 + Math.sin(a) * 27.5).toFixed(1))
      c.setAttribute('r', '2.6')
      ledG.appendChild(c)
      ui.leds.push(c)
    }
    // the 3D stage when WebGL is there; the SVG arena stays as the fallback
    const c3 = document.createElement('canvas')
    c3.className = 'rg-3d'
    ui.stage.prepend(c3)
    ui.g3 = window.RG3D?.create(c3, { calm }) || null
    if (ui.g3) {
      ui.c3 = c3
      root.classList.add('rg-3dmode')
      ui.hint = document.createElement('div')
      ui.hint.className = 'rg-hint3'
      ui.hint.textContent = '¡Púlsame!'
      ui.hint.style.display = G.clicks >= 5 ? 'none' : ''
      ui.bubble = document.createElement('div')
      ui.bubble.className = 'rg-bubble3'
      root.append(ui.hint, ui.bubble)
      // the button and the chest take clicks; anywhere else, dragging turns the camera round the stage
      let drag = null
      c3.title = 'Arrastra para girar la cámara · rueda para acercar · doble clic para volver'
      c3.addEventListener('pointerdown', e => {
        const r = c3.getBoundingClientRect()
        const hit = ui.g3.pick(e.clientX - r.left, e.clientY - r.top)
        if (hit === 'chest') openChest()
        else if (hit === 'button') {
          e.preventDefault()
          press(e)
        } else {
          drag = { x: e.clientX, y: e.clientY }
          c3.setPointerCapture(e.pointerId)
          c3.style.cursor = 'grabbing'
        }
      })
      c3.addEventListener('pointermove', e => {
        if (drag) {
          ui.g3.orbit(e.clientX - drag.x, e.clientY - drag.y)
          drag = { x: e.clientX, y: e.clientY }
          return
        }
        const r = c3.getBoundingClientRect()
        c3.style.cursor = ui.g3.pick(e.clientX - r.left, e.clientY - r.top) ? 'pointer' : 'grab'
      })
      const endDrag = () => {
        drag = null
        c3.style.cursor = 'grab'
      }
      c3.addEventListener('pointerup', endDrag)
      c3.addEventListener('pointercancel', endDrag)
      c3.addEventListener('wheel', e => {
        e.preventDefault()
        ui.g3.zoom(e.deltaY > 0 ? 1.08 : 0.93)
      })
      c3.addEventListener('dblclick', e => {
        const r = c3.getBoundingClientRect()
        if (!ui.g3.pick(e.clientX - r.left, e.clientY - r.top)) ui.g3.resetView()
      })
      ui.viewBtn = document.createElement('button')
      ui.viewBtn.className = 'rg-viewbtn'
      ui.viewBtn.title = 'Volver a la vista de frente'
      ui.viewBtn.textContent = '🧭 Recolocar vista'
      ui.viewBtn.hidden = true
      ui.viewBtn.addEventListener('click', () => ui.g3.resetView())
      root.appendChild(ui.viewBtn)
    } else c3.remove()
    root.addEventListener('pointerdown', e => e.stopPropagation())
    root.addEventListener('wheel', e => e.stopPropagation(), { passive: true })
    ui.button.addEventListener('pointerdown', e => {
      e.preventDefault()
      press(e)
    })
    root.querySelector('.rg-close').addEventListener('click', close)
    root.querySelector('.rg-restart').addEventListener('click', askRestart)
    root.querySelector('.rg-treebtn').addEventListener('click', () => toggleTree(true))
    root.querySelector('.rg-tree-close').addEventListener('click', () => toggleTree(false))
    ui.chest.addEventListener('pointerdown', e => {
      e.stopPropagation()
      openChest()
    })
    document.addEventListener('keydown', onKey)
    root.querySelectorAll('.rg-tabs button').forEach(b =>
      b.addEventListener('click', () => {
        root.querySelectorAll('.rg-tabs button').forEach(x => x.classList.toggle('on', x === b))
        root.querySelectorAll('.rg-pane').forEach(p => (p.hidden = p.dataset.pane !== b.dataset.tab))
        const pane = root.querySelector(`.rg-pane[data-pane="${b.dataset.tab}"]`)
        pane.animate([{ opacity: 0, transform: 'translateX(12px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' })
        refresh()
      }),
    )
    ui.talk.querySelector('button').addEventListener('click', () => nextTalk())
    buildHelpers()
    buildArts()
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
    if (G.ended) setTimeout(() => showEnd(2), 300)
    else if (G.act1 && !G.seenAct2) setTimeout(() => showEnd(1), 300)
    // the first time in, the story begins
    else if (!G.seenIntro) {
      G.seenIntro = 1
      setTimeout(() => say(NARRATOR, CHAPTERS[0].intro), 700)
    }
  }
  function close() {
    if (!root) return
    if (fight) loseFight(true)
    cancelAnimationFrame(ui.raf)
    clearInterval(ui.newsTimer)
    ui.g3?.dispose()
    ui.ro.disconnect()
    document.removeEventListener('keydown', onKey)
    const r = root
    r.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.97)' }], { duration: 220 }).onfinish = () => r.remove()
    root = null
    ui = null
    save(true)
  }
  function onKey(e) {
    if (e.key === 'Escape') return ui && !ui.tree.hidden ? toggleTree(false) : ui && !ui.talk.hidden ? nextTalk() : close()
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
    ui.g3?.resize(ui.c3.clientWidth, ui.c3.clientHeight)
  }
  // pixels on the 3D canvas → pixels on the overlay canvases
  function g3px(p) {
    // a press still in flight when the game closes lands nowhere
    if (!ui?.c3) return p
    const r = ui.c3.getBoundingClientRect()
    const box = root.getBoundingClientRect()
    return { x: p.x + r.left - box.left, y: p.y + r.top - box.top }
  }
  // arena coordinates → pixels on the canvases
  function toScreen(x, y) {
    if (ui.g3) return g3px(ui.g3.arena(x, y))
    const pt = ui.arena.createSVGPoint()
    pt.x = x
    pt.y = y
    const p = pt.matrixTransform(ui.arena.getScreenCTM())
    const r = root.getBoundingClientRect()
    return { x: p.x - r.left, y: p.y - r.top }
  }

  // ---------- helpers around the button ----------

  function buildSprites() {
    if (ui.g3) {
      ui.g3.clearCrew()
      ui.sprites = []
      ui.g3.setAct2(!!G.act1)
      for (const h of HELPERS) {
        const n = shownFor(h)
        const [a0, a1] = ARCS[h.id]
        for (let i = 0; i < n; i++) {
          const a = ((a0 + ((a1 - a0) * (i + 0.5)) / n) * Math.PI) / 180
          const c = ui.g3.addHelper(h.id, a, SL().catCoat(), isKing(h))
          ui.sprites.push({ h, c, x: Math.cos(a) * 205, y: 30 + Math.sin(a) * 92, next: performance.now() + rnd(200, h.every * 1000) })
        }
      }
      ui.g3.setArts(Object.keys(G.arts || {}))
      return
    }
    ui.back.innerHTML = ''
    ui.front.innerHTML = ''
    ui.sprites = []
    for (const h of HELPERS) {
      const n = shownFor(h)
      const [a0, a1] = ARCS[h.id]
      for (let i = 0; i < n; i++) {
        const a = ((a0 + ((a1 - a0) * (i + 0.5)) / n) * Math.PI) / 180
        const x = Math.cos(a) * 205
        const y = 30 + Math.sin(a) * 92 + (h.id === 'drone' ? -70 : 0)
        const g = document.createElementNS(SVG, 'g')
        g.setAttribute('class', `rg-h rg-${h.id}`)
        const scale = (h.id === 'claude' ? 2 : 1.7) * (isKing(h) ? 1.5 : 1)
        const flip = x > 0 ? -1 : 1
        const color = COLORS[h.id] ? ` color="${COLORS[h.id]}"` : ''
        g.innerHTML =
          (h.id === 'robot' ? '<line class="rg-piston" x1="0" y1="0" x2="0" y2="0" stroke="#9BA6B5" stroke-width="7" stroke-linecap="round"/>' : '') +
          (h.id === 'drone' || h.id === 'claude' ? '<line class="rg-laser" x1="0" y1="0" x2="0" y2="0" stroke-linecap="round"/>' : '') +
          `<ellipse class="rg-shadow" cx="0" cy="2" rx="${10 * scale}" ry="${3 * scale}" fill="#000" opacity="${h.id === 'drone' ? 0.12 : 0.3}"/>` +
          `<g class="rg-body">` +
          (h.id === 'claude' ? `<circle cx="0" cy="-${18 * scale}" r="${22 * scale}" fill="url(#rg-halo)" class="rg-aura"/>` : '') +
          // idle breathing lives on its own layer, so the press animations on rg-body never fight it
          `<g class="rg-idle" style="animation-delay:-${rnd(0, 3).toFixed(2)}s"><g transform="scale(${flip * scale},${scale})"><use href="${SPRITES[h.id]()}"${color}/></g></g></g>`
        g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`)
        ;(y < 30 ? ui.back : ui.front).appendChild(g)
        ui.sprites.push({ h, g, x, y, scale, body: g.querySelector('.rg-body'), next: performance.now() + rnd(200, h.every * 1000) })
      }
    }
  }
  // one visible press: what the sprite does depends on its kind; the press lands on the button at the end
  // every press has an anticipation (wind-up), a strike with stretch, a short hold on impact and a springy recovery
  function helperPress(s) {
    const { h, g, x, y } = s
    const toX = -x * 0.6
    const toY = (20 - y) * 0.6
    const back = x > 0 ? 1 : -1
    const body = s.body
    const dur = Math.min(720, h.every * 520)
    const hitAt = (impact, head, muzzle) => {
      if (!ui) return
      const share = (helperRate(G, h, fx) * h.every) / Math.max(1, shownFor(h))
      capHit(h.id === 'claude' ? 0.7 : 0.35)
      ledPulse(0.35)
      if (!ui.g3 || h.id === 'claude') flash(impact.x, impact.y, h.id === 'claude' ? 46 : 24, h.id === 'claude' ? '255,220,90' : '255,190,120')
      sparks(impact.x, impact.y, h.id === 'claude' ? 16 : 8, h.id === 'claude' ? '#FFD84F' : '#FFB35A', 3)
      floatNum(head, `+${fmtRate(share)}`, '#FFF4C8', 13)
      if (lvl(G, 'k4')) chestTick()
      if (h.id === 'cat') slash(impact.x, impact.y, back)
      if (h.id === 'skill') for (let i = 0; i < 4; i++) puff(impact.x + rnd(-16, 16), impact.y + rnd(0, 6), 'rgba(230,220,210,', 0.6)
      if (h.id === 'robot') for (let i = 0; i < 3; i++) puff(head.x + back * 10, head.y + 20, 'rgba(255,255,255,', 0.5)
      if (h.id === 'claude') {
        if (muzzle) bolt(muzzle.x, muzzle.y, impact.x, impact.y)
        shake(4)
      }
    }
    if (ui.g3) return ui.g3.helperPress(s.c, Math.min(720, h.every * 520), (impact, head, muzzle) => hitAt(g3px(impact), g3px(head), muzzle && g3px(muzzle)))
    const impact = toScreen(x * 0.3, 4 + (y - 20) * 0.18)
    const hit = () => hitAt(impact, toScreen(x * 0.85, y - 54))
    if (calm()) return hit()
    const spring = 'cubic-bezier(.25,.9,.3,1.25)'
    if (h.id === 'cat') {
      body.animate(
        [
          { transform: 'none' },
          { transform: `translate(${back * 6}px,1px) scale(1.06,.9) rotate(${-back * 8}deg)`, offset: 0.28 },
          { transform: `translate(${toX * 0.38}px,${toY * 0.38}px) scale(.94,1.1) rotate(${back * -24}deg)`, offset: 0.46 },
          { transform: `translate(${toX * 0.36}px,${toY * 0.36}px) scale(1.04,.95) rotate(${back * -20}deg)`, offset: 0.6 },
          { transform: 'none' },
        ],
        { duration: dur, easing: spring },
      )
      setTimeout(hit, dur * 0.46)
    } else if (h.id === 'skill') {
      body.animate(
        [
          { transform: 'none' },
          { transform: 'translateY(2px) scale(1.25,.72)', offset: 0.16 },
          { transform: `translate(${toX * 0.25}px,${toY * 0.25 - 70}px) scale(.86,1.2) rotate(${-back * 14}deg)`, offset: 0.42 },
          { transform: `translate(${toX * 0.5}px,${toY * 0.5 - 6}px) scale(1.35,.66)`, offset: 0.62 },
          { transform: `translate(${toX * 0.45}px,${toY * 0.45 - 26}px) scale(.95,1.08) rotate(${back * 10}deg)`, offset: 0.78 },
          { transform: 'translateY(1px) scale(1.12,.9)', offset: 0.92 },
          { transform: 'none' },
        ],
        { duration: dur * 1.35, easing: 'ease-in-out' },
      )
      g.querySelector('.rg-shadow').animate([{ transform: 'none' }, { transform: `translate(${toX * 0.25}px,${toY * 0.25}px) scale(.5)`, opacity: 0.1, offset: 0.42 }, { transform: 'none' }], { duration: dur * 1.35 })
      setTimeout(hit, dur * 1.35 * 0.62)
    } else if (h.id === 'robot') {
      g.querySelector('.rg-piston').setAttribute('y1', '-24')
      // line ends are attributes, not animatable by WAAPI: the frame loop drives the piston
      s.piston = { t0: performance.now(), dur }
      body.animate([{ transform: 'none' }, { transform: `translate(${back * 7}px,0) rotate(${back * 4}deg)`, offset: 0.25 }, { transform: `translate(${-back * 5}px,0) rotate(${-back * 3}deg)`, offset: 0.42 }, { transform: 'none' }], { duration: dur, easing: spring })
      setTimeout(hit, dur * 0.4)
    } else if (h.id === 'drone' || h.id === 'claude') {
      // charge first: light gathers at the muzzle, then the beam fires
      const muzzle = toScreen(x, y + (h.id === 'claude' ? -64 : -34))
      charge(muzzle.x, muzzle.y, h.id === 'claude' ? '#FFD84F' : '#FF5A7A', h.id === 'claude' ? 14 : 8)
      body.animate([{ transform: 'none' }, { transform: 'translateY(4px) scale(1.04,.96)', offset: 0.3 }, { transform: 'translateY(-9px) scale(.96,1.06)', offset: 0.4 }, { transform: 'none' }], { duration: dur * 1.2, easing: spring })
      setTimeout(() => {
        if (!ui) return
        s.laser = { t0: performance.now(), dur: dur * 0.6 }
        if (h.id === 'claude') bolt(muzzle.x, muzzle.y, impact.x, impact.y)
        hit()
      }, dur * 0.4)
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
    if (now - lastClick < comboCool(G) * 1000) combo = Math.min(50, combo + 1)
    else combo = 1
    lastClick = now
    updateCombo()
    let value = clickValue(G, fx)
    const crit = Math.random() < critChance(G)
    const dbl = Math.random() < doubleChance(G)
    if (crit) value *= critMult(G)
    if (dbl) value *= 2
    G.clicks++
    const got = earn(G, Math.max(1, Math.floor(value)))
    if (fight) hurtBoss(Math.max(1, Math.floor(value)), crit)
    else if (!got && G.life >= storyCap(G)) floatNum(toScreen(0, -60), G.act1 ? '🔒 Vence al Emperador Zarpas' : '🔒 Vence a Zarpas Omega', '#FF8A7A', 14)
    if (G.clicks <= 5 && ui) ui.hint.style.display = G.clicks >= 5 ? 'none' : ''
    if (G.clicks === 1 || G.life >= 10) checkMedals()
    chestTick()
    const p = e ? pointer(e) : toScreen(rnd(-30, 30), rnd(-30, -5))
    capHit(1)
    ui?.g3?.playerPress(crit)
    ledPulse(1)
    rayBoost = Math.min(1, rayBoost + 0.18)
    const base = toScreen(0, 20)
    ring(base, crit ? '#FFD84F' : '#FF6A5A', 7)
    ring(base, '#FFFFFF', 11, 0.06)
    flash(p.x, p.y, crit ? 90 : 34, crit ? '255,230,120' : '255,170,140')
    sparks(p.x, p.y, crit ? 46 : 12 + Math.round(fx.combo * 5), crit ? '#FFD84F' : '#FF8A6A', crit ? 8 : 4.8)
    floatNum({ x: p.x + rnd(-28, 28), y: p.y - rnd(10, 34) }, `+${fmt(value)}`, crit ? '#FFD84F' : '#FFFFFF', crit ? 28 : 17 + Math.min(8, fx.combo * 2), crit)
    if (crit) {
      bigText(`¡CRÍTICO ×${critMult(G)}!`, '#FFD84F')
      hitstop(70)
      punch(1.05)
      whiteFlash(0.35)
      shake(12)
      coinsBurst(p.x, p.y, 10)
    } else if (dbl) {
      floatNum({ x: p.x, y: p.y - 44 }, '¡DOBLE!', '#7FE3FF', 16, true)
      ring(base, '#7FE3FF', 9)
    }
    shake(1.5 + fx.combo * 1.2)
    SL().beep([180 + combo * 9 + (crit ? 400 : 0)], 0.02)
    checkEnds()
    refresh()
  }
  function pointer(e) {
    const r = root.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  // the cap sinks into the base, squashes, springs back past its rest and settles; its top flashes white
  function capHit(force) {
    if (!ui || calm()) return
    if (ui.g3) return ui.g3.capHit(force)
    ui.cap.animate(
      [
        { transform: 'none' },
        { transform: `translateY(${13 * force}px) scale(${1 + 0.07 * force},${1 - 0.2 * force})`, offset: 0.22 },
        { transform: `translateY(${-5 * force}px) scale(${1 - 0.03 * force},${1 + 0.07 * force})`, offset: 0.5 },
        { transform: `translateY(${1.5 * force}px) scale(1,.99)`, offset: 0.75 },
        { transform: 'none' },
      ],
      { duration: 260 + 120 * force, easing: 'ease-out' },
    )
    ui.capFlash.animate([{ opacity: 0.55 * force }, { opacity: 0 }], { duration: 160 + 120 * force, easing: 'ease-out' })
  }
  function shake(px) {
    if (!ui || calm() || px < 2) return
    const k = Math.min(px, 16)
    if (ui.g3) return ui.g3.shake(k)
    ui.stage.animate([0, 1, 2, 3, 4, 5].map(i => ({ transform: i === 5 ? 'none' : `translate(${rnd(-k, k) * (1 - i / 6)}px,${rnd(-k, k) * 0.6 * (1 - i / 6)}px) rotate(${rnd(-k, k) * 0.05}deg)` })), { duration: 220 })
  }
  // camera punch: a quick zoom in and out of the stage
  function punch(k) {
    if (!ui || calm()) return
    if (ui.g3) return ui.g3.punch(k)
    ui.stage.animate([{ transform: 'none' }, { transform: `scale(${k})`, offset: 0.25 }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1)' })
  }
  function whiteFlash(a) {
    if (!ui || calm()) return
    ui.white.animate([{ opacity: a }, { opacity: 0 }], { duration: 260, easing: 'ease-out' })
  }
  // hitstop: the particles freeze for a beat so the big hits land
  let freezeUntil = 0
  function hitstop(ms) {
    if (!calm()) freezeUntil = performance.now() + ms
  }
  let ledFlash = 0
  function ledPulse(k) {
    ledFlash = Math.min(1, ledFlash + k)
  }

  // ---------- particles, rings and numbers on the canvas ----------

  const parts = []
  const MAX_PARTS = 900
  const add = p => parts.length < MAX_PARTS && parts.push(p)
  function sparks(x, y, n, color, speed) {
    if (calm()) n = Math.min(n, 4)
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2)
      const v = rnd(0.4, 1) * speed
      add({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.6, life: 1, decay: rnd(0.016, 0.032), color, size: rnd(1.4, 3.2) })
    }
  }
  function confetti(x, y, n) {
    const colors = ['#FF5A4A', '#FFD84F', '#4FA3FF', '#7FE37F', '#B46CFF', '#FFFFFF']
    if (calm()) n = Math.min(n, 10)
    for (let i = 0; i < n; i++) {
      const a = rnd(-Math.PI, 0)
      const v = rnd(3, 9)
      add({ kind: 'confetti', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: rnd(0.006, 0.012), color: colors[i % colors.length], size: rnd(3, 6), rot: rnd(0, 6), vr: rnd(-0.3, 0.3), flip: rnd(0, 6) })
    }
  }
  function ring(p, color, grow = 7, decay = 0.035) {
    add({ kind: 'ring', x: p.x, y: p.y, r: 30, life: 1, decay, color, grow })
  }
  function flash(x, y, r, rgb) {
    add({ kind: 'flash', x, y, r, life: 1, decay: 0.09, rgb })
  }
  function floatNum(p, text, color, size, big = false) {
    if (parts.filter(q => q.kind === 'text').length > 45) return
    add({ kind: 'text', x: p.x, y: p.y, vx: rnd(-1.1, 1.1), vy: rnd(-2.6, -1.5), life: 1, decay: big ? 0.011 : 0.016, color, size, text, age: 0, big, spin: big ? rnd(-0.15, 0.15) : 0 })
  }
  // coins: spinning discs that either fall with gravity or fly along a curve to a target
  function coinsBurst(x, y, n) {
    if (calm()) n = Math.min(n, 3)
    for (let i = 0; i < n; i++) add({ kind: 'coin', x, y, vx: rnd(-4, 4), vy: rnd(-9, -4), life: 1, decay: 0.012, spin: rnd(0, 6), size: rnd(4, 6.5) })
  }
  function coinsFly(from, to, n) {
    if (calm()) n = Math.min(n, 3)
    for (let i = 0; i < n; i++) {
      const cx = (from.x + to.x) / 2 + rnd(-80, 80)
      const cy = Math.min(from.y, to.y) - rnd(40, 120)
      add({ kind: 'coin', fly: { from, to, cx, cy, t: -i * 0.06 }, x: from.x, y: from.y, life: 1, decay: 0, spin: rnd(0, 6), size: rnd(4, 6) })
    }
  }
  function bolt(x1, y1, x2, y2) {
    add({ kind: 'bolt', x: x1, y: y1, x2, y2, life: 1, decay: 0.12 })
    add({ kind: 'bolt', x: x1, y: y1, x2: x2 + rnd(-20, 20), y2: y2 + rnd(-8, 8), life: 0.7, decay: 0.14 })
  }
  // light gathering into a point before a shot
  function charge(x, y, color, n) {
    if (calm()) return
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2)
      const d = rnd(18, 36)
      add({ kind: 'suck', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, tx: x, ty: y, life: 1, decay: 0.05, color, size: rnd(1.5, 3) })
    }
    add({ kind: 'flash', x, y, r: 14, life: 1, decay: 0.05, rgb: color === '#FFD84F' ? '255,220,90' : '255,90,122', grow: true })
  }
  function slash(x, y, dir) {
    add({ kind: 'slash', x, y, dir, life: 1, decay: 0.07 })
  }
  function puff(x, y, rgba, a) {
    add({ kind: 'puff', x, y, vx: rnd(-0.6, 0.6), vy: rnd(-1.4, -0.4), r: rnd(3, 6), life: 1, decay: rnd(0.025, 0.04), rgba, a })
  }
  function embers(x, y, n) {
    if (calm()) return
    for (let i = 0; i < n; i++) add({ kind: 'ember', x: x + rnd(-55, 55), y: y + rnd(-6, 10), vx: rnd(-0.4, 0.4), vy: rnd(-2.6, -1.2), life: 1, decay: rnd(0.012, 0.022), size: rnd(1.5, 3.2), wob: rnd(0, 6) })
  }
  function beams(x, y, color) {
    add({ kind: 'beams', x, y, color, life: 1, decay: 0.012, rot: rnd(0, 6) })
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
  let rayBoost = 0
  function frame() {
    if (!ui) return
    ui.raf = requestAnimationFrame(frame)
    const W = root.clientWidth
    const H = root.clientHeight
    const c = toScreen(0, 0)
    const now = performance.now()
    const frozen = now < freezeUntil
    // background: rotating rays that throb with every press, drifting motes; hotter with the combo, gold in a frenzy
    const bg = ui.bg.getContext('2d')
    bg.clearRect(0, 0, W, H)
    const heat = (fx.combo - 1) / 2
    const gold = frenzyUntil > Date.now()
    if (!calm()) rayAngle += 0.002 + heat * 0.012 + (gold ? 0.02 : 0) + rayBoost * 0.02
    rayBoost *= 0.92
    const R = Math.hypot(W, H)
    bg.save()
    bg.translate(c.x, c.y)
    bg.rotate(rayAngle)
    const rays = 16
    for (let i = 0; i < rays; i++) {
      bg.beginPath()
      bg.moveTo(0, 0)
      bg.arc(0, 0, R, (i * 2 * Math.PI) / rays, ((i + 0.5) * 2 * Math.PI) / rays)
      bg.closePath()
      const a = 0.045 + heat * 0.06 + rayBoost * 0.08
      bg.fillStyle = gold ? `rgba(255,200,60,${a + 0.06})` : `rgba(255,${Math.round(90 - heat * 40)},${Math.round(70 - heat * 40)},${a})`
      bg.fill()
    }
    bg.restore()
    // a soft hot core behind the button
    const core = bg.createRadialGradient(c.x, c.y, 0, c.x, c.y, 260 + rayBoost * 80)
    core.addColorStop(0, gold ? `rgba(255,210,90,${0.35 + rayBoost * 0.3})` : `rgba(255,80,60,${0.22 + heat * 0.15 + rayBoost * 0.25})`)
    core.addColorStop(1, 'rgba(0,0,0,0)')
    bg.fillStyle = core
    bg.fillRect(0, 0, W, H)
    if (!ui.motes) ui.motes = Array.from({ length: 80 }, () => ({ x: rnd(0, 1), y: rnd(0, 1), v: rnd(0.0004, 0.0018), s: rnd(0.6, 2.2), tw: rnd(0, 6) }))
    for (const m of ui.motes) {
      if (!calm()) {
        m.y -= m.v * (1 + heat * 3 + rayBoost * 4)
        m.tw += 0.05
      }
      if (m.y < 0) m.y = 1
      bg.fillStyle = gold ? `rgba(255,220,120,${0.5 + Math.sin(m.tw) * 0.3})` : `rgba(255,255,255,${0.3 + Math.sin(m.tw) * 0.2})`
      bg.fillRect(m.x * W, m.y * H, m.s, m.s)
    }
    // the ring of lights: three chasers that run faster with production, everything lit on a press
    const speed = 0.0015 + Math.log10(1 + rate(G, fx)) * 0.0012
    ledFlash *= 0.9
    ui.leds.forEach((led, i) => {
      let b = ledFlash
      for (let k = 0; k < 3; k++) {
        const pos = ((now * speed + (k * ui.leds.length) / 3) % ui.leds.length + ui.leds.length) % ui.leds.length
        const d = Math.min(Math.abs(i - pos), ui.leds.length - Math.abs(i - pos))
        b = Math.max(b, 1 - d / 3)
      }
      led.setAttribute('fill', gold ? `rgba(255,216,79,${(0.25 + b * 0.75).toFixed(2)})` : `rgba(255,${Math.round(80 + b * 150)},${Math.round(60 + b * 120)},${(0.25 + b * 0.75).toFixed(2)})`)
    })
    if (ui.g3) {
      ui.g3.frame({ heat, gold, rayBoost, ledFlash, speed, frozen })
      const moved = ui.g3.viewMoved()
      if (ui.viewBtn.hidden === moved) ui.viewBtn.hidden = !moved
      const hp = toScreen(0, -66)
      ui.hint.style.left = `${hp.x}px`
      ui.hint.style.top = `${hp.y}px`
      const bh = ui.g3.bossHead()
      if (bh) {
        const p = g3px(bh)
        ui.bubble.style.transform = `translate(${p.x}px,${p.y}px)`
      }
    }
    // embers rise off the button while the combo is full
    if (fx.comboFull && !frozen) embers(c.x, c.y - 10, gold ? 3 : 2)
    if (golden && !calm()) {
      const r = golden.getBoundingClientRect()
      const box = root.getBoundingClientRect()
      const gx = r.left - box.left + r.width / 2
      const gy = r.top - box.top + r.height / 2
      add({ kind: 'spark', x: gx + rnd(-10, 10), y: gy + rnd(-6, 6), vx: rnd(-0.5, 0.5), vy: rnd(0, 1), life: 1, decay: 0.03, color: Math.random() < 0.5 ? '#FFF6C8' : '#FFD84F', size: rnd(1.5, 3) })
    }
    // foreground particles: light things add up (lighter), solid things paint over
    const ctx = ui.fxc.getContext('2d')
    ctx.clearRect(0, 0, W, H)
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      if (!frozen) p.life -= p.decay
      if (p.life <= 0 || (p.fly && p.fly.t >= 1)) {
        if (p.fly) sparks(p.fly.to.x, p.fly.to.y, 3, '#FFD84F', 2)
        parts.splice(i, 1)
        continue
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4))
      ctx.globalCompositeOperation = 'source-over'
      if (p.kind === 'spark') {
        const px = p.x
        const py = p.y
        if (!frozen) {
          p.x += p.vx
          p.y += p.vy
          p.vy += 0.18
          p.vx *= 0.98
        }
        ctx.globalCompositeOperation = 'lighter'
        ctx.strokeStyle = p.color
        ctx.lineWidth = p.size
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(px - p.vx * 1.5, py - p.vy * 1.5)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
      } else if (p.kind === 'confetti') {
        if (!frozen) {
          p.x += p.vx
          p.y += p.vy
          p.vy += 0.15
          p.vx *= 0.99
          p.rot += p.vr
          p.flip += 0.2
        }
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.scale(1, Math.cos(p.flip))
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      } else if (p.kind === 'ring') {
        if (!frozen) p.r += p.grow
        ctx.globalCompositeOperation = 'lighter'
        ctx.strokeStyle = p.color
        ctx.lineWidth = 5 * p.life
        ctx.beginPath()
        ctx.ellipse(p.x, p.y, p.r, p.r * (p.round ? 1 : 0.42), 0, 0, Math.PI * 2)
        ctx.stroke()
      } else if (p.kind === 'flash') {
        const r = p.grow ? p.r * (2 - p.life) : p.r * (1.6 - p.life * 0.6)
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
        g.addColorStop(0, `rgba(255,255,255,${p.life})`)
        g.addColorStop(0.35, `rgba(${p.rgb},${p.life * 0.8})`)
        g.addColorStop(1, `rgba(${p.rgb},0)`)
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = g
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2)
      } else if (p.kind === 'text') {
        if (!frozen) {
          p.x += p.vx
          p.y += p.vy
          p.vy *= 0.965
          p.age++
        }
        // pops in big and settles, the important ones keep a wobble
        const pop = p.age < 8 ? 1.8 - (p.age / 8) * 0.8 : 1
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.scale(pop, pop)
        if (p.big) ctx.rotate(Math.sin(p.age * 0.3) * p.spin)
        ctx.font = `900 ${p.size}px Verdana, sans-serif`
        ctx.textAlign = 'center'
        ctx.lineWidth = 4.5
        ctx.lineJoin = 'round'
        ctx.strokeStyle = '#1a1310'
        ctx.strokeText(p.text, 0, 0)
        if (p.big) {
          const g = ctx.createLinearGradient(0, -p.size, 0, 0)
          g.addColorStop(0, '#FFFFFF')
          g.addColorStop(1, p.color)
          ctx.fillStyle = g
        } else ctx.fillStyle = p.color
        ctx.fillText(p.text, 0, 0)
        ctx.restore()
      } else if (p.kind === 'coin') {
        if (p.fly) {
          if (!frozen) p.fly.t += 0.028
          const t = Math.max(0, p.fly.t)
          const e = t * t * (3 - 2 * t)
          const { from, to, cx, cy } = p.fly
          p.x = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * cx + e * e * to.x
          p.y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * cy + e * e * to.y
          if (p.fly.t < 0) continue
        } else if (!frozen) {
          p.x += p.vx
          p.y += p.vy
          p.vy += 0.3
        }
        if (!frozen) p.spin += 0.25
        const w = Math.abs(Math.cos(p.spin)) * p.size + 0.8
        ctx.fillStyle = '#B8860B'
        ctx.beginPath()
        ctx.ellipse(p.x, p.y + 1, w, p.size, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#FFD84F'
        ctx.beginPath()
        ctx.ellipse(p.x, p.y, w, p.size, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,.7)'
        ctx.fillRect(p.x - w * 0.4, p.y - p.size * 0.5, Math.max(0.6, w * 0.3), p.size * 0.5)
      } else if (p.kind === 'bolt') {
        // a fresh zig-zag every frame: it crackles
        const pts = [[p.x, p.y]]
        const n = 9
        const dx = p.x2 - p.x
        const dy = p.y2 - p.y
        const len = Math.hypot(dx, dy) || 1
        for (let k = 1; k < n; k++) {
          const off = rnd(-1, 1) * 16 * Math.sin((k / n) * Math.PI)
          pts.push([p.x + (dx * k) / n + (-dy / len) * off, p.y + (dy * k) / n + (dx / len) * off])
        }
        pts.push([p.x2, p.y2])
        ctx.globalCompositeOperation = 'lighter'
        for (const [width, color] of [[9, 'rgba(255,200,60,.35)'], [3.5, 'rgba(255,240,170,.9)'], [1.4, '#FFFFFF']]) {
          ctx.strokeStyle = color
          ctx.lineWidth = width * p.life
          ctx.lineJoin = 'round'
          ctx.beginPath()
          pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
          ctx.stroke()
        }
      } else if (p.kind === 'suck') {
        if (!frozen) {
          p.x += (p.tx - p.x) * 0.18
          p.y += (p.ty - p.y) * 0.18
        }
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = p.color
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      } else if (p.kind === 'slash') {
        // three claw marks drawn on and then fading
        const grow = Math.min(1, (1 - p.life) * 4)
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineCap = 'round'
        for (let k = -1; k <= 1; k++) {
          ctx.lineWidth = 3 * p.life
          ctx.beginPath()
          const sx = p.x + k * 7 - p.dir * 10
          const sy = p.y - 12 + k * 2
          ctx.moveTo(sx, sy)
          ctx.quadraticCurveTo(sx + p.dir * 10 * grow, sy + 8 * grow, sx + p.dir * 18 * grow, sy + 22 * grow)
          ctx.stroke()
        }
      } else if (p.kind === 'puff') {
        if (!frozen) {
          p.x += p.vx
          p.y += p.vy
          p.r += 0.5
        }
        ctx.fillStyle = `${p.rgba}${(p.a * p.life).toFixed(2)})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 'ember') {
        if (!frozen) {
          p.wob += 0.15
          p.x += p.vx + Math.sin(p.wob) * 0.5
          p.y += p.vy
        }
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = p.life > 0.6 ? '#FFE07A' : p.life > 0.3 ? '#FF8A2A' : '#C8321E'
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2)
        ctx.fill()
      } else if (p.kind === 'beams') {
        if (!frozen) p.rot += 0.02
        ctx.globalCompositeOperation = 'lighter'
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        const L = 160 * Math.min(1, (1 - p.life) * 5)
        for (let k = 0; k < 10; k++) {
          ctx.rotate((Math.PI * 2) / 10)
          const g = ctx.createLinearGradient(0, 0, L, 0)
          g.addColorStop(0, p.color)
          g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = g
          ctx.globalAlpha = p.life * 0.55
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.lineTo(L, -9)
          ctx.lineTo(L, 9)
          ctx.closePath()
          ctx.fill()
        }
        ctx.restore()
      }
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    // the shown count rolls towards the real one
    ui.shownLife += (G.life - ui.shownLife) * 0.22
    if (Math.abs(G.life - ui.shownLife) < 1) ui.shownLife = G.life
    const label = fmt(ui.shownLife)
    if (ui.life.textContent !== label) ui.life.textContent = label
    // helpers: each sprite presses on its own clock
    for (const s of ui.sprites) {
      if (!G.ended && now >= s.next) {
        s.next = now + s.h.every * 1000 * rnd(0.85, 1.15)
        helperPress(s)
      }
      if (s.piston) piston(s, now)
      if (s.laser) laser(s, now)
    }
    // the button glows with the combo and every press
    ui.button.querySelector('.rg-halo').setAttribute('opacity', (0.5 + heat * 0.5 + (gold ? 0.4 : 0) + rayBoost * 0.6).toFixed(2))
    root.classList.toggle('rg-hot', fx.comboFull)
    root.classList.toggle('rg-gold', gold)
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
    // shoots out with an overshoot (ease-out-back), holds on the button, then retracts
    const back = t => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2
    const ext = k < 0.15 ? -0.08 * (k / 0.15) : k < 0.4 ? back((k - 0.15) / 0.25) : k < 0.55 ? 1 : 1 - ((k - 0.55) / 0.45) ** 2
    line.setAttribute('stroke-width', (7 + (ext > 0.9 ? 2 : 0)).toString())
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
    G.shards = (G.shards || 0) + 1
    SL().unlock('redgold')
    hitstop(110)
    whiteFlash(0.6)
    punch(1.07)
    flash(x, y, 140, '255,220,90')
    beams(x, y, 'rgba(255,216,79,1)')
    ring({ x, y }, '#FFD84F', 9, 0.025)
    confetti(x, y, 70)
    sparks(x, y, 60, '#FFD84F', 9)
    coinsBurst(x, y, 16)
    floatNum({ x, y: y - 30 }, '+1 💠', '#9FE8FF', 18, true)
    SL().beep([784, 988, 1175, 1568], 0.07)
    if (Math.random() < 0.5) frenzy(goldenFrenzy(G), frenzySeconds(G), `¡FRENESÍ ×${goldenFrenzy(G)}!`)
    else {
      const lump = Math.max(rate(G, fx) * 60, clickValue(G, fx) * 10) * 2 ** lvl(G, 'l4')
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
    if (ui.g3) {
      ui.g3.chestShow()
      setTimeout(() => {
        if (!ui) return
        shake(5)
        const p = toScreen(0, 140)
        for (let i = 0; i < 8; i++) puff(p.x + rnd(-40, 40), p.y, 'rgba(200,180,150,', 0.5)
      }, 440)
      if (lvl(G, 'k4')) setTimeout(() => chestReady && openChest(), 2500)
      return
    }
    const c = ui.chest
    c.style.display = ''
    c.setAttribute('transform', 'translate(0,128)')
    c.innerHTML =
      '<g class="rg-chest-body"><ellipse cx="0" cy="22" rx="30" ry="8" fill="#000" opacity=".3"/><rect x="-26" y="-6" width="52" height="28" rx="3" fill="#8A5A2B" stroke="#3B2410" stroke-width="2"/><rect x="-26" y="4" width="52" height="4" fill="#C9A24A"/>' +
      '<g class="rg-lid"><path d="M-26 -6 q26 -26 52 0z" fill="#A86F35" stroke="#3B2410" stroke-width="2"/><path d="M-26 -6 q26 -26 52 0" fill="none" stroke="#C9A24A" stroke-width="3"/></g>' +
      '<rect x="-4" y="-4" width="8" height="10" fill="#FFD84F" stroke="#3B2410" stroke-width="1.5"/><text y="-30" text-anchor="middle" class="rg-chest-hint">¡Ábreme!</text></g>'
    if (!calm()) {
      c.firstChild.animate([{ transform: 'translateY(-160px) rotate(-10deg)' }, { transform: 'translateY(0) scale(1.18,.78)', offset: 0.55 }, { transform: 'translateY(-22px) scale(.95,1.06) rotate(4deg)', offset: 0.75 }, { transform: 'translateY(0) scale(1.06,.94)', offset: 0.9 }, { transform: 'none' }], { duration: 800, easing: 'ease-in' })
      setTimeout(() => {
        if (!ui) return
        const p = toScreen(0, 150)
        for (let i = 0; i < 6; i++) puff(p.x + rnd(-30, 30), p.y, 'rgba(200,180,150,', 0.5)
      }, 440)
    }
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
    const reward = chestBonus(G) * [base * 30 + click * 5, base * 120 + click * 15, base * 400 + click * 40, base * 1200 + click * 100][tier]
    G.chests = (G.chests || 0) + 1
    earn(G, Math.floor(reward))
    const p = toScreen(0, 118)
    const shards = CHEST_SHARDS[tier] + (tier >= 1 && art(G, 'sock') ? 1 : 0)
    G.shards = (G.shards || 0) + shards
    hitstop(40 + tier * 30)
    flash(p.x, p.y, 60 + tier * 40, rar.color === '#C9CED6' ? '230,235,240' : tier === 1 ? '79,163,255' : tier === 2 ? '180,108,255' : '255,176,32')
    beams(p.x, p.y, rar.color)
    sparks(p.x, p.y, 20 + tier * 25, rar.color, 5 + tier * 2)
    coinsBurst(p.x, p.y, 6 + tier * 6)
    if (shards) floatNum({ x: p.x, y: p.y - 50 }, `+${shards} 💠`, '#9FE8FF', 18, true)
    if (tier >= 2) {
      confetti(p.x, p.y, 30 * tier)
      whiteFlash(0.25 * tier)
      punch(1 + 0.02 * tier)
    }
    if (ui.g3) ui.g3.chestOpen(rar.color, tier)
    const lid = ui.g3 ? null : ui.chest.querySelector('.rg-lid')
    lid?.animate([{ transform: 'none' }, { transform: 'translate(-20px,-60px) rotate(-70deg)', opacity: 1, offset: 0.6 }, { transform: 'translate(-34px,-30px) rotate(-120deg)', opacity: 0 }], { duration: 500, easing: 'ease-out', fill: 'forwards' })
    if (tier === 3) {
      SL().unlock('redchest')
      frenzy(7, 20, '¡LEGENDARIO! ×7')
    } else if (tier === 2) frenzy(3, 15, '¡ÉPICO! ×3')
    bigText(`${rar.name}: +${fmt(reward)}`, rar.color)
    SL().beep([523, 659, 784, 1047].slice(0, 2 + tier), 0.07)
    const c = ui.chest
    if (!ui.g3) c.firstChild.animate([{ transform: 'none' }, { transform: 'scale(1.25,.8)', offset: 0.15 }, { transform: 'scale(1.1) translateY(-6px)', offset: 0.5 }, { transform: 'scale(0) rotate(20deg)', opacity: 0 }], { duration: 900, easing: 'ease-in' }).onfinish = () => {
      c.style.display = 'none'
    }
    refresh()
  }

  // ---------- the story: who talks ----------

  const NARRATOR = { name: 'El botón', face: '🔴' }
  const ZARPAS = { name: 'Doctor Zarpas', face: '😼', evil: true }
  const talks = []
  function say(who, text) {
    talks.push({ who, text })
    if (ui && ui.talk.hidden) nextTalk()
  }
  // shows the next line in the queue, typed out letter by letter; a click finishes it or moves on
  function nextTalk() {
    if (!ui) return
    const t = ui.talk
    if (t.typing) {
      clearInterval(t.typing)
      t.typing = 0
      t.querySelector('p').textContent = t.full
      return
    }
    const line = talks.shift()
    if (!line) {
      t.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(10px)' }], { duration: 180 }).onfinish = () => (t.hidden = true)
      return
    }
    const wasHidden = t.hidden
    t.hidden = false
    t.classList.toggle('evil', !!line.who.evil)
    t.querySelector('.who').innerHTML = `<span class="face">${line.who.face}</span>${line.who.name}`
    t.full = line.text
    const p = t.querySelector('p')
    p.textContent = ''
    if (wasHidden) t.animate([{ opacity: 0, transform: 'translateY(16px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1.2)' })
    if (line.who.evil) t.querySelector('.face').animate([{ transform: 'rotate(-12deg) scale(1.2)' }, { transform: 'rotate(10deg)' }, { transform: 'none' }], { duration: 500 })
    let i = 0
    if (calm()) {
      p.textContent = line.text
      return
    }
    t.typing = setInterval(() => {
      i += 2
      p.textContent = line.text.slice(0, i)
      if (i >= line.text.length) {
        clearInterval(t.typing)
        t.typing = 0
      }
    }, 18)
  }

  // ---------- the current mission, always on screen ----------

  function refreshMission() {
    const ch = chapter(G)
    const idx = Math.min(G.chapter || 0, CHAPTERS.length - 1)
    const m = ui.mission
    if (m.dataset.ch !== String(idx)) {
      m.dataset.ch = String(idx)
      m.innerHTML = `<button class="rg-fold" title="Minimizar / desplegar"></button><small>Capítulo ${idx + 1} de ${CHAPTERS.length}<span class="sum"></span></small><b>${ch.title}</b><ul>${ch.objs
        .map(o => `<li><span class="tick"></span><span class="tx">${o.text}</span><em></em><i class="bar"><u></u></i></li>`)
        .join('')}</ul><button class="rg-next" hidden></button>`
      m.querySelector('.rg-next').addEventListener('click', onNext)
      m.querySelector('.rg-fold').addEventListener('click', () => {
        G.missionMin = !G.missionMin
        save(true)
        refreshMission()
      })
      m.animate([{ opacity: 0, transform: 'translateX(-20px)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: 'cubic-bezier(.2,.9,.3,1.2)' })
    }
    ch.objs.forEach((o, k) => {
      const li = m.querySelectorAll('li')[k]
      const cur = Math.min(o.target, o.cur(G))
      const done = cur >= o.target
      if (done && !li.classList.contains('done')) {
        li.classList.add('done')
        if (m.dataset.ready) {
          li.animate([{ background: 'rgba(127,227,127,.45)', transform: 'scale(1.04)' }, { background: 'transparent', transform: 'none' }], { duration: 700, easing: 'ease-out' })
          const r = li.getBoundingClientRect()
          const box = root.getBoundingClientRect()
          sparks(r.left - box.left + 12, r.top - box.top + r.height / 2, 16, '#7FE37F', 3.5)
          SL().beep([660, 880], 0.06)
        }
      }
      li.querySelector('em').textContent = o.target >= 1000 ? `${fmt(cur)}/${fmt(o.target)}` : `${cur.toLocaleString('es-ES', { maximumFractionDigits: 1 })}/${o.target.toLocaleString('es-ES')}`
      li.querySelector('.bar u').style.width = `${(cur / o.target) * 100}%`
    })
    m.dataset.ready = '1'
    m.classList.toggle('min', !!G.missionMin)
    m.querySelector('.rg-fold').textContent = G.missionMin ? '▸' : '▾'
    const doneN = ch.objs.filter(o => o.cur(G) >= o.target).length
    m.querySelector('.sum').textContent = G.missionMin ? ` · ${doneN}/${ch.objs.length}` : ''
    const next = m.querySelector('.rg-next')
    const last = idx >= CHAPTERS.length - 1
    const pending = ch.boss !== undefined && !(G.beaten || {})[ch.boss]
    const ready = chapterDone(G) && !last
    next.hidden = !ready || !!fight
    if (ready) {
      const label = pending ? (fightCooldown > Date.now() ? `⏳ Zarpas descansa… ${Math.ceil((fightCooldown - Date.now()) / 1000)} s` : `⚔️ ¡Enfréntate a ${BOSSES[ch.boss].name}!`) : `Siguiente capítulo ▸ +${ch.shards} 💠`
      if (next.textContent !== label) next.textContent = label
      next.disabled = pending && fightCooldown > Date.now()
      next.classList.toggle('boss', pending)
    }
  }
  function onNext() {
    const ch = chapter(G)
    if (ch.boss !== undefined && !(G.beaten || {})[ch.boss]) return startFight(ch.boss)
    const before = G.chapter || 0
    const got = advance(G)
    if ((G.chapter || 0) === before) return
    const m = ui.mission.getBoundingClientRect()
    const box = root.getBoundingClientRect()
    const from = { x: m.left - box.left + m.width / 2, y: m.top - box.top + m.height }
    const sh = ui.shards.getBoundingClientRect()
    coinsFly(from, { x: sh.left - box.left + 10, y: sh.top - box.top + 8 }, Math.min(10, 2 + got * 2))
    confetti(from.x, from.y, 50)
    bigText(`¡Capítulo completado! +${got} 💠`, '#7FE3FF')
    SL().beep([523, 659, 784, 1047], 0.08)
    save(true)
    refresh()
    setTimeout(() => say(NARRATOR, chapter(G).intro), 900)
  }

  // ---------- artifacts ----------

  function buildArts() {
    ui.arts.innerHTML = `<p class="rg-hintline">Los fragmentos 💠 salen de los cofres raros, de los botones dorados, de los capítulos y de vencer a Zarpas.</p><div class="rg-artgrid">${ARTS.map(
      a => `<button class="rg-art" data-art="${a.id}"><span class="ic">${a.icon}</span><b>${a.name}</b><small>${a.desc}</small><em></em></button>`,
    ).join('')}</div>`
    ui.arts.querySelectorAll('[data-art]').forEach(b => b.addEventListener('click', () => buyArtifact(b.dataset.art)))
  }
  function refreshArts() {
    if (ui.arts.hidden) return
    for (const b of ui.arts.querySelectorAll('[data-art]')) {
      const a = ARTS.find(x => x.id === b.dataset.art)
      const owned = art(G, a.id)
      b.hidden = !artShown(G, a)
      b.classList.toggle('owned', owned)
      b.disabled = owned || (G.shards || 0) < a.cost
      b.querySelector('em').textContent = owned ? '✓ tuyo' : `${a.cost} 💠`
    }
  }
  function buyArtifact(id) {
    const a = ARTS.find(x => x.id === id)
    if (!buyArt(G, a)) return
    SL().unlock('redshop')
    if (ui.g3) {
      // in 3D the artifact appears over the button, spins in a burst of light and flies to its place on the stage
      ui.g3.setArts(Object.keys(G.arts), id, land => {
        if (!ui) return
        const q = g3px(land)
        flash(q.x, q.y, 70, '160,230,255')
        sparks(q.x, q.y, 24, '#9FE8FF', 4)
        ring(q, '#9FE8FF', 5, 0.05)
        SL().beep([1047, 1319], 0.05)
      })
      const p = g3px(ui.g3.point(0, 1.5, 1.6))
      hitstop(90)
      beams(p.x, p.y, '#9FE8FF')
      flash(p.x, p.y, 160, '160,230,255')
      sparks(p.x, p.y, 50, '#9FE8FF', 7)
      confetti(p.x, p.y, 40)
      whiteFlash(0.3)
      shake(8)
      bigText(`¡${a.name}!`, '#9FE8FF')
      SL().beep([392, 523, 659, 784, 1047], 0.07)
      save(true)
      refresh()
      return
    }
    // the relic rises to the middle of the screen, glowing, and settles into the list
    const b = ui.arts.querySelector(`[data-art="${id}"]`)
    const r = b.getBoundingClientRect()
    const box = root.getBoundingClientRect()
    const el = document.createElement('div')
    el.className = 'rg-relic'
    el.textContent = a.icon
    root.appendChild(el)
    const sx = r.left - box.left + 20
    const sy = r.top - box.top + 20
    const cx = box.width * 0.35
    const cy = box.height * 0.45
    el.animate(
      [
        { transform: `translate(${sx}px,${sy}px) scale(.6)`, opacity: 0.3 },
        { transform: `translate(${cx}px,${cy}px) scale(3)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${cx}px,${cy - 10}px) scale(3.2) rotate(8deg)`, opacity: 1, offset: 0.7 },
        { transform: `translate(${sx}px,${sy}px) scale(.8)`, opacity: 0 },
      ],
      { duration: 1600, easing: 'cubic-bezier(.3,.8,.3,1)' },
    ).onfinish = () => el.remove()
    setTimeout(() => {
      if (!ui) return
      beams(cx + 20, cy + 20, '#9FE8FF')
      flash(cx + 20, cy + 20, 120, '160,230,255')
      sparks(cx + 20, cy + 20, 40, '#9FE8FF', 6)
      whiteFlash(0.25)
    }, 520)
    bigText(`¡${a.name}!`, '#9FE8FF')
    SL().beep([392, 523, 659, 784, 1047], 0.07)
    save(true)
    refresh()
  }

  // ---------- rebirth: let it all go and come back with souls ----------

  function refreshRebirth() {
    const pend = pendingSouls(G)
    // the tab glows when a rebirth would at least double your souls
    ui.rebirthTab.classList.toggle('ready', !!G.act1 && pend >= Math.max(3, G.souls || 0))
    if (ui.rebirth.hidden) return
    const key = `${G.act1 ? 1 : 0}:${G.souls}:${pend}:${G.rebirths}`
    if (ui.rebirth.dataset.key === key) return
    ui.rebirth.dataset.key = key
    if (!G.act1) {
      ui.rebirth.innerHTML = '<div class="rg-soul"><div class="big">🔒</div><p>La grieta del patio aún está cerrada. Lleva el botón a los mil millones para abrirla.</p></div>'
      return
    }
    const next = (G.souls || 0) + pend
    ui.rebirth.innerHTML = `<div class="rg-soul">
      <p class="lore">La grieta te ofrece un trato: suéltalo todo y vuelve más fuerte. Cada <b>alma de botón</b> 🔆 da <b>+5 %</b> a todo, para siempre.</p>
      <div class="stats"><div><small>Almas</small><b>🔆 ${fmt(G.souls || 0)}</b><em>×${soulMult(G).toLocaleString('es-ES', { maximumFractionDigits: 2 })}</em></div><div><small>Renaceres</small><b>${G.rebirths || 0}</b></div></div>
      <div class="gain ${pend ? '' : 'none'}">${pend ? `Si renaces ahora: <b>+${fmt(pend)} almas</b> → ×${(1 + SOUL_PCT * next).toLocaleString('es-ES', { maximumFractionDigits: 2 })}` : G.life < REBIRTH_AT ? 'Las almas empiezan a salir al llegar a 1 billón (10¹²).' : 'Sigue pulsando: cuanto más lejos llegues, más almas.'}</div>
      <ul><li>✅ Conservas lo pulsado, la historia, los artefactos, los fragmentos y las almas.</li><li>♻️ Pierdes las monedas, los ayudantes y el árbol.</li><li>💡 Renace cuando las almas nuevas al menos dupliquen las que tienes.</li></ul>
      <button class="rg-rebirth-btn"${pend ? '' : ' disabled'}>🔆 Renacer${pend ? ` (+${fmt(pend)})` : ''}</button></div>`
    ui.rebirth.querySelector('.rg-rebirth-btn').addEventListener('click', askRebirth)
  }
  function askRebirth() {
    if (!ui || fight || root.querySelector('.rg-end')) return
    const pend = pendingSouls(G)
    if (!pend) return
    const card = document.createElement('div')
    card.className = 'rg-end'
    card.innerHTML = `<div class="big">🔆</div><h3>¿Renacer?</h3><p>Ganas <b>${fmt(pend)} almas</b> y todo irá ×${(1 + SOUL_PCT * ((G.souls || 0) + pend)).toLocaleString('es-ES', { maximumFractionDigits: 2 })}. Se van tus monedas, ayudantes y árbol; lo pulsado, la historia y los artefactos se quedan.</p>
      <div class="row"><button class="done">Ahora no</button><button class="primary again">🔆 Renacer</button></div>`
    card.querySelector('.done').addEventListener('click', () => card.remove())
    card.querySelector('.again').addEventListener('click', () => {
      card.remove()
      doRebirth()
    })
    root.appendChild(card)
    card.animate([{ opacity: 0, transform: 'translate(-50%,-46%) scale(.9)' }, { opacity: 1, transform: 'translate(-50%,-50%)' }], { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1)' })
  }
  function doRebirth() {
    // the crew goes up in light before the stage is cleared
    const p = toScreen(0, -10)
    for (const sp of ui.sprites) {
      const q = toScreen(sp.x, sp.y - 20)
      sparks(q.x, q.y, 8, '#FFF4C8', 4)
      puff(q.x, q.y, 'rgba(255,240,200,', 0.7)
    }
    const gain = rebirth(G)
    if (!gain) return
    combo = 0
    chestReady = 0
    ui.g3?.chestHide()
    SL().unlock('redrebirth')
    save(true)
    hitstop(160)
    whiteFlash(0.9)
    punch(1.1)
    flash(p.x, p.y, 260, '255,240,180')
    beams(p.x, p.y, '#FFE7A0')
    confetti(p.x, p.y, 90)
    bigText(`🔆 ¡Renaces! +${fmt(gain)} almas`, '#FFE7A0')
    SL().beep([262, 392, 523, 784, 1047, 1568], 0.09)
    buildSprites()
    if (!ui.tree.hidden) buildTree()
    refresh()
  }

  // ---------- the story tab ----------

  function refreshStory() {
    if (ui.story.hidden) return
    const idx = G.chapter || 0
    const key = `${idx}:${JSON.stringify(G.beaten || {})}`
    if (ui.story.dataset.key === key) return
    ui.story.dataset.key = key
    ui.story.innerHTML = CHAPTERS.map((ch, i) => {
      const state = i < idx ? 'done' : i === idx ? 'now' : 'locked'
      const boss = ch.boss !== undefined ? `<span class="tag">${(G.beaten || {})[ch.boss] ? '😿 vencido' : `⚔️ ${BOSSES[ch.boss].name}`}</span>` : ''
      const act = i === 0 ? '<h4 class="rg-act">Acto I · Mil millones</h4>' : i === ACT1_LAST + 1 ? `<h4 class="rg-act">${G.act1 ? 'Acto II · Hacia el octillón' : '🔒 Acto II'}</h4>` : ''
      return `${act}<div class="rg-chapter ${state}"><b>${state === 'locked' ? '🔒' : state === 'done' ? '✓' : '▶'} ${i + 1}. ${state === 'locked' ? '???' : ch.title}</b>${state === 'locked' ? '' : boss}${state === 'now' ? `<p>${ch.intro}</p>` : ''}</div>`
    }).join('')
  }

  // ---------- the fights against Doctor Zarpas ----------

  // Zarpas stands to the right of the button, clear of the crew
  const BX = 232
  const BY = -30
  let fight = null
  let fightCooldown = 0
  // the villain: a black cat in a cape with a monocle; armour and a crown come with each comeback
  function drawBoss(i) {
    const armour = i >= 1 ? '<path d="M-30 -8 q30 -18 60 0 v26 q-30 12 -60 0z" fill="#9AA3AE" stroke="#4A5260" stroke-width="2"/><path d="M-30 4 h60" stroke="#4A5260" stroke-width="2"/><circle cx="-18" cy="-2" r="2" fill="#4A5260"/><circle cx="18" cy="-2" r="2" fill="#4A5260"/>' : ''
    const crown = i >= 2 ? '<path d="M-22 -86 l8 -16 l8 12 l6 -16 l6 16 l8 -12 l8 16 z" fill="#FFD84F" stroke="#9A6A06" stroke-width="2"/><circle cx="0" cy="-92" r="3" fill="#FF3A5A"/>' : ''
    const aura = i >= 2 ? '<ellipse cx="0" cy="-30" rx="80" ry="90" fill="url(#rg-halo)" class="rg-boss-aura"/>' : ''
    return `${aura}<ellipse cx="0" cy="34" rx="46" ry="10" fill="#000" opacity=".35"/>
      <g class="rg-boss-body">
        <path d="M-40 30 q-14 -40 10 -62 h60 q24 22 10 62z" fill="#B3122A" class="cape"/>
        <ellipse cx="0" cy="6" rx="34" ry="30" fill="#1A1416"/>
        ${armour}
        <path d="M30 20 q30 -6 26 -40 q-2 -10 -8 -4 q2 26 -22 30z" fill="#1A1416" class="tail"/>
        <circle cx="0" cy="-42" r="30" fill="#1A1416"/>
        <path d="M-26 -58 l-6 -28 l22 14z M26 -58 l6 -28 l-22 14z" fill="#1A1416"/>
        <path d="M-24 -62 l-3 -16 l12 8z M24 -62 l3 -16 l-12 8z" fill="#5A2030"/>
        <ellipse cx="-11" cy="-46" rx="7" ry="5" fill="#FF2A3A" class="eye"/><ellipse cx="11" cy="-46" rx="7" ry="5" fill="#FF2A3A" class="eye"/>
        <ellipse cx="-11" cy="-46" rx="2" ry="4" fill="#200"/><ellipse cx="11" cy="-46" rx="2" ry="4" fill="#200"/>
        <circle cx="11" cy="-46" r="10" fill="none" stroke="#FFD84F" stroke-width="2.5"/><path d="M21 -46 q6 14 0 30" stroke="#FFD84F" stroke-width="1.2" fill="none"/>
        <path d="M-6 -32 q6 6 12 0" stroke="#FFF" stroke-width="2" fill="none"/><path d="M-4 -31 l2 5 l2 -5z M4 -31 l-2 5 l-2 -5z" fill="#FFF"/>
        <path d="M-30 -36 h-20 M-30 -32 l-18 4 M30 -36 h20 M30 -32 l18 4" stroke="#BBB" stroke-width="1.4"/>
        ${crown}
      </g>
      <g class="rg-boss-bubble" opacity="0"><rect x="-300" y="-78" width="256" height="34" rx="10" fill="#FFF" stroke="#1a1310" stroke-width="2"/><path d="M-46 -68 l16 8 l-16 8z" fill="#FFF" stroke="#1a1310" stroke-width="2"/><text x="-172" y="-56" text-anchor="middle"></text></g>`
  }
  function startFight(i) {
    const b = BOSSES[i]
    const hp = bossHp(G, b)
    fight = { i, b, hp, max: hp, until: Date.now() + b.seconds * 1000, nextTaunt: Date.now() + 3000 }
    if (ui.g3) ui.g3.bossShow(i)
    else bossSvg(i)
    setTimeout(() => {
      if (!ui) return
      shake(14)
      punch(1.04)
      const p = toScreen(BX, BY + 60)
      for (let k = 0; k < 14; k++) puff(p.x + rnd(-60, 60), p.y + 20, 'rgba(120,90,110,', 0.6)
    }, 560)
    ui.bossHud.hidden = false
    ui.bossHud.querySelector('.name').textContent = `😼 ${b.name}`
    ui.bossHud.animate([{ transform: 'translate(-50%,-40px)', opacity: 0 }, { transform: 'translate(-50%,0)', opacity: 1 }], { duration: 400, easing: 'cubic-bezier(.2,.9,.3,1.3)' })
    root.classList.add('rg-fighting')
    bigText(`⚔️ ¡${b.name}!`, '#FF5A6A')
    SL().beep([196, 185, 175, 165], 0.12)
    taunt(b.taunts[0])
    refresh()
    updateBossHud()
  }
  function bossSvg(i) {
    ui.boss.innerHTML = drawBoss(i)
    ui.boss.style.display = ''
    ui.boss.setAttribute('transform', `translate(${BX},${BY}) scale(.8)`)
    const body = ui.boss.querySelector('.rg-boss-body')
    // he crashes down from the sky
    body.animate([{ transform: 'translateY(-260px) rotate(-20deg)' }, { transform: 'translateY(0) scale(1.25,.75)', offset: 0.7 }, { transform: 'translateY(-16px) scale(.95,1.05)', offset: 0.85 }, { transform: 'none' }], { duration: 800, easing: 'ease-in' })
  }
  function taunt(text) {
    if (ui?.g3) {
      ui.bubble.textContent = text
      ui.bubble.animate([{ opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1.08, offset: 0.08 }, { opacity: 1, scale: 1, offset: 0.14 }, { opacity: 1, offset: 0.85 }, { opacity: 0, scale: 0.9 }], { duration: 2600, easing: 'ease-out' })
      return
    }
    const bub = ui?.boss.querySelector('.rg-boss-bubble')
    if (!bub) return
    bub.querySelector('text').textContent = text
    bub.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none', offset: 0.15 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: 2600, easing: 'ease-out' })
  }
  // Zarpas shrugs off frenzies: what a frenzy adds does not hurt him
  function hurtBoss(n, crit) {
    if (!fight) return
    n = Math.max(1, Math.floor(n / (fx.frenzy || 1)))
    fight.hp -= n
    if (ui) {
      if (!calm() && performance.now() - (fight.hitAt || 0) > 90) {
        fight.hitAt = performance.now()
        if (ui.g3) ui.g3.bossHurt(crit)
        else ui.boss.querySelector('.rg-boss-body').animate([{ transform: 'none', filter: 'brightness(3)' }, { transform: `translate(${crit ? 10 : 4}px,-2px) rotate(${crit ? 6 : 2}deg)`, filter: 'brightness(1.6)' }, { transform: 'none', filter: 'none' }], { duration: 180 })
        const p = toScreen(BX + rnd(-34, 34), BY - 10 + rnd(-14, 14))
        floatNum(p, `-${fmt(n)}`, crit ? '#FFD84F' : '#FF6A7A', crit ? 22 : 15, crit)
        sparks(p.x, p.y, crit ? 18 : 5, '#FF4A5A', 3.5)
      }
      updateBossHud()
    }
    if (fight.hp <= 0) winFight()
  }
  function updateBossHud() {
    if (!fight || !ui) return
    const pct = Math.max(0, fight.hp / fight.max)
    ui.bossHud.querySelector('.hp i').style.width = `${(pct * 100).toFixed(1)}%`
    ui.bossHud.querySelector('.hp span').textContent = `${fmt(Math.max(0, fight.hp))} / ${fmt(fight.max)}`
    const left = Math.max(0, Math.ceil((fight.until - Date.now()) / 1000))
    ui.bossHud.querySelector('.time').textContent = `⏱️ ${left} s`
    ui.bossHud.classList.toggle('hurry', left <= 10)
    // every few seconds he swipes at you: the combo is lost, keep pressing
    if (Date.now() > fight.nextTaunt) {
      fight.nextTaunt = Date.now() + 7000
      taunt(fight.b.taunts[Math.floor(Math.random() * fight.b.taunts.length)])
      if (combo > 8) {
        combo = 0
        updateCombo()
        bigText('¡Zarpazo! Combo perdido', '#FF8A7A')
        ui.g3?.bossSwipe()
        const p = toScreen(60, -10)
        slash(p.x, p.y, -1)
        shake(10)
      }
    }
  }
  function winFight() {
    const f = fight
    fight = null
    G.beaten = { ...G.beaten, [f.i]: Date.now() }
    G.shards = (G.shards || 0) + f.b.shards
    if (f.i === BOSSES.length - 1) SL().unlock('redboss')
    save(true)
    if (!ui) return
    const p = toScreen(BX, BY - 30)
    hitstop(160)
    whiteFlash(0.7)
    punch(1.08)
    flash(p.x, p.y, 200, '255,90,110')
    beams(p.x, p.y, '#FF5A6A')
    confetti(p.x, p.y, 120)
    coinsBurst(p.x, p.y, 24)
    // he spins away into the sky, shrinking
    if (ui.g3) ui.g3.bossGone('win')
    else ui.boss.querySelector('.rg-boss-body').animate([{ transform: 'none' }, { transform: 'translate(40px,-80px) rotate(200deg) scale(.7)', offset: 0.5 }, { transform: 'translate(200px,-400px) rotate(720deg) scale(.1)', opacity: 0 }], { duration: 1300, easing: 'ease-in' }).onfinish = () => {
      if (ui) ui.boss.style.display = 'none'
    }
    endFightHud()
    bigText(`¡${f.b.name} vencido! +${f.b.shards} 💠`, '#7FE37F')
    SL().beep([523, 659, 784, 1047, 1319], 0.09)
    setTimeout(() => say(ZARPAS, f.b.lose), 1400)
    refresh()
  }
  function loseFight(quiet) {
    const f = fight
    fight = null
    fightCooldown = Date.now() + 20000
    if (!ui || quiet) return
    taunt('¡Miau-ja-ja-ja! ¡Demasiado lento!')
    if (ui.g3) ui.g3.bossGone('flee')
    else ui.boss.querySelector('.rg-boss-body').animate([{ transform: 'none' }, { transform: 'translateY(-20px) rotate(-8deg)', offset: 0.3 }, { transform: 'translate(320px,-60px)', opacity: 0 }], { duration: 1500, easing: 'ease-in', delay: 900 }).onfinish = () => {
      if (ui) ui.boss.style.display = 'none'
    }
    endFightHud()
    bigText(`${f.b.name} se escapa… ¡Vuelve a intentarlo!`, '#FF8A7A')
    SL().beep([392, 330, 262], 0.15)
    refresh()
  }
  function endFightHud() {
    root.classList.remove('rg-fighting')
    ui.bossHud.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-30px)' }], { duration: 300 }).onfinish = () => {
      if (ui) ui.bossHud.hidden = true
    }
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
          const to = { x: r.left - box.left + 20, y: r.top - box.top + r.height / 2 }
          const cr = ui.coins.getBoundingClientRect()
          coinsFly({ x: cr.left - box.left + 10, y: cr.top - box.top + 8 }, to, Math.min(12, 3 + got))
          setTimeout(() => sparks(to.x, to.y, 14 + got, '#FFD84F', 4), 420)
          row.animate([{ transform: 'scale(1.05)', background: '#6a5a2a', boxShadow: '0 0 18px #ffd84f' }, { transform: 'scale(.98)', offset: 0.4 }, { transform: 'none' }], { duration: 420, easing: 'ease-out' })
          SL().beep([440, 660 + Math.min(got, 20) * 10], 0.05)
          if (MILESTONES.includes(count(G, h))) bigText(`${h.icon} ×${h.ms || 2} · nivel ${count(G, h)}`, '#FFE34F')
          if (isKing(h) && got) {
            bigText(`👑 ¡${h.name}: al máximo!`, '#FFD84F')
            whiteFlash(0.3)
          }
          const shown = ui.sprites.filter(s => s.h === h).length
          if (shown !== shownFor(h)) {
            buildSprites()
            const s = ui.sprites.filter(q => q.h === h).at(-1)
            if (s && s.g) {
              // a new crew member drops in from above and lands in a puff of dust
              s.g.animate([{ transform: `translate(${s.x}px,${s.y - 160}px) scale(.6,1.3)`, opacity: 0 }, { transform: `translate(${s.x}px,${s.y}px) scale(1.3,.7)`, opacity: 1, offset: 0.6 }, { transform: `translate(${s.x}px,${s.y - 12}px) scale(.95,1.08)`, offset: 0.8 }, { transform: `translate(${s.x}px,${s.y}px)` }], { duration: 650, easing: 'ease-in' })
              setTimeout(() => {
                if (!ui) return
                const p = toScreen(s.x, s.y)
                for (let i = 0; i < 6; i++) puff(p.x + rnd(-20, 20), p.y, 'rgba(220,200,180,', 0.55)
                ring(p, '#FFE34F', 4, 0.06)
              }, 390)
            }
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
    // the number itself rolls in the frame loop; here only the bump
    if (ui.lastLife !== G.life) {
      const now = performance.now()
      if (now - ui.bumpAt > 140 && !calm()) {
        ui.bumpAt = now
        ui.life.animate([{ transform: 'scale(1.12)' }, { transform: 'none' }], { duration: 160 })
      }
      ui.lastLife = G.life
    }
    ui.coins.textContent = `🪙 ${fmt(G.coins)}`
    ui.shards.textContent = `💠 ${G.shards || 0}`
    const unit = unitOf(G.life)
    ui.rates.textContent = `${unit ? `${unit[1]} = ${unit[2]}` : 'pulsaciones'} · ${fmtRate(rate(G, fx))}/s · ${fmtRate(clickValue(G, fx))} por clic`
    ui.helpers.querySelectorAll('[data-h]').forEach((row, i) => {
      const h = HELPERS[i]
      // the second act's crews stay out of the list until the first act is over
      row.hidden = h.act === 2 && !G.act1
      const n = count(G, h)
      const shown = helperShown(G, i)
      row.classList.toggle('locked', !shown)
      const next = MILESTONES.find(m => m > n && m <= h.max)
      row.querySelector('.nm').textContent = shown ? h.name : '???'
      row.querySelector('i').textContent = shown ? `${n}/${h.max}` : ''
      row.querySelector('small').textContent = !shown ? (h.act === 2 && !G.act1 ? 'Llega a los mil millones para descubrirlo' : `Compra ${HELPERS[i - 1].name.toLowerCase()} para descubrirlo`) : n >= h.max ? `${fmtRate(helperRate(G, h, fx))}/s · al máximo` : `${fmtRate(h.rate * helperMult(G, h))}/s cada uno · ${h.verb}${next ? ` · ×${h.ms || 2} en ${next}` : ''}`
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
    refreshMission()
    refreshArts()
    refreshStory()
    refreshRebirth()
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
    // each link twice: the cable, and a dotted line of energy that flows along it once lit
    const link = cls => TREE.flatMap(n => n.req.map(r => `<line class="${cls}" data-from="${r}" data-to="${n.id}" x1="${TREE_BY_ID[r].x * UNIT}" y1="${TREE_BY_ID[r].y * UNIT}" x2="${n.x * UNIT}" y2="${n.y * UNIT}"/>`)).join('')
    links.innerHTML = link('cable') + link('flow')
    nodes.innerHTML = TREE.map(
      n => `<g class="rg-node" data-node="${n.id}" transform="translate(${n.x * UNIT},${n.y * UNIT})"><circle class="glow" r="40"/><circle class="disc" r="30"/><circle class="prog" r="34" transform="rotate(-90)"/><text class="ic" y="11" text-anchor="middle">${n.icon}</text><text class="lv" y="52" text-anchor="middle"></text><text class="cost" y="67" text-anchor="middle"></text></g>`,
    ).join('')
    // the wallet stays in sight while you shop in the tree
    if (!ui.tree.querySelector('.rg-tree-wallet')) {
      const w = document.createElement('div')
      w.className = 'rg-tree-wallet'
      ui.tree.appendChild(w)
    }
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
      const afford = G.coins >= nodeCost(G, n)
      g.classList.toggle('afford', shown && l < n.max && afford)
      // what you can't pay for yet looks switched off
      g.classList.toggle('poor', l < n.max && !afford)
      g.classList.toggle('sel', n.id === selected)
      g.querySelector('.lv').textContent = n.max > 1 ? `${l}/${n.max}` : l ? '✓' : ''
      g.querySelector('.cost').textContent = l < n.max && n.id !== 'core' ? `🪙 ${fmt(nodeCost(G, n))}` : ''
      const C = 2 * Math.PI * 34
      const prog = g.querySelector('.prog')
      prog.setAttribute('stroke-dasharray', `${((C * l) / n.max).toFixed(1)} ${C.toFixed(1)}`)
    }
    for (const line of svg.querySelectorAll('.rg-links line')) {
      const to = TREE_BY_ID[line.dataset.to]
      line.style.display = nodeShown(G, to) ? '' : 'none'
      line.classList.toggle('lit', lvl(G, line.dataset.to) > 0)
    }
    const wallet = ui.tree.querySelector('.rg-tree-wallet')
    if (wallet) {
      const txt = `🪙 ${fmt(G.coins)}  ·  +${fmtRate(rate(G, fx))}/s`
      if (wallet.textContent !== txt) wallet.textContent = txt
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
    const cx = r.left - box.left + r.width / 2
    const cy = r.top - box.top + r.height / 2
    sparks(cx, cy, 40, '#FFD84F', 6)
    flash(cx, cy, 70, '255,220,90')
    add({ kind: 'ring', x: cx, y: cy, r: 20, life: 1, decay: 0.04, color: '#FFE34F', grow: 5, round: true })
    g.querySelector('.glow').animate([{ opacity: 0.9, transform: 'scale(.6)' }, { opacity: 0, transform: 'scale(2.2)' }], { duration: 600, easing: 'ease-out' })
    for (const line of svg.querySelectorAll(`.rg-links line.cable[data-to="${id}"]`)) {
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
    if (G.act1) pool.push('La grieta violeta del patio ya tiene su propia cuenta de Instagram.', 'Zarpas jura que la grieta no es suya. Tiene pelos violetas en el bigote.')
    if (n('factory') >= 1) pool.push('Las fábricas de gatos piden más cartón. Los gatos piden más cajas.')
    if (n('mech') >= 1) pool.push('Un mecha pulsador se queda atascado en la puerta del laboratorio. Otra vez.')
    if (n('sat') >= 1) pool.push('La NASA pregunta por qué hay satélites apuntando a un botón rojo.')
    if (n('portal') >= 1) pool.push('Por un portal sale otro tú. Te pide que pulses más flojo.')
    if (n('hole') >= 1) pool.push('Un agujero negro se traga el teletipo de noticias. Este lo has leído de milagro.')
    if (n('galaxy') >= 1) pool.push('Los astrónomos descubren una galaxia con forma de botón. Nadie se sorprende.')
    if (n('cosmic') >= 1) pool.push('El Gato cósmico bosteza y nacen tres estrellas.')
    if (G.life >= 1e24) pool.push('Ya no quedan nombres para tantos ceros. El botón se los inventa.')
    const text = first ? 'Bienvenido al juego del botón. Pulsa. Pulsa más. Todo lo que ves pulsa contigo.' : pool[Math.floor(Math.random() * pool.length)]
    ui.news.textContent = `📰 ${text}`
    ui.news.animate([{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 400, easing: 'ease-out' })
  }

  // ---------- the end ----------

  // returns true when the game is over
  function checkEnds() {
    if (!G.act1 && G.life >= ACT1) act1Done()
    if (G.life >= GOAL) {
      finish()
      return true
    }
    return false
  }
  function celebrate(text) {
    SL().beep([523, 659, 784, 1047, 1319, 1568], 0.12)
    let k = 0
    const burst = setInterval(() => {
      if (!ui || k++ > 8) return clearInterval(burst)
      confetti(rnd(0.1, 0.9) * root.clientWidth, rnd(0.2, 0.6) * root.clientHeight, 80)
    }, 250)
    bigText(text, '#FFD84F')
  }
  function act1Done() {
    G.act1 = Date.now()
    save(true)
    SL().unlock('redend')
    if (G.act1 - G.start < SPEEDRUN_MS) SL().unlock('redspeed')
    SL().mapLabel()
    if (!ui) return
    celebrate('🏁 ¡MIL MILLONES!')
    setTimeout(() => {
      if (!ui) return
      buildSprites()
      buildTree()
      refresh()
      showEnd(1)
    }, 2400)
  }
  function finish() {
    if (G.ended) return
    G.life = GOAL
    G.ended = Date.now()
    save(true)
    SL().unlock('redocti')
    SL().mapLabel()
    if (!ui) return
    celebrate('🌌 ¡UN OCTILLÓN!')
    setTimeout(() => showEnd(2), 2400)
  }
  const took = ms => {
    const mins = Math.max(1, Math.round(ms / 60000))
    return mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${Math.floor(mins / 1440)} d ${Math.floor((mins % 1440) / 60)} h`
  }
  // act 1: the thousand millions, with a way on; act 2: the octillion, the end
  function showEnd(act = G.ended ? 2 : 1) {
    if (!ui) return
    root.querySelector('.rg-end')?.remove()
    const speed = G.act1 && G.act1 - G.start < SPEEDRUN_MS
    const stats = `<li><span>Clics a mano</span><b>${fmt(G.clicks)}</b></li><li><span>Botones dorados</span><b>${fmt(G.golden || 0)}</b></li><li><span>Cofres</span><b>${fmt(G.chests || 0)}</b></li><li><span>Combo máximo</span><b>×${(G.bestCombo || 1).toLocaleString('es-ES', { maximumFractionDigits: 1 })}</b></li>`
    const card = document.createElement('div')
    card.className = 'rg-end'
    card.innerHTML =
      act === 1
        ? `<div class="big">🏁</div><h3>¡Mil millones! · Acto I</h3><p>Has salvado el botón del Doctor Zarpas. Pero la grieta violeta del patio sigue abierta, y el botón quiere más: un octillón, un 1 con 48 ceros.</p>
      <ul><li><span>Pulsaciones</span><b>1.000.000.000</b></li><li><span>Tiempo</span><b>${took((G.act1 || Date.now()) - (G.start || Date.now()))} <small>(media ~${AVERAGE_MIN} min)</small></b></li>${speed ? '<li class="speed"><span>⏱️ Speedrunner</span><b>¡menos de 20 min!</b></li>' : ''}${stats}</ul>
      <div class="row"><button class="again">🔁 Volver a empezar</button><button class="primary done">Seguir hacia el octillón ▸</button></div>`
        : `<div class="big">🌌</div><h3>¡Un octillón!</h3><p>De un botón en mitad de la nada a galaxias enteras pulsando contigo. Los dos Zarpas te aplauden (con la boca llena de atún).</p>
      <ul><li><span>Pulsaciones</span><b>1 Oc</b></li><li><span>Tiempo total</span><b>${took(G.ended - (G.start || G.ended))} <small>(media ~${AVERAGE_TOTAL_MIN} min)</small></b></li><li><span>Mil millones en</span><b>${took((G.act1 || G.ended) - (G.start || G.ended))}</b></li>${stats}
      <li><span>Árbol y ayudantes</span><b>${maxedAll(G) ? 'completos' : 'a medias'}</b></li></ul>
      <div class="row"><button class="again">🔁 Volver a empezar</button><button class="primary done">Cerrar</button></div>`
    card.querySelector('.done').addEventListener('click', () => {
      card.remove()
      if (act === 1 && !G.seenAct2) {
        G.seenAct2 = 1
        save(true)
        setTimeout(() => say(NARRATOR, chapter(G).intro), 400)
      }
    })
    card.querySelector('.again').addEventListener('click', () => {
      G = fresh()
      combo = 0
      chestReady = 0
      frenzyUntil = 0
      frenzyMult = 1
      fight = null
      save(true)
      card.remove()
      ui.g3?.chestHide()
      buildSprites()
      start()
      refresh()
      SL().mapLabel()
    })
    root.appendChild(card)
    card.animate([{ opacity: 0, transform: 'translate(-50%,-46%) scale(.9)' }, { opacity: 1, transform: 'translate(-50%,-50%)' }], { duration: 400, easing: 'cubic-bezier(.2,.9,.3,1)' })
  }

  // starting over from nothing: the whole game is wiped and the black screen with the red button comes back
  function askRestart() {
    if (!ui || root.querySelector('.rg-end')) return
    const card = document.createElement('div')
    card.className = 'rg-end'
    card.innerHTML = `<div class="big">🔁</div><h3>¿Empezar de cero?</h3><p>Se borra toda la partida del botón: pulsaciones, ayudantes, árbol, artefactos e historia. Las medallas que ya tienes se quedan.</p>
      <div class="row"><button class="done">Cancelar</button><button class="primary again">Empezar de cero</button></div>`
    card.querySelector('.done').addEventListener('click', () => card.remove())
    card.querySelector('.again').addEventListener('click', () => {
      G = fresh()
      combo = 0
      chestReady = 0
      frenzyUntil = 0
      frenzyMult = 1
      carry = 0
      fight = null
      talks.length = 0
      save(true)
      SL().setMedals({ ...SL().medals, '~rgintro': 0 })
      SL().mapLabel()
      close()
      setTimeout(intro, 450)
    })
    root.appendChild(card)
    card.animate([{ opacity: 0, transform: 'translate(-50%,-46%) scale(.9)' }, { opacity: 1, transform: 'translate(-50%,-50%)' }], { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1)' })
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
      checkEnds()
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
      fight = null
      talks.length = 0
    },
  }
})()
