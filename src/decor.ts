import type { RoomGeom } from './scene'
import { D, H, WALL_H, hash, iso, layout, pts, r } from './scene'

type P = [number, number]

// Small deterministic generator, so a room keeps the same stains and specks on every redraw.
function rng(seed: string) {
  let s = hash(seed) || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const quad = (x0: number, y0: number, x1: number, y1: number) => `M${pts([iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)])}Z`
const seg = (xa: number, ya: number, xb: number, yb: number, z = 0) => `M${pts([iso(xa, ya, z)])}L${pts([iso(xb, yb, z)])}`
const fillPath = (d: string, fill: string, opacity: number) => (d ? `<path d="${d}" fill="${fill}" fill-opacity="${opacity}" pointer-events="none"/>` : '')
const strokePath = (d: string, stroke: string, opacity: number, width = 1) =>
  d ? `<path d="${d}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${width}" fill="none" pointer-events="none"/>` : ''

type Bounds = { x0: number; x1: number; y0: number; y1: number }

function planks(b: Bounds, seed: string, tint?: string) {
  const rand = rng(seed)
  const w = 0.5
  let seams = ''
  let light = ''
  let joints = ''
  let alt = ''
  let row = 0
  for (let y = b.y0; y < b.y1 - 0.01; y += w, row++) {
    const y1 = Math.min(b.y1, y + w)
    if (y > b.y0) {
      seams += seg(b.x0, y, b.x1, y)
      light += seg(b.x0, y + 0.05, b.x1, y + 0.05)
    }
    if (row % 2) alt += quad(b.x0, y, b.x1, y1)
    // butt joints staggered row by row, like real boards
    for (let x = b.x0 + ((row * 1.3) % 2.6) + 0.4; x < b.x1 - 0.3; x += 2.6) joints += seg(x, y, x, y1)
    if (rand() < 0.5) alt += quad(b.x0 + rand() * (b.x1 - b.x0 - 1), y, b.x0 + rand() * (b.x1 - b.x0), y1)
  }
  return (tint ? fillPath(quad(b.x0, b.y0, b.x1, b.y1), tint, 0.32) : '') + fillPath(alt, '#000', 0.035) +
    strokePath(seams, '#3B2A1C', 0.2) + strokePath(light, '#FFFFFF', 0.16) + strokePath(joints, '#3B2A1C', 0.22)
}

// Grout lines; rows count from the far wall (y0 on the top row, y1 on the bottom one), so a size that doesn't divide
// the room leaves its cut row by the door in both rows, never against the outer wall.
function tiles(b: Bounds, size: number, grout: string, groutOpacity: number, width = 1, fromEnd = false) {
  let d = ''
  for (let x = b.x0 + size; x < b.x1 - 0.01; x += size) d += seg(x, b.y0, x, b.y1)
  if (fromEnd) for (let y = b.y1 - size; y > b.y0 + 0.01; y -= size) d += seg(b.x0, y, b.x1, y)
  else for (let y = b.y0 + size; y < b.y1 - 0.01; y += size) d += seg(b.x0, y, b.x1, y)
  return strokePath(d, grout, groutOpacity, width)
}

// Soft light for a room: a shadow fading out from the far wall and a faint pool of light in the middle.
function lighting(room: RoomGeom) {
  const id = room.id.replace(/[^\w-]/g, '_')
  const far = room.top ? room.y0 : room.y1
  const into = room.top ? 1 : -1
  // a gradient drawn in screen space along the normal of the wall's line on screen, so its bands follow the wall
  const [ax, ay] = iso(room.x0, far)
  const [bx, by] = iso(room.x0, far + into * 1.1)
  const [nx, ny] = [-0.447, 0.894]
  const t = (bx - ax) * nx + (by - ay) * ny
  const [cx, cy] = iso((room.x0 + room.x1) / 2, (room.y0 + room.y1) / 2)
  const rx = (room.x1 - room.x0) * 9
  return `<defs><linearGradient id="ao-${id}" gradientUnits="userSpaceOnUse" x1="${r(ax)}" y1="${r(ay)}" x2="${r(ax + nx * t)}" y2="${r(ay + ny * t)}">` +
    `<stop offset="0" stop-color="#2A1E14" stop-opacity=".16"/><stop offset="1" stop-color="#2A1E14" stop-opacity="0"/></linearGradient>` +
    `<radialGradient id="pool-${id}"><stop offset="0" stop-color="#FFF8EA" stop-opacity=".14"/><stop offset="1" stop-color="#FFF8EA" stop-opacity="0"/></radialGradient></defs>` +
    `<path d="${quad(room.x0, Math.min(far, far + into * 1.1), room.x1, Math.max(far, far + into * 1.1))}" fill="url(#ao-${id})" pointer-events="none"/>` +
    `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="${r(rx)}" ry="${r(rx / 2)}" fill="url(#pool-${id})" pointer-events="none"/>`
}

// Some tiles slightly lighter or darker than the rest, so a big floor doesn't look flat.
function mottle(b: Bounds, size: number, seed: string, share: number, color: string, opacity: number) {
  const rand = rng(seed)
  let d = ''
  for (let x = b.x0; x < b.x1 - 0.01; x += size) {
    for (let y = b.y0; y < b.y1 - 0.01; y += size) if (rand() < share) d += quad(x, y, Math.min(b.x1, x + size), Math.min(b.y1, y + size))
  }
  return fillPath(d, color, opacity)
}

function specks(b: Bounds, perTile: number, seed: string, size: number, colors: [string, number][]) {
  const rand = rng(seed)
  const d: string[] = colors.map(() => '')
  const n = Math.round((b.x1 - b.x0) * (b.y1 - b.y0) * perTile)
  for (let i = 0; i < n; i++) {
    const x = b.x0 + 0.1 + rand() * (b.x1 - b.x0 - 0.2 - size)
    const y = b.y0 + 0.1 + rand() * (b.y1 - b.y0 - 0.2 - size)
    const k = i % colors.length
    d[k] += quad(x, y, x + size, y + size)
  }
  return colors.map(([c, o], k) => fillPath(d[k]!, c, o)).join('')
}

function camo(b: Bounds, seed: string) {
  const rand = rng(seed)
  const clampX = (x: number) => Math.max(b.x0, Math.min(b.x1, x))
  const clampY = (y: number) => Math.max(b.y0, Math.min(b.y1, y))
  const blobs = ['', '']
  const n = Math.round(((b.x1 - b.x0) * (b.y1 - b.y0)) / 2.4)
  for (let i = 0; i < n; i++) {
    const cx = b.x0 + rand() * (b.x1 - b.x0)
    const cy = b.y0 + rand() * (b.y1 - b.y0)
    const rad = 0.45 + rand() * 0.6
    const ring: P[] = []
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2
      const rr = rad * (0.6 + rand() * 0.6)
      ring.push(iso(clampX(cx + Math.cos(a) * rr * 1.4), clampY(cy + Math.sin(a) * rr)))
    }
    blobs[i % 2] += `M${pts(ring)}Z`
  }
  return fillPath(blobs[0]!, '#4F5A35', 0.32) + fillPath(blobs[1]!, '#7A6A45', 0.3)
}

