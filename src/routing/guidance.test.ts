import assert from 'node:assert/strict'
import test from 'node:test'
import type { LineString, Position } from 'geojson'
import type { RouteSegment } from './graph.ts'
import {
  accuracyWarning,
  advanceNavigation,
  arrivalAccuracyMeters,
  arrivalMeters,
  hasArrived,
  isOffRoute,
  nextDirection,
  offRouteMeters,
  poorAccuracyMeters,
  progressBackwardMeters,
  projectOntoRoute,
  recalculateOffRoute,
  shouldRecalculateOffRoute,
  stabilizeProgress,
} from './guidance.ts'

const origin: Position = [72.836, 18.978]

test('route progress reports remaining distance and percent along the route', () => {
  const east = move(origin, 80, 0)
  const line = route([origin, east])
  const start = projectOntoRoute(origin, line)
  const middle = projectOntoRoute(move(origin, 40, 0), line)
  const end = projectOntoRoute(east, line)
  assert.ok(start)
  assert.ok(middle)
  assert.ok(end)
  assert.ok(Math.abs((start?.traveledMeters ?? 1)) < 1)
  assert.ok(Math.abs((start?.remainingMeters ?? 0) - 80) < 2)
  assert.ok(Math.abs((start?.percent ?? 1)) < 1)
  assert.ok(Math.abs((middle?.traveledMeters ?? 0) - 40) < 2)
  assert.ok(Math.abs((middle?.remainingMeters ?? 0) - 40) < 2)
  assert.ok(Math.abs((middle?.percent ?? 0) - 50) < 3)
  assert.ok((end?.remainingMeters ?? 1) < 1)
  assert.ok((end?.percent ?? 0) > 99)
})

test('turns come from route corners and short geometry does not invent one', () => {
  const corner = move(origin, 40, 0)
  const north = move(corner, 0, 40)
  const straight = nextDirection(route([origin, corner, north]), 0)
  assert.equal(straight.kind, 'left')
  assert.match(straight.text, /Turn left in 40 m/)
  const passed = nextDirection(route([origin, corner, north]), 50)
  assert.equal(passed.kind, 'continue')
  assert.match(passed.text, /Continue for/)
  const colinear = nextDirection(route([origin, move(origin, 20, 0), move(origin, 80, 0)]), 0)
  assert.equal(colinear.kind, 'continue')
  assert.doesNotMatch(colinear.text, /Turn/)
  const shortCorner = nextDirection(route([origin, move(origin, 4, 0), move(move(origin, 4, 0), 0, 4)]), 0)
  assert.equal(shortCorner.kind, 'continue')
  assert.doesNotMatch(shortCorner.text, /Turn/)
  const duplicate = nextDirection(route([origin, origin]), 0)
  assert.equal(duplicate.kind, 'unavailable')
  assert.match(duplicate.text, /not available/)
})

test('ordinary GPS noise does not jump progress or count as off route', () => {
  const east = move(origin, 80, 0)
  const line = route([origin, east])
  const along = projectOntoRoute(move(origin, 40, 0), line)
  assert.ok(along)
  if (!along) return
  const backward = projectOntoRoute(move(origin, 40 - progressBackwardMeters - 10, 3), line)
  assert.ok(backward)
  if (!backward) return
  const held = stabilizeProgress(along, backward, 5)
  assert.equal(held, along)
  const jitter = projectOntoRoute(move(origin, 42, 6), line)
  assert.ok(jitter)
  if (!jitter) return
  assert.ok(jitter.distanceFromRoute < offRouteMeters)
  assert.equal(isOffRoute(jitter.distanceFromRoute, 8), false)
  const accepted = stabilizeProgress(along, jitter, 8)
  assert.ok(Math.abs(accepted.traveledMeters - along.traveledMeters) < progressBackwardMeters)
  assert.equal(shouldRecalculateOffRoute(false, null, move(origin, 42, 6), 1_000), false)
  const started = advanceNavigation({
    session: null,
    gps: move(origin, 0, 8),
    accuracy: 5,
    entrance: east,
    entranceVerified: true,
    destinationName: 'Tiger',
    segments: [segment('open-path', 'accessible', [origin, east])],
    now: 1_000,
  })
  const noisy = advanceNavigation({
    session: started.session,
    gps: move(origin, 3, 8),
    accuracy: 5,
    entrance: east,
    entranceVerified: true,
    destinationName: 'Tiger',
    segments: [segment('open-path', 'accessible', [origin, east])],
    now: 2_000,
  })
  assert.equal(noisy.replacedRoute, false)
  assert.equal(noisy.session?.line, started.session?.line)
  assert.equal(noisy.guidance.offRoute, false)
})

