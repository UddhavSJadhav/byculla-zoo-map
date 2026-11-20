import type { Feature, Geometry, GeoJsonProperties } from 'geojson'
import { mapSources } from '@/data/map-v2/sources'
import type { MapLayerId } from '@/types/map-v2'
import { mapLayerIds } from '@/types/map-v2'
import type { DrawGeometry, EditorCategory, EditorProperties } from '@/map-v2/editor/types'
import { editorCategories } from '@/map-v2/editor/types'

export interface OsmRecord {
  layer: MapLayerId
  feature: Feature<Geometry, GeoJsonProperties>
}

const byId = new Map<string, OsmRecord>()
const idsBySourceId = new Map<string, string[]>()

for (const layerId of mapLayerIds) {
  for (const feature of mapSources[layerId].features) {
    const id = feature.properties && typeof feature.properties.id === 'string' ? feature.properties.id : null
    if (!id || byId.has(id)) continue
    byId.set(id, { layer: layerId, feature })
    const sourceId = feature.properties && typeof feature.properties.sourceId === 'string' ? feature.properties.sourceId : ''
    if (!sourceId) continue
    const related = idsBySourceId.get(sourceId)
    if (related) related.push(id)
    else idsBySourceId.set(sourceId, [id])
  }
}

export function osmRecord(id: string): OsmRecord | null {
  return byId.get(id) ?? null
}

export function relatedOsmIds(sourceId: string | undefined): string[] {
  if (!sourceId) return []
  return idsBySourceId.get(sourceId) ?? []
}

export function isEditorCategory(value: unknown): value is EditorCategory {
  return editorCategories.some((category) => category.id === value)
}

export function categoriesFor(kind: DrawGeometry): EditorCategory[] {
  return editorCategories.filter((category) => (category.geometries as readonly string[]).includes(kind)).map((category) => category.id)
}

export function inferEditorCategory(properties: Partial<EditorProperties>, kind: string): EditorCategory {
  const category = properties.category ?? ''
  const highway = properties.highway ?? ''
  if (
    kind === 'LineString' ||
    highway === 'footway' ||
    highway === 'service' ||
    category === 'footway' ||
    category === 'service' ||
    category === 'walking-path'
  ) {
    return 'walking-path'
  }
  if (category === 'garden') return 'garden'
  if (category === 'animal-enclosure') return 'animal-enclosure'
  if (category === 'tree') return 'tree'
  if (category === 'pond' || category === 'water' || properties.natural === 'water') return 'water'
  if (category === 'entrance') return 'entrance'
  if (category === 'facility') return 'facility'
  if (category === 'building' || category === 'animal-building') return 'building'
  if (kind === 'Point') return 'animal-attraction'
  return 'building'
}

export function editorCategoryOf(properties: Partial<EditorProperties>, kind: string): EditorCategory {
  if (isEditorCategory(properties.editorCategory)) return properties.editorCategory
  return inferEditorCategory(properties, kind)
}

export function readProperties(feature: Feature): EditorProperties {
  const properties = feature.properties ?? {}
  const fallbackId = typeof feature.id === 'string' || typeof feature.id === 'number' ? String(feature.id) : ''
  const id = typeof properties.id === 'string' && properties.id ? properties.id : fallbackId
  return {
    ...(properties as EditorProperties),
    id,
    name: typeof properties.name === 'string' ? properties.name : null,
    category: typeof properties.category === 'string' ? properties.category : '',
    source: typeof properties.source === 'string' ? properties.source : '',
    sourceId: typeof properties.sourceId === 'string' ? properties.sourceId : '',
    description: typeof properties.description === 'string' ? properties.description : undefined,
    access: typeof properties.access === 'string' ? properties.access : undefined,
    height: typeof properties.height === 'number' ? properties.height : undefined,
    modelReference: typeof properties.modelReference === 'string' ? properties.modelReference : undefined,
    editorCategory: isEditorCategory(properties.editorCategory) ? properties.editorCategory : undefined,
    editorOrigin: properties.editorOrigin === 'manual' || properties.editorOrigin === 'modified' ? properties.editorOrigin : undefined,
    replacesSourceId: typeof properties.replacesSourceId === 'string' ? properties.replacesSourceId : undefined,
    originLayer: typeof properties.originLayer === 'string' ? (properties.originLayer as MapLayerId) : undefined,
  }
}
