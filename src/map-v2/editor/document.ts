import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson'
import { mapSources } from '@/data/map-v2/sources'
import type { MapLayerId } from '@/types/map-v2'
import { mapLayerIds } from '@/types/map-v2'
import { editorCategoryOf, inferEditorCategory, isEditorCategory, osmRecord, readProperties, relatedOsmIds } from '@/map-v2/editor/catalog'
import { geometryKind, polygonGeometry, validateGeometry } from '@/map-v2/editor/geometry'
import type { EditorCategory, EditorDocument, EditorFeature, EditorProperties, FeatureFormValues } from '@/map-v2/editor/types'

const storageKey = 'zoo-map.editor.v1'

export type RenderSlot = MapLayerId | 'added'

export function emptyEditorDocument(): EditorDocument {
  return { type: 'FeatureCollection', version: 1, hiddenIds: [], features: [] }
}

export function loadEditorDocument(): EditorDocument {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return emptyEditorDocument()
    return normalizeDocument(JSON.parse(raw)).document
  } catch {
    return emptyEditorDocument()
  }
}

export function saveEditorDocument(document: EditorDocument) {
  localStorage.setItem(storageKey, JSON.stringify(document))
}

export function clearEditorDocument() {
  localStorage.removeItem(storageKey)
}

export function featureId(feature: Feature): string {
  return readProperties(feature).id
}

export function resolveFeature(document: EditorDocument, id: string): EditorFeature | null {
  const edited = document.features.find((feature) => featureId(feature) === id)
  if (edited) return edited
  if (document.hiddenIds.includes(id)) return null
  const record = osmRecord(id)
  if (!record) return null
  return {
    type: 'Feature',
    id: record.feature.id,
    geometry: record.feature.geometry,
    properties: readProperties(record.feature),
  }
}

export function renderSlots(feature: Feature): RenderSlot[] {
  const properties = readProperties(feature)
  const kind = feature.geometry?.type ?? ''
  const category = editorCategoryOf(properties, kind)
  if (category === 'walking-path' && kind === 'LineString') return ['paths']
  if (category === 'animal-enclosure' && kind === 'Polygon') return ['enclosures']
  if (category === 'garden' && kind === 'Polygon') return ['gardens']
  if (category === 'tree' && kind === 'Point') return ['trees']
  if (category === 'water' && (kind === 'Polygon' || kind === 'Point')) return ['water']
  if ((category === 'building' || category === 'animal-attraction') && kind === 'Polygon') {
    const slots: RenderSlot[] = ['buildings']
    if (properties.name?.trim()) slots.push('attractions')
    return slots
  }
  if (category === 'animal-attraction' || category === 'entrance' || category === 'facility') return ['added']
  if (properties.originLayer && mapLayerIds.includes(properties.originLayer)) return [properties.originLayer]
  return ['added']
}

export function composeLayer(
  layerId: MapLayerId,
  document: EditorDocument,
  preview: EditorFeature | null,
): FeatureCollection<Geometry, GeoJsonProperties> {
  const hidden = new Set(document.hiddenIds)
  const previewId = preview ? featureId(preview) : ''
  const features: Feature<Geometry, GeoJsonProperties>[] = mapSources[layerId].features.filter((feature) => {
    const id = feature.properties && typeof feature.properties.id === 'string' ? feature.properties.id : ''
    return id !== previewId && !hidden.has(id)
  })
  const extras = preview && !document.features.some((feature) => featureId(feature) === previewId) ? [preview] : []
  for (const feature of [...document.features, ...extras]) {
    const shown = preview && featureId(feature) === previewId ? preview : feature
    if (renderSlots(shown).includes(layerId)) features.push(shown)
  }
  return { type: 'FeatureCollection', features }
}

export function composeAdded(document: EditorDocument, preview: EditorFeature | null): FeatureCollection<Geometry, EditorProperties> {
  const previewId = preview ? featureId(preview) : ''
  const extras = preview && !document.features.some((feature) => featureId(feature) === previewId) ? [preview] : []
  const features = [...document.features, ...extras]
    .map((feature) => (preview && featureId(feature) === previewId ? preview : feature))
    .filter((feature) => renderSlots(feature).includes('added'))
  return { type: 'FeatureCollection', features }
}

