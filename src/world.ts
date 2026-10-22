import { WORLD } from './labs'
import { D, H, Y_MAX, box, floorQuad, iso, poly, pts, r, shade } from './scene'

// What surrounds the building, chosen in Ajustes (labs.ts WORLDS). Every world keeps the same two walking lanes:
// the near one (STREET_NEAR, skills strolling) and the far one (STREET_FAR, idle robots), so only the scenery changes.
// Props are drawn before the characters, so anything tall stands behind a lane (near strip or far strip) or off the lanes.

type Props = { svg: string; lamps: string[] }

// Ground under everything: the island of terrain the building sits on, and the sky around it.
export function worldGround(W: number, viewW: number, viewH: number) {
  switch (WORLD) {
    case 'beach':
      return stars(viewW, viewH, true) + beachGround(W)
    case 'forest':
      return stars(viewW, viewH, true) + forestGround(W)
    case 'snow':
      return stars(viewW, viewH, true) + snowGround(W)
    case 'moon':
      return stars(viewW, viewH, false) + earth() + moonGround(W)
    default:
      return stars(viewW, viewH, true) + cityGround(W)
  }
}

// Props drawn in front of the building, plus the light each one casts at night (shown through the dark shade).
export function worldProps(W: number): Props {
  switch (WORLD) {
    case 'beach':
      return beachProps(W)
    case 'forest':
      return forestProps(W)
    case 'snow':
      return snowProps(W)
    case 'moon':
      return moonProps(W)
    default:
      return cityProps(W)
  }
}

// Weather or sky effects above the characters (snowfall, gulls, shooting stars).
export function worldOverlay(_W: number, viewW: number, viewH: number) {
  switch (WORLD) {
    case 'snow':
      return snowfall(viewW, viewH)
    case 'beach':
      return gulls(viewW)
    case 'moon':
      return shootingStar(viewW)
    default:
      return ''
  }
}

// ---------- shared ----------

// deterministic noise, so the scenery doesn't jump on every redraw
const rnd = (n: number) => {
  let t = Math.imul(n ^ 0x9e3779b9, 2654435761) >>> 0
  t ^= t >>> 15
  t = Math.imul(t, 2246822519) >>> 0
  t ^= t >>> 13
  return t / 4294967296
}

// the walking lanes (STREET_NEAR, STREET_FAR) fall inside the near and far strips
const bands = () => ({ near0: H + 0.2, near1: H + 1.9, far0: H + 4.4, edge: Y_MAX + 1.2 })
const binX = (W: number) => Math.round(W * 0.55)

// x positions along a strip, leaving room for the recycling container
function spots(W: number, from: number, step: number, to = W + 1) {
  const xs: number[] = []
  for (let x = from; x <= to; x += step) if (Math.abs(x - binX(W)) > 1.8) xs.push(x)
  return xs
}

// Terrain outline: as big as the view allows (the svg ends right past the building corners), ended by a slab like the building's.
function island(W: number): [number, number][] {
  const x0 = -5
  const x1 = W + 4.5
  const y0 = -3
  const y1 = Y_MAX + 1.2
  const right = W + 1.9
  const left = -(Y_MAX + 1.9)
  const bottom = W + Y_MAX + 2
  return [[x0, y0], [y0 + right, y0], [x1, x1 - right], [x1, bottom - x1], [bottom - y1, y1], [y1 + left, y1], [x0, x0 - left]]
}

function frame(W: number, base: string, side: string, inner: string) {
  const isl = island(W)
  const outline = isl.map(([x, y]) => iso(x, y))
  const face = (a: [number, number], b: [number, number], fill: string) => poly([iso(a[0], a[1]), iso(b[0], b[1]), iso(b[0], b[1], -9), iso(a[0], a[1], -9)], fill)
  return (
    `<defs><clipPath id="world-clip"><polygon points="${pts(outline)}"/></clipPath></defs>` +
    face(isl[2]!, isl[3]!, shade(side, 0.75)) + face(isl[3]!, isl[4]!, shade(side, 0.88)) + face(isl[4]!, isl[5]!, side) +
    poly(outline, base) + `<g clip-path="url(#world-clip)" pointer-events="none">${inner}</g>`
  )
}

const band = (W: number, y0: number, y1: number, fill: string) => floorQuad(-8, y0, W + 8, y1, fill)

// texture dots (grass tufts, pebbles, flowers) merged into one path per color
function speckles(seed: number, n: number, x0: number, y0: number, x1: number, y1: number, colors: string[], w = 3, h = 1.5) {
  const ds = colors.map(() => '')
  for (let i = 0; i < n; i++) {
    const [sx, sy] = iso(x0 + rnd(seed + i * 3) * (x1 - x0), y0 + rnd(seed + i * 3 + 1) * (y1 - y0))
    ds[i % colors.length] += `M${r(sx)} ${r(sy)}h${w}v${h}h${-w}z`
  }
  return ds.map((d, k) => (d ? `<path d="${d}" fill="${colors[k]}"/>` : '')).join('')
}

// a straight line along x at depth y, as a path fragment
const lineX = (x0: number, x1: number, y: number) => `M${pts([iso(x0, y)])}L${pts([iso(x1, y)])}`

// the sky: stars drawn first so the terrain covers those below the horizon; outside the moon they only come out at night
function stars(viewW: number, viewH: number, nightOnly: boolean) {
  let s = ''
  for (let i = 0; i < 70; i++) {
    const x = rnd(500 + i) * viewW
    const y = rnd(900 + i) * viewH * 0.6
    const size = rnd(1300 + i) < 0.2 ? 2.5 : 1.5
    const blink = i % 4 === 0 ? `<animate attributeName="opacity" values="1;.25;1" dur="${r(2 + rnd(1700 + i) * 3)}s" repeatCount="indefinite"/>` : ''
    s += `<rect x="${r(x)}" y="${r(y)}" width="${size}" height="${size}" fill="#FFF8E0">${blink}</rect>`
  }
  return `<g${nightOnly ? ' class="lamp-light"' : ''} pointer-events="none">${s}</g>`
}

