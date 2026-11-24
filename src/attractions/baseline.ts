import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { validateGeometry } from '@/map-v2/editor/geometry'
import { readBaselineCache, saveBaselineCache, type BaselineCacheStorage } from '@/visitor/baselineCache'
import {
  attractionCategories,
  attractionStatuses,
  type AttractionCategory,
  type AttractionGeometry,
  type AttractionRecord,
  type AttractionStatus,
  type GeometryOrigin,
} from '@/attractions/types'

export const attractionBaselineUrl = '/data/attractions/byculla-zoo-attractions.geojson'

export interface AttractionBaselineState {
  status: 'loading' | 'ready' | 'error'
  error: string | null
  warnings: string[]
}

type Listener = () => void

const listeners = new Set<Listener>()
let snapshot: AttractionBaselineState = { status: 'loading', error: null, warnings: [] }
let records: AttractionRecord[] | null = null
let request: Promise<void> | null = null
let fromCache = false

export function baselineServedFromCache(): boolean {
  return fromCache
}

export function getBaselineState(): AttractionBaselineState {
  return snapshot
}

export function getBaselineRecords(): AttractionRecord[] | null {
  return records
}

export function subscribeBaseline(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function loadAttractionBaseline(): Promise<void> {
  if (request) return request
  request = fetch(attractionBaselineUrl)
    .then(async (response) => {
      if (!response.ok) throw new Error(`The attraction baseline could not be loaded (${response.status}).`)
      let raw: unknown
      try {
        raw = await response.json()
      } catch {
        throw new Error('The attraction baseline is not valid JSON.')
      }
      const parsed = parseAttractionBaseline(raw)
      if ('error' in parsed) throw new Error(parsed.error)
      fromCache = false
      records = parsed.records
      snapshot = { status: 'ready', error: null, warnings: parsed.warnings }
      const storage = baselineCacheStorage()
      if (storage) saveBaselineCache(raw, storage)
      publish()
    })
    .catch((error: unknown) => {
      const restored = restoreCachedBaseline()
      if (restored) {
        fromCache = true
        records = restored.records
        snapshot = {
          status: 'ready',
          error: null,
          warnings: [...restored.warnings, 'Showing saved attraction details while offline.'],
        }
        publish()
        return
      }
      if (records) {
        publish()
        return
      }
      fromCache = false
      records = null
      snapshot = {
        status: 'error',
        error: error instanceof Error ? error.message : 'The attraction baseline could not be loaded.',
        warnings: [],
      }
      publish()
    })
  return request
}

export function retryAttractionBaseline(): Promise<void> {
  request = null
  return loadAttractionBaseline()
}

function restoreCachedBaseline(): { records: AttractionRecord[]; warnings: string[] } | null {
  const storage = baselineCacheStorage()
  if (!storage) return null
  const raw = readBaselineCache(storage)
  if (!raw) return null
  const parsed = parseAttractionBaseline(raw)
  if ('error' in parsed) return null
  return parsed
}

function baselineCacheStorage(): BaselineCacheStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function parseAttractionBaseline(raw: unknown): { records: AttractionRecord[]; warnings: string[] } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'The attraction baseline is not a GeoJSON object.' }
  const collection = raw as FeatureCollection
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return { error: 'The attraction baseline is not a GeoJSON FeatureCollection.' }
  }
  const warnings: string[] = []
  const seen = new Set<string>()
  const next: AttractionRecord[] = []
  for (const feature of collection.features) {
    const parsed = readFeature(feature)
    if (typeof parsed === 'string') {
      warnings.push(parsed)
      continue
    }
    if (seen.has(parsed.id)) {
      warnings.push(`Skipped a duplicate attraction ${parsed.id}.`)
      continue
    }
    seen.add(parsed.id)
    next.push(parsed)
  }
  return { records: next, warnings }
}

