import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson'
import type { FilterSpecification, GeoJSONSource, LayerSpecification, Map } from 'maplibre-gl'
import { mapLayerIds, type MapLayerId } from '@/types/map-v2'
import { outerVertices, pointGeometry, polygonGeometry, type LngLat } from '@/map-v2/editor/geometry'
import { composeAdded, composeLayer } from '@/map-v2/editor/document'
import type { DrawGeometry, EditorDocument, EditorFeature, EditorProperties } from '@/map-v2/editor/types'

export const selectableLayerIds = [
  'registry-attraction-fill',
  'registry-attraction-line',
  'registry-attraction-circle',
  'registry-attraction-label',
  'editor-tree-target',
  'editor-water-target',
  'zoo-added-circle',
  'zoo-added-fill',
  'zoo-added-line',
  'zoo-added-label',
  'zoo-paths',
  'zoo-paths-casing',
  'zoo-buildings',
  'zoo-buildings-line',
  'zoo-gardens',
  'zoo-enclosures',
  'zoo-enclosures-line',
  'zoo-trees',
  'zoo-water',
  'zoo-water-line',
  'zoo-water-points',
  'zoo-garden-labels',
  'zoo-enclosure-labels',
  'zoo-attraction-labels',
  'zoo-tree-labels',
]

export interface PaintInput {
  document: EditorDocument
  preview: EditorFeature | null
  draftKind: DrawGeometry | null
  draftPoints: LngLat[]
  selection: EditorFeature | null
  showVertices: boolean
  activeVertex: number | null
  editing: boolean
}

const categoryColor: unknown[] = [
  'match',
  ['coalesce', ['get', 'editorCategory'], ['get', 'category']],
  'garden',
  '#6f8f55',
  'water',
  '#8ebfd0',
  'animal-enclosure',
  '#e7d4c4',
  'facility',
  '#efe0cc',
  'building',
  '#e4d3b8',
  'entrance',
  '#8d5a3c',
  'tree',
  '#3e7a46',
  'animal-attraction',
  '#f0d8c8',
  '#f0d8c8',
]

export function paintMap(map: Map, input: PaintInput) {
  ensureCustomLayers(map)
  syncTargetLayers(map, input.editing)
  for (const layerId of mapLayerIds) {
    setGeoJson(map, layerId, composeLayer(layerId, input.document, input.preview))
  }
  setGeoJson(map, 'added', composeAdded(input.document, input.preview))
  setGeoJson(map, 'editor-overlay', overlayCollection(input))
}

function ensureCustomLayers(map: Map) {
  const beforeLabels = map.getLayer('zoo-boundary-label') ? 'zoo-boundary-label' : undefined
  if (!map.getSource('added')) {
    map.addSource('added', { type: 'geojson', data: emptyCollection() })
    for (const layer of addedLayers) map.addLayer(layer, beforeLabels)
  }
  if (!map.getSource('editor-overlay')) {
    map.addSource('editor-overlay', { type: 'geojson', data: emptyCollection() })
    for (const layer of overlayLayers) map.addLayer(layer)
  }
}

function syncTargetLayers(map: Map, editing: boolean) {
  syncTarget(map, editing, 'editor-tree-target', 'trees')
  syncTarget(map, editing, 'editor-water-target', 'water', ['==', ['geometry-type'], 'Point'])
}

function syncTarget(map: Map, editing: boolean, id: string, source: MapLayerId, filter?: FilterSpecification) {
  if (!editing) {
    if (map.getLayer(id)) map.removeLayer(id)
    return
  }
  if (map.getLayer(id) || !map.getSource(source)) return
  const before = map.getLayer('editor-draft-fill') ? 'editor-draft-fill' : undefined
  map.addLayer(
    {
      id,
      type: 'circle',
      source,
      ...(filter ? { filter } : {}),
      paint: { 'circle-radius': 14, 'circle-color': '#000000', 'circle-opacity': 0.01 },
    },
    before,
  )
}

function setGeoJson(map: Map, id: string, data: FeatureCollection) {
  const source = map.getSource(id)
  if (source && source.type === 'geojson') (source as GeoJSONSource).setData(data)
}

function overlayCollection(input: PaintInput): FeatureCollection<Geometry, GeoJsonProperties> {
  if (!input.editing) return emptyCollection()
  const features: Feature<Geometry, GeoJsonProperties>[] = []
  if (input.draftKind && input.draftPoints.length > 0) features.push(...draftFeatures(input.draftKind, input.draftPoints))
  const selectedGeometry = input.preview?.geometry ?? input.selection?.geometry
  if (input.selection && selectedGeometry) {
    features.push(overlayFeature('selection', selectedGeometry))
    if (input.showVertices) features.push(...vertexFeatures(selectedGeometry, input.activeVertex))
  }
  return { type: 'FeatureCollection', features }
}

function draftFeatures(kind: DrawGeometry, points: LngLat[]): Feature<Geometry, GeoJsonProperties>[] {
  const features: Feature<Geometry, GeoJsonProperties>[] = points.map((coordinates) => ({
    type: 'Feature',
    properties: { role: 'draft-point' },
    geometry: pointGeometry(coordinates),
  }))
  if (kind === 'Polygon' && points.length >= 3) {
    features.push(overlayFeature('draft', polygonGeometry(points)))
  }
  if (kind !== 'Point' && points.length >= 2) {
    const line = kind === 'Polygon' ? [...points, points[0]] : points
    features.push({
      type: 'Feature',
      properties: { role: 'draft' },
      geometry: { type: 'LineString', coordinates: line },
    })
  }
  return features
}

