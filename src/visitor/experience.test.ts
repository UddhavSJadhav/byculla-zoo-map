import assert from 'node:assert/strict'
import test from 'node:test'
import { poorAccuracyMeters } from '../routing/guidance.ts'
import { readBaselineCache, saveBaselineCache, type BaselineCacheStorage } from './baselineCache.ts'
import {
  cancelNavigation,
  describeOffline,
  gpsWatchDecision,
  nextLocationNotice,
  preserveVisit,
  returnToMap,
  visitorChrome,
  visitorLocationExplanation,
  visitorTouchTargetPx,
} from './experience.ts'

test('a narrow visitor screen uses a bottom sheet and keeps the map full', () => {
  const phone = visitorChrome({ admin: false, width: 390, navigating: false, listOpen: true })
  assert.equal(phone.mapFillsScreen, true)
  assert.equal(phone.searchPlacement, 'sheet')
  assert.equal(phone.sheet?.placement, 'bottom')
  assert.equal(phone.sheet?.width, 'full')
  assert.equal(phone.sheet?.height, 'expanded')
  assert.ok(phone.sheet && phone.sheet.maxVh <= 50)
  assert.equal(phone.minTouchTargetPx, visitorTouchTargetPx)
  assert.ok(phone.minTouchTargetPx >= 44)
  const walking = visitorChrome({ admin: false, width: 390, navigating: true, listOpen: false })
  assert.equal(walking.sheet?.height, 'compact')
  assert.equal(walking.instructionProminent, true)
  const wide = visitorChrome({ admin: false, width: 1100, navigating: true, listOpen: false })
  assert.equal(wide.sheet?.width, 'capped')
  assert.equal(wide.mapFillsScreen, true)
})

test('admin keeps the top search and does not use the visitor sheet', () => {
  const admin = visitorChrome({ admin: true, width: 390, navigating: true, listOpen: true })
  assert.equal(admin.mode, 'admin')
  assert.equal(admin.sheet, null)
  assert.equal(admin.searchPlacement, 'top')
  assert.equal(admin.instructionProminent, false)
})

test('cancel keeps the destination and return to the map keeps navigation', () => {
  const active = { selectedId: 'exhibit-14', navigating: true, listOpen: true }
  const cancelled = cancelNavigation(active)
  assert.equal(cancelled.selectedId, 'exhibit-14')
  assert.equal(cancelled.navigating, false)
  assert.equal(cancelled.listOpen, true)
  const mapped = returnToMap(active)
  assert.equal(mapped.selectedId, 'exhibit-14')
  assert.equal(mapped.navigating, true)
  assert.equal(mapped.listOpen, false)
  assert.deepEqual(preserveVisit(active), active)
})

test('GPS states use visitor language and recover when updates resume', () => {
  assert.match(visitorLocationExplanation({ phase: 'waiting', wait: 'permission', errorKind: null, accuracy: null, recovered: false }).title, /permission is needed/)
  assert.match(visitorLocationExplanation({ phase: 'denied', wait: null, errorKind: 'denied', accuracy: null, recovered: false }).title, /denied/)
  assert.match(visitorLocationExplanation({ phase: 'temporary-error', wait: null, errorKind: 'timeout', accuracy: null, recovered: false }).title, /too long/)
  assert.match(visitorLocationExplanation({ phase: 'temporary-error', wait: null, errorKind: 'unavailable', accuracy: null, recovered: false }).title, /unavailable/)
  const poor = visitorLocationExplanation({ phase: 'available', wait: null, errorKind: null, accuracy: poorAccuracyMeters + 20, recovered: false })
  assert.equal(poor.poorAccuracy, true)
  assert.match(poor.detail, /steady/)
  const resumed = nextLocationNotice({ phase: 'temporary-error', recovered: false }, 'available')
  assert.equal(resumed.recovered, true)
  assert.match(visitorLocationExplanation({ phase: 'available', wait: null, errorKind: null, accuracy: 12, recovered: true }).detail, /resumed/)
  const steady = nextLocationNotice(resumed, 'available')
  assert.equal(steady.recovered, true)
  assert.equal(nextLocationNotice({ phase: 'available', recovered: true }, 'temporary-error').recovered, false)
})

test('a GPS watch is not duplicated and resumes after backgrounding', () => {
  assert.equal(gpsWatchDecision({ event: 'request', visible: true, hasSession: true, watchActive: true, interrupted: false, pending: false }), 'ignore-duplicate')
  assert.equal(gpsWatchDecision({ event: 'request', visible: true, hasSession: false, watchActive: false, interrupted: false, pending: false }), 'start')
  assert.equal(gpsWatchDecision({ event: 'visibility', visible: false, hasSession: true, watchActive: true, interrupted: true, pending: false }), 'keep')
  assert.equal(gpsWatchDecision({ event: 'visibility', visible: true, hasSession: true, watchActive: true, interrupted: false, pending: false }), 'keep')
  assert.equal(gpsWatchDecision({ event: 'visibility', visible: true, hasSession: true, watchActive: false, interrupted: true, pending: false }), 'resume')
  assert.equal(gpsWatchDecision({ event: 'visibility', visible: true, hasSession: true, watchActive: false, interrupted: false, pending: true }), 'keep')
  assert.deepEqual(preserveVisit({ selectedId: 'exhibit-14', navigating: true, listOpen: false }), {
    selectedId: 'exhibit-14',
    navigating: true,
    listOpen: false,
  })
})

test('offline attraction data can be restored and a GPS fix is not cached', () => {
  const storage = memoryStorage()
  const baseline = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'exhibit-test',
        properties: {
          id: 'exhibit-test',
          name: 'Test Birds',
          exhibitNumber: 1,
          category: 'birds',
          status: 'open',
          geometrySource: 'osm',
          sourceFeatureId: 'way/1',
          osmFeatureId: 'way/1',
        },
        geometry: null,
      },
    ],
  }
  assert.equal(saveBaselineCache(baseline, storage), true)
  assert.deepEqual(readBaselineCache(storage), baseline)
  assert.equal(saveBaselineCache({ latitude: 18.978, longitude: 72.836, accuracy: 12 }, storage), false)
  assert.deepEqual(readBaselineCache(storage), baseline)
  const missing = describeOffline({ online: false, attractionMetadataCached: false, pathGeometriesCached: true, graphReconstructed: true })
  assert.equal(missing.claimsRouting, false)
  assert.match(missing.text, /not available/)
  const ready = describeOffline({ online: false, attractionMetadataCached: true, pathGeometriesCached: true, graphReconstructed: true })
  assert.equal(ready.claimsRouting, true)
  assert.match(ready.text, /can be calculated/)
  const online = describeOffline({ online: true, attractionMetadataCached: true, pathGeometriesCached: true, graphReconstructed: true })
  assert.equal(online.showIndicator, false)
  assert.equal(online.claimsRouting, false)
})

function memoryStorage(): BaselineCacheStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
  }
}
