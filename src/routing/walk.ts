import type { LineString, Position } from 'geojson'
import { haversineMeters, nodeKey } from './distance.ts'
import { buildWalkingGraph, type RouteSegment, type WalkingGraph } from './graph.ts'
import { shortestWalk } from './route.ts'
import { gpsSnapMaxMeters, snapGpsToVisitorNetwork, type GpsSnap } from './snap.ts'

export const routeRecalcMeters = 8
export const routeRecalcQuietMeters = 3
export const routeRecalcQuietMs = 4000

export type VisitorWalk =
  | { ok: true; geometry: LineString; distanceMeters: number; pathIds: string[]; snapMeters: number; snap: Position }
  | { ok: false; reason: 'gps-unavailable' | 'not-connected' | 'no-route' | 'entrance-not-on-network' }

export interface RouteFix {
  at: number
  position: Position
}

export interface RouteDisplay {
  geometry: LineString | null
  distanceMeters: number | null
  destinationName: string | null
  message: string
  camera: 'none' | 'route' | 'position'
}

export function planVisitorWalk(input: {
  gps: Position | null
  entrance: Position | null
  segments: readonly RouteSegment[]
  maxMeters?: number
}): VisitorWalk {
  if (!input.gps) return { ok: false, reason: 'gps-unavailable' }
  if (!input.entrance) return { ok: false, reason: 'entrance-not-on-network' }
  const graph = buildWalkingGraph(input.segments)
  const endKey = nodeKey(input.entrance)
  if (!endKey || !graph.nodes.has(endKey)) return { ok: false, reason: 'entrance-not-on-network' }
  const snap = snapGpsToVisitorNetwork(input.gps, input.segments, input.maxMeters ?? gpsSnapMaxMeters)
  if (!snap) return { ok: false, reason: 'not-connected' }
  const network = routeFromSnap(graph, snap, input.entrance)
  if (!network) return { ok: false, reason: 'no-route' }
  return {
    ok: true,
    geometry: prepend(input.gps, network.geometry),
    distanceMeters: snap.distanceMeters + network.distanceMeters,
    pathIds: network.pathIds,
    snapMeters: snap.distanceMeters,
    snap: snap.point,
  }
}

export function shouldRecalculateRoute(previous: RouteFix | null, next: Position, now: number): boolean {
  if (!previous) return true
  const moved = haversineMeters(previous.position, next)
  if (moved >= routeRecalcMeters) return true
  return now - previous.at >= routeRecalcQuietMs && moved >= routeRecalcQuietMeters
}

export function emptyRouteDisplay(): RouteDisplay {
  return { geometry: null, distanceMeters: null, destinationName: null, message: '', camera: 'none' }
}

export function showRoute(name: string, walk: VisitorWalk): RouteDisplay {
  if (!walk.ok) {
    return { geometry: null, distanceMeters: null, destinationName: name, message: walkFailure(walk.reason), camera: 'none' }
  }
  return {
    geometry: walk.geometry,
    distanceMeters: walk.distanceMeters,
    destinationName: name,
    message: routeMessage(name, walk.distanceMeters),
    camera: 'route',
  }
}

export function updateRoute(current: RouteDisplay, walk: VisitorWalk, recalculate: boolean): RouteDisplay {
  if (!recalculate) return { ...current, camera: 'none' }
  if (!walk.ok) {
    return { geometry: null, distanceMeters: null, destinationName: current.destinationName, message: walkFailure(walk.reason), camera: 'none' }
  }
  return {
    geometry: walk.geometry,
    distanceMeters: walk.distanceMeters,
    destinationName: current.destinationName,
    message: routeMessage(current.destinationName ?? 'Destination', walk.distanceMeters),
    camera: 'none',
  }
}

export function cancelRoute(hasPosition: boolean): RouteDisplay {
  return {
    geometry: null,
    distanceMeters: null,
    destinationName: null,
    message: 'Route cancelled.',
    camera: hasPosition ? 'position' : 'none',
  }
}

export function focusRoutePosition(current: RouteDisplay, hasPosition: boolean): RouteDisplay {
  if (!hasPosition) {
    return { ...current, message: 'Current GPS position is not available.', camera: 'none' }
  }
  return { ...current, camera: 'position' }
}

function routeFromSnap(graph: WalkingGraph, snap: GpsSnap, end: Position): { geometry: LineString; distanceMeters: number; pathIds: string[] } | null {
  const snapKey = nodeKey(snap.point)
  if (snapKey && graph.nodes.has(snapKey)) {
    const direct = shortestWalk(graph, snap.point, end)
    if (!direct.ok) return null
    return { geometry: direct.geometry, distanceMeters: direct.distanceMeters, pathIds: direct.pathIds }
  }
  const choices = [snap.from, snap.to].flatMap((endpoint) => {
    const route = shortestWalk(graph, endpoint, end)
    if (!route.ok) return []
    const pathIds = route.pathIds[0] === snap.pathId ? route.pathIds : [snap.pathId, ...route.pathIds]
    return [{ geometry: prepend(snap.point, route.geometry), distanceMeters: haversineMeters(snap.point, endpoint) + route.distanceMeters, pathIds }]
  })
  choices.sort((left, right) => left.distanceMeters - right.distanceMeters)
  return choices[0] ?? null
}

function prepend(point: Position, line: LineString): LineString {
  const coordinates: Position[] = []
  const add = (position: Position) => {
    const last = coordinates[coordinates.length - 1]
    if (last && same(last, position)) return
    coordinates.push([Number(position[0]), Number(position[1])])
  }
  add(point)
  for (const position of line.coordinates) add(position)
  const first = coordinates[0]
  if (coordinates.length === 1 && first) coordinates.push(first)
  return { type: 'LineString', coordinates }
}

function same(left: Position, right: Position): boolean {
  return Number(left[0]) === Number(right[0]) && Number(left[1]) === Number(right[1])
}

function routeMessage(name: string, distanceMeters: number): string {
  return `${name}. Walking distance ${Math.round(distanceMeters)} m.`
}

function walkFailure(reason: Exclude<VisitorWalk, { ok: true }>['reason']): string {
  if (reason === 'gps-unavailable') return 'GPS is unavailable. No route is drawn.'
  if (reason === 'not-connected') return 'GPS is not connected to the visitor network. No route is drawn.'
  if (reason === 'no-route') return 'No continuous route available. No route is drawn.'
  return 'The entrance is not an exact point on a visitor-accessible path. No route is drawn.'
}
