import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import { attractionRegistry } from '../attractions/registry.ts'
import type { EntranceRecord } from './types.ts'

export const entranceBaselineUrl = '/data/attractions/byculla-zoo-entrances.geojson'

let records: Record<string, EntranceRecord> = {}
let request: Promise<void> | null = null

export function getEntranceBaselineRecords(): Record<string, EntranceRecord> {
  return records
}

export function loadEntranceBaseline(): Promise<void> {
  if (request) return request
  const known = new Set(attractionRegistry.map((attraction) => attraction.id))
  request = fetch(entranceBaselineUrl)
    .then(async (response) => {
      if (!response.ok) return
      let raw: unknown
      try {
        raw = await response.json()
      } catch {
        return
      }
      records = parseEntranceBaseline(raw, known)
    })
    .catch(() => {
      // A missing file leaves browser entrances in place.
    })
  return request
}

export function parseEntranceBaseline(raw: unknown, knownAttractionIds: ReadonlySet<string>): Record<string, EntranceRecord> {
  if (!raw || typeof raw !== 'object') return {}
  const collection = raw as FeatureCollection
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) return {}
  const next: Record<string, EntranceRecord> = {}
  for (const feature of collection.features) {
    const record = recordFromFeature(feature, knownAttractionIds)
    if (record) next[record.id] = record
  }
  return next
}

function recordFromFeature(feature: Feature<Geometry | null>, knownAttractionIds: ReadonlySet<string>): EntranceRecord | null {
  if (!feature || feature.type !== 'Feature') return null
  const properties = feature.properties && typeof feature.properties === 'object' ? (feature.properties as Record<string, unknown>) : {}
  const attractionId = typeof properties.attractionId === 'string' ? properties.attractionId : typeof feature.id === 'string' ? feature.id : ''
  if (!attractionId || !knownAttractionIds.has(attractionId)) return null
  if (!feature.geometry || feature.geometry.type !== 'Point') return null
  const point = coordinate(feature.geometry.coordinates)
  if (!point) return null
  const id =
    typeof feature.id === 'string' && feature.id
      ? feature.id
      : typeof properties.id === 'string' && properties.id
        ? properties.id
        : attractionId
  return {
    id,
    attractionId,
    coordinates: point,
    verified: properties.verified === true,
    lastEdited: typeof properties.lastEdited === 'string' && properties.lastEdited ? properties.lastEdited : new Date(0).toISOString(),
  }
}

function coordinate(value: Position | undefined | null): [number, number] | null {
  if (!value || value.length < 2) return null
  const longitude = Number(value[0])
  const latitude = Number(value[1])
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null
  return [longitude, latitude]
}
