import type { FeatureCollection, Position } from 'geojson'

export function polygonRing(collection: FeatureCollection): Position[] {
  const geometry = collection.features[0]?.geometry
  if (!geometry || geometry.type !== 'Polygon') return []
  return geometry.coordinates[0] ?? []
}

export function pointInRing(point: Position, ring: readonly Position[]): boolean {
  const longitude = Number(point[0])
  const latitude = Number(point[1])
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || ring.length < 3) return false
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index]
    const prior = ring[previous]
    if (!current || !prior) continue
    const currentLongitude = Number(current[0])
    const currentLatitude = Number(current[1])
    const priorLongitude = Number(prior[0])
    const priorLatitude = Number(prior[1])
    const crosses = currentLatitude > latitude !== priorLatitude > latitude
    if (!crosses) continue
    const edge = ((priorLongitude - currentLongitude) * (latitude - currentLatitude)) / (priorLatitude - currentLatitude) + currentLongitude
    if (longitude < edge) inside = !inside
  }
  return inside
}

export function ringBounds(ring: readonly Position[]): { west: number; south: number; east: number; north: number } | null {
  let west = Number.POSITIVE_INFINITY
  let south = Number.POSITIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY
  for (const position of ring) {
    const longitude = Number(position[0])
    const latitude = Number(position[1])
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue
    west = Math.min(west, longitude)
    east = Math.max(east, longitude)
    south = Math.min(south, latitude)
    north = Math.max(north, latitude)
  }
  if (!Number.isFinite(west) || west > east || south > north) return null
  return { west, south, east, north }
}
