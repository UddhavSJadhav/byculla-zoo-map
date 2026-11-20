/**
 * Build Map V2 GeoJSON from an OpenStreetMap map extract.
 * Usage: node scripts/extract-zoo-geojson.mjs path/to/map.osm.xml
 * The extract must include way 112796885, the zoo boundary.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const boundaryId = '112796885'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'src/data/map-v2')
const xmlPath = process.argv[2]
if (!xmlPath) {
  console.error('Pass the path to an OSM XML extract.')
  process.exit(1)
}

const animalBuildings = new Set([
  'Penguin',
  'Lion',
  'Birds Paradise',
  'Otter',
  'Turtle',
  'Elephant',
  'Deer',
  'Hippopotamus',
  'Bear',
  'Tiger',
  'Hyena&Leopard',
  'Aqua Birds',
])

const xml = readFileSync(xmlPath, 'utf8')
const nodes = new Map()
for (const match of xml.matchAll(/<node id="(\d+)"[^>]* lat="([^"]+)" lon="([^"]+)"/g)) {
  nodes.set(match[1], [Number(match[3]), Number(match[2])])
}

const ways = []
for (const match of xml.matchAll(/<way id="(\d+)"[\s\S]*?<\/way>/g)) {
  const body = match[0]
  const tags = tagsFrom(body)
  const refs = [...body.matchAll(/<nd ref="(\d+)"/g)].map((item) => item[1])
  const coordinates = refs.map((id) => nodes.get(id)).filter(Boolean)
  ways.push({
    id: match[1],
    tags,
    coordinates,
    closed: refs.length > 3 && refs[0] === refs[refs.length - 1],
  })
}

const taggedNodes = []
for (const match of xml.matchAll(/<node id="(\d+)"(?![^>]*\/>)[^>]*>[\s\S]*?<\/node>/g)) {
  const body = match[0]
  if (!body.includes('<tag ')) continue
  const idMatch = body.match(/^<node id="(\d+)"[^>]* lat="([^"]+)" lon="([^"]+)"/)
  if (!idMatch) continue
  taggedNodes.push({
    id: idMatch[1],
    coordinates: [Number(idMatch[3]), Number(idMatch[2])],
    tags: tagsFrom(body),
  })
}

const boundaryWay = ways.find((way) => way.id === boundaryId)
if (!boundaryWay || boundaryWay.coordinates.length < 4) {
  throw new Error(`Zoo boundary way ${boundaryId} was not in the extract.`)
}

const ring = boundaryWay.coordinates.slice(0, -1)
const boundaryName = decode(boundaryWay.tags.name ?? '')

function tagsFrom(body) {
  const tags = {}
  for (const tag of body.matchAll(/<tag k="([^"]+)" v="([^"]+)"\/>/g)) {
    tags[tag[1]] = decode(tag[2])
  }
  return tags
}

function decode(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}

function inside(lon, lat) {
  let crossings = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [xi, yi] = ring[index]
    const [xj, yj] = ring[previous]
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersects) crossings = !crossings
  }
  return crossings
}

function centroid(coordinates) {
  const points = coordinates.length > 1 && samePoint(coordinates[0], coordinates.at(-1))
    ? coordinates.slice(0, -1)
    : coordinates
  let lon = 0
  let lat = 0
  for (const point of points) {
    lon += point[0]
    lat += point[1]
  }
  return [lon / points.length, lat / points.length]
}

function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1]
}

function wayInside(way) {
  const [lon, lat] = centroid(way.coordinates)
  return inside(lon, lat)
}

function feature(id, category, name, sourceId, geometry, extra = {}) {
  const properties = {
    id,
    name,
    category,
    source: 'OpenStreetMap',
    sourceId,
    ...extra,
  }
  return {
    type: 'Feature',
    id,
    properties,
    geometry,
  }
}

function polygon(coordinates) {
  const ringCoordinates = samePoint(coordinates[0], coordinates.at(-1))
    ? coordinates
    : [...coordinates, coordinates[0]]
  return { type: 'Polygon', coordinates: [ringCoordinates] }
}

function line(coordinates) {
  return { type: 'LineString', coordinates }
}

function collection(name, features) {
  return {
    type: 'FeatureCollection',
    name,
    attribution: '© OpenStreetMap contributors, ODbL',
    features,
  }
}

const boundary = feature(
  `way-${boundaryId}`,
  'zoo-boundary',
  boundaryName,
  `way/${boundaryId}`,
  polygon(boundaryWay.coordinates),
)

const paths = ways
  .filter((way) => way.id !== boundaryId && (way.tags.highway === 'footway' || way.tags.highway === 'service'))
  .filter(wayInside)
  .filter((way) => way.coordinates.length >= 2)
  .map((way) =>
    feature(
      `way-${way.id}`,
      way.tags.highway,
      way.tags.name ?? null,
      `way/${way.id}`,
      way.tags.area === 'yes' && way.closed ? polygon(way.coordinates) : line(way.coordinates),
      {
        highway: way.tags.highway,
        ...(way.tags.access ? { access: way.tags.access } : {}),
      },
    ),
  )

const buildings = ways
  .filter((way) => way.tags.building && way.closed && wayInside(way))
  .map((way) => {
    const name = way.tags.name ?? null
    const category = name && animalBuildings.has(name) ? 'animal-building' : 'building'
    return feature(`way-${way.id}`, category, name, `way/${way.id}`, polygon(way.coordinates), {
      building: way.tags.building,
    })
  })

const gardens = ways
  .filter((way) => way.tags.leisure === 'garden' && way.closed && wayInside(way))
  .map((way) =>
    feature(`way-${way.id}`, 'garden', way.tags.name ?? null, `way/${way.id}`, polygon(way.coordinates), {
      leisure: 'garden',
    }),
  )

const enclosures = ways
  .filter((way) => way.tags.leisure === 'park' && way.tags.name === 'Elephant Enclosure' && way.closed && wayInside(way))
  .map((way) =>
    feature(`way-${way.id}`, 'animal-enclosure', way.tags.name, `way/${way.id}`, polygon(way.coordinates), {
      leisure: 'park',
    }),
  )

const trees = taggedNodes
  .filter((node) => node.tags.natural === 'tree' && inside(node.coordinates[0], node.coordinates[1]))
  .map((node) =>
    feature(
      `node-${node.id}`,
      'tree',
      node.tags.name ?? null,
      `node/${node.id}`,
      { type: 'Point', coordinates: node.coordinates },
      {
        ...(node.tags.species ? { species: node.tags.species } : {}),
      },
    ),
  )

const waterWays = ways
  .filter((way) => way.tags.natural === 'water' && way.closed && wayInside(way))
  .map((way) =>
    feature(`way-${way.id}`, 'pond', way.tags.name ?? null, `way/${way.id}`, polygon(way.coordinates), {
      natural: 'water',
      ...(way.tags.water ? { water: way.tags.water } : {}),
    }),
  )

const waterPoints = taggedNodes
  .filter(
    (node) =>
      (node.tags.emergency === 'fire_water_pond' || node.tags.name === 'Artificial pond') &&
      inside(node.coordinates[0], node.coordinates[1]),
  )
  .map((node) =>
    feature(`node-${node.id}`, 'pond', node.tags.name ?? null, `node/${node.id}`, {
      type: 'Point',
      coordinates: node.coordinates,
    }),
  )

const water = [...waterWays, ...waterPoints]

function isAttractionWay(way) {
  if (!way.closed || !wayInside(way)) return false
  const name = way.tags.name
  if (name && animalBuildings.has(name)) return true
  if (way.tags.tourism === 'museum') return true
  if (way.tags.historic === 'monument' && name) return true
  if (way.tags.shop === 'coffee' || way.tags.shop === 'ticket') return true
  return false
}

function attractionCategory(tags) {
  if (tags.name && animalBuildings.has(tags.name)) return 'animal-building'
  if (tags.tourism === 'museum') return 'museum'
  if (tags.historic === 'monument') return 'monument'
  if (tags.shop === 'coffee') return 'cafe'
  if (tags.shop === 'ticket') return 'ticket'
  if (tags.shop === 'herbalist') return 'shop'
  return 'attraction'
}

const attractionWays = ways.filter(isAttractionWay).map((way) =>
  feature(
    `attraction-${way.id}`,
    attractionCategory(way.tags),
    way.tags.name ?? null,
    `way/${way.id}`,
    polygon(way.coordinates),
  ),
)

const attractionNodes = taggedNodes
  .filter((node) => node.tags.shop === 'herbalist' && node.tags.name && inside(node.coordinates[0], node.coordinates[1]))
  .map((node) =>
    feature(
      `attraction-${node.id}`,
      'shop',
      node.tags.name,
      `node/${node.id}`,
      { type: 'Point', coordinates: node.coordinates },
    ),
  )

const attractions = [...attractionWays, ...attractionNodes]

function countTags(items, pick) {
  const counts = new Map()
  for (const item of items) {
    for (const tag of pick(item)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => `${tag} (${count})`)
}

const footways = paths.filter((item) => item.properties.highway === 'footway').length
const serviceWays = paths.filter((item) => item.properties.highway === 'service').length
const privatePaths = paths.filter((item) => item.properties.access === 'private').length
const namedTrees = trees.filter((item) => item.properties.name).length
const speciesTrees = trees.filter((item) => item.properties.species).length
const animalBuildingCount = buildings.filter((item) => item.properties.category === 'animal-building').length

const facilityNodes = taggedNodes.filter((node) => inside(node.coordinates[0], node.coordinates[1]))
const facilityWays = ways.filter(wayInside)
const notLayered = [
  summarizeGroup(
    'Toilets',
    facilityNodes.filter((node) => node.tags.amenity === 'toilets'),
    'Point',
    ['amenity=toilets'],
  ),
  summarizeGroup(
    'Drinking water',
    facilityNodes.filter((node) => node.tags.amenity === 'drinking_water'),
    'Point',
    ['amenity=drinking_water'],
  ),
  summarizeGroup(
    'Benches',
    facilityNodes.filter((node) => node.tags.amenity === 'bench'),
    'Point',
    ['amenity=bench'],
  ),
  summarizeGroup(
    'Parking',
    facilityWays.filter((way) => way.tags.amenity === 'parking'),
    'Polygon',
    ['amenity=parking'],
  ),
  summarizeGroup(
    'Playground',
    facilityWays.filter((way) => way.tags.leisure === 'playground'),
    'Polygon',
    ['leisure=playground'],
  ),
  summarizeGroup(
    'Other walls',
    ways.filter((way) => way.id !== boundaryId && way.tags.barrier === 'wall' && wayInside(way)),
    'Polygon',
    ['barrier=wall'],
  ),
].filter((item) => item.count > 0)

const datasets = [
  dataset('boundary', 'Zoo boundary', 'zoo-boundary.geojson', [boundary], ['Polygon'], [
    'tourism=zoo (1)',
    'barrier=wall (1)',
  ]),
  dataset('paths', 'Walking paths', 'walking-paths.geojson', paths, geometryTypes(paths), [
    `highway=footway (${footways})`,
    `highway=service (${serviceWays})`,
    `access=private (${privatePaths})`,
  ]),
  dataset('buildings', 'Buildings', 'buildings.geojson', buildings, ['Polygon'], [
    `building=yes (${buildings.filter((item) => item.properties.building === 'yes').length})`,
    `building=roof (${buildings.filter((item) => item.properties.building === 'roof').length})`,
    `category=animal-building (${animalBuildingCount})`,
    `unnamed (${buildings.filter((item) => !item.properties.name).length})`,
  ]),
  dataset('gardens', 'Gardens', 'gardens.geojson', gardens, ['Polygon'], [
    `leisure=garden (${gardens.length})`,
    `named (${gardens.filter((item) => item.properties.name).length})`,
  ]),
  dataset('enclosures', 'Animal enclosures', 'animal-enclosures.geojson', enclosures, ['Polygon'], [
    'leisure=park (1)',
    'name=Elephant Enclosure (1)',
  ]),
  dataset('trees', 'Trees', 'trees.geojson', trees, ['Point'], [
    `natural=tree (${trees.length})`,
    `name (${namedTrees})`,
    `species (${speciesTrees})`,
  ]),
  dataset('attractions', 'Attractions', 'attractions.geojson', attractions, geometryTypes(attractions), categoryTags(attractions)),
  dataset('water', 'Water', 'water.geojson', water, geometryTypes(water), [
    `natural=water (${waterWays.length})`,
    `pond point (${waterPoints.length})`,
  ]),
]

const files = {
  'zoo-boundary.geojson': [boundary],
  'walking-paths.geojson': paths,
  'buildings.geojson': buildings,
  'gardens.geojson': gardens,
  'animal-enclosures.geojson': enclosures,
  'trees.geojson': trees,
  'attractions.geojson': attractions,
  'water.geojson': water,
}

mkdirSync(outDir, { recursive: true })
for (const [fileName, features] of Object.entries(files)) {
  const body = collection(fileName.replace('.geojson', ''), features)
  writeFileSync(resolve(outDir, fileName), `${JSON.stringify(body)}\n`)
}

const missing = [
  'Entrances and gates are not mapped.',
  'Building heights are not mapped.',
  'No zoo=enclosure areas exist except the Elephant Enclosure park polygon.',
  'Jackal, macaw, biome park, amphitheatre, auditorium, butterfly garden, and reptiles have no OpenStreetMap feature.',
  'Internal footways and service ways are tagged access=private, so they are not confirmed public paths.',
]

const availability = `import type { AvailabilityDataset, MappedFeatureGroup } from '@/types/map-v2'

/** Generated by scripts/extract-zoo-geojson.mjs. Data © OpenStreetMap contributors, ODbL. */
export const extractedDatasets: AvailabilityDataset[] = ${JSON.stringify(datasets, null, 2)}

export const mappedNotLayered: MappedFeatureGroup[] = ${JSON.stringify(notLayered, null, 2)}

export const missingGeography: string[] = ${JSON.stringify(missing, null, 2)}
`

writeFileSync(resolve(outDir, 'availability.ts'), availability)
for (const item of datasets) {
  console.log(`${item.file}\t${item.count}\t${item.geometryTypes.join(',')}`)
}
console.log('not layered', notLayered.map((item) => `${item.category}:${item.count}`).join(', '))

function dataset(id, title, file, features, geometryTypes, tags) {
  return { id, title, file, count: features.length, geometryTypes, tags }
}

function geometryTypes(features) {
  return [...new Set(features.map((item) => item.geometry.type))]
}

function categoryTags(features) {
  return countTags(features, (item) => [`category=${item.properties.category}`])
}

function summarizeGroup(category, items, geometry, tags) {
  return { category, count: items.length, geometry, tags }
}