const shadow = (sx: number, sy: number, rx: number) => `<ellipse cx="${r(sx)}" cy="${r(sy)}" rx="${rx}" ry="${r(rx * 0.38)}" fill="#000" opacity=".16"/>`

function roundTree(sx: number, sy: number, s = 1, leaf = '#4F8F45', light = '#6DAE57') {
  const blobs: [number, number, number][] = [[0, -28, 11], [-7, -22, 8], [7, -23, 8], [-3, -34, 7], [4, -31, 6]]
  return (
    shadow(sx, sy, 12 * s) + `<rect x="${r(sx - 2 * s)}" y="${r(sy - 18 * s)}" width="${r(4 * s)}" height="${r(18 * s)}" fill="#6B4A2F"/>` +
    blobs.map(([dx, dy, rr], i) => `<circle cx="${r(sx + dx * s)}" cy="${r(sy + dy * s)}" r="${r(rr * s)}" fill="${i % 2 ? light : leaf}"/>`).join('') +
    `<circle cx="${r(sx - 3 * s)}" cy="${r(sy - 33 * s)}" r="${r(2.5 * s)}" fill="${shade(light, 1.25)}"/>`
  )
}

function pine(sx: number, sy: number, s = 1, snowy = false) {
  const dark = snowy ? '#2F5E46' : '#2F6B3E'
  const lite = snowy ? '#3F7556' : '#3E8048'
  let g = shadow(sx, sy, 11 * s) + `<rect x="${r(sx - 2 * s)}" y="${r(sy - 9 * s)}" width="${r(4 * s)}" height="${r(9 * s)}" fill="#5E3F27"/>`
  for (const [off, w, tall] of [[-6, 13, 20], [-18, 10.5, 18], [-30, 8, 18]] as const) {
    const base = sy + off * s
    const top = base - tall * s
    g += poly([[sx - w * s, base], [sx, base], [sx, top]], lite) + poly([[sx, base], [sx + w * s, base], [sx, top]], dark)
    if (snowy) g += poly([[sx - w * s * 0.55, top + tall * s * 0.55], [sx, top], [sx + w * s * 0.55, top + tall * s * 0.55], [sx, top + tall * s * 0.4]], '#F4F8FB')
  }
  return g
}

// a street lamp: the post, and its warm pool of light for the night layer
function lampPost(sx: number, sy: number, post = '#3B3F46', head = '#57534E', tall = 62): [string, string] {
  const svg =
    `<rect x="${r(sx - 1.2)}" y="${r(sy - tall)}" width="2.4" height="${tall}" fill="${post}"/><rect x="${r(sx - 1.2)}" y="${r(sy - tall - 2)}" width="12" height="2.4" fill="${post}"/>` +
    `<rect x="${r(sx + 7)}" y="${r(sy - tall - 1)}" width="7" height="5" fill="${head}"/>`
  const light =
    `<g class="lamp-light" pointer-events="none"><circle cx="${r(sx + 10.5)}" cy="${r(sy - tall + 5)}" r="22" fill="url(#lamp)"/><rect x="${r(sx + 7.5)}" y="${r(sy - tall + 3.5)}" width="6" height="2" fill="#FFF1C2"/>` +
    `<ellipse cx="${r(sx + 10)}" cy="${r(sy + 4)}" rx="34" ry="14" fill="url(#lamp)"/></g>`
  return [svg, light]
}

// an iso ellipse on the ground (a circle of radius a×b tiles seen from the scene's angle)
function groundEllipse(cx: number, cy: number, a: number, b: number, fill: string, extra = '') {
  const list: [number, number][] = []
  for (let k = 0; k < 24; k++) list.push(iso(cx + a * Math.cos((k / 24) * Math.PI * 2), cy + b * Math.sin((k / 24) * Math.PI * 2)))
  return poly(list, fill, extra)
}

// the path out of the corridor door (end of the corridor, x = W) down to the near strip
const doorPath = (W: number, fill: string) => floorQuad(W, D, W + 2.6, D + 1, fill) + floorQuad(W + 0.8, D, W + 2.6, H + 0.2, fill)

// ---------- city ----------

function cityGround(W: number) {
  const { near0, near1, far0 } = bands()
  const grass = '#86A85E'
  let s = floorQuad(W + 2.9, -4, W + 8, near0 - 0.15, grass) + floorQuad(-8, -4, -0.4, near0 - 0.15, grass) + band(W, Y_MAX, Y_MAX + 3, grass)
  s += speckles(11, 60, W + 2.9, -3, W + 5, near0, ['#769850', '#9CBC6E']) + speckles(12, 40, -5, Y_MAX, W + 4, Y_MAX + 1.2, ['#769850', '#9CBC6E'])
  s += doorPath(W, '#CFC7B9')
  // road with its curbs
  s += band(W, near1, far0, '#4A4743') + band(W, near1 - 0.12, near1, '#8F887D') + band(W, far0, far0 + 0.12, '#8F887D')
  s += speckles(13, 50, -4, near1 + 0.1, W + 4, far0 - 0.1, ['#55524D', '#403D3A'])
  const zebra0 = W + 0.8
  const zebra1 = W + 2.6
  let dashes = ''
  for (let x = -5; x < W + 5; x += 2) if (x + 1 < zebra0 - 0.3 || x > zebra1 + 0.3) dashes += lineX(x, x + 1, H + 3.15)
  s += `<path d="${dashes}" stroke="#E8DFA8" stroke-width="2"/>`
  // the zebra crossing in front of the door
  for (let y = near1 + 0.15; y < far0 - 0.2; y += 0.45) s += floorQuad(zebra0, y, zebra1, y + 0.22, '#ECE8DF')
  // storm drains along the near curb, manholes on the road
  for (const x of spots(W, 3, 9, W - 1)) {
    s += floorQuad(x, near1 - 0.38, x + 0.7, near1 - 0.14, '#34312E')
    s += `<path d="${lineX(x + 0.05, x + 0.65, near1 - 0.3)}${lineX(x + 0.05, x + 0.65, near1 - 0.22)}" stroke="#5C5852" stroke-width="1"/>`
  }
  for (const x of [W * 0.22, W * 0.7]) {
    const [mx, my] = iso(x, H + 2.55)
    s += `<ellipse cx="${r(mx)}" cy="${r(my)}" rx="11" ry="5.5" fill="#3A3835" stroke="#615C55" stroke-width="1.5"/><path d="M${r(mx - 7)} ${r(my)}h14M${r(mx - 4)} ${r(my - 3)}h8M${r(mx - 4)} ${r(my + 3)}h8" stroke="#615C55"/>`
  }
  // tree pits on the far sidewalk
  for (const x of cityTrees(W)) s += floorQuad(x - 0.4, H + 4.5, x + 0.4, H + 5.0, '#5E4B37') + floorQuad(x - 0.3, H + 4.57, x + 0.3, H + 4.93, '#6F5940')
  // sidewalk joints
  let curb = ''
  for (let x = -5; x < W + 5; x += 1) curb += `M${pts([iso(x, near0)])}L${pts([iso(x, near1)])}M${pts([iso(x, far0)])}L${pts([iso(x, Y_MAX)])}`
  s += `<path d="${curb}" stroke="#000" stroke-opacity=".08"/>`
  return frame(W, '#B9B2A6', '#6E665C', s)
}

