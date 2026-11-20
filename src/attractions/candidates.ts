import type { Feature, Geometry, GeoJsonProperties, Polygon, Position } from 'geojson'
import { mapSources } from '@/data/map-v2/sources'
import { attractionRegistry } from '@/attractions/registry'
import type { AttractionGeometry } from '@/attractions/types'
import type { MapLayerId } from '@/types/map-v2'

export type NameMatch = 'exact' | 'related' | 'shared'

export interface OsmCandidate {
  featureId: string
  sourceId: string
  layer: string
  name: string
  geometryType: 'Point' | 'Polygon'
  geometry: AttractionGeometry
  tags: string[]
  nameMatch: NameMatch
  insideZoo: true
  alsoMatches: string[]
  note: string
}

const searchableLayers: MapLayerId[] = ['attractions', 'buildings', 'enclosures', 'gardens', 'water']
const layerRank: Record<string, number> = { attractions: 0, buildings: 1, enclosures: 2, gardens: 3, water: 4 }
const excludedCategories = new Set(['museum', 'monument', 'cafe', 'ticket', 'shop', 'tree', 'pond', 'zoo-boundary', 'footway', 'service'])
const synonyms: Record<string, string> = { hippo: 'hippopotamus' }

interface IndexedFeature {
  featureId: string
  sourceId: string
  layer: string
  name: string
  geometry: AttractionGeometry
  tags: string[]
}

const boundaryRing = outerRing(mapSources.boundary.features[0]?.geometry)
const indexed = indexFeatures()
const candidatesByAttraction = buildCandidates()
const byFeatureId = new Map(indexed.map((feature) => [feature.featureId, feature]))
const bySourceId = new Map(indexed.map((feature) => [feature.sourceId, feature]))

type Listener = () => void
const highlightListeners = new Set<Listener>()
let highlightedSourceId: string | null = null

export function candidatesFor(attractionId: string): OsmCandidate[] {
  return candidatesByAttraction.get(attractionId) ?? []
}

export function candidateBySource(attractionId: string, sourceId: string): OsmCandidate | null {
  return candidatesFor(attractionId).find((candidate) => candidate.sourceId === sourceId) ?? null
}

export function geometryForFeature(featureId: string): AttractionGeometry | null {
  return byFeatureId.get(featureId)?.geometry ?? null
}

export function geometryForSource(sourceId: string): AttractionGeometry | null {
  return bySourceId.get(sourceId)?.geometry ?? null
}

export function setCandidateHighlight(sourceId: string | null) {
  highlightedSourceId = sourceId
  highlightListeners.forEach((listener) => listener())
}

export function getCandidateHighlight(): OsmCandidate | null {
  if (!highlightedSourceId) return null
  for (const candidates of candidatesByAttraction.values()) {
    const found = candidates.find((candidate) => candidate.sourceId === highlightedSourceId)
    if (found) return found
  }
  return null
}

export function subscribeCandidateHighlight(listener: Listener) {
  highlightListeners.add(listener)
  return () => {
    highlightListeners.delete(listener)
  }
}

function buildCandidates(): Map<string, OsmCandidate[]> {
  const prepared = attractionRegistry.map((attraction) => ({
    attraction,
    matches: indexed.flatMap((feature) => {
      const nameMatch = relateNames(attraction.name, feature.name)
      if (!nameMatch) return []
      return [{ feature, nameMatch }]
    }),
  }))
  const result = new Map<string, OsmCandidate[]>()
  for (const entry of prepared) {
    result.set(
      entry.attraction.id,
      entry.matches.map(({ feature, nameMatch }) => ({
        featureId: feature.featureId,
        sourceId: feature.sourceId,
        layer: feature.layer,
        name: feature.name,
        geometryType: feature.geometry.type,
        geometry: feature.geometry,
        tags: feature.tags,
        nameMatch,
        insideZoo: true,
        alsoMatches: prepared
          .filter((other) => other.attraction.id !== entry.attraction.id && other.matches.some((match) => match.feature.sourceId === feature.sourceId))
          .map((other) => other.attraction.name),
        note: noteFor(entry.attraction.name, feature, nameMatch),
      })),
    )
  }
  return result
}