test('a large departure is off route and a noisy one is not', () => {
  assert.equal(isOffRoute(10, 8), false)
  assert.equal(isOffRoute(offRouteMeters + 5, offRouteMeters + 10), false)
  assert.equal(isOffRoute(offRouteMeters + 5, 5), true)
  assert.equal(isOffRoute(offRouteMeters + 5, poorAccuracyMeters + 20), false)
  const previous = { at: 1_000, position: origin }
  assert.equal(shouldRecalculateOffRoute(true, previous, move(origin, 2, 0), 2_000), false)
  assert.equal(shouldRecalculateOffRoute(true, null, move(origin, 0, 30), 2_000), true)
})

test('off-route recalculation uses an accessible path and refuses an unsafe snap', () => {
  const east = move(origin, 80, 0)
  const north = move(origin, 0, 30)
  const northEnd = move(east, 0, 30)
  const gps = move(mid(origin, east), 0, 30)
  const original = segment('original', 'accessible', [origin, east])
  const parallel = segment('parallel', 'accessible', [north, northEnd])
  const connector = segment('connector', 'accessible', [northEnd, east])
  const shortcut = segment('shortcut', 'restricted', [gps, east])
  const safe = recalculateOffRoute({
    gps,
    entrance: east,
    entranceVerified: true,
    segments: [original, parallel, connector, shortcut],
  })
  assert.equal(safe.ok, true)
  if (!safe.ok) return
  assert.deepEqual(safe.geometry.coordinates[0], gps)
  assert.deepEqual(safe.geometry.coordinates.at(-1), east)
  assert.ok(safe.pathIds.includes('parallel'))
  assert.equal(safe.pathIds.includes('shortcut'), false)
  const started = advanceNavigation({
    session: null,
    gps: mid(origin, east),
    accuracy: 5,
    entrance: east,
    entranceVerified: true,
    destinationName: 'Otter',
    segments: [original],
    now: 1_000,
  })
  const departed = advanceNavigation({
    session: started.session,
    gps,
    accuracy: 5,
    entrance: east,
    entranceVerified: true,
    destinationName: 'Otter',
    segments: [original, parallel, connector, shortcut],
    now: 5_000,
  })
  assert.equal(departed.replacedRoute, true)
  assert.equal(departed.guidance.offRoute, false)
  assert.equal(departed.session?.line.coordinates[0]?.[0], gps[0])
  const fence = segment('fence', 'restricted', [move(origin, 0, 15), move(east, 0, 15)])
  const blocked = recalculateOffRoute({
    gps: move(mid(origin, east), 0, 30),
    entrance: east,
    entranceVerified: true,
    segments: [original, fence],
  })
  assert.equal(blocked.ok, false)
  if (!blocked.ok) assert.match(blocked.message, /No safe route can be recalculated/)
  const unverified = segment('gap', 'unverified', [northEnd, east])
  const openGap = recalculateOffRoute({
    gps,
    entrance: east,
    entranceVerified: true,
    segments: [original, parallel, unverified],
  })
  assert.equal(openGap.ok, false)
  const refused = advanceNavigation({
    session: started.session,
    gps: move(mid(origin, east), 0, 30),
    accuracy: 5,
    entrance: east,
    entranceVerified: true,
    destinationName: 'Otter',
    segments: [original, fence],
    now: 5_000,
  })
  assert.equal(refused.replacedRoute, false)
  assert.equal(refused.session?.line, started.session?.line)
  assert.match(refused.session?.recalcMessage ?? '', /No safe route can be recalculated/)
  const unverifiedEntrance = recalculateOffRoute({
    gps: origin,
    entrance: east,
    entranceVerified: false,
    segments: [original],
  })
  assert.equal(unverifiedEntrance.ok, false)
  if (!unverifiedEntrance.ok) assert.match(unverifiedEntrance.message, /not verified/)
})

