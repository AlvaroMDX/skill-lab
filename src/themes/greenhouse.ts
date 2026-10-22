import type { Station, ThemeModule } from '../scene'
import { agentSpotsAt, boxT, bob, columns, hash, iso, poly, r, shade, spanY, T, withSpares } from '../scene'

const LEAF = '#5E9E45'
const LEAF_DARK = '#3F7A34'
const TERRACOTTA = '#C4693F'
const SOIL = '#5A3C26'
const BLOOMS = ['#F2709B', '#FFD24F', '#F4F1EA', '#B58CE8', '#FF8A4F']

// a terracotta pot with a leafy tuft, optionally in bloom; (cx, cy) is the pot's base on screen
function pot(cx: number, cy: number, k: number) {
  const bloom = BLOOMS[k % BLOOMS.length]!
  let s = `<path d="M${r(cx - 4)} ${r(cy - 6)} h8 l-1.2 6 h-5.6 z" fill="${TERRACOTTA}"/><rect x="${r(cx - 4.6)}" y="${r(cy - 7.4)}" width="9.2" height="2" fill="${shade(TERRACOTTA, 0.8)}"/>`
  s += `<rect x="${r(cx - 4)}" y="${r(cy - 12)}" width="3" height="5" fill="${LEAF}"/><rect x="${r(cx - 1)}" y="${r(cy - 14)}" width="3" height="7" fill="${LEAF_DARK}"/><rect x="${r(cx + 1.6)}" y="${r(cy - 11)}" width="3" height="4" fill="${LEAF}"/>`
  if (k % 3 !== 1) s += `<rect x="${r(cx - 0.4)}" y="${r(cy - 16)}" width="3" height="3" fill="${bloom}"/><rect x="${r(cx + 0.6)}" y="${r(cy - 15)}" width="1" height="1" fill="#FFF3B0"/>`
  return s
}

// a plant growing out of a raised bed: flowers on one bed, tomatoes on stakes on the other
function bedPlant(cx: number, cy: number, k: number, tomato: boolean) {
  if (tomato) {
    return (
      `<rect x="${r(cx - 0.5)}" y="${r(cy - 20)}" width="1" height="20" fill="#B89B6A"/>` +
      `<rect x="${r(cx - 4)}" y="${r(cy - 15)}" width="4" height="7" fill="${LEAF}"/><rect x="${r(cx)}" y="${r(cy - 19)}" width="4" height="8" fill="${LEAF_DARK}"/><rect x="${r(cx - 3)}" y="${r(cy - 8)}" width="6" height="4" fill="${LEAF}"/>` +
      `<rect x="${r(cx - 3.5)}" y="${r(cy - 11)}" width="3" height="3" fill="#E2463A"/>` + (k % 2 ? `<rect x="${r(cx + 1)}" y="${r(cy - 14)}" width="3" height="3" fill="#E2463A"/>` : `<rect x="${r(cx + 1)}" y="${r(cy - 14)}" width="3" height="3" fill="#F2A23A"/>`)
    )
  }
  const bloom = BLOOMS[k % BLOOMS.length]!
  const h = 8 + (k % 3) * 2
  return (
    `<rect x="${r(cx - 0.5)}" y="${r(cy - h)}" width="1" height="${h}" fill="${LEAF_DARK}"/><rect x="${r(cx - 3)}" y="${r(cy - 5)}" width="3" height="3" fill="${LEAF}"/><rect x="${r(cx)}" y="${r(cy - 7)}" width="3" height="3" fill="${LEAF}"/>` +
    `<rect x="${r(cx - 2)}" y="${r(cy - h - 3)}" width="4" height="4" fill="${bloom}"/><rect x="${r(cx - 0.5)}" y="${r(cy - h - 1.5)}" width="1.2" height="1.2" fill="#FFF3B0"/>`
  )
}