// A diamond motif on every tile plus a woven border along the walls.
function carpet(b: Bounds, motif: [string, string], border: string) {
  const d = ['', '']
  let i = 0
  for (let x = b.x0 + 1; x < b.x1 - 0.5; x += 1) {
    for (let y = b.y0 + 1; y < b.y1 - 0.5; y += 1, i++) {
      const s = 0.22
      d[i % 2] += `M${pts([iso(x - s, y), iso(x, y - s), iso(x + s, y), iso(x, y + s)])}Z`
    }
  }
  const inset = 0.3
  const band = quad(b.x0 + inset, b.y0 + inset, b.x1 - inset, b.y1 - inset) + quad(b.x0 + inset + 0.14, b.y0 + inset + 0.14, b.x1 - inset - 0.14, b.y1 - inset - 0.14)
  return fillPath(d[0]!, motif[0], 0.55) + fillPath(d[1]!, motif[1], 0.55) +
    `<path d="${band}" fill="${border}" fill-opacity=".7" fill-rule="evenodd" pointer-events="none"/>`
}

// Floor pattern for a room (planks, tiles, carpet…), drawn over its base colour `fill`.
// null keeps the generic tile grid and checker.
export function floorDecor(room: RoomGeom, fill: string): string | null {
  const base = pattern(room, fill)
  return base ? base + lighting(room) : base
}

