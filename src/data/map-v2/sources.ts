import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson'
import type { MapLayerId } from '@/types/map-v2'
import animalEnclosures from './animal-enclosures.geojson'
import attractions from './attractions.geojson'
import buildings from './buildings.geojson'
import gardens from './gardens.geojson'
import trees from './trees.geojson'
import walkingPaths from './walking-paths.geojson'
import water from './water.geojson'
import zooBoundary from './zoo-boundary.geojson'

export const mapSources: Record<MapLayerId, FeatureCollection<Geometry, GeoJsonProperties>> = {
  boundary: zooBoundary as FeatureCollection<Geometry, GeoJsonProperties>,
  paths: walkingPaths as FeatureCollection<Geometry, GeoJsonProperties>,
  buildings: buildings as FeatureCollection<Geometry, GeoJsonProperties>,
  gardens: gardens as FeatureCollection<Geometry, GeoJsonProperties>,
  enclosures: animalEnclosures as FeatureCollection<Geometry, GeoJsonProperties>,
  trees: trees as FeatureCollection<Geometry, GeoJsonProperties>,
  attractions: attractions as FeatureCollection<Geometry, GeoJsonProperties>,
  water: water as FeatureCollection<Geometry, GeoJsonProperties>,
}