const cityTrees = (W: number) => spots(W, 1.5, 5, W + 1.5)

function cityProps(W: number): Props {
  let svg = ''
  const lamps: string[] = []
  for (const x of spots(W, 2, 6, W - 1)) {
    const [lx, ly] = iso(x, H + 0.55)
    const [post, light] = lampPost(lx, ly)
    svg += post
    lamps.push(light)
  }
  // crossing sign by the zebra, hydrant on the near sidewalk
  {
    const [sx, sy] = iso(W + 0.55, H + 0.5)
    svg += `<rect x="${r(sx - 1)}" y="${r(sy - 40)}" width="2" height="40" fill="#6B6F76"/><rect x="${r(sx - 7)}" y="${r(sy - 50)}" width="14" height="14" fill="#2F6DB5" stroke="#FFF" stroke-width="1.2"/>` +
      `<path d="M${r(sx - 5)} ${r(sy - 38.5)}L${r(sx)} ${r(sy - 47.5)}L${r(sx + 5)} ${r(sy - 38.5)}Z" fill="#FFF"/><rect x="${r(sx - 1)}" y="${r(sy - 45)}" width="2" height="5" fill="#2A2A2A"/>`
    const [hx, hy] = iso(binX(W) + 3.2, H + 0.5)
    svg += shadow(hx, hy, 6) + `<rect x="${r(hx - 3.5)}" y="${r(hy - 12)}" width="7" height="12" fill="#C8463A"/><rect x="${r(hx - 5)}" y="${r(hy - 9)}" width="10" height="3" fill="#A8382E"/><rect x="${r(hx - 4)}" y="${r(hy - 15)}" width="8" height="3" fill="#A8382E"/>`
  }
  // trees in their pits across the street, benches between them
  for (const x of cityTrees(W)) {
    const [tx, ty] = iso(x, H + 4.75)
    svg += roundTree(tx, ty, 1.1)
    if (x + 2.5 < W + 1) svg += box(x + 2, H + 4.5, 0, 1.3, 0.35, 5, '#9A6B42') + box(x + 2, H + 4.5, 5, 1.3, 0.08, 9, '#8A5E38')
  }
  // a row of trees on the lawn by the side of the building
  for (const y of [3, 7.5, 12]) {
    const [tx, ty] = iso(W + 3.6, y)
    svg += roundTree(tx, ty, 1.15)
  }
  const [tx, ty] = iso(-3.6, H + 0.5)
  svg += roundTree(tx, ty, 1.1)
  return { svg, lamps }
}

// ---------- beach ----------

function beachGround(W: number) {
  const { near0, near1, far0 } = bands()
  const sand = '#E9D3A1'
  const wet = '#CDB27E'
  let s = speckles(21, 140, -5, -3, W + 5, Y_MAX + 1.2, ['#D9BF88', '#F5E4BC'])
  // the boardwalk: planks across the walk, a beam on each side
  const planks = '#B88A57'
  s += band(W, near0, near1 - 0.1, planks) + doorPath(W, planks)
  let lines = ''
  for (let x = -5; x < W + 5; x += 0.4) lines += `M${pts([iso(x, near0)])}L${pts([iso(x, near1 - 0.1)])}`
  for (let y = D + 0.2; y < near0; y += 0.4) lines += lineX(W + 0.8, W + 2.6, y)
  s += `<path d="${lines}" stroke="#8C6440" stroke-opacity=".55"/>` + band(W, near1 - 0.22, near1 - 0.1, '#7E5A3A') + band(W, near0, near0 + 0.1, '#7E5A3A')
  // wet sand, shallow and deep water, then the sandbar on the far side
  s += band(W, H + 2.2, H + 2.5, wet) + band(W, H + 2.5, far0 - 0.25, '#6CC3D6') + band(W, H + 2.8, far0 - 0.5, '#3F98BF') + band(W, far0 - 0.25, far0, wet)
  s += band(W, far0, Y_MAX + 3, sand) + speckles(22, 50, -5, far0, W + 5, Y_MAX + 1.2, ['#D9BF88', '#F5E4BC'])
  // waves rolling along the water, foam lapping both shores
  ;[2.95, 3.3, 3.65].forEach((k, i) => {
    s += `<path d="${lineX(-6, W + 6, H + k)}" stroke="#FFF" stroke-width="1.6" stroke-dasharray="${10 + i * 4} ${24 + i * 6}" opacity=".5">` +
      `<animate attributeName="stroke-dashoffset" from="0" to="${-(34 + i * 10)}" dur="${3 + i}s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values=".15;.7;.15" dur="${2.6 + i * 0.7}s" repeatCount="indefinite"/></path>`
  })
  const foam = (y: number, dx: number, dy: number, dur: number) =>
    `<path d="${lineX(-6, W + 6, y)}" stroke="#F4FBFF" stroke-width="2.5" opacity=".85"><animateTransform attributeName="transform" type="translate" values="0 0;${dx} ${dy};0 0" dur="${dur}s" repeatCount="indefinite"/></path>`
  s += foam(H + 2.52, 3.6, -1.8, 4) + foam(far0 - 0.27, -3.6, 1.8, 4.6)
  for (let i = 0; i < 12; i++) {
    const [gx, gy] = iso(-3 + rnd(2300 + i) * (W + 6), H + 2.6 + rnd(2400 + i) * 1.4)
    s += `<rect x="${r(gx)}" y="${r(gy)}" width="3" height="1.5" fill="#FFF" opacity="0"><animate attributeName="opacity" values="0;.9;0" dur="${r(1.5 + rnd(2500 + i) * 2)}s" begin="${r(rnd(2600 + i) * 2)}s" repeatCount="indefinite"/></rect>`
  }
  return frame(W, sand, '#9C7E52', s)
}

