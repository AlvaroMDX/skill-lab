import type { RoomGeom, Station, ThemeModule } from '../scene'
import { boxT, columns, hash, iso, poly, r, shade, spanY, T, withSpares } from '../scene'

const LEAF = '#5E9E45'
const LEAF_DARK = '#3F7A34'
const TERRACOTTA = '#C4693F'
const SOIL = '#5A3C26'
const BLOOMS = ['#F2709B', '#FFD24F', '#F4F1EA', '#B58CE8', '#FF8A4F']
const BED_Z = 10
// a gardener stands this far in front of the bed, on the side that faces the viewer in both rows
const GAP = 0.45
const BED_DEPTH = 0.8

// t of the side of [ta, tb] nearest to the viewer, pushed out by gap: rows below see the far wall up front
const nearT = (room: RoomGeom, ta: number, tb: number, gap: number) => (room.top ? tb + gap : ta - gap)

// a terracotta pot with a leafy tuft, optionally in bloom; (cx, cy) is the pot's base on screen
function pot(cx: number, cy: number, k: number) {
  const bloom = BLOOMS[k % BLOOMS.length]!
  let s = `<path d="M${r(cx - 4)} ${r(cy - 6)} h8 l-1.2 6 h-5.6 z" fill="${TERRACOTTA}"/><rect x="${r(cx - 4.6)}" y="${r(cy - 7.4)}" width="9.2" height="2" fill="${shade(TERRACOTTA, 0.8)}"/><rect x="${r(cx + 1.6)}" y="${r(cy - 5.4)}" width="1.6" height="5" fill="#000" opacity=".12"/>`
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
      `<rect x="${r(cx - 3.5)}" y="${r(cy - 11)}" width="3" height="3" fill="#E2463A"/><rect x="${r(cx + 1)}" y="${r(cy - 14)}" width="3" height="3" fill="${k % 2 ? '#E2463A' : '#F2A23A'}"/><rect x="${r(cx - 3)}" y="${r(cy - 11)}" width="1" height="1" fill="#FFF" opacity=".5"/>`
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
    const parts: { t: number; svg: string }[] = []
    const w = room.x1 - room.x0
    // stepping stones down the side aisle the gardeners walk along
    let path = ''
    for (let k = 0; k < 6; k++) {
      const [sx, sy] = iso(room.x0 + 0.55 + (k % 2) * 0.12, T(room, 1.6 + k * 0.95))
      path += `<ellipse cx="${r(sx)}" cy="${r(sy)}" rx="7" ry="3.4" fill="#A8977A"/><ellipse cx="${r(sx)}" cy="${r(sy - 0.8)}" rx="6" ry="2.6" fill="#BCAD92"/>`
    }
    // potting shelf on the far wall; up front in a row below it keeps a single low level so it hides nothing
    {
      const shelfY = spanY(room, 0.1, 0.65)
      const front = room.top ? shelfY.y + shelfY.d : shelfY.y
      const levels = room.top ? [0, 12, 22] : [0]
      let s = ''
      for (const x of [room.x0 + 0.35, room.x1 - 0.45]) s += boxT(room, x, 0.1, 0.2, 0, 0.1, room.top ? 24 : 4, '#6E4A30')
      for (const z of levels) s += boxT(room, room.x0 + 0.3, 0.1, 0.65, z, w - 0.6, z ? 1.6 : 2, z ? '#8A5A3B' : '#7A5136')
      let k = hash(room.id)
      for (const z of levels.map(l => l + 2 - (l ? 0.4 : 0))) {
        for (let x = room.x0 + 0.75; x < room.x1 - 0.5; x += 0.62, k++) {
          const [cx, cy] = iso(x, front - (room.top ? 0.2 : -0.2), z)
          s += pot(cx, cy, k)
        }
      }
      parts.push({ t: 0.1, svg: s })
    }
    // raised beds: wooden frame, soil and plants in two lines, the gardeners on the viewer's side
    const stations: Station[] = []
    ;[2.0, 5.2].forEach((t, bed) => {
      let s = boxT(room, room.x0 + 1, t, t + BED_DEPTH, 0, w - 2.4, BED_Z, '#8A5A3B')
      const { y, d } = spanY(room, t + 0.08, t + BED_DEPTH - 0.08)
      s += poly([iso(room.x0 + 1.08, y, BED_Z), iso(room.x1 - 1.48, y, BED_Z), iso(room.x1 - 1.48, y + d, BED_Z), iso(room.x0 + 1.08, y + d, BED_Z)], SOIL)
      // plank seams on the visible side
      const fy = room.top ? T(room, t + BED_DEPTH) : T(room, t)
      s += `<path d="M${r(iso(room.x0 + 1, fy, 5)[0])} ${r(iso(room.x0 + 1, fy, 5)[1])}L${r(iso(room.x1 - 1.4, fy, 5)[0])} ${r(iso(room.x1 - 1.4, fy, 5)[1])}" stroke="#6E4A30" stroke-width="1"/>`
      // the far line of plants first, the near one over it
      for (const line of room.top ? [0.25, 0.55] : [0.55, 0.25]) {
        let n = bed * 7 + (line > 0.4 ? 3 : 0)
        for (let x = room.x0 + 1.3; x < room.x1 - 1.6; x += 0.5, n++) {
          const [cx, cy] = iso(x + (line > 0.4 ? 0.2 : 0), T(room, t + line), BED_Z)
          s += bedPlant(cx, cy, n, bed === 1)
        }
      }
      if (active) {
        // overhead sprinklers mist the beds while someone works, the drops land on the soil
        for (let j = 0; j < 4; j++) {
          const [dx, dy] = iso(room.x0 + 1.5 + j * ((w - 3) / 3), T(room, t + 0.4), 40)
          const b = r(((j * 7 + bed * 3) % 10) / 10)
          s += `<rect x="${r(dx - 0.6)}" y="${r(dy)}" width="1.2" height="3" fill="#7FD0FF" opacity="0" pointer-events="none"><animate attributeName="y" values="${r(dy)};${r(dy + 40 - BED_Z - 3)}" dur=".9s" begin="${b}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.9;.9;0" keyTimes="0;.2;.85;1" dur=".9s" begin="${b}s" repeatCount="indefinite"/></rect>`
        }
      }
      for (const x of columns(room, 1.4, 1.6)) stations.push({ x, y: T(room, nearT(room, t, t + BED_DEPTH, GAP)), kind: 'greenhouse' })
      parts.push({ t, svg: s })
    })
    // a lemon tree in a big pot and a watering can by the door
    {
      const [tx, ty] = iso(room.x0 + 0.55, T(room, 6.7))
      let s = `<ellipse cx="${r(tx + 2)}" cy="${r(ty)}" rx="9" ry="3.4" fill="#000" opacity=".15"/><path d="M${r(tx - 7)} ${r(ty - 12)} h14 l-2 12 h-10 z" fill="${TERRACOTTA}"/><rect x="${r(tx - 8)}" y="${r(ty - 14)}" width="16" height="3" fill="${shade(TERRACOTTA, 0.8)}"/><rect x="${r(tx + 3)}" y="${r(ty - 11)}" width="3" height="10" fill="#000" opacity=".1"/>`
      s += `<rect x="${r(tx - 1)}" y="${r(ty - 26)}" width="2.4" height="13" fill="#7A5136"/><circle cx="${r(tx)}" cy="${r(ty - 33)}" r="11" fill="${LEAF_DARK}"/><circle cx="${r(tx - 3)}" cy="${r(ty - 36)}" r="7" fill="${LEAF}"/>`
      for (const [lx, ly] of [[-5, -30], [4, -35], [2, -27], [-1, -40]] as const) s += `<rect x="${r(tx + lx)}" y="${r(ty + ly)}" width="3" height="3" fill="#FFE34F"/>`
      const [cx, cy] = iso(room.x1 - 1.0, T(room, 6.6))
      s += `<ellipse cx="${r(cx + 2)}" cy="${r(cy)}" rx="8" ry="2.6" fill="#000" opacity=".15"/><rect x="${r(cx - 5)}" y="${r(cy - 9)}" width="10" height="9" fill="${lab.accent}"/><rect x="${r(cx - 5)}" y="${r(cy - 9)}" width="10" height="2" fill="${shade(lab.accent, 1.3)}"/><rect x="${r(cx + 2)}" y="${r(cy - 7)}" width="3" height="7" fill="#000" opacity=".12"/>` +
        `<path d="M${r(cx + 5)} ${r(cy - 3)} l7 -8" stroke="${shade(lab.accent, 0.75)}" stroke-width="2"/><rect x="${r(cx + 10)}" y="${r(cy - 13)}" width="4" height="3" fill="${shade(lab.accent, 0.75)}"/>` +
        `<path d="M${r(cx - 4)} ${r(cy - 9)} q4 -7 8 0" stroke="${shade(lab.accent, 0.75)}" stroke-width="1.8" fill="none"/>`
      parts.push({ t: 6.7, svg: s })
    }
    parts.sort((a, b) => (room.top ? a.t - b.t : b.t - a.t))
    // the robots wait in the aisle between the beds and the door, clear of the gardeners
    const spotT = room.top ? 1.2 : 6.6
    return { svg: path + parts.map(p => p.svg).join(''), stations: withSpares(room, stations, 'greenhouse'), agentSpots: [0, 1, 2].map(k => ({ x: room.x0 + 1.9 + k * 1.4, y: T(room, spotT) })).filter(p => p.x < room.x1 - 1) }
  },
  // watering: leans in, raises the can over the bed behind and tips it; the drops land on the soil, where a sprout grows and flowers
  work(seed, accent) {
    const b = r((seed % 17) / 10)
    const dur = r(3.6 + (seed % 5) * 0.2)
    const keys = `keyTimes="0;.18;.62;.8;1" keySplines=".4 0 .6 1;0 0 1 1;.4 0 .6 1;0 0 1 1" calcMode="spline" dur="${dur}s" begin="${b}s" repeatCount="indefinite"`
    const lean = `<animateTransform attributeName="transform" type="rotate" values="0;4;4;0;0" ${keys}/>`
    // a spot on the soil behind the gardener: across the gap to the middle of the bed, then a bit along it
    const along = 0.4
    const soilX = r((GAP + BED_DEPTH / 2 + along) * 18)
    const soilY = r((-(GAP + BED_DEPTH / 2) + along) * 9 - BED_Z)
    // the rose of the tipped can, measured from the can drawn below
    const tip = { x: 26, y: -26 }
    const arm = `<path d="M12.5 -10 L13 -23" stroke="#2A211C" stroke-width="3.4"/><path d="M12.5 -10.5 L13 -22.5" stroke="${accent}" stroke-width="2"/>`
    const can =
      `<g transform="translate(10,-30)"><g><animateTransform attributeName="transform" type="rotate" values="0;30;30;0;0" ${keys}/>` +
      `<rect x="0" y="-1" width="8" height="7" fill="${accent}" stroke="#2A211C" stroke-width=".6"/><rect x="0" y="-1" width="8" height="1.6" fill="${shade(accent, 1.3)}"/><rect x="5.6" y="0.6" width="2.4" height="5.4" fill="#000" opacity=".15"/>` +
      `<path d="M8 3 l5 -7" stroke="${shade(accent, 0.7)}" stroke-width="1.6"/><rect x="11.6" y="-6.4" width="3" height="2.4" fill="${shade(accent, 0.7)}"/>` +
      `<path d="M1 -1 q3 -5 6 0" stroke="${shade(accent, 0.7)}" stroke-width="1.4" fill="none"/></g></g>`
    // the streams only show while the can is tipped
    const fall = `dur=".4s" repeatCount="indefinite"`
    const drops = [0, 1, 2]
      .map(k => {
        const x0 = tip.x - 1.5 + k * 1.5
        const x1 = soilX - 1.5 + k * 1.5
        const d = `begin="${r(k * 0.13)}s" ${fall}`
        return `<rect x="${r(x0)}" y="${tip.y}" width="1.2" height="2.4" fill="#7FD0FF"><animate attributeName="y" values="${tip.y};${r(soilY - 2)}" ${d}/><animate attributeName="x" values="${r(x0)};${r(x1)}" ${d}/></rect>`
      })
      .join('')
    const pouring = `<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;.2;.24;.62;.66;1" dur="${dur}s" begin="${b}s" repeatCount="indefinite"/>`
    const water = `<g opacity="0" pointer-events="none">${pouring}${drops}<ellipse cx="${soilX}" cy="${soilY}" rx="3.4" ry="1.2" fill="#7FD0FF" opacity=".7"/></g>`
    // the sprout grows over two waterings, then starts again
    const cycle = r(dur * 2)
    const grow = `<animateTransform attributeName="transform" type="scale" values=".15;.15;.6;1;1;.15" keyTimes="0;.1;.4;.6;.92;1" dur="${cycle}s" begin="${b}s" repeatCount="indefinite"/>`
    const sprout =
      `<g transform="translate(${soilX},${soilY})"><g>${grow}<rect x="-0.6" y="-9" width="1.2" height="9" fill="${LEAF_DARK}"/><rect x="-4" y="-6" width="3.4" height="2.6" fill="${LEAF}"/><rect x="0.6" y="-8" width="3.4" height="2.6" fill="${LEAF}"/>` +
      `<g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.55;.6;.92;1" dur="${cycle}s" begin="${b}s" repeatCount="indefinite"/><rect x="-2.5" y="-13" width="5" height="5" fill="${shade(accent, 1.25)}"/><rect x="-0.8" y="-11.3" width="1.6" height="1.6" fill="#FFF3B0"/></g></g></g>`
    return { move: lean, extra: sprout + water + `<g>${lean}${arm}${can}</g>` }
  },
}
