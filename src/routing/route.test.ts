import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { haversineMeters } from './distance.ts'
import { buildWalkingGraph, cachedGraph, describeNetwork, type RouteSegment } from './graph.ts'
import { shortestWalk } from './route.ts'

const accessible = (id: string, coordinates: [number, number][]): RouteSegment => ({ id, status: 'accessible', coordinates })

test('distance uses geographical metres, not degree or pixel length', () => {
  const from: [number, number] = [0, 0]
  const to: [number, number] = [0, 1]
  const meters = haversineMeters(from, to)
  assert.ok(Math.abs(meters - 111194.9) < 1)
  assert.notEqual(meters, 1)
})

test('a route follows connected accessible segments and sums their length', () => {
  const graph = buildWalkingGraph([
    accessible('a', [[0, 0], [0.001, 0]]),
    accessible('b', [[0.001, 0], [0.002, 0]]),
  ])
  const result = shortestWalk(graph, [0, 0], [0.002, 0])
  assert.equal(result.ok, true)
  if (!result.ok) return
  const expected = haversineMeters([0, 0], [0.001, 0]) + haversineMeters([0.001, 0], [0.002, 0])
  assert.equal(result.distanceMeters, expected)
  assert.deepEqual(result.pathIds, ['a', 'b'])
  assert.deepEqual(result.geometry.coordinates, [[0, 0], [0.001, 0], [0.002, 0]])
})

test('a shared vertex in the middle of a line is a junction', () => {
  const graph = buildWalkingGraph([
    accessible('spine', [[0, 0], [0.001, 0], [0.002, 0]]),
    accessible('spur', [[0.001, 0], [0.001, 0.001]]),
  ])
  const result = shortestWalk(graph, [0, 0], [0.001, 0.001])
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.pathIds, ['spine', 'spur'])
  assert.deepEqual(result.geometry.coordinates, [[0, 0], [0.001, 0], [0.001, 0.001]])
  const expected = haversineMeters([0, 0], [0.001, 0]) + haversineMeters([0.001, 0], [0.001, 0.001])
  assert.equal(result.distanceMeters, expected)
})

test('coordinates that are merely close do not connect', () => {
  const graph = buildWalkingGraph([
    accessible('west', [[0, 0], [0.001, 0]]),
    accessible('east', [[0.0011, 0], [0.002, 0]]),
  ])
  const result = shortestWalk(graph, [0, 0], [0.002, 0])
  assert.deepEqual(result, { ok: false, reason: 'no-route' })
})

test('disconnected accessible paths do not produce a route', () => {
  const graph = buildWalkingGraph([
    accessible('north', [[0, 0.01], [0.001, 0.01]]),
    accessible('south', [[0, 0], [0.001, 0]]),
  ])
  const result = shortestWalk(graph, [0, 0.01], [0.001, 0])
  assert.deepEqual(result, { ok: false, reason: 'no-route' })
})

test('a restricted segment is excluded even when it is the only bridge', () => {
  const graph = buildWalkingGraph([
    accessible('west', [[0, 0], [0.001, 0]]),
    { id: 'bridge', status: 'restricted', coordinates: [[0.001, 0], [0.002, 0]] },
    accessible('east', [[0.002, 0], [0.003, 0]]),
  ])
  assert.deepEqual(graph.includedPathIds, ['west', 'east'])
  assert.deepEqual(graph.excluded, [{ id: 'bridge', status: 'restricted' }])
  const result = shortestWalk(graph, [0, 0], [0.003, 0])
  assert.deepEqual(result, { ok: false, reason: 'no-route' })
  if (result.ok) assert.equal(result.pathIds.includes('bridge'), false)
})

test('an unverified segment cannot be used for a route', () => {
  const graph = buildWalkingGraph([
    accessible('west', [[0, 0], [0.001, 0]]),
    { id: 'pending', status: 'unverified', coordinates: [[0.001, 0], [0.002, 0]] },
    accessible('east', [[0.002, 0], [0.003, 0]]),
  ])
  const result = shortestWalk(graph, [0, 0], [0.003, 0])
  assert.deepEqual(result, { ok: false, reason: 'no-route' })
  assert.equal(graph.includedPathIds.includes('pending'), false)
})

test('the shorter accessible path is chosen', () => {
  const direct = [[0, 0], [0.002, 0]] as [number, number][]
  const around = [[0, 0], [0, 0.002], [0.002, 0.002], [0.002, 0]] as [number, number][]
  const graph = buildWalkingGraph([accessible('direct', direct), accessible('around', around)])
  const result = shortestWalk(graph, [0, 0], [0.002, 0])
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.pathIds, ['direct'])
  assert.ok(result.distanceMeters < haversineMeters([0, 0], [0, 0.002]) + haversineMeters([0, 0.002], [0.002, 0.002]) + haversineMeters([0.002, 0.002], [0.002, 0]))
})

test('a point that is not on the network is not snapped', () => {
  const graph = buildWalkingGraph([accessible('only', [[0, 0], [0.001, 0]])])
  assert.deepEqual(shortestWalk(graph, [0.0001, 0], [0.001, 0]), { ok: false, reason: 'start-not-on-network' })
  assert.deepEqual(shortestWalk(graph, [0, 0], [0.001, 0.0001]), { ok: false, reason: 'end-not-on-network' })
})

test('the graph is rebuilt when path access changes', () => {
  let segments: RouteSegment[] = [accessible('only', [[0, 0], [0.001, 0]])]
  const listeners = new Set<() => void>()
  const readGraph = cachedGraph(
    () => segments,
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  )
  assert.deepEqual(readGraph().includedPathIds, ['only'])
  segments = [{ id: 'only', status: 'restricted', coordinates: [[0, 0], [0.001, 0]] }]
  assert.deepEqual(readGraph().includedPathIds, ['only'])
  for (const listener of listeners) listener()
  assert.deepEqual(readGraph().includedPathIds, [])
  assert.deepEqual(readGraph().excluded, [{ id: 'only', status: 'restricted' }])
})

test('the zoo walking network is one connected geometry and the visitor graph starts empty', () => {
  const collection = JSON.parse(readFileSync(new URL('../data/map-v2/walking-paths.geojson', import.meta.url), 'utf8')) as {
    features: { id: string; geometry: { type: string; coordinates: [number, number][] }; properties: { access?: string } }[]
  }
  const lines = collection.features.map((feature) => ({ id: String(feature.id), coordinates: feature.geometry.coordinates }))
  const structure = describeNetwork(lines)
  assert.equal(lines.length, 51)
  assert.equal(structure.segments, 51)
  assert.equal(structure.nodes, 412)
  assert.equal(structure.edges, 448)
  assert.equal(structure.sharedNodes, 75)
  assert.equal(structure.midLineJunctions, 72)
  assert.equal(structure.components, 1)
  assert.equal(structure.largestComponent, 412)
  assert.equal(collection.features.every((feature) => feature.properties.access === 'private'), true)
  const visitor = buildWalkingGraph(lines.map((line) => ({ id: line.id, status: 'unverified' as const, coordinates: line.coordinates })))
  assert.deepEqual(visitor.includedPathIds, [])
  assert.equal(visitor.excluded.length, 51)
  assert.equal(visitor.adjacency.size, 0)
})
