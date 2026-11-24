import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { pathAccessStatuses, type PathAccessStatus, type PathOverride } from './types.ts'

export const pathAccessBaselineUrl = '/data/attractions/byculla-zoo-path-access.geojson'

export interface PathAccessIdentity {
  osmFeatureId: string
  sourceId: string
}

let records: Record<string, PathOverride> = {}
let request: Promise<void> | null = null

export function getPathAccessBaseline(): Record<string, PathOverride> {
  return records
}

export function loadPathAccessBaseline(known: readonly PathAccessIdentity[]): Promise<void> {
  if (request) return request
  request = fetch(pathAccessBaselineUrl)
    .then(async (response) => {
      if (!response.ok) return
      let raw: unknown
      try {
        raw = await response.json()
      } catch {
        return
      }
      records = parsePathAccessBaseline(raw, known)
    })
    .catch(() => {
      // A missing file leaves browser path decisions in place.
    })
  return request
}

export function parsePathAccessBaseline(raw: unknown, known: readonly PathAccessIdentity[]): Record<string, PathOverride> {
  if (!raw || typeof raw !== 'object') return {}
  const collection = raw as FeatureCollection
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) return {}
  const next: Record<string, PathOverride> = {}
  for (const feature of collection.features) {
    const record = recordFromFeature(feature, known)
    if (record) next[record.id] = record.override
  }
  return next
}

export function resolvePathAccess(
  id: string,
  baseline: Record<string, PathOverride>,
  local: Record<string, PathOverride>,
  removed: ReadonlySet<string>,
): { status: PathAccessStatus; note: string; lastEdited: string | null } {
  const edited = local[id]
  if (edited) return { status: edited.status, note: edited.note, lastEdited: edited.lastEdited }
  if (removed.has(id)) return { status: 'unverified', note: '', lastEdited: null }
  const saved = baseline[id]
  if (saved) return { status: saved.status, note: saved.note, lastEdited: saved.lastEdited }
  return { status: 'unverified', note: '', lastEdited: null }
}

function recordFromFeature(
  feature: Feature<Geometry | null>,
  known: readonly PathAccessIdentity[],
): { id: string; override: PathOverride } | null {
  if (!feature || feature.type !== 'Feature') return null
  const properties = feature.properties && typeof feature.properties === 'object' ? (feature.properties as Record<string, unknown>) : {}
  const osmFeatureId = typeof properties.osmFeatureId === 'string' ? properties.osmFeatureId : typeof feature.id === 'string' ? feature.id : ''
  const sourceId = typeof properties.sourceId === 'string' ? properties.sourceId : ''
  const seed = known.find((path) => path.osmFeatureId === osmFeatureId || (sourceId !== '' && path.sourceId === sourceId))
  if (!seed || !isStatus(properties.status)) return null
  const note = typeof properties.note === 'string' ? properties.note.trim() : ''
  if (properties.status === 'unverified' && !note) return null
  return {
    id: seed.osmFeatureId,
    override: {
      status: properties.status,
      note,
      lastEdited: typeof properties.lastEdited === 'string' && properties.lastEdited ? properties.lastEdited : new Date(0).toISOString(),
    },
  }
}

function isStatus(value: unknown): value is PathAccessStatus {
  return pathAccessStatuses.some((status) => status.id === value)
}
