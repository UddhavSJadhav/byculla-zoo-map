import type { Position } from 'geojson'
import type { AttractionGeometry, AttractionStatus } from '../attractions/types.ts'
import { entranceReadiness } from '../entrances/connection.ts'
import type { EntranceRecord } from '../entrances/types.ts'
import type { WalkingGraph } from '../routing/graph.ts'
import { shortestWalk } from '../routing/route.ts'

export type DestinationReadiness =
  | { state: 'unavailable'; reason: 'closed' | 'no-geometry' }
  | { state: 'entrance-not-mapped' }
  | { state: 'entrance-not-verified' }
  | { state: 'entrance-not-connected'; reason: 'no-accessible-paths' | 'off-network' }
  | { state: 'start-not-chosen' }
  | { state: 'no-route'; reason: 'start-not-on-network' | 'no-route' }
  | { state: 'ready'; distanceMeters: number; pathIds: string[] }

export function destinationReadiness(input: {
  status: AttractionStatus
  geometry: AttractionGeometry | null
  entrance: Pick<EntranceRecord, 'coordinates' | 'verified'> | null
  start: Position | null
  graph: WalkingGraph
}): DestinationReadiness {
  if (input.status === 'closed') return { state: 'unavailable', reason: 'closed' }
  if (!input.geometry) return { state: 'unavailable', reason: 'no-geometry' }
  const entrance = entranceReadiness(input.entrance, input.graph)
  if (entrance.state === 'missing') return { state: 'entrance-not-mapped' }
  if (entrance.state === 'unverified') return { state: 'entrance-not-verified' }
  if (entrance.state !== 'route-ready' || !input.entrance) {
    return { state: 'entrance-not-connected', reason: entrance.state === 'not-connected' ? entrance.reason : 'off-network' }
  }
  if (!input.start) return { state: 'start-not-chosen' }
  const route = shortestWalk(input.graph, input.start, input.entrance.coordinates)
  if (!route.ok) {
    if (route.reason === 'end-not-on-network') return { state: 'entrance-not-connected', reason: 'off-network' }
    return { state: 'no-route', reason: route.reason === 'start-not-on-network' ? 'start-not-on-network' : 'no-route' }
  }
  return { state: 'ready', distanceMeters: route.distanceMeters, pathIds: route.pathIds }
}

export function destinationStatusLabel(readiness: DestinationReadiness): string {
  if (readiness.state === 'unavailable') return 'Destination unavailable'
  if (readiness.state === 'entrance-not-mapped') return 'Entrance not mapped'
  if (readiness.state === 'entrance-not-verified') return 'Entrance not verified'
  if (readiness.state === 'entrance-not-connected') return 'Entrance not connected to an accessible path'
  if (readiness.state === 'start-not-chosen') return 'Starting point needed'
  if (readiness.state === 'no-route') return 'No continuous route available'
  return 'Ready for navigation'
}

export function destinationStatusDetail(readiness: DestinationReadiness): string {
  if (readiness.state === 'unavailable' && readiness.reason === 'closed') return 'This attraction is closed. Its record is still kept.'
  if (readiness.state === 'unavailable') return 'This attraction has no mapped location.'
  if (readiness.state === 'entrance-not-mapped') return 'No visitor entrance has been recorded. The exhibit shape is not used as an entrance.'
  if (readiness.state === 'entrance-not-verified') return 'An entrance is recorded, and it has not been verified.'
  if (readiness.state === 'entrance-not-connected' && readiness.reason === 'no-accessible-paths') {
    return 'No visitor-accessible walking path has been marked.'
  }
  if (readiness.state === 'entrance-not-connected') return 'This entrance does not meet a visitor-accessible walking path.'
  if (readiness.state === 'start-not-chosen') return 'The entrance is on a visitor-accessible path. Choose your current GPS position before a route can be checked.'
  if (readiness.state === 'no-route' && readiness.reason === 'start-not-on-network') {
    return 'Your position is not on a visitor-accessible path, so no route is available.'
  }
  if (readiness.state === 'no-route') return 'The visitor-accessible paths do not connect your position to this entrance.'
  return `A connected walk of ${Math.round(readiness.distanceMeters)} m is available. Turn-by-turn directions are not shown.`
}