function palm(sx: number, sy: number, s = 1) {
  let g = shadow(sx + 10 * s, sy, 14 * s)
  for (let i = 0; i < 8; i++) g += `<rect x="${r(sx + i * i * 0.12 * s - 2.2 * s)}" y="${r(sy - (i + 1) * 7 * s)}" width="${r(4.4 * s)}" height="${r(7.4 * s)}" fill="${i % 2 ? '#86613A' : '#9C7448'}"/>`
  const tx = sx + 7.7 * s
  const ty = sy - 57 * s
  const fronds: [number, number, number, number][] = [[-24, 8, -12, -10], [24, 9, 12, -11], [-18, -6, -9, -14], [19, -7, 9, -15], [-4, 14, -8, 2], [6, 15, 8, 3]]
  for (const [ex, ey, cx, cy] of fronds) {
    g += `<path d="M${r(tx)} ${r(ty)}Q${r(tx + cx * s)} ${r(ty + cy * s)} ${r(tx + ex * s)} ${r(ty + ey * s)}" stroke="#3E8E4A" stroke-width="${r(4.5 * s)}" fill="none" stroke-linecap="round"/>`
  }
  return g + `<circle cx="${r(tx - 2)}" cy="${r(ty + 3)}" r="2.6" fill="#6A4A2A"/><circle cx="${r(tx + 2.5)}" cy="${r(ty + 3.5)}" r="2.6" fill="#7A5631"/>`
}

function umbrella(sx: number, sy: number, color: string) {
  return (
    shadow(sx, sy, 15) + `<rect x="${r(sx - 0.8)}" y="${r(sy - 27)}" width="1.6" height="27" fill="#EDE6D8"/>` +
    `<path d="M${r(sx - 17)} ${r(sy - 24)}Q${r(sx)} ${r(sy - 42)} ${r(sx + 17)} ${r(sy - 24)}Z" fill="${color}"/>` +
    `<path d="M${r(sx - 6)} ${r(sy - 24)}Q${r(sx)} ${r(sy - 39)} ${r(sx + 6)} ${r(sy - 24)}Z" fill="#FFF8EC"/>`
  )
}

function beachProps(W: number): Props {
  const { far0 } = bands()
  let svg = ''
  const lamps: string[] = []
  // palms and white lamps along the boardwalk
  spots(W, 1, 3.5, W - 0.5).forEach((x, i) => {
    const [px, py] = iso(x, H + 0.5)
    if (i % 2 === 0) svg += palm(px, py)
    else {
      const [post, light] = lampPost(px, py, '#E8E4DC', '#C9C3B6', 48)
      svg += post
      lamps.push(light)
    }
  })
  const [ex, ey] = iso(-3.4, H + 0.5)
  svg += palm(ex, ey, 1.1)
  // towels on the sandbar (flat, so the far lane can walk over them) and umbrellas behind the lane
  const colors = ['#E05A4E', '#3E8FD0', '#F2B33D', '#5BB58A']
  spots(W, 2, 5.5, W).forEach((x, i) => {
    const c = colors[i % colors.length]!
    svg += floorQuad(x + 0.6, Y_MAX - 0.3, x + 1.6, Y_MAX + 0.4, shade(c, 1.35)) + floorQuad(x + 0.6, Y_MAX - 0.3, x + 1.6, Y_MAX - 0.1, c)
    const [ux, uy] = iso(x, far0 + 0.35)
    svg += umbrella(ux, uy, c)
  })
  // a rowing boat bobbing on the water
  {
    const bx = W * 0.28
    const by = H + 3.2
    const hull = box(bx - 0.9, by - 0.3, 0, 1.8, 0.6, 5, '#B5653F') + poly([iso(bx - 0.8, by - 0.22, 5), iso(bx + 0.8, by - 0.22, 5), iso(bx + 0.8, by + 0.22, 5), iso(bx - 0.8, by + 0.22, 5)], '#7A4A30')
    const [ox, oy] = iso(bx, by, 6)
    svg += `<g>${hull}<path d="M${r(ox - 22)} ${r(oy + 4)}L${r(ox + 14)} ${r(oy - 6)}" stroke="#D9B98A" stroke-width="1.6"/>` +
      `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.6;0 0" dur="3s" repeatCount="indefinite"/></g>`
  }
  // the lifeguard tower by the side of the building
  {
    const lx = W + 2.9
    const ly = H - 3.5
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) svg += box(lx + dx * 1.1, ly + dy * 1.1, 0, 0.12, 0.12, 30, '#D8D2C4')
    svg += box(lx - 0.1, ly - 0.1, 30, 1.45, 1.45, 3, '#F2EEE6') + box(lx + 0.1, ly + 0.1, 33, 1.05, 1.05, 13, '#E25B45') + box(lx, ly, 46, 1.25, 1.25, 3, '#F2EEE6')
    const [fx, fy] = iso(lx + 1.25, ly, 49)
    svg += `<rect x="${r(fx)}" y="${r(fy - 16)}" width="1.4" height="16" fill="#6B6F76"/><path d="M${r(fx + 1.4)} ${r(fy - 16)}h11l-3 4l3 4h-11z" fill="#E25B45"><animate attributeName="d" values="M${r(fx + 1.4)} ${r(fy - 16)}h11l-3 4l3 4h-11z;M${r(fx + 1.4)} ${r(fy - 16)}h10l-1 4l1 4h-10z;M${r(fx + 1.4)} ${r(fy - 16)}h11l-3 4l3 4h-11z" dur="1.2s" repeatCount="indefinite"/></path>`
  }
  // a sandcastle past the end of the walk
  {
    const [cx, cy] = iso(W + 3.4, H + 2.2)
    svg += shadow(cx, cy, 10) + `<rect x="${r(cx - 8)}" y="${r(cy - 8)}" width="16" height="8" fill="#D9BC82"/><rect x="${r(cx - 9)}" y="${r(cy - 13)}" width="5" height="6" fill="#E3C890"/><rect x="${r(cx + 4)}" y="${r(cy - 13)}" width="5" height="6" fill="#E3C890"/><rect x="${r(cx - 3)}" y="${r(cy - 17)}" width="6" height="10" fill="#E3C890"/><path d="M${r(cx)} ${r(cy - 17)}v-6l5 2l-5 2" fill="#E05A4E" stroke="#6B6F76" stroke-width=".8"/>`
  }
  return { svg, lamps }
}

