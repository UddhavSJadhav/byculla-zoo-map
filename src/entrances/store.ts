import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import { sameCoordinate } from './connection.ts'
import type { EntranceRecord, EntranceStorage } from './types.ts'

const storageKey = 'zoo-map.entrances.v1'

interface StoredEntrances {
  version: 1
  entrances: Record<string, { coordinates: [number, number]; verified: boolean; lastEdited: string }>
}

type Listener = () => void

export interface EntranceStore {
  subscribe(listener: Listener): () => void
  list(): readonly EntranceRecord[]
  get(attractionId: string): EntranceRecord | null
  set(attractionId: string, coordinates: Position): string | null
  verify(attractionId: string, verified: boolean): string | null
  remove(attractionId: string): string | null
  reload(): void
  exportCollection(): FeatureCollection<Geometry | null>
  importCollection(raw: unknown, knownAttractionIds: ReadonlySet<string>): { applied: number; warnings: string[] }
  beginPlacement(attractionId: string): void
  cancelPlacement(): void
  placingId(): string | null
}

export function createEntranceStore(storage: EntranceStorage): EntranceStore {
  const listeners = new Set<Listener>()
  let cachedRecords: Record<string, EntranceRecord> | null = null
  let cachedList: readonly EntranceRecord[] | null = null
  let placingId: string | null = null

  function emit() {
    cachedList = null
    for (const listener of listeners) listener()
  }

  function read(): Record<string, EntranceRecord> {
    if (cachedRecords) return cachedRecords
    cachedRecords = parse(storage.getItem(storageKey))
    return cachedRecords
  }

  function write(records: Record<string, EntranceRecord>) {
    cachedRecords = records
    cachedList = null
    if (Object.keys(records).length === 0) storage.removeItem(storageKey)
    else storage.setItem(storageKey, JSON.stringify({ version: 1, entrances: records } satisfies StoredEntrances))
    emit()
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    list() {
      if (cachedList) return cachedList
      cachedList = Object.values(read()).sort((left, right) => left.attractionId.localeCompare(right.attractionId))
      return cachedList
    },
    get(attractionId) {
      return read()[attractionId] ?? null
    },
    set(attractionId, coordinates) {
      const id = attractionId.trim()
      if (!id) return 'Choose an attraction before placing an entrance.'
      const point = coordinate(coordinates)
      if (!point) return 'The entrance must be a longitude and latitude.'
      const current = read()[id]
      const verified = current && sameCoordinate(current.coordinates, point) ? current.verified : false
      if (placingId === id) placingId = null
      write({
        ...read(),
        [id]: { attractionId: id, coordinates: point, verified, lastEdited: new Date().toISOString() },
      })
      return null
    },
    verify(attractionId, verified) {
      const current = read()[attractionId]
      if (!current) return 'Place an entrance before verifying it.'
      write({ ...read(), [attractionId]: { ...current, verified, lastEdited: new Date().toISOString() } })
      return null
    },
    remove(attractionId) {
      if (!read()[attractionId]) return 'That attraction has no entrance.'
      const next = { ...read() }
      delete next[attractionId]
      if (placingId === attractionId) placingId = null
      write(next)
      return null
    },
    reload() {
      cachedRecords = null
      cachedList = null
      read()
      emit()
    },
    exportCollection() {
      return {
        type: 'FeatureCollection',
        features: this.list().map((entrance) => ({
          type: 'Feature' as const,
          id: entrance.attractionId,
          geometry: { type: 'Point' as const, coordinates: entrance.coordinates },
          properties: {
            attractionId: entrance.attractionId,
            verified: entrance.verified,
            lastEdited: entrance.lastEdited,
          },
        })),
      }
    },
    importCollection(raw, knownAttractionIds) {
      const warnings: string[] = []
      if (!raw || typeof raw !== 'object') return { applied: 0, warnings: ['The file is not a GeoJSON object.'] }
      const collection = raw as FeatureCollection
      if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
        return { applied: 0, warnings: ['Choose a GeoJSON FeatureCollection.'] }
      }
      const next = { ...read() }
      let applied = 0
      for (const feature of collection.features) {
        const result = recordFromFeature(feature, knownAttractionIds)
        if (typeof result === 'string') {
          warnings.push(result)
          continue
        }
        next[result.attractionId] = result
        applied += 1
      }
      if (applied === 0) return { applied, warnings: warnings.length > 0 ? warnings : ['Nothing in that file matched an attraction.'] }
      write(next)
      return { applied, warnings }
    },
    beginPlacement(attractionId) {
      placingId = attractionId
      emit()
    },
    cancelPlacement() {
      placingId = null
      emit()
    },
    placingId() {
      return placingId
    },
  }
}

