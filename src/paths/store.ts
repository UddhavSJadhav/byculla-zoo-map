import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { pathCatalog } from '@/paths/catalog'
import { pathAccessStatuses, type PathAccessStatus, type PathOverride, type PathRecord } from '@/paths/types'

const storageKey = 'zoo-map.path-access.v1'

interface StoredPathAccess {
  version: 1
  overrides: Record<string, PathOverride>
}

type Listener = () => void

const listeners = new Set<Listener>()
let cachedOverrides: Record<string, PathOverride> | null = null
let cachedList: PathRecord[] | null = null

function emptyStore(): StoredPathAccess {
  return { version: 1, overrides: {} }
}

function readStore(): StoredPathAccess {
  if (cachedOverrides) return { version: 1, overrides: cachedOverrides }
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) {
      cachedOverrides = {}
      return emptyStore()
    }
    const parsed = JSON.parse(raw) as StoredPathAccess
    cachedOverrides = parsed && parsed.version === 1 && parsed.overrides && typeof parsed.overrides === 'object' ? sanitizeOverrides(parsed.overrides) : {}
  } catch {
    cachedOverrides = {}
  }
  return { version: 1, overrides: cachedOverrides }
}

function sanitizeOverrides(value: Record<string, PathOverride>): Record<string, PathOverride> {
  const overrides: Record<string, PathOverride> = {}
  for (const [id, override] of Object.entries(value)) {
    if (!override || typeof override !== 'object' || !isStatus(override.status)) continue
    const note = typeof override.note === 'string' ? override.note : ''
    if (override.status === 'unverified' && !note.trim()) continue
    overrides[id] = {
      status: override.status,
      note: note.trim(),
      lastEdited: typeof override.lastEdited === 'string' ? override.lastEdited : new Date(0).toISOString(),
    }
  }
  return overrides
}

function writeStore(overrides: Record<string, PathOverride>) {
  cachedOverrides = overrides
  cachedList = null
  if (Object.keys(overrides).length === 0) localStorage.removeItem(storageKey)
  else localStorage.setItem(storageKey, JSON.stringify({ version: 1, overrides } satisfies StoredPathAccess))
  listeners.forEach((listener) => listener())
}

export function subscribePaths(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function listPaths(): PathRecord[] {
  if (cachedList) return cachedList
  const overrides = readStore().overrides
  cachedList = pathCatalog.map((seed) => {
    const override = overrides[seed.osmFeatureId]
    return {
      ...seed,
      status: override?.status ?? 'unverified',
      note: override?.note ?? '',
      lastEdited: override?.lastEdited ?? null,
    }
  })
  return cachedList
}

export function visitorPaths(): PathRecord[] {
  return listPaths().filter((path) => path.status === 'accessible')
}

export function getPath(id: string): PathRecord | null {
  return listPaths().find((path) => path.osmFeatureId === id || path.sourceId === id) ?? null
}

export function pathStatusCounts(): Record<PathAccessStatus, number> {
  const counts: Record<PathAccessStatus, number> = { unverified: 0, accessible: 0, restricted: 0 }
  for (const path of listPaths()) counts[path.status] += 1
  return counts
}

export function pathHasEdits(): boolean {
  return Object.keys(readStore().overrides).length > 0
}

export function orphanedPathIds(): string[] {
  const known = new Set(pathCatalog.map((seed) => seed.osmFeatureId))
  return Object.keys(readStore().overrides).filter((id) => !known.has(id)).sort()
}

export function updatePathAccess(id: string, patch: { status?: PathAccessStatus; note?: string }): string | null {
  const current = getPath(id)
  if (!current) return 'That path is not in the OpenStreetMap walking-path data.'
  const status = patch.status ?? current.status
  const note = patch.note !== undefined ? patch.note.trim() : current.note
  const next = { ...readStore().overrides }
  if (status === 'unverified' && !note) delete next[current.osmFeatureId]
  else {
    next[current.osmFeatureId] = {
      status,
      note,
      lastEdited: new Date().toISOString(),
    }
  }
  writeStore(next)
  return null
}

export function resetPathAccess() {
  writeStore({})
}

export function exportPathAccess(): FeatureCollection<null> {
  const overrides = readStore().overrides
  return {
    type: 'FeatureCollection',
    features: listPaths()
      .filter((path) => overrides[path.osmFeatureId])
      .map((path) => ({
        type: 'Feature' as const,
        id: path.osmFeatureId,
        geometry: null,
        properties: {
          osmFeatureId: path.osmFeatureId,
          sourceId: path.sourceId,
          status: path.status,
          note: path.note,
          lastEdited: path.lastEdited,
        },
      })),
  }
}

export function importPathAccess(raw: unknown): { applied: number; warnings: string[] } {
  const warnings: string[] = []
  if (!raw || typeof raw !== 'object') return { applied: 0, warnings: ['The file is not a GeoJSON object.'] }
  const collection = raw as FeatureCollection
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return { applied: 0, warnings: ['Choose a GeoJSON FeatureCollection.'] }
  }
  const next = { ...readStore().overrides }
  let applied = 0
  for (const feature of collection.features) {
    const result = overrideFromFeature(feature)
    if (typeof result === 'string') {
      warnings.push(result)
      continue
    }
    if (result.override.status === 'unverified' && !result.override.note) delete next[result.id]
    else next[result.id] = result.override
    applied += 1
  }
  if (applied === 0) return { applied, warnings: warnings.length > 0 ? warnings : ['Nothing in that file matched a walking path.'] }
  writeStore(next)
  return { applied, warnings }
}

function overrideFromFeature(feature: Feature<Geometry | null>): { id: string; override: PathOverride } | string {
  const properties = feature.properties && typeof feature.properties === 'object' ? (feature.properties as Record<string, unknown>) : {}
  const osmFeatureId = typeof properties.osmFeatureId === 'string' ? properties.osmFeatureId : typeof feature.id === 'string' ? feature.id : ''
  const sourceId = typeof properties.sourceId === 'string' ? properties.sourceId : ''
  const seed = pathCatalog.find((path) => path.osmFeatureId === osmFeatureId || (sourceId !== '' && path.sourceId === sourceId))
  if (!seed) return `Skipped ${osmFeatureId || sourceId || 'a feature'} because it is not an OpenStreetMap walking path.`
  if (!isStatus(properties.status)) return `Skipped ${seed.sourceId}: status must be unverified, accessible, or restricted.`
  const note = typeof properties.note === 'string' ? properties.note.trim() : ''
  return {
    id: seed.osmFeatureId,
    override: {
      status: properties.status,
      note,
      lastEdited: typeof properties.lastEdited === 'string' && properties.lastEdited ? properties.lastEdited : new Date().toISOString(),
    },
  }
}

function isStatus(value: unknown): value is PathAccessStatus {
  return pathAccessStatuses.some((status) => status.id === value)
}
