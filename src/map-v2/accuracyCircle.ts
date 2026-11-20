import type { FeatureCollection, Polygon } from 'geojson'

const earthRadiusMeters = 6_378_137

export function accuracyCircle(
  latitude: number,
  longitude: number,
  radiusMeters: number,
): FeatureCollection<Polygon> {
  const steps = 64
  const angularDistance = radiusMeters / earthRadiusMeters
  const lat1 = (latitude * Math.PI) / 180
  const lon1 = (longitude * Math.PI) / 180
  const coordinates: [number, number][] = []

  for (let step = 0; step <= steps; step += 1) {
    const bearing = (step / steps) * Math.PI * 2
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angularDistance) +
        Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
    )
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
      )
    coordinates.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI])
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [coordinates] },
      },
    ],
  }
}

export function emptyFeatureCollection(): FeatureCollection<Polygon> {
  return { type: 'FeatureCollection', features: [] }
}