function gulls(viewW: number) {
  let s = ''
  for (let i = 0; i < 2; i++) {
    const y = 40 + i * 28
    s += `<path d="M-6 0q3 -4 6 0q3 -4 6 0" stroke="#FFF" stroke-width="1.6" fill="none"><animateMotion path="M${-40 - i * 60} ${y} Q${viewW / 2} ${y - 30} ${viewW + 60} ${y + 10}" dur="${26 + i * 9}s" begin="${-i * 11}s" repeatCount="indefinite"/></path>`
  }
  return `<g pointer-events="none" opacity=".85">${s}</g>`
}

// ---------- forest ----------

function forestGround(W: number) {
  const { near0, far0 } = bands()
  const grass = '#7FAF5B'
  const dirt = '#B48D5E'
  let s = speckles(31, 160, -5, -3, W + 5, Y_MAX + 1.2, ['#6E9E4D', '#93C26B'])
  s += band(W, H + 1.95, far0 + 0.05, '#76A653') + speckles(32, 70, -5, H + 2, W + 5, far0, ['#E8C547', '#F2F0E8', '#D97A9A', '#B58AD8'], 2.5, 2.5)
  // the two dirt paths the walkers follow, the path to the door and a cut through the meadow
  s += band(W, H + 0.75, H + 1.85, dirt) + band(W, H + 4.75, Y_MAX + 0.05, dirt) + floorQuad(W, D, W + 2.4, D + 1, dirt) + floorQuad(W + 1, D, W + 2.2, H + 0.8, dirt) + floorQuad(W + 1.1, H + 1.8, W + 2.1, H + 4.8, dirt)
  s += speckles(33, 90, -5, H + 0.8, W + 5, H + 1.8, ['#9C7A4E', '#C9A577']) + speckles(34, 90, -5, H + 4.8, W + 5, Y_MAX, ['#9C7A4E', '#C9A577'])
  s += band(W, near0 - 0.1, near0 + 0.05, '#6B9A4A')
  return frame(W, grass, '#6E5236', s)
}

function mushroom(sx: number, sy: number, s = 1) {
  return (
    `<rect x="${r(sx - 1.5 * s)}" y="${r(sy - 5 * s)}" width="${r(3 * s)}" height="${r(5 * s)}" fill="#F1E9D8"/>` +
    `<path d="M${r(sx - 5 * s)} ${r(sy - 4.5 * s)}Q${r(sx)} ${r(sy - 13 * s)} ${r(sx + 5 * s)} ${r(sy - 4.5 * s)}Z" fill="#D2463A"/>` +
    `<rect x="${r(sx - 2.5 * s)}" y="${r(sy - 8 * s)}" width="1.5" height="1.5" fill="#FFF"/><rect x="${r(sx + 1.2 * s)}" y="${r(sy - 7 * s)}" width="1.5" height="1.5" fill="#FFF"/>`
  )
}

function bush(sx: number, sy: number) {
  return shadow(sx, sy, 10) + `<circle cx="${r(sx - 5)}" cy="${r(sy - 5)}" r="6" fill="#4C8A42"/><circle cx="${r(sx + 5)}" cy="${r(sy - 5)}" r="6" fill="#4C8A42"/><circle cx="${r(sx)}" cy="${r(sy - 9)}" r="7" fill="#5E9E4F"/><rect x="${r(sx - 3)}" y="${r(sy - 12)}" width="2" height="2" fill="#E05A6A"/>`
}

// a wooden lantern on a post, and its glow
function lantern(sx: number, sy: number): [string, string] {
  const svg =
    shadow(sx, sy, 5) + `<rect x="${r(sx - 1.5)}" y="${r(sy - 30)}" width="3" height="30" fill="#6B4A2F"/><rect x="${r(sx - 1.5)}" y="${r(sy - 31)}" width="9" height="2.5" fill="#6B4A2F"/>` +
    `<rect x="${r(sx + 3)}" y="${r(sy - 29)}" width="7" height="9" fill="#3B2A1E"/><rect x="${r(sx + 4.5)}" y="${r(sy - 27.5)}" width="4" height="6" fill="#F5C46A"/><rect x="${r(sx + 2.5)}" y="${r(sy - 30.5)}" width="8" height="2" fill="#4A3424"/>`
  const light =
    `<g class="lamp-light" pointer-events="none"><circle cx="${r(sx + 6.5)}" cy="${r(sy - 24.5)}" r="17" fill="url(#lamp)"/><rect x="${r(sx + 4.5)}" y="${r(sy - 27.5)}" width="4" height="6" fill="#FFE6A0"/>` +
    `<ellipse cx="${r(sx + 5)}" cy="${r(sy + 2)}" rx="24" ry="10" fill="url(#lamp)"/></g>`
  return [svg, light]
}