function pattern(room: RoomGeom, _fill: string): string | null {
  const b: Bounds = { x0: room.x0, x1: room.x1, y0: room.y0, y1: room.y1 }
  const seed = room.id
  if (room.kind === 'patio') return null
  if (room.kind === 'dorm') return planks(b, seed)
  switch (room.theme) {
    case 'cafe':
    case 'smoking':
    case 'music':
      return planks(b, seed)
    case 'library':
      return planks(b, seed, '#A27552')
    case 'gym':
      return mottle(b, 1, seed, 0.5, '#000', 0.05) + tiles(b, 1, '#2E3238', 0.3, 1.2) + specks(b, 3, seed, 0.05, [['#2E3238', 0.35], ['#FFFFFF', 0.4]])
    case 'arcade':
      return carpet(b, ['#FF4FA3', '#4FE3FF'], '#FFD36B')
    case 'military':
      return camo(b, seed) + tiles(b, 3, '#2F3522', 0.3, 1.2, !room.top) + specks(b, 1.5, seed, 0.06, [['#2F3522', 0.3]])
    case 'space':
    case 'kitchen':
    case 'beach':
    case 'casino':
      // these themes draw their own floor in furnish()
      return ''
    case 'greenhouse':
      return mottle(b, 1, seed, 0.45, '#B4643F', 0.22) + mottle(b, 1, seed + 'x', 0.25, '#7A5A3A', 0.18) + tiles(b, 1, '#F2E6CF', 0.55, 1.4) +
        specks(b, 1.2, seed, 0.07, [['#5A4030', 0.35]])
    default:
      // plain lab: light tiles with pale grout and a few tiles a shade off
      return mottle(b, 1, seed, 0.3, '#FFFFFF', 0.18) + mottle(b, 1, seed + 'd', 0.15, '#000', 0.035) + tiles(b, 1, '#FFFFFF', 0.6, 1.3) + tiles(b, 1, '#000', 0.05)
  }
}

const wallQuadBack = (xa: number, xb: number, za: number, zb: number) => [iso(xa, 0, za), iso(xb, 0, za), iso(xb, 0, zb), iso(xa, 0, zb)] as P[]
const wallQuadSide = (ya: number, yb: number, za: number, zb: number) => [iso(0, ya, za), iso(0, yb, za), iso(0, yb, zb), iso(0, ya, zb)] as P[]
const polyD = (list: P[]) => `M${pts(list)}Z`

// Wall sconce: a brass plate, a little shade and a warm glow that stays on day and night.
function sconce(p: P) {
  const [x, y] = [r(p[0]), r(p[1])]
  return `<g transform="translate(${x},${y})" pointer-events="none"><ellipse cy="-3" rx="9" ry="12" fill="url(#sconce-glow)"/>` +
    `<rect x="-1.5" y="-1" width="3" height="5" fill="#8F7A63"/><path d="M-4 -1 L4 -1 L2.5 -6 L-2.5 -6 Z" fill="#F4D9A6" stroke="#8F7A63" stroke-width=".8"/></g>`
}

// A framed picture on the side wall (x=0): sheared like the wall.
function sidePicture(ya: number, yb: number, za: number, zb: number, art: string) {
  const frame = wallQuadSide(ya, yb, za, zb)
  const inner = wallQuadSide(ya + 0.12, yb - 0.12, za + 2, zb - 2)
  // the art is laid out left to right, and on this wall left is the larger y
  const [ax, ay] = iso(0, yb - 0.12, zb - 2)
  const w = r((yb - ya - 0.24) * 18)
  const h = r(zb - za - 4)
  return `<path d="${polyD(frame)}" fill="#8F6A48" stroke="#5E4530" stroke-width=".8"/><path d="${polyD(inner)}" fill="#F4ECDD"/>` +
    `<g transform="matrix(1,-0.5,0,1,${r(ax)},${r(ay)})">${art.replace(/\{w\}/g, String(w)).replace(/\{h\}/g, String(h))}</g>`
}

