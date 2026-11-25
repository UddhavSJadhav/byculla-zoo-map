import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import { getEntranceBaselineRecords, loadEntranceBaseline } from './baseline.ts'
import { sameCoordinate } from './connection.ts'
import { nextEntranceId } from './ids.ts'
import type { EntranceRecord, EntranceStorage } from './types.ts'

const storageKey = 'zoo-map.entrances.v1'

interface StoredEntrance {
  attractionId: string
  coordinates: [number, number]
  verified: boolean
  lastEdited: string
}

interface StoredEntrances {
  version: 1 | 2
  entrances: Record<string, StoredEntrance | { coordinates: [number, number]; verified: boolean; lastEdited: string }>
  removed?: string[]
}

interface LocalEntrances {
  entrances: Record<string, EntranceRecord>
  removed: string[]
}

interface Placement {
  entranceId: string
  attractionId: string
}

type Listener = () => void

export interface EntranceStore {
  subscribe(listener: Listener): () => void
  list(): readonly EntranceRecord[]
  listForAttraction(attractionId: string): readonly EntranceRecord[]
  get(entranceId: string): EntranceRecord | null
  set(entranceId: string, coordinates: Position, attractionId?: string): string | null
  verify(entranceId: string, verified: boolean): string | null
  remove(entranceId: string): string | null
  reload(): void
  exportCollection(): FeatureCollection<Geometry | null>
  importCollection(raw: unknown, knownAttractionIds: ReadonlySet<string>): { applied: number; warnings: string[] }
  beginPlacement(attractionId: string, entranceId?: string): void
  cancelPlacement(): void
  placingId(): string | null
  placingAttractionId(): string | null
}

