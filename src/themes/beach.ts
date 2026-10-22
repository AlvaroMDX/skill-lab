import type { Station, ThemeModule } from '../scene'
import { agentSpotsAt, bob, boxT, columns, r, T, withSpares } from '../scene'

// Placeholder furniture (two rows of tables) until the theme gets its own.
export const beach: ThemeModule = {
  floor: '#EED9A4',
  furnish(room) {
    let s = ''
    const stations: Station[] = []
    for (const t of [2.4, 4.8]) {
      s += boxT(room, room.x0 + 1, t, t + 0.8, 0, room.x1 - room.x0 - 2.4, 12, '#C49A6C')
      for (const x of columns(room, 1.4, 1.6)) stations.push({ x, y: T(room, t + 1.25), kind: 'beach' })
    }
    return { svg: s, stations: withSpares(room, stations, 'beach'), agentSpots: agentSpotsAt(room, 1.3) }
  },
  work: seed => ({ move: bob(1.6, 1.5, r((seed % 14) / 10)), extra: '' }),
}