function forestProps(W: number): Props {
  const { far0 } = bands()
  let svg = ''
  const lamps: string[] = []
  // pines between the building and the near path, lanterns among them
  spots(W, 0.8, 3, W).forEach((x, i) => {
    const [px, py] = iso(x, H + 0.45)
    if (i % 3 === 1) {
      const [post, light] = lantern(px, py)
      svg += post
      lamps.push(light)
    } else svg += pine(px, py, i % 2 ? 1.05 : 0.9)
  })
  // the meadow between the paths: bushes, stumps and mushrooms (low, the near walkers pass just behind)
  for (let i = 0; i < 14; i++) {
    const x = -2 + rnd(3100 + i) * (W + 3)
    if (x > W + 0.6 && x < W + 2.6) continue
    const [mx, my] = iso(x, H + 2.2 + rnd(3200 + i) * 2.1)
    svg += i % 3 === 0 ? bush(mx, my) : mushroom(mx, my, i % 2 ? 1 : 0.8) + (i % 4 === 1 ? mushroom(mx + 6, my + 2, 0.6) : '')
  }
  for (const x of [W * 0.15, W * 0.62]) {
    svg += box(x, H + 3.2, 0, 0.5, 0.5, 6, '#7A5534') + poly([iso(x + 0.08, H + 3.28, 6), iso(x + 0.42, H + 3.28, 6), iso(x + 0.42, H + 3.62, 6), iso(x + 0.08, H + 3.62, 6)], '#D8B98A')
  }
  // round trees and pines across the far path
  spots(W, 1.5, 4.5, W + 1).forEach((x, i) => {
    const [tx, ty] = iso(x, far0 + 0.15)
    svg += i % 2 ? pine(tx, ty, 0.85) : roundTree(tx, ty, 1.05)
  })
  // a little wood by the side of the building
  ;[[W + 3.4, 2.5], [W + 3.8, 6], [W + 3.3, 9.5], [W + 3.9, 13]].forEach(([x, y], i) => {
    const [tx, ty] = iso(x!, y!)
    svg += i % 2 ? roundTree(tx, ty, 1.2, '#3F7F3C', '#5C9E4C') : pine(tx, ty, 1.2)
  })
  const [ex, ey] = iso(-3.6, H + 0.5)
  svg += pine(ex, ey, 1.1)
  return { svg, lamps }
}

// ---------- snow ----------

function snowGround(W: number) {
  const { far0 } = bands()
  const snow = '#EEF2F6'
  const trodden = '#D6DEE6'
  let s = speckles(41, 140, -5, -3, W + 5, Y_MAX + 1.2, ['#DCE5ED', '#FFFFFF'])
  s += band(W, H + 0.8, H + 1.8, trodden) + band(W, H + 4.8, Y_MAX + 0.05, trodden) + floorQuad(W, D, W + 2.4, D + 1, trodden) + floorQuad(W + 1, D, W + 2.2, H + 0.85, trodden)
  // footprints along both paths
  s += speckles(42, 70, -4, H + 1.05, W + 4, H + 1.55, ['#BCC8D3'], 2, 1.2) + speckles(43, 70, -4, H + 4.95, W + 4, H + 5.45, ['#BCC8D3'], 2, 1.2)
  // the frozen pond in the middle
  const px = W * 0.3
  const py = H + 3.15
  s += groundEllipse(px, py, 4.3, 1.15, '#F8FBFD') + groundEllipse(px, py, 4, 0.95, '#B9DCEB', ' stroke="#93C2D8" stroke-width="2"') + groundEllipse(px + 0.6, py + 0.1, 2.4, 0.5, '#CDE8F3')
  const [ix, iy] = iso(px - 1, py - 0.2)
  s += `<path d="M${r(ix - 18)} ${r(iy + 2)}l14 -3M${r(ix + 10)} ${r(iy + 6)}l18 -4M${r(ix + 34)} ${r(iy - 2)}l10 -2" stroke="#FFF" stroke-width="1.5" opacity=".9"/>`
  s += speckles(44, 30, -5, H + 2, W + 5, far0, ['#DCE5ED'])
  return frame(W, snow, '#8FA0B0', s)
}

function snowman(sx: number, sy: number) {
  return (
    shadow(sx, sy, 12) + `<circle cx="${r(sx)}" cy="${r(sy - 8)}" r="9" fill="#FAFCFE"/><circle cx="${r(sx)}" cy="${r(sy - 21)}" r="6.5" fill="#FAFCFE"/><circle cx="${r(sx)}" cy="${r(sy - 31)}" r="5" fill="#FAFCFE"/>` +
    `<path d="M${r(sx - 9)} ${r(sy - 8)}a9 9 0 0 0 18 0" fill="#DCE6EE"/><rect x="${r(sx - 6)}" y="${r(sy - 26)}" width="12" height="3" fill="#C8463A"/><rect x="${r(sx + 2)}" y="${r(sy - 26)}" width="3" height="8" fill="#C8463A"/>` +
    `<rect x="${r(sx - 5)}" y="${r(sy - 37)}" width="10" height="2" fill="#2A2A2A"/><rect x="${r(sx - 3.5)}" y="${r(sy - 44)}" width="7" height="7" fill="#2A2A2A"/>` +
    `<rect x="${r(sx - 2.5)}" y="${r(sy - 33)}" width="1.6" height="1.6" fill="#222"/><rect x="${r(sx + 1)}" y="${r(sy - 33)}" width="1.6" height="1.6" fill="#222"/><path d="M${r(sx)} ${r(sy - 30.5)}h6l-6 1.6z" fill="#F08A2C"/>` +
    `<path d="M${r(sx - 6)} ${r(sy - 21)}l-9 -6M${r(sx + 6)} ${r(sy - 21)}l9 -7" stroke="#6B4A2F" stroke-width="1.5"/>`
  )
}

function snowProps(W: number): Props {
  const { far0 } = bands()
  let svg = ''
  const lamps: string[] = []
  spots(W, 0.8, 3, W).forEach((x, i) => {
    const [px, py] = iso(x, H + 0.45)
    if (i % 3 === 1) {
      const [post, light] = lampPost(px, py, '#2E3238', '#46423E', 56)
      svg += post + `<rect x="${r(px + 6)}" y="${r(py - 59)}" width="9" height="2.5" fill="#FFF"/>`
      lamps.push(light)
    } else svg += pine(px, py, i % 2 ? 1.05 : 0.9, true)
  })
  spots(W, 2, 4.5, W + 1).forEach(x => {
    const [tx, ty] = iso(x, far0 + 0.2)
    svg += pine(tx, ty, 0.85, true)
  })
  ;[[W + 3.4, 2.5], [W + 3.8, 6.5], [W + 3.3, 10.5]].forEach(([x, y]) => {
    const [tx, ty] = iso(x!, y!)
    svg += pine(tx, ty, 1.25, true)
  })
  const [ex, ey] = iso(-3.6, H + 0.5)
  svg += pine(ex, ey, 1.1, true)
  // the snowman and his sled, past the end of the walk
  const [sx, sy] = iso(W + 3.5, H + 2.6)
  svg += snowman(sx, sy) + box(W + 3.1, H + 3.6, 2, 1.1, 0.5, 2, '#B5463A') + `<path d="M${pts([iso(W + 3, H + 4.05, 1), iso(W + 4.3, H + 4.05, 1)])}" stroke="#6B6F76" stroke-width="1.5"/>`
  return { svg, lamps }
}