export function visibleFeatures(document: EditorDocument): EditorFeature[] {
  const hidden = new Set(document.hiddenIds)
  const features: EditorFeature[] = []
  for (const layerId of mapLayerIds) {
    for (const feature of mapSources[layerId].features) {
      const id = feature.properties && typeof feature.properties.id === 'string' ? feature.properties.id : ''
      if (!id || hidden.has(id)) continue
      features.push(tagDataset(feature, layerId))
    }
  }
  for (const feature of document.features) {
    const slot = renderSlots(feature).find((item) => item !== 'attractions') ?? 'added'
    features.push(tagDataset(feature, slot))
  }
  return features
}

function tagDataset(feature: Feature, dataset: string): EditorFeature {
  return {
    type: 'Feature',
    id: feature.id,
    geometry: feature.geometry,
    properties: { ...readProperties(feature), dataset },
  }
}

export function emptyForm(category: EditorCategory): FeatureFormValues {
  return {
    id: `manual-${crypto.randomUUID()}`,
    name: '',
    category,
    description: '',
    source: 'Manual',
    access: '',
    height: '',
    modelReference: '',
  }
}

export function formFromFeature(feature: Feature): FeatureFormValues {
  const properties = readProperties(feature)
  const kind = feature.geometry?.type ?? 'Point'
  return {
    id: properties.id,
    name: properties.name ?? '',
    category: editorCategoryOf(properties, kind),
    description: properties.description ?? '',
    source: properties.source || 'OpenStreetMap',
    access: properties.access ?? '',
    height: properties.height === undefined ? '' : String(properties.height),
    modelReference: properties.modelReference ?? '',
  }
}

export function formsEqual(left: FeatureFormValues, right: FeatureFormValues): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.category === right.category &&
    left.description === right.description &&
    left.source === right.source &&
    left.access === right.access &&
    left.height === right.height &&
    left.modelReference === right.modelReference
  )
}

export function buildManualFeature(form: FeatureFormValues, geometry: Geometry): { feature: EditorFeature } | { error: string } {
  const applied = applyForm(
    {
      type: 'Feature',
      geometry,
      properties: {
        id: form.id,
        name: null,
        category: form.category,
        source: 'Manual',
        sourceId: '',
        editorOrigin: 'manual',
        editorCategory: form.category,
      },
    },
    form,
  )
  if ('error' in applied) return applied
  return { feature: applied.feature }
}

export function applyForm(feature: EditorFeature, form: FeatureFormValues): { feature: EditorFeature } | { error: string } {
  const id = form.id.trim()
  if (!id) return { error: 'Feature ID is required.' }
  const geometryError = validateGeometry(feature.geometry)
  if (geometryError) return { error: geometryError }
  const kind = geometryKind(feature.geometry)
  if (!kind) return { error: 'Use a Point, LineString, or Polygon.' }
  let height: number | undefined
  if (form.height.trim()) {
    height = Number(form.height)
    if (!Number.isFinite(height) || height < 0) return { error: 'Height must be zero or greater, or left blank.' }
  }
  const properties = readProperties(feature)
  const previousCategory = inferEditorCategory({ ...properties, editorCategory: undefined }, kind)
  properties.id = id
  properties.name = form.name.trim() || null
  properties.description = form.description.trim()
  properties.source = form.source.trim() || 'Manual'
  properties.editorCategory = form.category
  if (properties.editorOrigin === 'manual' || form.category !== previousCategory) properties.category = form.category
  if (properties.editorOrigin === 'manual') properties.sourceId = `manual/${id}`
  if (form.access) properties.access = form.access
  else delete properties.access
  if (height === undefined) delete properties.height
  else properties.height = height
  if (form.modelReference.trim()) properties.modelReference = form.modelReference.trim()
  else delete properties.modelReference
  if (properties.editorOrigin === 'manual' && properties.category === 'walking-path' && !properties.highway) {
    properties.highway = 'footway'
  }
  return { feature: { type: 'Feature', id, geometry: feature.geometry, properties } }
}

export function adoptFeature(document: EditorDocument, feature: EditorFeature): EditorDocument {
  const properties = readProperties(feature)
  const record = osmRecord(properties.id)
  const hidden = new Set(document.hiddenIds)
  const sourceId = properties.replacesSourceId ?? (record ? readProperties(record.feature).sourceId : undefined)
  if (record) {
    for (const related of relatedOsmIds(sourceId)) hidden.add(related)
    hidden.add(properties.id)
  }
  const stored: EditorFeature = {
    type: 'Feature',
    id: properties.id,
    geometry: feature.geometry,
    properties: {
      ...properties,
      editorOrigin: properties.editorOrigin ?? (record ? 'modified' : 'manual'),
      editorCategory: editorCategoryOf(properties, feature.geometry?.type ?? ''),
      replacesSourceId: properties.replacesSourceId ?? (record ? sourceId : undefined),
      originLayer: properties.originLayer ?? record?.layer,
    },
  }
  const features = document.features.filter((item) => featureId(item) !== properties.id)
  return { ...document, hiddenIds: [...hidden], features: [...features, stored] }
}

