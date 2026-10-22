import type { Station, ThemeModule } from '../scene'
import { agentSpotsAt, bob, boxT, columns, r, T, withSpares } from '../scene'

// Placeholder furniture (two rows of tables) until the theme gets its own.
export const casino: ThemeModule = {
  floor: '#2F5D46',
  furnish(room) {
    let s = ''
    const stations: Station[] = []
    for (const t of [2.4, 4.8]) {
      s += boxT(room, room.x0 + 1, t, t + 0.8, 0, room.x1 - room.x0 - 2.4, 12, '#7A2E2E')
      for (const x of columns(room, 1.4, 1.6)) stations.push({ x, y: T(room, t + 1.25), kind: 'casino' })
    }
    return { svg: s, stations: withSpares(room, stations, 'casino'), agentSpots: agentSpotsAt(room, 1.3) }
  },
  work: seed => ({ move: bob(1.6, 1.5, r((seed % 14) / 10)), extra: '' }),
}
