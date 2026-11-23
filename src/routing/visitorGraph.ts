import { subscribePaths, visitorPaths } from '@/paths/store'
import { buildWalkingGraph, cachedGraph, type WalkingGraph } from './graph.ts'
import { shortestWalk } from './route.ts'

const readVisitorGraph = cachedGraph(
  () =>
    visitorPaths().map((path) => ({
      id: path.osmFeatureId,
      status: path.status,
      coordinates: path.geometry.coordinates,
    })),
  subscribePaths,
)

export function visitorWalkingGraph(): WalkingGraph {
  return readVisitorGraph()
}

export { buildWalkingGraph, shortestWalk }
export type { RouteResult, WalkingRoute } from './route.ts'
export type { NetworkStructure, RouteSegment, WalkingGraph } from './graph.ts'