// Details on the back and side walls (wainscot, rails, sconces…), drawn before the windows.
export function wallDecor(W: number) {
  const out: string[] = []
  out.push(
    '<defs><linearGradient id="wall-ao" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#3B2A1C" stop-opacity=".16"/><stop offset="1" stop-color="#3B2A1C" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="wall-sun" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFF6E6" stop-opacity=".35"/><stop offset="1" stop-color="#FFF6E6" stop-opacity="0"/></linearGradient>' +
    '<radialGradient id="sconce-glow"><stop offset="0" stop-color="#FFE6A0" stop-opacity=".55"/><stop offset="1" stop-color="#FFE6A0" stop-opacity="0"/></radialGradient></defs>',
  )
  // soft light from the left over the back wall, and a darker side wall corner
  out.push(`<path d="${polyD(wallQuadBack(0, W * 0.6, 6, WALL_H - 10))}" fill="url(#wall-sun)" pointer-events="none"/>`)
  out.push(`<path d="${polyD(wallQuadSide(0, 1.2, 6, WALL_H - 10))}" fill="#3B2A1C" fill-opacity=".06" pointer-events="none"/>`)
  // faint wallpaper stripes on the upper wall
  let stripes = ''
  for (let x = 0.5; x < W; x += 0.5) stripes += `M${pts([iso(x, 0, 24)])}L${pts([iso(x, 0, WALL_H - 10)])}`
  for (let y = 0.5; y < H; y += 0.5) stripes += `M${pts([iso(0, y, 24)])}L${pts([iso(0, y, WALL_H - 10)])}`
  out.push(strokePath(stripes, '#FFFFFF', 0.28, 1.4))
  // wainscot: wood-tinted panels under a chair rail
  out.push(`<path d="${polyD(wallQuadBack(0, W, 6, 20))}${polyD(wallQuadSide(0, H, 6, 20))}" fill="#C9A882" fill-opacity=".42" pointer-events="none"/>`)
  // panels fitted to each room's stretch of wall, so none is cut in two by a partition
  let panels = ''
  const fit = (a: number, b: number, quad: (u0: number, u1: number) => P[]) => {
    const n = Math.max(1, Math.round((b - a) / 1.5))
    const step = (b - a) / n
    for (let k = 0; k < n; k++) panels += polyD(quad(a + k * step + 0.15, a + (k + 1) * step - 0.15))
  }
  const cuts = [...new Set([0, ...layout().rooms.filter(rm => rm.top).map(rm => rm.x1), W])].sort((a, b) => a - b)
  cuts.slice(1).forEach((x, k) => fit(cuts[k]!, x, (u0, u1) => wallQuadBack(u0, u1, 8.5, 17.5)))
  fit(0, D, (u0, u1) => wallQuadSide(u0, u1, 8.5, 17.5))
  fit(D + 1, H, (u0, u1) => wallQuadSide(u0, u1, 8.5, 17.5))
  out.push(strokePath(panels, '#8F6A48', 0.35))
  out.push(`<path d="${polyD(wallQuadBack(0, W, 20, 22.5))}${polyD(wallQuadSide(0, H, 20, 22.5))}" fill="#A27552" pointer-events="none"/>`)
  out.push(strokePath(seg(0, 0, W, 0, 22.5) + seg(0, 0, 0, H, 22.5), '#FFFFFF', 0.4))
  out.push(`<path d="${polyD(wallQuadBack(0, W, 6, 14))}${polyD(wallQuadSide(0, H, 6, 14))}" fill="url(#wall-ao)" pointer-events="none"/>`)
  // crown moulding under the top band
  out.push(`<path d="${polyD(wallQuadBack(0, W, WALL_H - 12, WALL_H - 10))}${polyD(wallQuadSide(0, H, WALL_H - 12, WALL_H - 10))}" fill="#C2B39D" pointer-events="none"/>`)
  out.push(strokePath(seg(0, 0, W, 0, WALL_H - 12) + seg(0, 0, 0, H, WALL_H - 12), '#8F7A63', 0.35))
  // corner post where the two walls meet
  out.push(`<path d="${polyD([iso(0, 0, 0), iso(0.12, 0, 0), iso(0.12, 0, WALL_H), iso(0, 0, WALL_H)])}" fill="#D7CBB8" pointer-events="none"/>`)
  // sconces beside the dorm windows (clear of the LITERAS sign), and on the side wall between the windows
  out.push(sconce(iso(0.65, 0, 40)), sconce(iso(11.4, 0, 40)), sconce(iso(0, 5.4, 42)), sconce(iso(0, D + 2.2, 42)))
  // pictures on the free stretch of the side wall
  out.push(sidePicture(6, 7.8, 30, 48,
    '<rect x="2" y="2" width="{w}" height="{h}" fill="#BFE0F0"/><path d="M2 {h} l9 -10 l6 6 l5 -4 l8 8 Z" transform="translate(0,2)" fill="#6FA35E"/><circle cx="24" cy="8" r="3" fill="#FFD36B"/>'))
  out.push(sidePicture(D + 6, D + 7.6, 30, 46,
    '<rect x="2" y="2" width="{w}" height="{h}" fill="#F2D9C4"/><circle cx="16" cy="13" r="6" fill="#D97757"/><rect x="8" y="20" width="16" height="2" fill="#A27552"/>'))
  return out.join('')
}
