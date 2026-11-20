export interface ZooFeatureProperties {
  id: string
  name: string | null
  category: string
  source: 'OpenStreetMap'
  sourceId: string
  /** Optional fields reserved for a later 3D model. They are not populated from OSM. */
  height?: number
  minHeight?: number
  elevation?: number
  objectType?: string
  modelReference?: string
  highway?: string
  access?: string
  building?: string
  species?: string
  leisure?: string
  natural?: string
  water?: string
}

export interface AvailabilityDataset {
  id: MapLayerId
  title: string
  file: string
  count: number
  geometryTypes: string[]
  tags: string[]
}

export interface MappedFeatureGroup {
  category: string
  count: number
  geometry: string
  tags: string[]
}

export type MapLayerId =
  | 'boundary'
  | 'paths'
  | 'buildings'
  | 'gardens'
  | 'enclosures'
  | 'trees'
  | 'attractions'
  | 'water'

export const mapLayerIds: MapLayerId[] = [
  'boundary',
  'paths',
  'buildings',
  'gardens',
  'enclosures',
  'trees',
  'attractions',
  'water',
]
