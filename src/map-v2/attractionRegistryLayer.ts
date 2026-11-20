import type { Feature, FeatureCollection, Geometry, GeoJsonProperties, Position } from 'geojson'
import type { GeoJSONSource, LayerSpecification, Map } from 'maplibre-gl'
import { geometryForFeature, geometryForSource } from '@/attractions/candidates'
import type { AttractionGeometry, AttractionRecord } from '@/attractions/types'
import { featureIdForAttraction } from '@/attractions/store'

export const attractionRegistryLayerIds = [
  'registry-attraction-fill',
  'registry-attraction-line',
  'registry-attraction-circle',
  'registry-attraction-label',
] as const

export function syncAttractionRegistry(map: Map, attractions: AttractionRecord[]) {
  const data = collectionFor(attractions)
  if (!map.getSource('attraction-registry')) {
    map.addSource('attraction-registry', { type: 'geojson', data })
    const before = map.getLayer('editor-draft-fill') ? 'editor-draft-fill' : map.getLayer('zoo-boundary-label') ? 'zoo-boundary-label' : undefined
    for (const layer of registryLayers) map.addLayer(layer, before)
    return
  }
  const source = map.getSource('attraction-registry')
  if (source && source.type === 'geojson') (source as GeoJSONSource).setData(data)
}

export function syncCandidateHighlight(map: Map, geometry: AttractionGeometry | null) {
  const data = highlightCollection(geometry)
  if (!map.getSource('attraction-candidate')) {
    map.addSource('attraction-candidate', { type: 'geojson', data })
    const before = map.getLayer('editor-draft-fill') ? 'editor-draft-fill' : undefined
    for (const layer of highlightLayers) map.addLayer(layer, before)
    return
  }
  const source = map.getSource('attraction-candidate')
  if (source && source.type === 'geojson') (source as GeoJSONSource).setData(data)
}

function collectionFor(attractions: AttractionRecord[]): FeatureCollection<Geometry, GeoJsonProperties> {
  const features: Feature<Geometry, GeoJsonProperties>[] = []
  const shared: Record<string, AttractionRecord[]> = {}
  for (const attraction of attractions) {
    if (!attraction.geometry) continue
    if (attraction.geometryOrigin === 'osm' && attraction.sourceFeatureId) {
      const group = shared[attraction.sourceFeatureId] ?? []
      group.push(attraction)
      shared[attraction.sourceFeatureId] = group
      continue
    }
    features.push(...featuresFor([attraction], attraction.geometry, featureIdForAttraction(attraction.id)))
  }
  for (const [sourceId, group] of Object.entries(shared)) {
    const sample = group[0]
    const geometry = (sample?.osmFeatureId ? geometryForFeature(sample.osmFeatureId) : null) ?? geometryForSource(sourceId) ?? sample?.geometry ?? null
    if (!sample || !geometry) continue
    features.push(...featuresFor(group, geometry, featureIdForAttraction(sample.id)))
  }
  return { type: 'FeatureCollection', features }
}

function featuresFor(group: AttractionRecord[], geometry: AttractionGeometry, id: string): Feature<Geometry, GeoJsonProperties>[] {
  const sorted = [...group].sort((left, right) => left.exhibitNumber - right.exhibitNumber)
  const first = sorted[0]
  if (!first) return []
  const label = sorted.map((attraction) => `${attraction.exhibitNumber}. ${attraction.name}`).join('\n')
  const properties = {
    id,
    attractionId: first.id,
    attractionIds: sorted.map((attraction) => attraction.id).join(','),
    name: label,
    exhibitNumber: first.exhibitNumber,
    origin: first.geometryOrigin ?? 'manual',
    sourceFeatureId: first.sourceFeatureId,
    anchor: geometry.type === 'Point' ? 'point' : 'area',
    label,
  }
  const features: Feature<Geometry, GeoJsonProperties>[] = [{ type: 'Feature', id, geometry, properties }]
  if (geometry.type === 'Polygon') {
    const center = ringCenter(geometry.coordinates[0] ?? [])
    if (center) features.push({ type: 'Feature', properties: { ...properties, anchor: 'label' }, geometry: { type: 'Point', coordinates: center } })
  }
  return features
}

function ringCenter(ring: Position[]): [number, number] | null {
  const corners = ring.length > 1 && same(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring
  if (corners.length === 0) return null
  let longitude = 0
  let latitude = 0
  for (const position of corners) {
    longitude += Number(position[0])
    latitude += Number(position[1])
  }
  return [longitude / corners.length, latitude / corners.length]
}

function same(left: Position | undefined, right: Position | undefined) {
  if (!left || !right) return false
  return left[0] === right[0] && left[1] === right[1]
}

const registryLayers = [
  {
    id: 'registry-attraction-fill',
    type: 'fill',
    source: 'attraction-registry',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': ['case', ['==', ['get', 'origin'], 'osm'], '#c45c26', '#e7d4c4'],
      'fill-opacity': ['case', ['==', ['get', 'origin'], 'osm'], 0.16, 0.72],
    },
  },
  {
    id: 'registry-attraction-line',
    type: 'line',
    source: 'attraction-registry',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'line-color': ['case', ['==', ['get', 'origin'], 'osm'], '#c45c26', '#8d6b4a'],
      'line-width': ['case', ['==', ['get', 'origin'], 'osm'], 2.5, 2],
    },
  },
  {
    id: 'registry-attraction-circle',
    type: 'circle',
    source: 'attraction-registry',
    filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'anchor'], 'point']],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 7, 18, 11, 20, 14],
      'circle-color': '#c47b4a',
      'circle-stroke-color': '#f7f1e4',
      'circle-stroke-width': 2,
    },
  },
  {
    id: 'registry-attraction-label',
    type: 'symbol',
    source: 'attraction-registry',
    filter: ['==', ['geometry-type'], 'Point'],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 13,
      'text-anchor': 'top',
      'text-offset': [0, 0.85],
      'text-max-width': 10,
    },
    paint: { 'text-color': '#3f3428', 'text-halo-color': '#f7f1e4', 'text-halo-width': 1.2 },
  },
] as LayerSpecification[]

function highlightCollection(geometry: AttractionGeometry | null): FeatureCollection<Geometry, GeoJsonProperties> {
  if (!geometry) return { type: 'FeatureCollection', features: [] }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry }] }
}

const highlightLayers = [
  {
    id: 'registry-candidate-fill',
    type: 'fill',
    source: 'attraction-candidate',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': '#c45c26', 'fill-opacity': 0.28 },
  },
  {
    id: 'registry-candidate-line',
    type: 'line',
    source: 'attraction-candidate',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'line-color': '#9a3412', 'line-width': 3, 'line-dasharray': [1.2, 0.8] },
  },
  {
    id: 'registry-candidate-circle',
    type: 'circle',
    source: 'attraction-candidate',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 12, 'circle-color': '#c45c26', 'circle-opacity': 0.35, 'circle-stroke-color': '#9a3412', 'circle-stroke-width': 2 },
  },
] as LayerSpecification[]
