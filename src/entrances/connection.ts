import type { Position } from 'geojson'
import { nodeKey } from '../routing/distance.ts'
import type { WalkingGraph } from '../routing/graph.ts'
import type { EntranceRecord } from './types.ts'

export type EntranceConnection = 'no-accessible-paths' | 'off-network' | 'on-network'

export type EntranceReadiness =
  | { state: 'missing' }
  | { state: 'unverified'; connection: EntranceConnection }
  | { state: 'not-connected'; reason: 'no-accessible-paths' | 'off-network' }
  | { state: 'route-ready'; pathIds: string[] }

export function entranceReadiness(
  entrance: Pick<EntranceRecord, 'coordinates' | 'verified'> | null,
  graph: WalkingGraph,
): EntranceReadiness {
  if (!entrance) return { state: 'missing' }
  const connection = connectionFor(entrance.coordinates, graph)
  if (!entrance.verified) return { state: 'unverified', connection }
  if (connection === 'no-accessible-paths') return { state: 'not-connected', reason: 'no-accessible-paths' }
  if (connection === 'off-network') return { state: 'not-connected', reason: 'off-network' }
  return { state: 'route-ready', pathIds: pathIdsAt(entrance.coordinates, graph) }
}

function connectionFor(coordinates: Position, graph: WalkingGraph): EntranceConnection {
  if (graph.includedPathIds.length === 0) return 'no-accessible-paths'
  return pathIdsAt(coordinates, graph).length > 0 ? 'on-network' : 'off-network'
}

function pathIdsAt(coordinates: Position, graph: WalkingGraph): string[] {
  const key = nodeKey(coordinates)
  if (!key || !graph.nodes.has(key)) return []
  const pathIds: string[] = []
  for (const arc of graph.adjacency.get(key) ?? []) {
    if (!pathIds.includes(arc.pathId)) pathIds.push(arc.pathId)
  }
  return pathIds
}

export function entranceStatusText(readiness: EntranceReadiness): string {
  if (readiness.state === 'missing') return 'No entrance has been placed.'
  if (readiness.state === 'unverified') {
    if (readiness.connection === 'on-network') return 'Placed on a visitor-accessible path, but not verified. It is not route-ready.'
    if (readiness.connection === 'no-accessible-paths') return 'Placed, but not verified. Not yet connected. No visitor-accessible walking path has been marked.'
    return 'Placed, but not verified. Not yet connected. This entrance does not meet a visitor-accessible walking path.'
  }
  if (readiness.state === 'route-ready') return 'Verified and on a visitor-accessible path.'
  if (readiness.reason === 'no-accessible-paths') return 'Not yet connected. No visitor-accessible walking path has been marked.'
  return 'Not yet connected. This entrance does not meet a visitor-accessible walking path.'
}

export function sameCoordinate(left: Position, right: Position): boolean {
  return Number(left[0]) === Number(right[0]) && Number(left[1]) === Number(right[1])
}