function snowfall(viewW: number, viewH: number) {
  let s = ''
  for (let i = 0; i < 48; i++) {
    const x = rnd(4100 + i) * viewW
    const dur = 7 + rnd(4200 + i) * 7
    const drift = (rnd(4300 + i) - 0.5) * 40
    s += `<circle cx="${r(x)}" cy="-10" r="${r(1 + rnd(4400 + i) * 1.3)}" fill="#FFF" opacity="${r(0.6 + rnd(4500 + i) * 0.4)}">` +
      `<animate attributeName="cy" from="-10" to="${viewH + 10}" dur="${r(dur)}s" begin="${r(-rnd(4600 + i) * dur)}s" repeatCount="indefinite"/>` +
      `<animate attributeName="cx" values="${r(x)};${r(x + drift)};${r(x)}" dur="${r(dur / 2)}s" repeatCount="indefinite"/></circle>`
  }
  return `<g pointer-events="none">${s}</g>`
}

// ---------- moon ----------

function crater(cx: number, cy: number, a: number) {
  const [sx, sy] = iso(cx, cy)
  const rx = 25 * a
  const ry = 12.5 * a
  return (
    `<ellipse cx="${r(sx)}" cy="${r(sy)}" rx="${r(rx + 3)}" ry="${r(ry + 1.8)}" fill="#B4B4BB"/><ellipse cx="${r(sx)}" cy="${r(sy)}" rx="${r(rx)}" ry="${r(ry)}" fill="#7F7F87"/>` +
    `<ellipse cx="${r(sx + rx * 0.18)}" cy="${r(sy + ry * 0.22)}" rx="${r(rx * 0.72)}" ry="${r(ry * 0.65)}" fill="#8E8E96"/>`
  )
}

function moonGround(W: number) {
  const { near1, far0 } = bands()
  let s = speckles(51, 170, -5, -3, W + 5, Y_MAX + 1.2, ['#8A8A92', '#B0B0B7', '#7C7C84'])
  // smoother regolith where the walkers go, with tyre tracks
  s += band(W, H + 0.8, H + 1.8, '#A7A7AE') + band(W, H + 4.8, Y_MAX + 0.05, '#A7A7AE') + floorQuad(W, D, W + 2.4, D + 1, '#A7A7AE') + floorQuad(W + 1, D, W + 2.2, H + 0.85, '#A7A7AE')
  s += `<path d="${lineX(-5, W + 5, H + 3.0)}${lineX(-5, W + 5, H + 3.25)}" stroke="#86868E" stroke-width="2" stroke-dasharray="3 2"/>`
  for (let i = 0; i < 16; i++) {
    const x = -1 + rnd(5100 + i) * (W + 1)
    if (Math.abs(x - binX(W)) < 2) continue
    s += crater(x, i % 3 === 0 ? far0 - 0.75 : near1 + 0.55 + rnd(5200 + i) * 0.5, 0.5 + rnd(5300 + i) * 0.5)
  }
  s += crater(W + 3.5, 2.5, 1) + crater(W + 3.3, 11.5, 0.7) + crater(W + 3.7, 15, 0.45) + crater(-3, H + 0.6, 0.5) + crater(W * 0.3, Y_MAX + 0.6, 0.45) + crater(W * 0.8, Y_MAX + 0.7, 0.4)
  const glow = (id: string, c: string, o: number) => `<radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${o}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`
  return `<defs>${glow('red-glow', '#FF3B30', 0.7)}${glow('blue-glow', '#7FD3FF', 0.55)}</defs>` + frame(W, '#9C9CA3', '#5E5E66', s)
}

// the Earth hanging in the black sky, top left of the building
function earth() {
  const [ox, oy] = iso(0, 0)
  const cx = r(ox * 0.42)
  const cy = r(Math.max(42, oy - 95))
  return (
    `<defs><clipPath id="earth-clip"><circle cx="${cx}" cy="${cy}" r="24"/></clipPath></defs><g pointer-events="none"><circle cx="${cx}" cy="${cy}" r="30" fill="#6FB0FF" opacity=".15"/>` +
    `<circle cx="${cx}" cy="${cy}" r="24" fill="#2F6FB5"/><g clip-path="url(#earth-clip)">` +
    `<path d="M${cx - 16} ${cy - 14}h10v6h6v8h-8v6h-6v-8h-4z M${cx + 4} ${cy - 20}h8v4h6v10h-6v8h-6v-10h-2z M${cx - 6} ${cy + 10}h12v6h-12z" fill="#4E9A54"/>` +
    `<path d="M${cx - 20} ${cy - 4}h14v2h-14z M${cx + 2} ${cy + 4}h18v2h-18z M${cx - 10} ${cy - 22}h16v2h-16z" fill="#FFF" opacity=".75"/>` +
    `<circle cx="${cx + 14}" cy="${cy + 8}" r="26" fill="#0B1030" opacity=".5"/></g></g>`
  )
}

