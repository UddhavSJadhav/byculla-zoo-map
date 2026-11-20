import type { Geometry, LineString, Point, Polygon, Position } from 'geojson'
import type { DrawGeometry } from '@/map-v2/editor/types'

export type LngLat = [number, number]

const epsilon = 1e-12

export function samePosition(a: Position, b: Position): boolean {
  return Math.abs(Number(a[0]) - Number(b[0])) < 1e-10 && Math.abs(Number(a[1]) - Number(b[1])) < 1e-10
}

export function isLngLat(position: Position): position is LngLat {
  return (
    position.length >= 2 &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    position[0] >= -180 &&
    position[0] <= 180 &&
    position[1] >= -90 &&
    position[1] <= 90
  )
}

export function dedupeConsecutive(points: LngLat[]): LngLat[] {
  const result: LngLat[] = []
  for (const point of points) {
    const previous = result.at(-1)
    if (!previous || !samePosition(previous, point)) result.push([point[0], point[1]])
  }
  return result
}

export function closeRing(points: LngLat[]): LngLat[] {
  if (points.length === 0) return []
  const first = points[0]
  const last = points[points.length - 1]
  return samePosition(first, last) ? points : [...points, first]
}

export function ringArea(ring: LngLat[]): number {
  let sum = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index]
    const [x2, y2] = ring[index + 1]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum / 2)
}

function crosses(a: LngLat, b: LngLat, c: LngLat, d: LngLat): boolean {
  if (samePosition(a, c) || samePosition(a, d) || samePosition(b, c) || samePosition(b, d)) return false
  const orient = (p: LngLat, q: LngLat, r: LngLat) => {
    const value = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    if (Math.abs(value) <= epsilon) return 0
    return value > 0 ? 1 : -1
  }
  return orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b)
}

export function ringCrosses(unique: LngLat[]): boolean {
  const count = unique.length
  if (count < 4) return false
  for (let start = 0; start < count; start += 1) {
    const a = unique[start]
    const b = unique[(start + 1) % count]
    for (let other = start + 1; other < count; other += 1) {
      const c = unique[other]
      const d = unique[(other + 1) % count]
      if (crosses(a, b, c, d)) return true
    }
  }
  return false
}

export function validatePoints(kind: DrawGeometry, points: LngLat[]): string | null {
  if (points.some((point) => !isLngLat(point))) return 'Coordinates must be longitude and latitude.'
  const unique = dedupeConsecutive(points)
  if (kind === 'Point') return unique.length === 1 ? null : 'A point needs one coordinate.'
  if (kind === 'LineString') return unique.length >= 2 ? null : 'A walking path needs at least two points.'
  if (unique.length === 0) return 'A polygon needs at least three corners.'
  const open = samePosition(unique[0], unique[unique.length - 1]) ? unique.slice(0, -1) : unique
  if (open.length < 3) return 'A polygon needs at least three corners.'
  if (ringArea(closeRing(open)) <= epsilon) return 'This polygon has no area.'
  if (ringCrosses(open)) return 'Polygon edges cross. Adjust the corners before saving.'
  return null
}

export function pointGeometry(point: LngLat): Point {
  return { type: 'Point', coordinates: [point[0], point[1]] }
}

export function lineGeometry(points: LngLat[]): LineString {
  return { type: 'LineString', coordinates: dedupeConsecutive(points) }
}

export function polygonGeometry(points: LngLat[]): Polygon {
  const unique = dedupeConsecutive(points)
  const open =
    unique.length > 1 && samePosition(unique[0], unique[unique.length - 1]) ? unique.slice(0, -1) : unique
  return { type: 'Polygon', coordinates: [closeRing(open)] }
}

export function geometryKind(geometry: Geometry | null | undefined): DrawGeometry | null {
  if (!geometry) return null
  if (geometry.type === 'Point' || geometry.type === 'LineString' || geometry.type === 'Polygon') return geometry.type
  return null
}

export function outerVertices(geometry: Geometry): LngLat[] | null {
  if (geometry.type === 'Point') return isLngLat(geometry.coordinates) ? [[geometry.coordinates[0], geometry.coordinates[1]]] : null
  if (geometry.type === 'LineString') {
    if (!geometry.coordinates.every(isLngLat)) return null
    return geometry.coordinates.map((position) => [position[0], position[1]])
  }
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0] ?? []
    if (ring.length < 4 || !ring.every(isLngLat)) return null
    const points = ring.map((position) => [position[0], position[1]] as LngLat)
    return samePosition(points[0], points[points.length - 1]) ? points.slice(0, -1) : points
  }
  return null
}

export function geometryWithVertices(geometry: Geometry, vertices: LngLat[]): Geometry | null {
  if (geometry.type === 'Point') return vertices.length === 1 ? pointGeometry(vertices[0]) : null
  if (geometry.type === 'LineString') return vertices.length >= 2 ? lineGeometry(vertices) : null
  if (geometry.type === 'Polygon') {
    if (vertices.length < 3) return null
    const next = polygonGeometry(vertices)
    return { type: 'Polygon', coordinates: [next.coordinates[0], ...geometry.coordinates.slice(1)] }
  }
  return null
}

export function validateGeometry(geometry: Geometry | null | undefined): string | null {
  const kind = geometryKind(geometry)
  if (!kind || !geometry) return 'Use a Point, LineString, or Polygon.'
  const vertices = outerVertices(geometry)
  if (!vertices) return 'The geometry has invalid coordinates.'
  return validatePoints(kind, vertices)
}

export function draftGeometry(kind: DrawGeometry, points: LngLat[]): Geometry | null {
  if (kind === 'Point') return points.length === 1 ? pointGeometry(points[0]) : null
  if (kind === 'LineString') return points.length >= 2 ? lineGeometry(points) : points.length === 1 ? lineGeometry([points[0], points[0]]) : null
  if (points.length >= 3) return polygonGeometry(points)
  if (points.length >= 2) return lineGeometry(points)
  if (points.length === 1) return pointGeometry(points[0])
  return null
}

export function insertVertex(vertices: LngLat[], index: number, point: LngLat): LngLat[] {
  const next = vertices.slice()
  next.splice(index, 0, point)
  return next
}
