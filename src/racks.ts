import type { Lab } from './labs'
import type { RoomGeom, ServiceStatus } from './scene'
import { box, doorX, esc, iso, r } from './scene'

const WIDE = 0.5
const DEEP = 0.35
const HEIGHT = 24
const STEP = 0.6
const BODY = '#2F333A'
const LED = { up: '#4CD964', down: '#FF3B30', unknown: '#8A8F98' }

type Slot = { x: number; y: number; w: number; d: number; faceRight: boolean }

// Bottom puestos: against the door wall, left of the door, then right of it clear of the entry path.
// Top puestos: the bottom row's hanging signs hide their door wall, so the racks line the back half of the left wall.
function slots(room: RoomGeom, n: number): Slot[] {
  const list: Slot[] = []
  if (room.top) {
    // towards the back of the wall: the front corner holds the plant and theme props (flag, target…)
    for (let y = 3.4; y >= 0.9 && list.length < n; y -= STEP) list.push({ x: room.x0 + 0.12, y: room.y0 + y, w: DEEP, d: WIDE, faceRight: true })
    return list
  }
  const y = room.y0 + 0.08
  for (let x = doorX(room) - 0.75 - WIDE; x >= room.x0 + 0.25 && list.length < n; x -= STEP) list.push({ x, y, w: WIDE, d: DEEP, faceRight: false })
  for (let x = doorX(room) + 0.75; x + WIDE <= room.x1 - 0.85 && list.length < n; x += STEP) list.push({ x, y, w: WIDE, d: DEEP, faceRight: false })
  return list
}

const fmt = (s: ServiceStatus | undefined) =>
  !s ? 'sin comprobar' : s.up ? `en pie (${s.code ?? '?'}, ${s.ms ?? '?'} ms)` : `caído${s.code ? ` (${s.code})` : ''}`

// a group drawn in the plane of the box's left (y + d) or right (x + w) face; local x runs along the face, local y is -z
const onLeft = ({ x, y, d }: Slot, body: string) => {
  const [ox, oy] = iso(x, y + d)
  return `<g transform="matrix(1,0.5,0,1,${r(ox)},${r(oy)})" shape-rendering="crispEdges">${body}</g>`
}
const onRight = ({ x, y, w, d }: Slot, body: string) => {
  const [ox, oy] = iso(x + w, y + d)
  return `<g transform="matrix(1,-0.5,0,1,${r(ox)},${r(oy)})" shape-rendering="crispEdges">${body}</g>`
}

function rack(slot: Slot, name: string, url: string, s: ServiceStatus | undefined) {
  const state = !s ? 'unknown' : s.up ? 'up' : 'down'
  const color = LED[state]
  const blink =
    state === 'up' ? '<animate attributeName="opacity" values="1;.35;1" dur="2.4s" repeatCount="indefinite"/>'
    : state === 'down' ? '<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.5;.5;1" dur=".6s" repeatCount="indefinite"/>'
    : ''
  // front: 9 px wide, server units, status light and a few drive lights
  let front = `<rect x="0.8" y="-23" width="7.4" height="22" fill="#23262C"/>`
  for (const v of [-20, -16, -12, -8, -4]) front += `<rect x="1.5" y="${v}" width="5" height="2" fill="#3A3F47"/><rect x="1.5" y="${v}" width="5" height=".6" fill="#4A515B"/>`
  front += `<g>${blink}<rect x="6" y="-22" width="2.6" height="2.6" fill="${color}" fill-opacity=".35"/><rect x="6.5" y="-21.5" width="1.6" height="1.6" fill="${color}"/></g>`
  for (const v of [-15.6, -11.6, -7.6]) front += `<rect x="7" y="${v}" width=".8" height=".8" fill="#6E7682"/>`
  // side: vents
  let side = ''
  for (let v = -20; v <= -4; v += 3) side += `<rect x="1" y="${v}" width="4.3" height="1" fill="#000" fill-opacity=".3"/>`
  const [lx, ly] = iso(slot.x + slot.w / 2, slot.y + slot.d / 2, HEIGHT + 7)
  return (
    `<g data-service="${esc(name)}" data-up="${state === 'unknown' ? '' : state === 'up' ? '1' : '0'}"><title>${esc(name)} · ${fmt(s)}\n${esc(url)}</title>` +
    box(slot.x, slot.y, 0, slot.w, slot.d, HEIGHT, BODY) +
    (slot.faceRight ? onRight(slot, front) + onLeft(slot, side) : onLeft(slot, front) + onRight(slot, side)) +
    `<text class="rack-name" x="${r(lx)}" y="${r(ly)}" text-anchor="middle">${esc(name)}</text></g>`
  )
}

// The puesto's deployed services as server racks with a status light (green up, red down, grey not checked yet).
export function racks(room: RoomGeom, lab: Lab, status: Record<string, ServiceStatus>) {
  if (!lab.services.length) return ''
  return slots(room, lab.services.length)
    .map((slot, i) => ({ slot, sv: lab.services[i]! }))
    .sort((a, b) => a.slot.x + a.slot.y - (b.slot.x + b.slot.y))
    .map(({ slot, sv }) => rack(slot, sv.name, sv.url, status[sv.url]))
    .join('')
}
