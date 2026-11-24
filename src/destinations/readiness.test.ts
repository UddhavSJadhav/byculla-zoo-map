import assert from 'node:assert/strict'
import test from 'node:test'
import type { AttractionRecord } from '../attractions/types.ts'
import { destinationChoices } from './choices.ts'
import { destinationReadiness, destinationStatusLabel } from './readiness.ts'
import { buildWalkingGraph } from '../routing/graph.ts'

const graph = buildWalkingGraph([
  { id: 'open-path', status: 'accessible', coordinates: [[10, 20], [11, 20]] },
  { id: 'open-north', status: 'accessible', coordinates: [[11, 20], [11, 21]] },
  { id: 'bridge', status: 'restricted', coordinates: [[11, 20], [12, 20]] },
  { id: 'other', status: 'accessible', coordinates: [[30, 40], [31, 40]] },
])

const polygon = {
  type: 'Polygon' as const,
  coordinates: [[[10, 20], [10.002, 20], [10.002, 20.002], [10, 20]]],
}

test('a closed attraction stays unavailable and its record is kept', () => {
  const closed = attraction({ status: 'closed', geometry: polygon })
  const listed = destinationChoices([closed], ['animal'], false, '')
  assert.equal(listed.length, 0)
  assert.equal(destinationChoices([closed], ['animal'], true, '').length, 1)
  const readiness = destinationReadiness({
    status: closed.status,
    geometry: closed.geometry,
    entrance: { coordinates: [11, 21], verified: true },
    start: [10, 20],
    graph,
  })
  assert.deepEqual(readiness, { state: 'unavailable', reason: 'closed' })
  assert.equal(destinationStatusLabel(readiness), 'Destination unavailable')
})

test('an attraction without geometry is unavailable', () => {
  const readiness = destinationReadiness({
    status: 'reference',
    geometry: null,
    entrance: { coordinates: [11, 20], verified: true },
    start: [10, 20],
    graph,
  })
  assert.deepEqual(readiness, { state: 'unavailable', reason: 'no-geometry' })
})

test('a mapped attraction without an entrance is not given its polygon corner', () => {
  const readiness = destinationReadiness({
    status: 'open',
    geometry: polygon,
    entrance: null,
    start: [10, 20],
    graph,
  })
  assert.equal(readiness.state, 'entrance-not-mapped')
  assert.equal(destinationStatusLabel(readiness), 'Entrance not mapped')
})

test('an unverified entrance is not route-ready', () => {
  const readiness = destinationReadiness({
    status: 'open',
    geometry: polygon,
    entrance: { coordinates: [11, 20], verified: false },
    start: [10, 20],
    graph,
  })
  assert.equal(readiness.state, 'entrance-not-verified')
})

test('a verified entrance off the accessible network is not connected', () => {
  const midpoint = destinationReadiness({
    status: 'open',
    geometry: polygon,
    entrance: { coordinates: [10.5, 20], verified: true },
    start: [10, 20],
    graph,
  })
  assert.deepEqual(midpoint, { state: 'entrance-not-connected', reason: 'off-network' })
  const empty = buildWalkingGraph([{ id: 'pending', status: 'unverified', coordinates: [[10, 20], [11, 20]] }])
  const none = destinationReadiness({
    status: 'open',
    geometry: polygon,
    entrance: { coordinates: [11, 20], verified: true },
    start: null,
    graph: empty,
  })
  assert.deepEqual(none, { state: 'entrance-not-connected', reason: 'no-accessible-paths' })
})

test('a connected entrance waits for a chosen start and does not invent one', () => {
  const readiness = destinationReadiness({
    status: 'open',
    geometry: polygon,
    entrance: { coordinates: [11, 21], verified: true },
    start: null,
    graph,
  })
  assert.equal(readiness.state, 'start-not-chosen')
  assert.equal(destinationStatusLabel(readiness), 'Starting point needed')
})

test('a start that is not an exact path vertex has no continuous route', () => {
  const readiness = destinationReadiness({
    status: 'open',
    geometry: polygon,
    entrance: { coordinates: [11, 21], verified: true },
    start: [10.0001, 20],
    graph,
  })
  assert.deepEqual(readiness, { state: 'no-route', reason: 'start-not-on-network' })
})

test('disconnected accessible paths do not produce a route', () => {
  const readiness = destinationReadiness({
    status: 'open',
    geometry: polygon,
    entrance: { coordinates: [11, 21], verified: true },
    start: [30, 40],
    graph,
  })
  assert.deepEqual(readiness, { state: 'no-route', reason: 'no-route' })
  assert.equal(destinationStatusLabel(readiness), 'No continuous route available')
})

test('a verified entrance on the same accessible network is ready without using a restricted segment', () => {
  const readiness = destinationReadiness({
    status: 'open',
    geometry: polygon,
    entrance: { coordinates: [11, 21], verified: true },
    start: [10, 20],
    graph,
  })
  assert.equal(readiness.state, 'ready')
  if (readiness.state === 'ready') {
    assert.ok(readiness.distanceMeters > 0)
    assert.deepEqual(readiness.pathIds, ['open-path', 'open-north'])
  }
  assert.equal(destinationStatusLabel(readiness), 'Ready for navigation')
})

test('search lists open and unmapped attractions and hides closed records without deleting them', () => {
  const tiger = attraction({ name: 'Tiger', exhibitNumber: 14, status: 'open' })
  const amphitheatre = attraction({ id: 'exhibit-8', name: 'Amphitheatre', exhibitNumber: 8, status: 'closed', geometry: null, category: 'venue' })
  const macaque = attraction({ id: 'exhibit-13', name: 'Macaque', exhibitNumber: 13, status: 'unknown', geometry: null })
  const all = [tiger, amphitheatre, macaque]
  assert.deepEqual(destinationChoices(all, ['animal', 'venue'], false, '').map((item) => item.id), ['exhibit-14', 'exhibit-13'])
  assert.equal(all.length, 3)
  assert.deepEqual(destinationChoices(all, ['animal', 'venue'], true, 'amph').map((item) => item.name), ['Amphitheatre'])
})

function attraction(patch: Partial<AttractionRecord> & Pick<AttractionRecord, 'status'>): AttractionRecord {
  return {
    id: 'exhibit-14',
    name: 'Tiger',
    exhibitNumber: 14,
    category: 'animal',
    description: '',
    geometry: { type: 'Point', coordinates: [10, 20] },
    source: 'test',
    verified: false,
    geometryOrigin: 'manual',
    sourceFeatureId: null,
    osmFeatureId: null,
    osmLayer: null,
    lastEdited: null,
    rejectedSourceIds: [],
    ...patch,
  }
}
