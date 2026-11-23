import type { LineString, Position } from 'geojson'
import { mapSources } from '@/data/map-v2/sources'

export interface PathSeed {
  osmFeatureId: string
  sourceId: string
  highway: string
  osmAccess: string
  geometry: LineString
  connectedIds: readonly string[]
}

export const pathCatalog: readonly PathSeed[] = buildCatalog()

function buildCatalog(): PathSeed[] {
  const seeds: PathSeed[] = []
  const nodes = new Map<string, string[]>()
  for (const feature of mapSources.paths.features) {
    if (feature.geometry?.type !== 'LineString') continue
    const properties = feature.properties ?? {}
    const osmFeatureId = typeof feature.id === 'string' ? feature.id : typeof properties.id === 'string' ? properties.id : ''
    const sourceId = typeof properties.sourceId === 'string' ? properties.sourceId : ''
    if (!osmFeatureId || !sourceId) continue
    const geometry = feature.geometry
    seeds.push({
      osmFeatureId,
      sourceId,
      highway: typeof properties.highway === 'string' ? properties.highway : 'footway',
      osmAccess: typeof properties.access === 'string' ? properties.access : '',
      geometry,
      connectedIds: [],
    })
    const seen = new Set<string>()
    for (const position of geometry.coordinates) {
      const key = nodeKey(position)
      if (seen.has(key)) continue
      seen.add(key)
      const group = nodes.get(key)
      if (group) group.push(osmFeatureId)
      else nodes.set(key, [osmFeatureId])
    }
  }
  return seeds.map((seed) => {
    const connected = new Set<string>()
    for (const position of seed.geometry.coordinates) {
      for (const id of nodes.get(nodeKey(position)) ?? []) {
        if (id !== seed.osmFeatureId) connected.add(id)
      }
    }
    return { ...seed, connectedIds: [...connected].sort() }
  })
}

function nodeKey(position: Position) {
  return `${Number(position[0]).toFixed(7)},${Number(position[1]).toFixed(7)}`
}
