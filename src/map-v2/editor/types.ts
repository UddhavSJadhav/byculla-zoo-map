import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { MapLayerId } from '@/types/map-v2'

export const editorTools = [
  { id: 'select', label: 'Select' },
  { id: 'path', label: 'Path' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'point', label: 'Point' },
  { id: 'edit', label: 'Edit' },
  { id: 'delete', label: 'Delete' },
] as const

export type EditorTool = (typeof editorTools)[number]['id']

export const editorCategories = [
  { id: 'walking-path', label: 'Walking path', geometries: ['LineString'] },
  { id: 'animal-enclosure', label: 'Animal enclosure', geometries: ['Polygon'] },
  { id: 'garden', label: 'Garden', geometries: ['Polygon'] },
  { id: 'building', label: 'Building', geometries: ['Polygon'] },
  { id: 'tree', label: 'Tree', geometries: ['Point'] },
  { id: 'entrance', label: 'Entrance', geometries: ['Point'] },
  { id: 'animal-attraction', label: 'Animal attraction', geometries: ['Point', 'Polygon'] },
  { id: 'facility', label: 'Facility', geometries: ['Point', 'Polygon'] },
  { id: 'water', label: 'Water body', geometries: ['Point', 'Polygon'] },
] as const

export type EditorCategory = (typeof editorCategories)[number]['id']
export type DrawGeometry = 'Point' | 'LineString' | 'Polygon'

export const toolHints: Record<EditorTool, string> = {
  select: 'Click a feature to inspect it.',
  path: 'Click to add path points. Save when the path is finished.',
  polygon: 'Click to add corners. Save to close the polygon.',
  point: 'Click the map to place a point, then save it.',
  edit: 'Drag vertices to reshape the selected feature. Click a small point to insert a vertex.',
  delete: 'Click a feature to delete it from your local map.',
}

export const accessTypes = ['public', 'private', 'permissive', 'customers', 'destination'] as const

export interface EditorProperties {
  id: string
  name: string | null
  category: string
  source: string
  sourceId: string
  description?: string
  access?: string
  height?: number
  modelReference?: string
  editorCategory?: EditorCategory
  editorOrigin?: 'manual' | 'modified'
  replacesSourceId?: string
  originLayer?: MapLayerId
  highway?: string
  building?: string
  species?: string
  leisure?: string
  natural?: string
  water?: string
  dataset?: string
}

export interface EditorDocument {
  type: 'FeatureCollection'
  version: 1
  hiddenIds: string[]
  features: Feature<Geometry, EditorProperties>[]
}

export interface FeatureFormValues {
  id: string
  name: string
  category: EditorCategory
  description: string
  source: string
  access: string
  height: string
  modelReference: string
}

export type EditorFeature = Feature<Geometry, EditorProperties>

export type DownloadCollection = FeatureCollection<Geometry, EditorProperties>
