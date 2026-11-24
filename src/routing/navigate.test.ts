import assert from 'node:assert/strict'
import test from 'node:test'
import type { Position } from 'geojson'
import { haversineMeters } from './distance.ts'
import type { RouteSegment } from './graph.ts'
import { gpsSnapMaxMeters, snapGpsToVisitorNetwork } from './snap.ts'
import {
  cancelRoute,
  emptyRouteDisplay,
  focusRoutePosition,
  planVisitorWalk,
  routeRecalcMeters,
  routeRecalcQuietMs,
  shouldRecalculateRoute,
  showRoute,
  updateRoute,
} from './walk.ts'
import { destinationReadiness, destinationStatusLabel } from '../destinations/readiness.ts'
import { buildWalkingGraph } from './graph.ts'

const origin: Position = [72.836, 18.978]

test('a nearby GPS fix snaps to an accessible path and the route is ready to draw', () => {
  const east = move(origin, 80, 0)
  const segments = [segment('open-path', 'accessible', [origin, east])]
  const gps = move(mid(origin, east), 0, 10)
  const walk = planVisitorWalk({ gps, entrance: east, segments })
  assert.equal(walk.ok, true)
  if (!walk.ok) return
  assert.equal(walk.geometry.type, 'LineString')
  assert.deepEqual(walk.geometry.coordinates[0], gps)
  assert.deepEqual(walk.geometry.coordinates.at(-1), east)
  assert.deepEqual(walk.pathIds, ['open-path'])
  assert.ok(walk.snapMeters <= gpsSnapMaxMeters)
  assert.ok(walk.distanceMeters > walk.snapMeters)
  const shown = showRoute('Tiger', walk)
  assert.equal(shown.geometry, walk.geometry)
  assert.equal(shown.camera, 'route')
  assert.match(shown.message, /Tiger/)
  assert.match(shown.message, /Walking distance/)
})

test('cancelling a route removes the line and returns to the current position', () => {
  const east = move(origin, 40, 0)
  const walk = planVisitorWalk({ gps: move(origin, 0, 8), entrance: east, segments: [segment('open-path', 'accessible', [origin, east])] })
  const shown = showRoute('Otter', walk)
  const cancelled = cancelRoute(true)
  assert.equal(cancelled.geometry, null)
  assert.equal(cancelled.camera, 'position')
  assert.match(cancelled.message, /cancelled/i)
  assert.equal(focusRoutePosition(shown, false).message.includes('not available'), true)
  assert.equal(focusRoutePosition(shown, true).camera, 'position')
  assert.equal(focusRoutePosition(shown, true).geometry, shown.geometry)
})

test('a small GPS update does not recalculate and a larger one replaces the line', () => {
  const east = move(origin, 80, 0)
  const segments = [segment('open-path', 'accessible', [origin, east])]
  const first = move(mid(origin, east), 0, 8)
  const walk = planVisitorWalk({ gps: first, entrance: east, segments })
  const shown = showRoute('Deer', walk)
  const started = { at: 1_000, position: first }
  const jitter = move(first, 2, 0)
  assert.equal(shouldRecalculateRoute(started, jitter, 2_000), false)
  assert.equal(updateRoute(shown, planVisitorWalk({ gps: jitter, entrance: east, segments }), false).geometry, shown.geometry)
  const shifted = move(first, routeRecalcMeters + 1, 0)
  assert.equal(shouldRecalculateRoute(started, shifted, 1_100), true)
  const quiet = move(first, 4, 0)
  assert.equal(shouldRecalculateRoute(started, quiet, 1_000 + routeRecalcQuietMs), true)
  const next = planVisitorWalk({ gps: shifted, entrance: east, segments })
  const updated = updateRoute(shown, next, true)
  assert.notEqual(updated.geometry, null)
  assert.equal(updated.camera, 'none')
  if (next.ok && updated.geometry) assert.deepEqual(updated.geometry.coordinates[0], shifted)
})

test('a disconnected accessible network does not draw a route', () => {
  const east = move(origin, 40, 0)
  const other = move(origin, 0, 200)
  const otherEnd = move(other, 40, 0)
  const walk = planVisitorWalk({
    gps: move(mid(origin, east), 0, 6),
    entrance: otherEnd,
    segments: [segment('near', 'accessible', [origin, east]), segment('far', 'accessible', [other, otherEnd])],
  })
  assert.deepEqual(walk, { ok: false, reason: 'no-route' })
  const shown = showRoute('Hippo', walk)
  assert.equal(shown.geometry, null)
  assert.match(shown.message, /No route is drawn/)
})

