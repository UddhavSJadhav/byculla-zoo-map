import type { Position } from 'geojson'

/** Mean Earth radius, metres. Distance is great-circle, not degrees or pixels. */
const earthRadiusMeters = 6371008.8

export function haversineMeters(from: Position, to: Position): number {
  const longitude1 = Number(from[0])
  const latitude1 = Number(from[1])
  const longitude2 = Number(to[0])
  const latitude2 = Number(to[1])
  const radians = Math.PI / 180
  const latitudeDelta = (latitude2 - latitude1) * radians
  const longitudeDelta = (longitude2 - longitude1) * radians
  const start = latitude1 * radians
  const end = latitude2 * radians
  const half =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(start) * Math.cos(end) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(half)))
}

export function nodeKey(position: Position): string | null {
  const longitude = Number(position[0])
  const latitude = Number(position[1])
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return `${longitude},${latitude}`
}
