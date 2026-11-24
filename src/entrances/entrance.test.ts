import assert from 'node:assert/strict'
import test from 'node:test'
import { entranceReadiness, entranceStatusText } from './connection.ts'
import { createEntranceStore, type EntranceStore } from './store.ts'
import type { EntranceStorage } from './types.ts'
import { buildWalkingGraph } from '../routing/graph.ts'

function memory(): EntranceStorage {
  const jar = new Map<string, string>()
  return {
    getItem: (key) => jar.get(key) ?? null,
    setItem: (key, value) => {
      jar.set(key, value)
    },
    removeItem: (key) => {
      jar.delete(key)
    },
  }
}

function store(): EntranceStore {
  return createEntranceStore(memory())
}

const known = new Set(['exhibit-14', 'exhibit-16', 'exhibit-17'])

test('placing an entrance stores only that coordinate', () => {
  const entrances = store()
  assert.equal(entrances.set('exhibit-14', [72.1, 18.2]), null)
  const record = entrances.get('exhibit-14')
  assert.deepEqual(record?.coordinates, [72.1, 18.2])
  assert.equal(record?.verified, false)
  assert.equal(entrances.list().length, 1)
})

test('moving an entrance updates the coordinate and clears verification', () => {
  const entrances = store()
  entrances.set('exhibit-14', [72.1, 18.2])
  assert.equal(entrances.verify('exhibit-14', true), null)
  assert.equal(entrances.get('exhibit-14')?.verified, true)
  entrances.set('exhibit-14', [72.2, 18.3])
  assert.deepEqual(entrances.get('exhibit-14')?.coordinates, [72.2, 18.3])
  assert.equal(entrances.get('exhibit-14')?.verified, false)
  entrances.set('exhibit-14', [72.2, 18.3])
  entrances.verify('exhibit-14', true)
  entrances.set('exhibit-14', [72.2, 18.3])
  assert.equal(entrances.get('exhibit-14')?.verified, true)
})

test('removing an entrance deletes only that record', () => {
  const entrances = store()
  entrances.set('exhibit-16', [1, 2])
  entrances.set('exhibit-17', [3, 4])
  assert.equal(entrances.remove('exhibit-16'), null)
  assert.equal(entrances.get('exhibit-16'), null)
  assert.deepEqual(entrances.get('exhibit-17')?.coordinates, [3, 4])
})

test('export and import carry entrance points without attraction geometry', () => {
  const entrances = store()
  entrances.set('exhibit-14', [72.1, 18.2])
  entrances.verify('exhibit-14', true)
  const exported = entrances.exportCollection()
  assert.equal(exported.features.length, 1)
  assert.equal(exported.features[0]?.geometry?.type, 'Point')
  assert.equal(JSON.stringify(exported).includes('Polygon'), false)
  assert.equal(JSON.stringify(exported).includes('sourceFeatureId'), false)
  const imported = store()
  const result = imported.importCollection(
    {
      type: 'FeatureCollection',
      features: [
        exported.features[0],
        {
          type: 'Feature',
          id: 'exhibit-16',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: { attractionId: 'exhibit-16', verified: true },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [4, 5] },
          properties: { attractionId: 'missing-exhibit', verified: true },
        },
      ],
    },
    known,
  )
  assert.equal(result.applied, 1)
  assert.equal(result.warnings.length, 2)
  assert.deepEqual(imported.get('exhibit-14')?.coordinates, [72.1, 18.2])
  assert.equal(imported.get('exhibit-14')?.verified, true)
  assert.equal(imported.get('exhibit-16'), null)
  assert.equal(JSON.stringify(imported.exportCollection()).includes('Polygon'), false)
})

test('refresh keeps the entrance that was saved', () => {
  const entrances = store()
  entrances.set('exhibit-14', [72.4, 18.5])
  entrances.verify('exhibit-14', true)
  entrances.reload()
  assert.deepEqual(entrances.get('exhibit-14')?.coordinates, [72.4, 18.5])
  assert.equal(entrances.get('exhibit-14')?.verified, true)
})

test('an entrance is route-ready only when verified and on an accessible path vertex', () => {
  const graph = buildWalkingGraph([
    { id: 'open-path', status: 'accessible', coordinates: [[10, 20], [10.001, 20]] },
    { id: 'closed-path', status: 'restricted', coordinates: [[11, 20], [11.001, 20]] },
    { id: 'pending-path', status: 'unverified', coordinates: [[12, 20], [12.001, 20]] },
  ])
  const onPath = { coordinates: [10, 20] as [number, number], verified: true }
  const ready = entranceReadiness(onPath, graph)
  assert.equal(ready.state, 'route-ready')
  if (ready.state === 'route-ready') assert.deepEqual(ready.pathIds, ['open-path'])
  const unverified = entranceReadiness({ ...onPath, verified: false }, graph)
  assert.equal(unverified.state, 'unverified')
  if (unverified.state === 'unverified') assert.equal(unverified.connection, 'on-network')
  assert.deepEqual(entranceReadiness({ coordinates: [10.0005, 20], verified: true }, graph), { state: 'not-connected', reason: 'off-network' })
  assert.deepEqual(entranceReadiness({ coordinates: [11, 20], verified: true }, graph), { state: 'not-connected', reason: 'off-network' })
  assert.deepEqual(entranceReadiness({ coordinates: [12, 20], verified: true }, graph), { state: 'not-connected', reason: 'off-network' })
  const empty = buildWalkingGraph([{ id: 'pending-path', status: 'unverified', coordinates: [[12, 20], [12.001, 20]] }])
  const unverifiedEmpty = entranceReadiness({ ...onPath, verified: false }, empty)
  assert.equal(entranceStatusText(unverifiedEmpty).includes('Not yet connected'), true)
  assert.deepEqual(entranceReadiness(onPath, empty), { state: 'not-connected', reason: 'no-accessible-paths' })
  assert.equal(entranceReadiness(null, graph).state, 'missing')
})