// a lattice mast with a red light blinking on top, and the red glow at night
function antenna(sx: number, sy: number, tall: number, delay: number): [string, string] {
  const top = sy - tall
  let lattice = ''
  for (let y = sy - 8; y > top + 6; y -= 8) lattice += `M${r(sx - 3)} ${r(y)}L${r(sx + 3)} ${r(y - 8)}`
  const blink = `<animate attributeName="opacity" values="1;1;.15;.15" dur="1.6s" begin="${delay}s" repeatCount="indefinite"/>`
  const svg =
    shadow(sx, sy, 7) + `<path d="M${r(sx - 3.5)} ${sy}L${r(sx - 1)} ${top}M${r(sx + 3.5)} ${sy}L${r(sx + 1)} ${top}${lattice}" stroke="#C9CCD2" stroke-width="1.4" fill="none"/>` +
    `<path d="M${r(sx - 9)} ${r(top + 18)}q9 8 18 0z" fill="#E6E8EC" stroke="#9EA2AA"/><circle cx="${r(sx)}" cy="${r(top - 1)}" r="2.6" fill="#FF3B30">${blink}</circle>`
  const light = `<g class="lamp-light" pointer-events="none"><circle cx="${r(sx)}" cy="${r(top - 1)}" r="14" fill="url(#red-glow)">${blink}</circle></g>`
  return [svg, light]
}

function moonProps(W: number): Props {
  const { far0 } = bands()
  let svg = ''
  const lamps: string[] = []
  // antennas behind the near path, blue path lights between them
  spots(W, 2, 4, W).forEach((x, i) => {
    const [px, py] = iso(x, H + 0.45)
    if (i % 3 === 0) {
      const [mast, light] = antenna(px, py, 66, i * 0.4)
      svg += mast
      lamps.push(light)
    } else {
      svg += `<rect x="${r(px - 1.5)}" y="${r(py - 12)}" width="3" height="12" fill="#8D9098"/><rect x="${r(px - 2.5)}" y="${r(py - 15)}" width="5" height="3" fill="#7FD3FF"/>`
      lamps.push(`<g class="lamp-light" pointer-events="none"><circle cx="${r(px)}" cy="${r(py - 13)}" r="12" fill="url(#blue-glow)"/><ellipse cx="${r(px)}" cy="${r(py + 1)}" rx="20" ry="8" fill="url(#blue-glow)"/></g>`)
    }
  })
  // the lunar module by the side of the building
  {
    const mx = W + 3.2
    const my = 6.5
    for (const [dx, dy] of [[-0.9, -0.9], [0.8, -0.9], [-0.9, 0.8], [0.8, 0.8]] as const) {
      svg += floorQuad(mx + dx - 0.12, my + dy - 0.12, mx + dx + 0.22, my + dy + 0.22, '#C9CCD2') + box(mx + dx, my + dy, 0, 0.1, 0.1, 13, '#B9BCC4')
    }
    svg += box(mx - 0.65, my - 0.65, 10, 1.3, 1.3, 13, '#D9A93A') + box(mx - 0.45, my - 0.45, 23, 0.9, 0.9, 14, '#C9CCD2')
    const [wx, wy] = iso(mx + 0.05, my + 0.45, 31)
    svg += `<rect x="${r(wx - 4)}" y="${r(wy - 3)}" width="7" height="5" fill="#2B3445"/>`
    const [tx, ty] = iso(mx, my, 37)
    svg += `<path d="M${r(tx)} ${r(ty)}v-10" stroke="#9EA2AA" stroke-width="1.2"/><circle cx="${r(tx)}" cy="${r(ty - 11)}" r="2" fill="#FFF"><animate attributeName="opacity" values="1;.2;1" dur="2.4s" repeatCount="indefinite"/></circle>`
    lamps.push(`<g class="lamp-light" pointer-events="none"><rect x="${r(wx - 4)}" y="${r(wy - 3)}" width="7" height="5" fill="#FFE6A0"/><circle cx="${r(wx)}" cy="${r(wy)}" r="16" fill="url(#lamp)"/></g>`)
    // the flag planted next to it
    const [fx, fy] = iso(W + 2.4, my + 3.2)
    svg += `<rect x="${r(fx - 0.7)}" y="${r(fy - 34)}" width="1.4" height="34" fill="#D8DAE0"/><rect x="${r(fx + 0.7)}" y="${r(fy - 34)}" width="16" height="10" fill="#F4F1EA"/><rect x="${r(fx + 5)}" y="${r(fy - 31.5)}" width="7" height="5" fill="#E07A5F"/>`
  }
  // a second antenna across the far path
  {
    const [ax, ay] = iso(W * 0.4, far0 + 0.2)
    const [mast, light] = antenna(ax, ay, 46, 0.8)
    svg += mast
    lamps.push(light)
  }
  // the rover crawling up and down between the paths (low, the near walkers pass just behind)
  {
    const [ax, ay] = iso(3, H + 3.1)
    const [bx, by] = iso(W - 3, H + 3.1)
    svg +=
      `<g><animateMotion path="M${r(ax)} ${r(ay)}L${r(bx)} ${r(by)}L${r(ax)} ${r(ay)}" dur="90s" repeatCount="indefinite"/>` + shadow(0, 0, 14) +
      `<rect x="-12" y="-13" width="24" height="6" fill="#D8D8DC"/><rect x="-12" y="-9" width="24" height="2" fill="#A4A6AE"/><rect x="-10" y="-16" width="20" height="3" fill="#2E4C8C"/>` +
      `<path d="M8 -16v-8" stroke="#9EA2AA" stroke-width="1.2"/><path d="M4 -26q4 4 8 0z" fill="#E6E8EC"/>` +
      `<circle cx="-9" cy="-4" r="3.5" fill="#3B3F46"/><circle cx="0" cy="-4" r="3.5" fill="#3B3F46"/><circle cx="9" cy="-4" r="3.5" fill="#3B3F46"/></g>`
  }
  return { svg, lamps }
}

function shootingStar(viewW: number) {
  const x = viewW * 0.25
  return (
    `<g pointer-events="none" opacity="0"><path d="M0 0l-34 -12" stroke="#FFF8E0" stroke-width="1.6" stroke-linecap="round"/>` +
    `<animateMotion path="M${r(x)} 30L${r(x + 220)} 110" dur="9s" keyTimes="0;.12;1" keyPoints="0;1;1" calcMode="linear" repeatCount="indefinite"/>` +
    `<animate attributeName="opacity" values="0;1;0;0" keyTimes="0;.06;.12;1" dur="9s" repeatCount="indefinite"/></g>`
  )
}
