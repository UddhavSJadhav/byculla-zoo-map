import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { pathCatalog } from '@/paths/catalog'
import { getPathAccessBaseline, loadPathAccessBaseline, resolvePathAccess } from '@/paths/baseline'
import { pathAccessStatuses, type PathAccessStatus, type PathOverride, type PathRecord } from '@/paths/types'

const storageKey = 'zoo-map.path-access.v1'

interface StoredPathAccess {
  version: 1
  overrides: Record<string, PathOverride>
  removed?: string[]
}

type Listener = () => void

const listeners = new Set<Listener>()
let cachedOverrides: Record<string, PathOverride> | null = null
let cachedRemoved: string[] | null = null
let cachedList: PathRecord[] | null = null

function emptyStore(): StoredPathAccess {
  return { version: 1, overrides: {} }
}

function readStore(): StoredPathAccess {
  if (cachedOverrides && cachedRemoved) return { version: 1, overrides: cachedOverrides, removed: cachedRemoved }
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) {
      cachedOverrides = {}
      cachedRemoved = []
      return emptyStore()
    }
    const parsed = JSON.parse(raw) as StoredPathAccess
    cachedOverrides = parsed && parsed.version === 1 && parsed.overrides && typeof parsed.overrides === 'object' ? sanitizeOverrides(parsed.overrides) : {}
    cachedRemoved = parsed && Array.isArray(parsed.removed) ? parsed.removed.filter((id) => typeof id === 'string' && !(id in (cachedOverrides ?? {}))) : []
  } catch {
    cachedOverrides = {}
    cachedRemoved = []
  }
  return { version: 1, overrides: cachedOverrides, removed: cachedRemoved }
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

function writeStore(overrides: Record<string, PathOverride>, removed: readonly string[] = []) {
  cachedOverrides = overrides
  cachedRemoved = [...new Set(removed)]
  cachedList = null
  if (Object.keys(overrides).length === 0 && cachedRemoved.length === 0) localStorage.removeItem(storageKey)
  else {
    const stored: StoredPathAccess = { version: 1, overrides }
    if (cachedRemoved.length > 0) stored.removed = cachedRemoved
    localStorage.setItem(storageKey, JSON.stringify(stored))
  }
  listeners.forEach((listener) => listener())
}

function publishBaseline() {
  cachedList = null
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
  const stored = readStore()
  const baseline = getPathAccessBaseline()
  const removed = new Set(stored.removed ?? [])
  cachedList = pathCatalog.map((seed) => {
    const access = resolvePathAccess(seed.osmFeatureId, baseline, stored.overrides, removed)
    return {
      ...seed,
      status: access.status,
      note: access.note,
      lastEdited: access.lastEdited,
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
  const stored = readStore()
  return Object.keys(stored.overrides).length > 0 || (stored.removed?.length ?? 0) > 0
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
  const stored = readStore()
  const next = { ...stored.overrides }
  const removed = new Set(stored.removed ?? [])
  if (status === 'unverified' && !note) {
    delete next[current.osmFeatureId]
    if (getPathAccessBaseline()[current.osmFeatureId]) removed.add(current.osmFeatureId)
    else removed.delete(current.osmFeatureId)
  } else {
    next[current.osmFeatureId] = {
      status,
      note,
      lastEdited: new Date().toISOString(),
    }
    removed.delete(current.osmFeatureId)
  }
  writeStore(next, [...removed])
  return null
}

export function resetPathAccess() {
  writeStore({})
}

export function exportPathAccess(): FeatureCollection<null> {
  return {
    type: 'FeatureCollection',
    features: listPaths()
      .filter((path) => path.status !== 'unverified' || path.note.trim() !== '')
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
  const stored = readStore()
  const next = { ...stored.overrides }
  const removed = new Set(stored.removed ?? [])
  let applied = 0
  for (const feature of collection.features) {
    const result = overrideFromFeature(feature)
    if (typeof result === 'string') {
      warnings.push(result)
      continue
    }
    if (result.override.status === 'unverified' && !result.override.note) {
      delete next[result.id]
      if (getPathAccessBaseline()[result.id]) removed.add(result.id)
    } else {
      next[result.id] = result.override
      removed.delete(result.id)
    }
    applied += 1
  }
  if (applied === 0) return { applied, warnings: warnings.length > 0 ? warnings : ['Nothing in that file matched a walking path.'] }
  writeStore(next, [...removed])
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

if (typeof window !== 'undefined') {
  void loadPathAccessBaseline(pathCatalog).then(() => {
    publishBaseline()
  })
}
