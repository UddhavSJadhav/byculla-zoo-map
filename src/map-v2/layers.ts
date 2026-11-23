import type { LayerSpecification, Map } from 'maplibre-gl'
import { mapSources } from '@/data/map-v2/sources'
import { emptyFeatureCollection } from '@/map-v2/accuracyCircle'
import { pathAccessLayerIds } from '@/map-v2/pathAccessLayer'
import type { MapLayerId } from '@/types/map-v2'

const labelFont = ['Noto Sans Regular']
const named = ['==', ['typeof', ['get', 'name']], 'string'] as const

const animalFill = [
  'match',
  ['get', 'name'],
  'Penguin',
  '#c5dff0',
  'Lion',
  '#f3ddb0',
  'Birds Paradise',
  '#f6cddd',
  'Otter',
  '#d7eee6',
  'Turtle',
  '#d9ebc8',
  'Elephant',
  '#ead4c2',
  'Deer',
  '#eddcb8',
  'Hippopotamus',
  '#d5e6f2',
  'Bear',
  '#e6d4c2',
  'Tiger',
  '#f6d4b4',
  'Hyena&Leopard',
  '#efe0cc',
  'Aqua Birds',
  '#d7e8f2',
  '#f0d8c8',
] as const

export const layerSwatches: Record<MapLayerId, string> = {
  boundary: '#f4ead7',
  paths: '#efe4cf',
  buildings: '#e4d3b8',
  gardens: '#6f8f55',
  enclosures: '#e7d4c4',
  trees: '#3e7a46',
  attractions: '#8d5a3c',
  water: '#8ebfd0',
}

export const layerGroupIds: Record<MapLayerId, string[]> = {
  boundary: ['zoo-ground', 'zoo-boundary-label'],
  paths: ['zoo-paths-casing', 'zoo-paths', ...pathAccessLayerIds],
  buildings: ['zoo-buildings', 'zoo-buildings-line'],
  gardens: ['zoo-gardens', 'zoo-garden-labels'],
  enclosures: ['zoo-enclosures', 'zoo-enclosures-line', 'zoo-enclosure-labels'],
  trees: ['zoo-trees', 'zoo-tree-labels'],
  attractions: ['zoo-attraction-labels'],
  water: ['zoo-water', 'zoo-water-line', 'zoo-water-points'],
}

const zooLayers = [
  {
    id: 'zoo-ground',
    type: 'fill',
    source: 'boundary',
    paint: { 'fill-color': '#f4ead7', 'fill-opacity': 1 },
  },
  {
    id: 'zoo-gardens',
    type: 'fill',
    source: 'gardens',
    paint: { 'fill-color': '#6f8f55', 'fill-opacity': 0.9 },
  },
  {
    id: 'zoo-water',
    type: 'fill',
    source: 'water',
    paint: { 'fill-color': '#8ebfd0', 'fill-opacity': 0.9 },
  },
  {
    id: 'zoo-water-line',
    type: 'line',
    source: 'water',
    paint: { 'line-color': '#6aa3b5', 'line-width': 1.2 },
  },
  {
    id: 'zoo-water-points',
    type: 'circle',
    source: 'water',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': '#8ebfd0',
      'circle-radius': 6,
      'circle-stroke-color': '#f4ead7',
      'circle-stroke-width': 1,
    },
  },
  {
    id: 'zoo-enclosures',
    type: 'fill',
    source: 'enclosures',
    paint: { 'fill-color': '#e7d4c4', 'fill-opacity': 0.95 },
  },
  {
    id: 'zoo-paths-casing',
    type: 'line',
    source: 'paths',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#e4d2b0',
      'line-width': pathWidth(1.8),
    },
  },
  {
    id: 'zoo-paths',
    type: 'line',
    source: 'paths',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#fff8ee',
      'line-width': pathWidth(0),
    },
  },
  {
    id: 'zoo-buildings',
    type: 'fill',
    source: 'buildings',
    paint: {
      'fill-color': ['case', ['==', ['get', 'category'], 'animal-building'], animalFill, '#e4d3b8'],
      'fill-opacity': 0.96,
    },
  },
  {
    id: 'zoo-buildings-line',
    type: 'line',
    source: 'buildings',
    paint: { 'line-color': '#b7a288', 'line-width': 1 },
  },
  {
    id: 'zoo-enclosures-line',
    type: 'line',
    source: 'enclosures',
    paint: { 'line-color': '#8d6b4a', 'line-width': 2 },
  },
  {
    id: 'zoo-trees',
    type: 'circle',
    source: 'trees',
    paint: {
      'circle-color': '#3e7a46',
      'circle-stroke-color': '#f4ead7',
      'circle-stroke-width': 1,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 1.5, 17, 3, 19, 6],
    },
  },
  {
    id: 'gps-accuracy',
    type: 'fill',
    source: 'gps-accuracy',
    paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.15 },
  },
  {
    id: 'gps-accuracy-line',
    type: 'line',
    source: 'gps-accuracy',
    paint: { 'line-color': '#2563eb', 'line-width': 1, 'line-opacity': 0.7 },
  },
  label('zoo-boundary-label', 'boundary', 15, 16.8, false),
  label('zoo-garden-labels', 'gardens', 16, 22, false),
  label('zoo-enclosure-labels', 'enclosures', 16, 22, false),
  label('zoo-attraction-labels', 'attractions', 16, 22, false),
  label('zoo-tree-labels', 'trees', 18.5, 22, true),
] as const

export function addZooLayers(map: Map) {
  for (const [id, data] of Object.entries(mapSources)) {
    map.addSource(id, { type: 'geojson', data })
  }
  map.addSource('gps-accuracy', { type: 'geojson', data: emptyFeatureCollection() })
  for (const layer of zooLayers) {
    map.addLayer(layer as LayerSpecification)
  }
}

function pathWidth(extra: number) {
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    15,
    ['+', extra, ['case', ['==', ['get', 'highway'], 'service'], 1.4, 2.6]],
    18,
    ['+', extra, ['case', ['==', ['get', 'highway'], 'service'], 5, 11]],
    20,
    ['+', extra, ['case', ['==', ['get', 'highway'], 'service'], 8, 18]],
  ]
}

function label(id: string, source: MapLayerId, minzoom: number, maxzoom: number, optional: boolean) {
  return {
    id,
    type: 'symbol' as const,
    source,
    minzoom,
    maxzoom,
    filter: named,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': labelFont,
      'text-size': source === 'trees' ? 11 : 13,
      'text-optional': optional,
      'text-padding': source === 'trees' ? 1 : 4,
      'text-max-width': 12,
      'text-anchor': 'center',
      'symbol-sort-key': source === 'trees' ? 2 : 0,
    },
    paint: {
      'text-color': '#3f3428',
      'text-halo-color': '#f7f1e4',
      'text-halo-width': 1.2,
    },
  }
}