function parse(raw: string | null): Record<string, EntranceRecord> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as StoredEntrances
    if (!parsed || parsed.version !== 1 || !parsed.entrances || typeof parsed.entrances !== 'object') return {}
    const records: Record<string, EntranceRecord> = {}
    for (const [id, record] of Object.entries(parsed.entrances)) {
      const point = record && coordinate(record.coordinates)
      if (!point) continue
      records[id] = {
        attractionId: id,
        coordinates: point,
        verified: record.verified === true,
        lastEdited: typeof record.lastEdited === 'string' ? record.lastEdited : new Date(0).toISOString(),
      }
    }
    return records
  } catch {
    return {}
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

function recordFromFeature(feature: Feature<Geometry | null>, knownAttractionIds: ReadonlySet<string>): EntranceRecord | string {
  const properties = feature.properties && typeof feature.properties === 'object' ? (feature.properties as Record<string, unknown>) : {}
  const attractionId = typeof properties.attractionId === 'string' ? properties.attractionId : typeof feature.id === 'string' ? feature.id : ''
  if (!attractionId || !knownAttractionIds.has(attractionId)) return `Skipped ${attractionId || 'a feature'} because it is not an attraction.`
  if (!feature.geometry || feature.geometry.type !== 'Point') return `Skipped ${attractionId}: an entrance must be a Point.`
  const point = coordinate(feature.geometry.coordinates)
  if (!point) return `Skipped ${attractionId}: the entrance coordinate is not a longitude and latitude.`
  return {
    attractionId,
    coordinates: point,
    verified: properties.verified === true,
    lastEdited: typeof properties.lastEdited === 'string' && properties.lastEdited ? properties.lastEdited : new Date().toISOString(),
  }
}

function defaultStorage(): EntranceStorage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // The page can hide storage; entrances then stay in memory for this session.
  }
  const jar = new Map<string, string>()
  return {
    getItem: (key) => jar.get(key) ?? null,
    setItem: (key, value) => {
      jar.set(key, value)
    },
    removeItem: (key) => {
      jar.delete(key)
    },
  }
}

const entrances = createEntranceStore(defaultStorage())

export function subscribeEntrances(listener: Listener) {
  return entrances.subscribe(listener)
}

export function listEntrances() {
  return entrances.list()
}

export function getEntrance(attractionId: string) {
  return entrances.get(attractionId)
}

export function setEntrance(attractionId: string, coordinates: Position) {
  return entrances.set(attractionId, coordinates)
}

export function verifyEntrance(attractionId: string, verified: boolean) {
  return entrances.verify(attractionId, verified)
}

export function removeEntrance(attractionId: string) {
  return entrances.remove(attractionId)
}

export function reloadEntrances() {
  entrances.reload()
}

export function exportEntrances() {
  return entrances.exportCollection()
}

export function importEntrances(raw: unknown, knownAttractionIds: ReadonlySet<string>) {
  return entrances.importCollection(raw, knownAttractionIds)
}

export function beginEntrancePlacement(attractionId: string) {
  entrances.beginPlacement(attractionId)
}

export function cancelEntrancePlacement() {
  entrances.cancelPlacement()
}

export function placingEntranceId() {
  return entrances.placingId()
}
