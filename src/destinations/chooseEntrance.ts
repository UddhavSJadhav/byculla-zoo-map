import type { Position } from 'geojson'
import type { EntranceRecord } from '../entrances/types.ts'
import type { RouteSegment, WalkingGraph } from '../routing/graph.ts'
import { destinationReadiness, type DestinationReadiness } from './readiness.ts'

export function chooseEntrance(input: {
  entrances: readonly EntranceRecord[]
  status: Parameters<typeof destinationReadiness>[0]['status']
  geometry: Parameters<typeof destinationReadiness>[0]['geometry']
  start: Position | null
  graph: WalkingGraph
  network?: readonly RouteSegment[]
  snapMaxMeters?: number
}): { entrance: EntranceRecord | null; readiness: DestinationReadiness } {
  if (input.entrances.length === 0) {
    return {
      entrance: null,
      readiness: destinationReadiness({
        status: input.status,
        geometry: input.geometry,
        entrance: null,
        start: input.start,
        graph: input.graph,
        network: input.network,
        snapMaxMeters: input.snapMaxMeters,
      }),
    }
  }
  const ranked = input.entrances.map((entrance) => ({
    entrance,
    readiness: destinationReadiness({
      status: input.status,
      geometry: input.geometry,
      entrance,
      start: input.start,
      graph: input.graph,
      network: input.network,
      snapMaxMeters: input.snapMaxMeters,
    }),
  }))
  const ready = ranked
    .filter((item) => item.readiness.state === 'ready')
    .sort((left, right) => {
      if (left.readiness.state !== 'ready' || right.readiness.state !== 'ready') return 0
      return left.readiness.distanceMeters - right.readiness.distanceMeters
    })
  if (ready[0]) return ready[0]
  const waiting = ranked.find((item) => item.readiness.state === 'start-not-chosen')
  if (waiting) return waiting
  const preference = ['no-route', 'entrance-not-connected', 'entrance-not-verified', 'unavailable'] as const
  for (const state of preference) {
    const match = ranked.find((item) => item.readiness.state === state)
    if (match) return match
  }
  return ranked[0] ?? { entrance: null, readiness: { state: 'entrance-not-mapped' } }
}
