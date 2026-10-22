import type { RoomGeom } from './scene'

// Seasonal dressing for the whole lab (Halloween, Navidad, verano…). 'auto' picks by date, 'off' shows nothing.
export const SEASONS = ['auto', 'off'] as const

// Decorations drawn after the rooms and the street, before the characters. Empty for now.
export function seasonDecor(_rooms: RoomGeom[], _W: number, _now: number, _season: string) {
  return ''
}
