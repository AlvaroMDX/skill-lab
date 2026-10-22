import type { RoomGeom } from './scene'

// Floor pattern for a room (planks, tiles, carpet…), drawn over its base colour `fill`.
// null keeps the generic tile grid and checker.
export function floorDecor(_room: RoomGeom, _fill: string): string | null {
  return null
}

// Details on the back and side walls (wainscot, rails, sconces…), drawn before the windows.
export function wallDecor(_W: number) {
  return ''
}