export const greenhouse: ThemeModule = {
  floor: '#C9B48A',
  furnish(room, lab, active) {
    let s = ''
    const w = room.x1 - room.x0
    // stepping stones down the middle aisle
    for (let k = 0; k < 6; k++) {
      const [sx, sy] = iso(room.x0 + 0.55 + (k % 2) * 0.12, T(room, 1.6 + k * 0.95))
      s += `<ellipse cx="${r(sx)}" cy="${r(sy)}" rx="7" ry="3.4" fill="#A8977A"/><ellipse cx="${r(sx)}" cy="${r(sy - 0.8)}" rx="6" ry="2.6" fill="#BCAD92"/>`
    }
    // potting shelf along the far wall, two levels of pots
    const shelfY = spanY(room, 0.1, 0.65)
    const front = room.top ? shelfY.y + shelfY.d : shelfY.y
    s += boxT(room, room.x0 + 0.3, 0.1, 0.65, 0, w - 0.6, 2, '#7A5136') + boxT(room, room.x0 + 0.3, 0.1, 0.65, 12, w - 0.6, 1.6, '#8A5A3B')
    for (const x of [room.x0 + 0.35, room.x1 - 0.45]) s += boxT(room, x, 0.1, 0.2, 0, 0.1, 24, '#6E4A30')
    s += boxT(room, room.x0 + 0.3, 0.1, 0.65, 22, w - 0.6, 1.6, '#8A5A3B')
    let k = hash(room.id)
    for (const z of [2, 13.6, 23.6]) {
      for (let x = room.x0 + 0.75; x < room.x1 - 0.5; x += 0.62, k++) {
        const [cx, cy] = iso(x, front - (room.top ? 0.2 : -0.2), z)
        s += pot(cx, cy, k)
      }
    }
    // raised beds: wooden frame, soil and plants in two lines
    const stations: Station[] = []
    ;[2.4, 4.8].forEach((t, bed) => {
      s += boxT(room, room.x0 + 1, t, t + 0.8, 0, w - 2.4, 10, '#8A5A3B')
      const { y, d } = spanY(room, t + 0.08, t + 0.72)
      s += poly([iso(room.x0 + 1.08, y, 10), iso(room.x1 - 1.48, y, 10), iso(room.x1 - 1.48, y + d, 10), iso(room.x0 + 1.08, y + d, 10)], SOIL)
      for (const line of room.top ? [0.25, 0.55] : [0.55, 0.25]) {
        let n = bed * 7 + (line > 0.4 ? 3 : 0)
        for (let x = room.x0 + 1.3; x < room.x1 - 1.6; x += 0.5, n++) {
          const [cx, cy] = iso(x + (line > 0.4 ? 0.2 : 0), T(room, t + line), 10)
          s += bedPlant(cx, cy, n, bed === 1)
        }
      }
      if (active) {
        // overhead sprinklers mist the beds while someone works
        for (let j = 0; j < 4; j++) {
          const [dx, dy] = iso(room.x0 + 1.5 + j * ((w - 3) / 3), T(room, t + 0.4), 34)
          const b = r(((j * 7 + bed * 3) % 10) / 10)
          s += `<rect x="${r(dx - 0.8)}" y="${r(dy)}" width="1.6" height="3" fill="#7FD0FF" opacity="0" pointer-events="none"><animate attributeName="y" values="${r(dy)};${r(dy + 22)}" dur="1s" begin="${b}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.9;0" dur="1s" begin="${b}s" repeatCount="indefinite"/></rect>`
        }
      }
      for (const x of columns(room, 1.4, 1.6)) stations.push({ x, y: T(room, t + 0.8 + 0.45), kind: 'greenhouse' })
    })
    // a lemon tree in a big pot and a watering can by the door
    {
      const [tx, ty] = iso(room.x0 + 0.55, T(room, 6.7))
      s += `<ellipse cx="${r(tx)}" cy="${r(ty)}" rx="8" ry="3" fill="#000" opacity=".15"/><path d="M${r(tx - 7)} ${r(ty - 12)} h14 l-2 12 h-10 z" fill="${TERRACOTTA}"/><rect x="${r(tx - 8)}" y="${r(ty - 14)}" width="16" height="3" fill="${shade(TERRACOTTA, 0.8)}"/>`
      s += `<rect x="${r(tx - 1)}" y="${r(ty - 26)}" width="2.4" height="13" fill="#7A5136"/><circle cx="${r(tx)}" cy="${r(ty - 33)}" r="11" fill="${LEAF_DARK}"/><circle cx="${r(tx - 3)}" cy="${r(ty - 36)}" r="7" fill="${LEAF}"/>`
      for (const [lx, ly] of [[-5, -30], [4, -35], [2, -27], [-1, -40]] as const) s += `<rect x="${r(tx + lx)}" y="${r(ty + ly)}" width="3" height="3" fill="#FFE34F"/>`
      const [cx, cy] = iso(room.x1 - 1.0, T(room, 6.6))
      s += `<ellipse cx="${r(cx)}" cy="${r(cy)}" rx="7" ry="2.6" fill="#000" opacity=".15"/><rect x="${r(cx - 5)}" y="${r(cy - 9)}" width="10" height="9" fill="${lab.accent}"/><rect x="${r(cx - 5)}" y="${r(cy - 9)}" width="10" height="2" fill="${shade(lab.accent, 1.3)}"/>` +
        `<path d="M${r(cx + 5)} ${r(cy - 3)} l7 -8" stroke="${shade(lab.accent, 0.75)}" stroke-width="2"/><rect x="${r(cx + 10)}" y="${r(cy - 13)}" width="4" height="3" fill="${shade(lab.accent, 0.75)}"/>` +
        `<path d="M${r(cx - 4)} ${r(cy - 9)} q4 -7 8 0" stroke="${shade(lab.accent, 0.75)}" stroke-width="1.8" fill="none"/>`
    }
    return { svg: s, stations: withSpares(room, stations, 'greenhouse'), agentSpots: agentSpotsAt(room, 1.3) }
  },
  // watering: the can tilts and pours, and a sprout grows until it flowers
  work(seed, accent) {
    const b = r((seed % 14) / 10)
    const pour = `<animateTransform attributeName="transform" type="rotate" values="0;28;28;0;0" keyTimes="0;.15;.6;.75;1" dur="4s" begin="${b}s" repeatCount="indefinite"/>`
    const can =
      `<g transform="translate(9,-11)"><g>${pour}<rect x="0" y="-1" width="8" height="7" fill="${accent}"/><rect x="0" y="-1" width="8" height="1.6" fill="${shade(accent, 1.3)}"/>` +
      `<path d="M8 3 l6 -5" stroke="${shade(accent, 0.7)}" stroke-width="1.6"/><rect x="13" y="-4" width="3" height="2.4" fill="${shade(accent, 0.7)}"/>` +
      `<path d="M1 -1 q3 -5 6 0" stroke="${shade(accent, 0.7)}" stroke-width="1.4" fill="none"/></g></g>`
    const drops = [0, 0.33, 0.66]
      .map(o => `<rect x="${r(22 + o * 3)}" y="-12" width="1.4" height="2.6" fill="#7FD0FF" opacity="0"><animate attributeName="y" values="-12;-1" dur=".6s" begin="${r(b + 0.7 + o * 0.6)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0" dur=".6s" begin="${r(b + 0.7 + o * 0.6)}s" repeatCount="indefinite"/></rect>`)
      .join('')
    const grow = `<animateTransform attributeName="transform" type="scale" values=".2;.2;1;1;.2" keyTimes="0;.1;.5;.9;1" dur="8s" begin="${b}s" repeatCount="indefinite"/>`
    const sprout =
      `<g transform="translate(23,1)"><g>${grow}<rect x="-0.6" y="-9" width="1.2" height="9" fill="${LEAF_DARK}"/><rect x="-4" y="-6" width="3.4" height="2.6" fill="${LEAF}"/><rect x="0.6" y="-8" width="3.4" height="2.6" fill="${LEAF}"/>` +
      `<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.45;.5;.9;1" dur="8s" begin="${b}s" repeatCount="indefinite"/><rect x="-2.5" y="-13" width="5" height="5" fill="${shade(accent, 1.25)}"/><rect x="-0.8" y="-11.3" width="1.6" height="1.6" fill="#FFF3B0"/></g></g></g>`
    return { move: bob(0.6, 2, b), extra: can + drops + sprout }
  },
}
