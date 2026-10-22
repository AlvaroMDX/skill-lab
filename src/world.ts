import { WORLD } from './labs'
import { H, floorQuad, iso, pts, r } from './scene'

// What surrounds the building, chosen in Ajustes (labs.ts WORLDS). Every world keeps the same two walking lanes:
// the near one (STREET_NEAR, skills strolling) and the far one (STREET_FAR, idle robots), so only the scenery changes.

// Ground under everything: the street and whatever lies around the building.
export function worldGround(W: number, _viewW: number, _viewH: number) {
  switch (WORLD) {
    default:
      return cityGround(W)
  }
}

// Props drawn in front of the building, plus the light each one casts at night (shown through the dark shade).
export function worldProps(W: number): { svg: string; lamps: string[] } {
  switch (WORLD) {
    default:
      return streetLamps(W)
  }
}

// Weather or sky effects above the characters (snowfall, stars…).
export function worldOverlay(_W: number, _viewW: number, _viewH: number) {
  return ''
}

function cityGround(W: number) {
  const sx0 = -4
  const sx1 = W + 4
  let s = floorQuad(sx0, H + 0.2, sx1, H + 1.9, '#B9B2A6') + floorQuad(sx0, H + 1.9, sx1, H + 4.4, '#4A4743') + floorQuad(sx0, H + 4.4, sx1, H + 5.8, '#B9B2A6')
  let dashes = ''
  for (let x = sx0; x < sx1; x += 2) dashes += `M${pts([iso(x, H + 3.15)])}L${pts([iso(x + 1, H + 3.15)])}`
  s += `<path d="${dashes}" stroke="#E8DFA8" stroke-width="2" pointer-events="none"/>`
  let curb = ''
  for (let x = sx0; x < sx1; x += 1) curb += `M${pts([iso(x, H + 0.2)])}L${pts([iso(x, H + 1.9)])}M${pts([iso(x, H + 4.4)])}L${pts([iso(x, H + 5.8)])}`
  return s + `<path d="${curb}" stroke="#000" stroke-opacity=".08" pointer-events="none"/>`
}

function streetLamps(W: number) {
  let svg = ''
  const lamps: string[] = []
  for (let x = 2; x < W; x += 6) {
    const [lx, ly] = iso(x, H + 0.55)
    svg += `<rect x="${r(lx - 1.2)}" y="${r(ly - 62)}" width="2.4" height="62" fill="#3B3F46"/><rect x="${r(lx - 1.2)}" y="${r(ly - 64)}" width="12" height="2.4" fill="#3B3F46"/><rect x="${r(lx + 7)}" y="${r(ly - 63)}" width="7" height="5" fill="#57534E"/>`
    lamps.push(
      `<g class="lamp-light" pointer-events="none"><circle cx="${r(lx + 10.5)}" cy="${r(ly - 57)}" r="22" fill="url(#lamp)"/><rect x="${r(lx + 7.5)}" y="${r(ly - 58.5)}" width="6" height="2" fill="#FFF1C2"/>` +
        `<ellipse cx="${r(lx + 10)}" cy="${r(ly + 4)}" rx="34" ry="14" fill="url(#lamp)"/></g>`,
    )
  }
  return { svg, lamps }
}
