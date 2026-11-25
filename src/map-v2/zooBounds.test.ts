import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { pointInRing } from './zooBounds.ts'

const boundary = JSON.parse(readFileSync(new URL('../data/map-v2/zoo-boundary.geojson', import.meta.url), 'utf8')) as {
  features: { geometry: { coordinates: [number, number][][] } }[]
}
const ring = boundary.features[0]?.geometry.coordinates[0] ?? []

test('the zoo center is inside the boundary and a distant point is not', () => {
  assert.equal(pointInRing([72.8367, 18.9781], ring), true)
  assert.equal(pointInRing([72.85, 18.98], ring), false)
  assert.equal(pointInRing([72.8367, 18.9781], []), false)
})