function noteFor(exhibitName: string, feature: IndexedFeature, nameMatch: NameMatch): string {
  if (nameMatch === 'shared') {
    return `OpenStreetMap names this one ${feature.geometry.type.toLowerCase()} "${feature.name}". It does not provide a separate shape for ${exhibitName}.`
  }
  if (nameMatch === 'related') {
    return `The visitor map says ${exhibitName}. OpenStreetMap names the same kind of structure ${feature.name}.`
  }
  return 'The name, structure tag, and position inside the zoo boundary all agree.'
}

function indexFeatures(): IndexedFeature[] {
  const bySource = new Map<string, IndexedFeature>()
  if (!boundaryRing) return []
  for (const layer of searchableLayers) {
    for (const feature of mapSources[layer].features) {
      const indexedFeature = readFeature(layer, feature)
      if (!indexedFeature || !contained(indexedFeature.geometry, boundaryRing)) continue
      const current = bySource.get(indexedFeature.sourceId)
      if (!current) {
        bySource.set(indexedFeature.sourceId, indexedFeature)
        continue
      }
      const tags = [...new Set([...current.tags, ...indexedFeature.tags])]
      if ((layerRank[layer] ?? 9) < (layerRank[current.layer] ?? 9)) bySource.set(indexedFeature.sourceId, { ...indexedFeature, tags })
      else current.tags = tags
    }
  }
  return [...bySource.values()]
}

function readFeature(layer: string, feature: Feature<Geometry, GeoJsonProperties>): IndexedFeature | null {
  const properties = feature.properties ?? {}
  if (properties.source !== 'OpenStreetMap') return null
  const sourceId = text(properties.sourceId)
  const featureId = text(properties.id) || (typeof feature.id === 'string' ? feature.id : '')
  const name = text(properties.name).trim()
  const category = text(properties.category)
  if (!sourceId || !featureId || !name || excludedCategories.has(category)) return null
  if (!isExhibitStructure(properties as Record<string, unknown>)) return null
  if (feature.geometry?.type !== 'Point' && feature.geometry?.type !== 'Polygon') return null
  const tags = supportingTags(properties as Record<string, unknown>)
  return { featureId, sourceId, layer, name, geometry: feature.geometry, tags }
}

function isExhibitStructure(properties: Record<string, unknown>): boolean {
  const category = text(properties.category)
  const leisure = text(properties.leisure)
  const building = text(properties.building)
  return category === 'animal-building' || category === 'animal-enclosure' || leisure === 'park' || leisure === 'garden' || building === 'yes' || building === 'roof'
}

function supportingTags(properties: Record<string, unknown>): string[] {
  return ['category', 'building', 'leisure', 'natural']
    .map((key) => (text(properties[key]) ? `${key}=${text(properties[key])}` : ''))
    .filter(Boolean)
}

function relateNames(exhibitName: string, osmName: string): NameMatch | null {
  const exhibit = words(exhibitName)
  const osm = words(osmName)
  if (exhibit.length === 0 || osm.length === 0) return null
  if (exhibit.join(' ') === osm.join(' ')) return 'exact'
  const synonym = synonyms[exhibit.join(' ')]
  if (synonym && synonym === osm.join(' ')) return 'related'
  if (exhibit.every((word) => osm.includes(word)) && osm.length > exhibit.length) return 'shared'
  return null
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function contained(geometry: AttractionGeometry, ring: Position[]): boolean {
  const positions = geometry.type === 'Point' ? [geometry.coordinates] : (geometry.coordinates[0] ?? []).slice(0, -1)
  return positions.length > 0 && positions.every((position) => pointInside(ring, position))
}

function pointInside(ring: Position[], point: Position): boolean {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const current = ring[index]
    const prior = ring[previous]
    if (!current || !prior) continue
    const crosses = current[1] > point[1] !== prior[1] > point[1]
    if (crosses && point[0] < ((prior[0] - current[0]) * (point[1] - current[1])) / (prior[1] - current[1]) + current[0]) inside = !inside
  }
  return inside
}

function outerRing(geometry: Geometry | undefined): Position[] | null {
  if (!geometry || geometry.type !== 'Polygon') return null
  const ring = (geometry as Polygon).coordinates[0]
  return ring && ring.length >= 4 ? ring : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