test('arrival uses the entrance threshold and GPS accuracy', () => {
  const entrance = move(origin, 10, 0)
  assert.equal(hasArrived(origin, entrance, 15, true), true)
  assert.equal(haversineSafe(origin, entrance) <= arrivalMeters, true)
  assert.equal(hasArrived(origin, entrance, arrivalAccuracyMeters + 10, true), false)
  assert.equal(hasArrived(origin, move(origin, arrivalMeters + 15, 0), 10, true), false)
  assert.equal(hasArrived(entrance, entrance, 5, false), false)
  const line = route([origin, entrance])
  const guidance = advanceNavigation({
    session: { line, progress: null, offRouteFix: null, recalcMessage: null },
    gps: entrance,
    accuracy: 10,
    entrance,
    entranceVerified: true,
    destinationName: 'Deer',
    segments: [segment('open-path', 'accessible', [origin, entrance])],
    now: 1_000,
  })
  assert.equal(guidance.guidance.arrived, true)
  assert.match(guidance.guidance.detail, /reached the entrance/)
  const blocked = advanceNavigation({
    session: { line, progress: null, offRouteFix: null, recalcMessage: null },
    gps: entrance,
    accuracy: 10,
    entrance,
    entranceVerified: false,
    destinationName: 'Deer',
    segments: [],
    now: 1_000,
  })
  assert.equal(blocked.session, null)
  assert.equal(blocked.guidance.arrived, false)
  assert.match(blocked.guidance.detail, /not verified/)
})

test('poor GPS accuracy warns and does not move route progress', () => {
  const east = move(origin, 80, 0)
  const line = route([origin, east])
  const along = projectOntoRoute(move(origin, 40, 0), line)
  const jumped = projectOntoRoute(origin, line)
  assert.ok(along)
  assert.ok(jumped)
  if (!along || !jumped) return
  assert.equal(stabilizeProgress(along, jumped, poorAccuracyMeters + 40), along)
  assert.match(accuracyWarning(poorAccuracyMeters + 40) ?? '', /Location accuracy is poor/)
  assert.equal(accuracyWarning(12), null)
  const session = advanceNavigation({
    session: null,
    gps: move(origin, 40, 4),
    accuracy: 8,
    entrance: east,
    entranceVerified: true,
    destinationName: 'Bear',
    segments: [segment('open-path', 'accessible', [origin, east])],
    now: 1_000,
  })
  const warned = advanceNavigation({
    session: session.session,
    gps: origin,
    accuracy: poorAccuracyMeters + 40,
    entrance: east,
    entranceVerified: true,
    destinationName: 'Bear',
    segments: [segment('open-path', 'accessible', [origin, east])],
    now: 2_000,
  })
  assert.equal(warned.session?.progress, session.session?.progress)
  assert.equal(warned.replacedRoute, false)
  assert.match(warned.guidance.accuracyWarning ?? '', /poor/)
  const missing = advanceNavigation({
    session: session.session,
    gps: null,
    accuracy: null,
    entrance: east,
    entranceVerified: true,
    destinationName: 'Bear',
    segments: [segment('open-path', 'accessible', [origin, east])],
    now: 3_000,
  })
  assert.equal(missing.session?.line, session.session?.line)
  assert.match(missing.guidance.detail, /GPS is unavailable/)
  assert.equal(missing.replacedRoute, false)
})

function route(coordinates: Position[]): LineString {
  return { type: 'LineString', coordinates }
}

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

function haversineSafe(from: Position, to: Position): number {
  const metersPerLat = 111132
  const metersPerLon = 111320 * Math.cos((Number(from[1]) * Math.PI) / 180)
  const east = (Number(to[0]) - Number(from[0])) * metersPerLon
  const north = (Number(to[1]) - Number(from[1])) * metersPerLat
  return Math.hypot(east, north)
}
