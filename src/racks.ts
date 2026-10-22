import type { Lab } from './labs'
import type { RoomGeom, ServiceStatus } from './scene'

// The puesto's deployed services as server racks with a status light (green up, red down). Empty for now.
export function racks(_room: RoomGeom, _lab: Lab, _status: Record<string, ServiceStatus>) {
  return ''
}