export function deleteFromDocument(document: EditorDocument, id: string): EditorDocument {
  const existing = document.features.find((feature) => featureId(feature) === id)
  const hidden = new Set(document.hiddenIds)
  const sourceId = existing?.properties.replacesSourceId ?? osmRecord(id)?.feature.properties?.sourceId
  if (typeof sourceId === 'string') {
    for (const related of relatedOsmIds(sourceId)) hidden.add(related)
  }
  if (osmRecord(id)) hidden.add(id)
  return {
    ...document,
    hiddenIds: [...hidden],
    features: document.features.filter((feature) => featureId(feature) !== id),
  }
}

export function restoreOriginal(document: EditorDocument, id: string): EditorDocument {
  const existing = document.features.find((feature) => featureId(feature) === id)
  const sourceId = existing?.properties.replacesSourceId
  if (!sourceId) return document
  const related = new Set(relatedOsmIds(sourceId))
  return {
    ...document,
    features: document.features.filter((feature) => featureId(feature) !== id),
    hiddenIds: document.hiddenIds.filter((hiddenId) => !related.has(hiddenId)),
  }
}

export function idConflict(document: EditorDocument, nextId: string, currentId: string): string | null {
  if (nextId === currentId) return null
  if (document.features.some((feature) => featureId(feature) === nextId)) return 'That feature ID is already used by a manual edit.'
  if (osmRecord(nextId) && !document.hiddenIds.includes(nextId)) return 'That feature ID belongs to an OpenStreetMap feature.'
  return null
}

export function normalizeDocument(raw: unknown): { document: EditorDocument; warnings: string[] } {
  const warnings: string[] = []
  if (!raw || typeof raw !== 'object') return { document: emptyEditorDocument(), warnings: ['The file is not a GeoJSON object.'] }
  const record = raw as { type?: unknown; features?: unknown; hiddenIds?: unknown }
  if (record.type !== 'FeatureCollection' || !Array.isArray(record.features)) {
    return { document: emptyEditorDocument(), warnings: ['Choose a GeoJSON FeatureCollection.'] }
  }
  const features: EditorFeature[] = []
  for (const item of record.features) {
    const normalized = normalizeFeature(item)
    if (typeof normalized === 'string') {
      warnings.push(normalized)
      continue
    }
    features.push(normalized)
  }
  const hiddenIds = Array.isArray(record.hiddenIds) ? record.hiddenIds.filter((id): id is string => typeof id === 'string') : []
  return { document: { type: 'FeatureCollection', version: 1, hiddenIds, features }, warnings }
}

function normalizeFeature(raw: unknown): EditorFeature | string {
  if (!raw || typeof raw !== 'object') return 'Skipped a feature that is not an object.'
  const feature = raw as Feature
  const kind = geometryKind(feature.geometry)
  if (!kind || !feature.geometry) return 'Skipped a feature that is not a Point, LineString, or Polygon.'
  const geometry = kind === 'Polygon' ? polygonGeometry(readOuter(feature.geometry)) : feature.geometry
  const error = validateGeometry(geometry)
  if (error) return `Skipped a ${kind}: ${error}`
  const properties = readProperties({ ...feature, geometry })
  if (!properties.id) properties.id = `manual-${crypto.randomUUID()}`
  if (!properties.editorOrigin) properties.editorOrigin = properties.source === 'OpenStreetMap' ? 'modified' : 'manual'
  if (!isEditorCategory(properties.editorCategory)) properties.editorCategory = inferEditorCategory(properties, kind)
  if (!properties.category) properties.category = properties.editorCategory
  if (!properties.source) properties.source = properties.editorOrigin === 'manual' ? 'Manual' : 'OpenStreetMap'
  if (!properties.sourceId) properties.sourceId = properties.editorOrigin === 'manual' ? `manual/${properties.id}` : properties.id
  return { type: 'Feature', id: properties.id, geometry, properties }
}

function readOuter(geometry: Geometry): [number, number][] {
  if (geometry.type !== 'Polygon') return []
  const ring = geometry.coordinates[0] ?? []
  return ring
    .filter((position) => position.length >= 2 && Number.isFinite(position[0]) && Number.isFinite(position[1]))
    .map((position) => [position[0], position[1]])
}

export function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function collectionOf(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features }
}