function overlayFeature(role: string, geometry: Geometry): Feature<Geometry, GeoJsonProperties> {
  return { type: 'Feature', properties: { role }, geometry }
}

export function vertexFeatures(geometry: Geometry, activeVertex: number | null): Feature[] {
  const vertices = outerVertices(geometry)
  if (!vertices) return []
  const features: Feature[] = vertices.map((coordinates, index) => ({
    type: 'Feature',
    properties: {
      role: 'vertex',
      kind: 'vertex',
      vertexIndex: index,
      active: index === activeVertex,
    },
    geometry: pointGeometry(coordinates),
  }))
  if (geometry.type === 'Point' || vertices.length < 2) return features
  const segments = geometry.type === 'Polygon' ? vertices.length : vertices.length - 1
  for (let index = 0; index < segments; index += 1) {
    const start = vertices[index]
    const end = vertices[(index + 1) % vertices.length]
    features.push({
      type: 'Feature',
      properties: { role: 'vertex', kind: 'midpoint', vertexIndex: index + 1, active: false },
      geometry: pointGeometry([(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]),
    })
  }
  return features
}

function emptyCollection(): FeatureCollection<Geometry, EditorProperties> {
  return { type: 'FeatureCollection', features: [] }
}

const addedLayers = [
  {
    id: 'zoo-added-fill',
    type: 'fill',
    source: 'added',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': categoryColor, 'fill-opacity': 0.95 },
  },
  {
    id: 'zoo-added-line',
    type: 'line',
    source: 'added',
    filter: ['!=', ['geometry-type'], 'Point'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#b7a288', 'line-width': 1.5 },
  },
  {
    id: 'zoo-added-circle',
    type: 'circle',
    source: 'added',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': [
        'match',
        ['coalesce', ['get', 'editorCategory'], ['get', 'category']],
        'water',
        '#6aa3b5',
        'tree',
        '#3e7a46',
        'facility',
        '#9a7b4f',
        'entrance',
        '#8d5a3c',
        'animal-attraction',
        '#c47b4a',
        '#8d5a3c',
      ],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 4, 18, 7, 20, 9],
      'circle-stroke-color': '#f7f1e4',
      'circle-stroke-width': 1.5,
    },
  },
  {
    id: 'zoo-added-label',
    type: 'symbol',
    source: 'added',
    minzoom: 16,
    filter: ['==', ['typeof', ['get', 'name']], 'string'],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 13,
      'text-offset': [0, 1.05],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: { 'text-color': '#3f3428', 'text-halo-color': '#f7f1e4', 'text-halo-width': 1.2 },
  },
] as LayerSpecification[]

const overlayLayers = [
  {
    id: 'editor-draft-fill',
    type: 'fill',
    source: 'editor-overlay',
    filter: ['all', ['==', ['get', 'role'], 'draft'], ['==', ['geometry-type'], 'Polygon']],
    paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.18 },
  },
  {
    id: 'editor-draft-line',
    type: 'line',
    source: 'editor-overlay',
    filter: ['all', ['==', ['get', 'role'], 'draft'], ['==', ['geometry-type'], 'LineString']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#1d4ed8', 'line-width': 2.5, 'line-dasharray': [1.2, 1] },
  },
  {
    id: 'editor-selection-fill',
    type: 'fill',
    source: 'editor-overlay',
    filter: ['all', ['==', ['get', 'role'], 'selection'], ['==', ['geometry-type'], 'Polygon']],
    paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.12 },
  },
  {
    id: 'editor-selection-line',
    type: 'line',
    source: 'editor-overlay',
    filter: ['all', ['==', ['get', 'role'], 'selection'], ['!=', ['geometry-type'], 'Point']],
    paint: { 'line-color': '#1d4ed8', 'line-width': 3 },
  },
  {
    id: 'editor-draft-points',
    type: 'circle',
    source: 'editor-overlay',
    filter: ['==', ['get', 'role'], 'draft-point'],
    paint: { 'circle-radius': 5, 'circle-color': '#1d4ed8', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
  },
  {
    id: 'editor-selection-point',
    type: 'circle',
    source: 'editor-overlay',
    filter: ['all', ['==', ['get', 'role'], 'selection'], ['==', ['geometry-type'], 'Point']],
    paint: { 'circle-radius': 9, 'circle-color': '#1d4ed8', 'circle-opacity': 0.25, 'circle-stroke-color': '#1d4ed8', 'circle-stroke-width': 2 },
  },
  {
    id: 'editor-vertices',
    type: 'circle',
    source: 'editor-overlay',
    filter: ['==', ['get', 'role'], 'vertex'],
    paint: {
      'circle-radius': ['case', ['==', ['get', 'kind'], 'midpoint'], 4, ['==', ['get', 'active'], true], 8, 6],
      'circle-color': ['case', ['==', ['get', 'kind'], 'midpoint'], '#93c5fd', '#1d4ed8'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  },
] as LayerSpecification[]
