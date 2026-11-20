import type { Point, Polygon } from 'geojson'

export const attractionCategories = [
  { id: 'animal', label: 'Animal' },
  { id: 'birds', label: 'Birds' },
  { id: 'garden', label: 'Garden' },
  { id: 'habitat', label: 'Habitat' },
  { id: 'venue', label: 'Venue' },
] as const

export type AttractionCategory = (typeof attractionCategories)[number]['id']

export const attractionStatuses = [
  { id: 'reference', label: 'Visitor-map reference' },
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Closed' },
  { id: 'unknown', label: 'Unknown' },
] as const

export type AttractionStatus = (typeof attractionStatuses)[number]['id']

export type AttractionGeometry = Point | Polygon

export type GeometryOrigin = 'osm' | 'manual'

/** Metadata from the visitor map. Geometry stays empty until someone accepts or draws it. */
export interface AttractionRecord {
  id: string
  name: string
  exhibitNumber: number
  category: AttractionCategory
  description: string
  geometry: AttractionGeometry | null
  source: string
  verified: boolean
  status: AttractionStatus
  geometryOrigin: GeometryOrigin | null
  sourceFeatureId: string | null
  osmFeatureId: string | null
  osmLayer: string | null
  lastEdited: string | null
  rejectedSourceIds: string[]
}

export interface AttractionOverride {
  name?: string
  category?: AttractionCategory
  description?: string
  source?: string
  verified?: boolean
  status?: AttractionStatus
  geometry?: AttractionGeometry | null
  geometryOrigin?: GeometryOrigin | null
  sourceFeatureId?: string | null
  osmFeatureId?: string | null
  osmLayer?: string | null
  lastEdited?: string | null
  rejectedSourceIds?: string[]
}

export interface AttractionPatch {
  name?: string
  category?: AttractionCategory
  description?: string
  source?: string
  verified?: boolean
  status?: AttractionStatus
}

export type AttractionMappingMode = 'point' | 'polygon' | 'edit'

export interface AttractionMappingRequest {
  token: number
  attractionId: string
  mode: AttractionMappingMode
}
