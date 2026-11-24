import type { Position } from 'geojson'
import type { RouteSegment } from './graph.ts'
import { haversineMeters } from './distance.ts'

/** Furthest a GPS fix may move to join a visitor-accessible path. */
export const gpsSnapMaxMeters = 15

export interface GpsSnap {
  point: Position
  distanceMeters: number
  pathId: string
  from: Position
  to: Position
}

export function snapGpsToVisitorNetwork(
  gps: Position,
  segments: readonly RouteSegment[],
  maxMeters = gpsSnapMaxMeters,
): GpsSnap | null {
  const accessible = segments.filter((segment) => segment.status === 'accessible')
  const blocked = segments.filter((segment) => segment.status !== 'accessible')
  let best: GpsSnap | null = null
  for (const segment of accessible) {
    for (let index = 1; index < segment.coordinates.length; index += 1) {
      const from = segment.coordinates[index - 1]
      const to = segment.coordinates[index]
      if (!from || !to) continue
      const candidate = project(gps, from, to, segment.id)
      if (!candidate || candidate.distanceMeters > maxMeters) continue
      if (crossesBlocked(gps, candidate.point, blocked)) continue
      if (!best || candidate.distanceMeters < best.distanceMeters) best = candidate
    }
  }
  return best
}

function project(gps: Position, from: Position, to: Position, pathId: string): GpsSnap | null {
  const originLat = Number(gps[1])
  const metersPerLat = 111132
  const metersPerLon = 111320 * Math.cos((originLat * Math.PI) / 180)
  if (!Number.isFinite(metersPerLon) || Math.abs(metersPerLon) < 1) return null
  const ax = (Number(from[0]) - Number(gps[0])) * metersPerLon
  const ay = (Number(from[1]) - Number(gps[1])) * metersPerLat
  const bx = (Number(to[0]) - Number(gps[0])) * metersPerLon
  const by = (Number(to[1]) - Number(gps[1])) * metersPerLat
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (-ax * dx + -ay * dy) / lengthSquared))
  const endpoint = t <= 0 ? from : t >= 1 ? to : null
  const point = endpoint
    ? ([Number(endpoint[0]), Number(endpoint[1])] as Position)
    : ([Number(gps[0]) + ((ax + t * dx) / metersPerLon), Number(gps[1]) + ((ay + t * dy) / metersPerLat)] as Position)
  return { point, distanceMeters: haversineMeters(gps, point), pathId, from: [Number(from[0]), Number(from[1])], to: [Number(to[0]), Number(to[1])] }
}

function crossesBlocked(gps: Position, snap: Position, blocked: readonly RouteSegment[]): boolean {
  for (const segment of blocked) {
    for (let index = 1; index < segment.coordinates.length; index += 1) {
      const from = segment.coordinates[index - 1]
      const to = segment.coordinates[index]
      if (!from || !to) continue
      if (interiorIntersection(gps, snap, from, to)) return true
    }
  }
  return false
}

function interiorIntersection(a: Position, b: Position, c: Position, d: Position): boolean {
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  if (o1 * o2 < 0 && o3 * o4 < 0) return true
  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) return overlapsInterior(a, b, c, d)
  return false
}

function orient(a: Position, b: Position, c: Position): number {
  const value = (Number(b[0]) - Number(a[0])) * (Number(c[1]) - Number(a[1])) - (Number(b[1]) - Number(a[1])) * (Number(c[0]) - Number(a[0]))
  if (Math.abs(value) < 1e-12) return 0
  return value > 0 ? 1 : -1
}

function overlapsInterior(a: Position, b: Position, c: Position, d: Position): boolean {
  const horizontal = Math.abs(Number(b[0]) - Number(a[0])) >= Math.abs(Number(b[1]) - Number(a[1]))
  const start = Math.min(axis(a, horizontal), axis(b, horizontal))
  const end = Math.max(axis(a, horizontal), axis(b, horizontal))
  const otherStart = Math.min(axis(c, horizontal), axis(d, horizontal))
  const otherEnd = Math.max(axis(c, horizontal), axis(d, horizontal))
  const overlap = Math.min(end, otherEnd) - Math.max(start, otherStart)
  return overlap > 1e-9
}

function axis(position: Position, horizontal: boolean): number {
  return Number(horizontal ? position[0] : position[1])
}