function readFeature(feature: Feature): AttractionRecord | string {
  if (!feature || feature.type !== 'Feature') return 'Skipped an item that is not a GeoJSON Feature.'
  const properties = feature.properties && typeof feature.properties === 'object' ? (feature.properties as Record<string, unknown>) : {}
  const id = typeof properties.id === 'string' && properties.id.trim() ? properties.id.trim() : typeof feature.id === 'string' ? feature.id : ''
  if (!id) return 'Skipped a feature with no attraction id.'
  const name = typeof properties.name === 'string' ? properties.name.trim() : ''
  if (!name) return `Skipped ${id}: name is missing.`
  const exhibitNumber = typeof properties.exhibitNumber === 'number' ? properties.exhibitNumber : Number.NaN
  if (!Number.isInteger(exhibitNumber)) return `Skipped ${id}: exhibit number is missing.`
  if (!isCategory(properties.category)) return `Skipped ${name}: category is not one of the visitor-map categories.`
  const status = isStatus(properties.status) ? properties.status : 'reference'
  const geometrySource = properties.geometrySource === 'osm' || properties.geometrySource === 'manual' ? properties.geometrySource : null
  const geometry = readGeometry(name, geometrySource, feature.geometry, properties)
  if (typeof geometry === 'string') return geometry
  return {
    id,
    name,
    exhibitNumber,
    category: properties.category,
    description: typeof properties.description === 'string' ? properties.description.trim() : '',
    geometry: geometry.geometry,
    source: typeof properties.source === 'string' && properties.source.trim() ? properties.source.trim() : 'Visitor map',
    verified: properties.verified === true,
    status,
    geometryOrigin: geometry.geometryOrigin,
    sourceFeatureId: geometry.sourceFeatureId,
    osmFeatureId: geometry.osmFeatureId,
    osmLayer: geometry.osmLayer,
    lastEdited: typeof properties.lastEdited === 'string' && properties.lastEdited ? properties.lastEdited : null,
    rejectedSourceIds: Array.isArray(properties.rejectedSourceIds)
      ? properties.rejectedSourceIds.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

function readGeometry(
  name: string,
  geometrySource: GeometryOrigin | null,
  geometry: Geometry | null,
  properties: Record<string, unknown>,
): Pick<AttractionRecord, 'geometry' | 'geometryOrigin' | 'sourceFeatureId' | 'osmFeatureId' | 'osmLayer'> | string {
  if (geometrySource === 'osm') {
    const sourceFeatureId = typeof properties.sourceFeatureId === 'string' ? properties.sourceFeatureId : ''
    const osmFeatureId = typeof properties.osmFeatureId === 'string' ? properties.osmFeatureId : ''
    if (!sourceFeatureId || !osmFeatureId) return `Skipped ${name}: the OpenStreetMap link has no source id.`
    return {
      geometry: null,
      geometryOrigin: 'osm',
      sourceFeatureId,
      osmFeatureId,
      osmLayer: typeof properties.osmLayer === 'string' && properties.osmLayer ? properties.osmLayer : null,
    }
  }
  if (geometrySource === 'manual') {
    if (geometry?.type !== 'Point' && geometry?.type !== 'Polygon') return `Skipped ${name}: a manual attraction needs a Point or Polygon.`
    const geometryError = validateGeometry(geometry)
    if (geometryError) return `Skipped ${name}: ${geometryError}`
    return {
      geometry: geometry as AttractionGeometry,
      geometryOrigin: 'manual',
      sourceFeatureId: null,
      osmFeatureId: null,
      osmLayer: null,
    }
  }
  return { geometry: null, geometryOrigin: null, sourceFeatureId: null, osmFeatureId: null, osmLayer: null }
}

function publish() {
  listeners.forEach((listener) => listener())
}

function isCategory(value: unknown): value is AttractionCategory {
  return attractionCategories.some((category) => category.id === value)
}

function isStatus(value: unknown): value is AttractionStatus {
  return attractionStatuses.some((status) => status.id === value)
}
