import type { LineString } from 'geojson'

export const pathAccessStatuses = [
  { id: 'unverified', label: 'Needs verification' },
  { id: 'accessible', label: 'Visitor accessible' },
  { id: 'restricted', label: 'Restricted' },
] as const

export type PathAccessStatus = (typeof pathAccessStatuses)[number]['id']

/** One OpenStreetMap way. Geometry is the original LineString, not a stored copy. */
export interface PathRecord {
  osmFeatureId: string
  sourceId: string
  highway: string
  osmAccess: string
  status: PathAccessStatus
  note: string
  lastEdited: string | null
  geometry: LineString
  connectedIds: readonly string[]
}

export interface PathOverride {
  status: PathAccessStatus
  note: string
  lastEdited: string
}