test('unavailable GPS does not draw a route', () => {
  const east = move(origin, 40, 0)
  const walk = planVisitorWalk({ gps: null, entrance: east, segments: [segment('open-path', 'accessible', [origin, east])] })
  assert.deepEqual(walk, { ok: false, reason: 'gps-unavailable' })
  assert.equal(showRoute('Bear', walk).geometry, null)
  assert.match(showRoute('Bear', walk).message, /GPS is unavailable/)
  assert.equal(emptyRouteDisplay().geometry, null)
})

test('GPS snaps only to an accessible path and only inside the maximum distance', () => {
  const east = move(origin, 60, 0)
  const accessible = segment('open-path', 'accessible', [origin, east])
  const restricted = segment('closed-path', 'restricted', [move(origin, 0, 30), move(east, 0, 30)])
  const gps = move(mid(origin, east), 0, 10)
  const snap = snapGpsToVisitorNetwork(gps, [restricted, accessible])
  assert.ok(snap)
  assert.equal(snap?.pathId, 'open-path')
  assert.ok(haversineMeters(snap?.point ?? gps, mid(origin, east)) < 1)
  const distant = move(mid(origin, east), 0, gpsSnapMaxMeters + 10)
  assert.equal(snapGpsToVisitorNetwork(distant, [accessible, restricted]), null)
  const fence = segment('fence', 'restricted', [move(origin, 0, 4), move(east, 0, 4)])
  const blocked = planVisitorWalk({
    gps: move(mid(origin, east), 0, 8),
    entrance: east,
    segments: [accessible, fence],
  })
  assert.equal(blocked.ok, false)
  if (!blocked.ok) assert.equal(blocked.reason, 'not-connected')
})

test('an entrance off the path is not snapped into the network', () => {
  const east = move(origin, 40, 0)
  const walk = planVisitorWalk({
    gps: origin,
    entrance: move(east, 0, 5),
    segments: [segment('open-path', 'accessible', [origin, east])],
  })
  assert.deepEqual(walk, { ok: false, reason: 'entrance-not-on-network' })
})

test('readiness uses a safe GPS snap and refuses an unsafe one', () => {
  const east = move(origin, 80, 0)
  const network = [segment('open-path', 'accessible', [origin, east])]
  const graph = buildWalkingGraph(network)
  const ready = destinationReadiness({
    status: 'open',
    geometry: { type: 'Point', coordinates: east },
    entrance: { coordinates: [east[0], east[1]], verified: true },
    start: move(mid(origin, east), 0, 9),
    graph,
    network,
  })
  assert.equal(ready.state, 'ready')
  if (ready.state === 'ready') assert.deepEqual(ready.pathIds, ['open-path'])
  const fence = segment('fence', 'restricted', [move(origin, 0, 4), move(east, 0, 4)])
  const blocked = destinationReadiness({
    status: 'open',
    geometry: { type: 'Point', coordinates: east },
    entrance: { coordinates: [east[0], east[1]], verified: true },
    start: move(mid(origin, east), 0, 8),
    graph,
    network: [...network, fence],
  })
  assert.equal(blocked.state, 'no-route')
  if (blocked.state === 'no-route') assert.equal(blocked.reason, 'gps-not-connected')
  assert.equal(destinationStatusLabel(blocked), 'GPS is not connected to the visitor network')
})

function segment(id: string, status: RouteSegment['status'], coordinates: Position[]): RouteSegment {
  return { id, status, coordinates }
}

function move(position: Position, eastMeters: number, northMeters: number): Position {
  const metersPerLat = 111132
  const metersPerLon = 111320 * Math.cos((Number(position[1]) * Math.PI) / 180)
  return [Number(position[0]) + eastMeters / metersPerLon, Number(position[1]) + northMeters / metersPerLat]
}

function mid(left: Position, right: Position): Position {
  return [(Number(left[0]) + Number(right[0])) / 2, (Number(left[1]) + Number(right[1])) / 2]
}