export function createEntranceStore(
  storage: EntranceStorage,
  baseline: () => Record<string, EntranceRecord> = () => ({}),
): EntranceStore {
  const listeners = new Set<Listener>()
  let cachedLocal: LocalEntrances | null = null
  let cachedRecords: Record<string, EntranceRecord> | null = null
  let cachedList: readonly EntranceRecord[] | null = null
  let placing: Placement | null = null

  function emit() {
    cachedList = null
    for (const listener of listeners) listener()
  }

  function readLocal(): LocalEntrances {
    if (cachedLocal) return cachedLocal
    cachedLocal = parse(storage.getItem(storageKey))
    return cachedLocal
  }

  function view(): Record<string, EntranceRecord> {
    if (cachedRecords) return cachedRecords
    const local = readLocal()
    const removed = new Set(local.removed)
    const merged: Record<string, EntranceRecord> = {}
    for (const [id, record] of Object.entries(baseline())) {
      if (!removed.has(id)) merged[id] = record
    }
    Object.assign(merged, local.entrances)
    cachedRecords = merged
    return merged
  }

  function write(local: LocalEntrances) {
    cachedLocal = {
      entrances: local.entrances,
      removed: [...new Set(local.removed)],
    }
    cachedRecords = null
    cachedList = null
    if (Object.keys(cachedLocal.entrances).length === 0 && cachedLocal.removed.length === 0) storage.removeItem(storageKey)
    else {
      const entrances: Record<string, StoredEntrance> = {}
      for (const [id, record] of Object.entries(cachedLocal.entrances)) {
        entrances[id] = {
          attractionId: record.attractionId,
          coordinates: record.coordinates,
          verified: record.verified,
          lastEdited: record.lastEdited,
        }
      }
      const stored: StoredEntrances = { version: 2, entrances }
      if (cachedLocal.removed.length > 0) stored.removed = cachedLocal.removed
      storage.setItem(storageKey, JSON.stringify(stored))
    }
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
      cachedList = Object.values(view()).sort((left, right) => {
        const byAttraction = left.attractionId.localeCompare(right.attractionId)
        return byAttraction !== 0 ? byAttraction : left.id.localeCompare(right.id)
      })
      return cachedList
    },
    listForAttraction(attractionId) {
      return this.list().filter((entrance) => entrance.attractionId === attractionId)
    },
    get(entranceId) {
      return view()[entranceId] ?? null
    },
    set(entranceId, coordinates, attractionId) {
      const id = entranceId.trim()
      if (!id) return 'Choose an entrance before placing it.'
      const point = coordinate(coordinates)
      if (!point) return 'The entrance must be a longitude and latitude.'
      const current = view()[id]
      const attraction = (attractionId ?? current?.attractionId ?? id).trim()
      if (!attraction) return 'Choose an attraction before placing an entrance.'
      const verified = current && sameCoordinate(current.coordinates, point) ? current.verified : false
      const local = readLocal()
      if (placing?.entranceId === id) placing = null
      write({
        entrances: {
          ...local.entrances,
          [id]: { id, attractionId: attraction, coordinates: point, verified, lastEdited: new Date().toISOString() },
        },
        removed: local.removed.filter((item) => item !== id),
      })
      return null
    },
    verify(entranceId, verified) {
      const current = view()[entranceId]
      if (!current) return 'Place an entrance before verifying it.'
      const local = readLocal()
      write({
        entrances: { ...local.entrances, [entranceId]: { ...current, verified, lastEdited: new Date().toISOString() } },
        removed: local.removed.filter((item) => item !== entranceId),
      })
      return null
    },
    remove(entranceId) {
      if (!view()[entranceId]) return 'That entrance is not on the map.'
      const local = readLocal()
      const entrances = { ...local.entrances }
      delete entrances[entranceId]
      if (placing?.entranceId === entranceId) placing = null
      write({
        entrances,
        removed: baseline()[entranceId] ? [...local.removed, entranceId] : local.removed.filter((item) => item !== entranceId),
      })
      return null
    },
    reload() {
      cachedLocal = null
      cachedRecords = null
      cachedList = null
      view()
      emit()
    },
    exportCollection() {
      return {
        type: 'FeatureCollection',
        features: this.list().map((entrance) => ({
          type: 'Feature' as const,
          id: entrance.id,
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
      const local = readLocal()
      const next = { ...local.entrances }
      const removed = new Set(local.removed)
      let applied = 0
      for (const feature of collection.features) {
        const result = recordFromFeature(feature, knownAttractionIds)
        if (typeof result === 'string') {
          warnings.push(result)
          continue
        }
        next[result.id] = result
        removed.delete(result.id)
        applied += 1
      }
      if (applied === 0) return { applied, warnings: warnings.length > 0 ? warnings : ['Nothing in that file matched an attraction.'] }
      write({ entrances: next, removed: [...removed] })
      return { applied, warnings }
    },
    beginPlacement(attractionId, entranceId) {
      const id = attractionId.trim()
      if (!id) return
      placing = {
        attractionId: id,
        entranceId: entranceId?.trim() || nextEntranceId(id, view()),
      }
      emit()
    },
    cancelPlacement() {
      placing = null
      emit()
    },
    placingId() {
      return placing?.entranceId ?? null
    },
    placingAttractionId() {
      return placing?.attractionId ?? null
    },
  }
}

function parse(raw: string | null): LocalEntrances {
  if (!raw) return { entrances: {}, removed: [] }
  try {
    const parsed = JSON.parse(raw) as StoredEntrances
    if (!parsed || (parsed.version !== 1 && parsed.version !== 2) || !parsed.entrances || typeof parsed.entrances !== 'object') {
      return { entrances: {}, removed: [] }
    }
    const entrances: Record<string, EntranceRecord> = {}
    for (const [id, record] of Object.entries(parsed.entrances)) {
      if (!record || typeof record !== 'object') continue
      const point = coordinate(record.coordinates)
      if (!point) continue
      const attractionId =
        'attractionId' in record && typeof record.attractionId === 'string' && record.attractionId ? record.attractionId : id
      entrances[id] = {
        id,
        attractionId,
        coordinates: point,
        verified: record.verified === true,
        lastEdited: typeof record.lastEdited === 'string' ? record.lastEdited : new Date(0).toISOString(),
      }
    }
    const removed = Array.isArray(parsed.removed) ? parsed.removed.filter((id) => typeof id === 'string' && !(id in entrances)) : []
    return { entrances, removed }
  } catch {
    return { entrances: {}, removed: [] }
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

const entrances = createEntranceStore(defaultStorage(), getEntranceBaselineRecords)

if (typeof window !== 'undefined') {
  void loadEntranceBaseline().then(() => {
    entrances.reload()
  })
}

export function subscribeEntrances(listener: Listener) {
  return entrances.subscribe(listener)
}

export function listEntrances() {
  return entrances.list()
}

export function listEntrancesForAttraction(attractionId: string) {
  return entrances.listForAttraction(attractionId)
}

export function getEntrance(entranceId: string) {
  return entrances.get(entranceId)
}

export function setEntrance(entranceId: string, coordinates: Position, attractionId?: string) {
  return entrances.set(entranceId, coordinates, attractionId)
}

export function verifyEntrance(entranceId: string, verified: boolean) {
  return entrances.verify(entranceId, verified)
}

export function removeEntrance(entranceId: string) {
  return entrances.remove(entranceId)
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

export function beginEntrancePlacement(attractionId: string, entranceId?: string) {
  entrances.beginPlacement(attractionId, entranceId)
}

export function cancelEntrancePlacement() {
  entrances.cancelPlacement()
}

export function placingEntranceId() {
  return entrances.placingId()
}

export function placingAttractionId() {
  return entrances.placingAttractionId()
}
