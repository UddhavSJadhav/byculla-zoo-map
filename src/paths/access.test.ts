import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { FeatureCollection } from 'geojson'
import { parsePathAccessBaseline, resolvePathAccess } from './baseline.ts'
import type { PathOverride } from './types.ts'

const walkingPaths = JSON.parse(
  readFileSync(new URL('../data/map-v2/walking-paths.geojson', import.meta.url), 'utf8'),
) as FeatureCollection
const known = walkingPaths.features.map((feature) => ({
  osmFeatureId: String(feature.id),
  sourceId: typeof feature.properties?.sourceId === 'string' ? feature.properties.sourceId : '',
}))

test('the public path file marks saved access and leaves geometry on the OpenStreetMap paths', () => {
  const raw = JSON.parse(readFileSync(new URL('../../public/data/attractions/byculla-zoo-path-access.geojson', import.meta.url), 'utf8'))
  const records = parsePathAccessBaseline(raw, known)
  const statuses = Object.values(records).map((record) => record.status)
  assert.equal(statuses.filter((status) => status === 'accessible').length, 37)
  assert.equal(statuses.filter((status) => status === 'restricted').length, 10)
  assert.equal(Object.keys(records).length, 47)
  assert.equal(JSON.stringify(raw).includes('"type":"LineString"'), false)
  assert.equal(records['way-53369530']?.status, 'accessible')
  assert.equal(records['way-1052761650']?.status, 'restricted')
  for (const id of Object.keys(records)) assert.ok(known.some((path) => path.osmFeatureId === id))
})

test('a browser edit overrides saved path access and a removal stays unverified', () => {
  const baseline: Record<string, PathOverride> = {
    'way-1': { status: 'accessible', note: '', lastEdited: '2026-11-24T00:00:00.000Z' },
    'way-2': { status: 'restricted', note: '', lastEdited: '2026-11-24T00:00:00.000Z' },
  }
  assert.equal(resolvePathAccess('way-1', baseline, {}, new Set()).status, 'accessible')
  assert.equal(resolvePathAccess('way-3', baseline, {}, new Set()).status, 'unverified')
  const local: Record<string, PathOverride> = {
    'way-2': { status: 'accessible', note: 'opened', lastEdited: '2026-11-24T01:00:00.000Z' },
  }
  assert.equal(resolvePathAccess('way-2', baseline, local, new Set()).status, 'accessible')
  assert.equal(resolvePathAccess('way-2', baseline, local, new Set()).note, 'opened')
  assert.equal(resolvePathAccess('way-1', baseline, {}, new Set(['way-1'])).status, 'unverified')
})
