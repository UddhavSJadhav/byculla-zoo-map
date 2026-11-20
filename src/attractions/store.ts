import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { getBaselineRecords, getBaselineState, loadAttractionBaseline, subscribeBaseline } from '@/attractions/baseline'
import { candidateBySource, geometryForFeature, geometryForSource } from '@/attractions/candidates'
import { attractionById, attractionRegistry } from '@/attractions/registry'
import { validateGeometry } from '@/map-v2/editor/geometry'
import type { EditorFeature, EditorProperties } from '@/map-v2/editor/types'
import {
  attractionCategories,
  attractionStatuses,
  type AttractionCategory,
  type AttractionGeometry,
  type AttractionMappingMode,
  type AttractionMappingRequest,
  type AttractionOverride,
  type AttractionPatch,
  type AttractionRecord,
  type AttractionStatus,
} from '@/attractions/types'

const storageKey = 'zoo-map.attractions.v1'

interface StoredAttractions {
  version: 1
  overrides: Record<string, AttractionOverride>
}

type Listener = () => void

const listeners = new Set<Listener>()
const mappingListeners = new Set<Listener>()
let mappingRequest: AttractionMappingRequest | null = null
let mappingToken = 0
let cachedOverrides: Record<string, AttractionOverride> | null = null
let cachedList: AttractionRecord[] | null = null

function emptyStore(): StoredAttractions {
  return { version: 1, overrides: {} }
}

function readStore(): StoredAttractions {
  if (cachedOverrides) return { version: 1, overrides: cachedOverrides }
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) {
      cachedOverrides = {}
      return emptyStore()
    }
    const parsed = JSON.parse(raw) as StoredAttractions
    cachedOverrides = parsed && parsed.version === 1 && parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {}
  } catch {
    cachedOverrides = {}
  }
  return { version: 1, overrides: cachedOverrides }
}

function writeStore(overrides: Record<string, AttractionOverride>) {
  cachedOverrides = overrides
  cachedList = null
  const hasEdits = Object.keys(overrides).length > 0
  if (!hasEdits) localStorage.removeItem(storageKey)
  else localStorage.setItem(storageKey, JSON.stringify({ version: 1, overrides } satisfies StoredAttractions))
  listeners.forEach((listener) => listener())
}

export function subscribeAttractions(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function subscribeAttractionMapping(listener: Listener) {
  mappingListeners.add(listener)
  return () => {
    mappingListeners.delete(listener)
  }
}

export function listAttractions(): AttractionRecord[] {
  if (cachedList) return cachedList
  const seeds = inventorySeeds()
  if (!seeds) {
    cachedList = []
    return cachedList
  }
  const overrides = readStore().overrides
  cachedList = seeds.map((seed) => mergeRecord(seed, overrides[seed.id]))
  return cachedList
}

export function getAttraction(id: string): AttractionRecord | null {
  return listAttractions().find((attraction) => attraction.id === id) ?? null
}

export function orphanedAttractionIds(): string[] {
  const seeds = inventorySeeds()
  if (!seeds) return []
  const known = new Set(seeds.map((seed) => seed.id))
  return Object.keys(readStore().overrides).filter((id) => !known.has(id)).sort()
}

export function attractionHasEdits(): boolean {
  return Object.keys(readStore().overrides).length > 0
}

export function updateAttraction(id: string, patch: AttractionPatch): string | null {
  const current = getAttraction(id)
  if (!current) return 'That attraction is not in the visitor-map inventory.'
  const next = { ...readStore().overrides }
  const override = { ...next[id] }
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return 'Name is required.'
    override.name = name
  }
  if (patch.category !== undefined) override.category = patch.category
  if (patch.description !== undefined) override.description = patch.description.trim()
  if (patch.source !== undefined) {
    const source = patch.source.trim()
    if (!source) return 'Source is required.'
    override.source = source
  }
  if (patch.verified !== undefined) override.verified = patch.verified
  if (patch.status !== undefined) override.status = patch.status
  commitOverride(next, id, override)
  writeStore(next)
  return null
}

export function assignAttractionGeometry(id: string, geometry: AttractionGeometry | null): string | null {
  if (!seedFor(id)) return 'That attraction is not in the visitor-map inventory.'
  if (geometry) {
    const geometryError = validateGeometry(geometry)
    if (geometryError) return geometryError
    if (geometry.type !== 'Point' && geometry.type !== 'Polygon') return 'Use a point or a polygon for an attraction.'
  }
  const next = { ...readStore().overrides }
  const override = { ...next[id] }
  override.geometry = geometry
  override.geometryOrigin = geometry ? 'manual' : null
  override.sourceFeatureId = null
  override.osmFeatureId = null
  override.osmLayer = null
  override.lastEdited = new Date().toISOString()
  commitOverride(next, id, override)
  writeStore(next)
  return null
}

export function attractionsUsingSource(sourceId: string): AttractionRecord[] {
  return listAttractions().filter((attraction) => attraction.geometryOrigin === 'osm' && attraction.sourceFeatureId === sourceId)
}

export function acceptOsmCandidate(id: string, sourceId: string): string | null {
  const candidate = candidateBySource(id, sourceId)
  if (!candidate) return 'That OpenStreetMap feature is not a candidate for this exhibit.'
  const next = { ...readStore().overrides }
  const override: AttractionOverride = { ...next[id] }
  override.geometry = null
  override.geometryOrigin = 'osm'
  override.sourceFeatureId = candidate.sourceId
  override.osmFeatureId = candidate.featureId
  override.osmLayer = candidate.layer
  override.lastEdited = new Date().toISOString()
  override.rejectedSourceIds = (override.rejectedSourceIds ?? []).filter((rejected) => rejected !== sourceId)
  commitOverride(next, id, override)
  writeStore(next)
  return null
}

export function rejectOsmCandidate(id: string, sourceId: string): string | null {
  if (!candidateBySource(id, sourceId)) return 'That OpenStreetMap feature is not a candidate for this exhibit.'
  const current = getAttraction(id)
  if (!current) return 'That attraction is not in the visitor-map inventory.'
  const next = { ...readStore().overrides }
  const override: AttractionOverride = { ...next[id] }
  override.rejectedSourceIds = [...new Set([...(override.rejectedSourceIds ?? current.rejectedSourceIds), sourceId])]
  if (current.sourceFeatureId === sourceId || override.sourceFeatureId === sourceId) {
    override.geometry = null
    override.geometryOrigin = null
    override.sourceFeatureId = null
    override.osmFeatureId = null
    override.osmLayer = null
    override.lastEdited = new Date().toISOString()
  }
  commitOverride(next, id, override)
  writeStore(next)
  return null
}

export function rejectSharedSource(sourceId: string): string | null {
  const linked = attractionsUsingSource(sourceId)
  if (linked.length === 0) return 'No attraction is linked to that feature.'
  const next = { ...readStore().overrides }
  for (const attraction of linked) {
    const override: AttractionOverride = { ...next[attraction.id] }
    override.rejectedSourceIds = [...new Set([...(override.rejectedSourceIds ?? attraction.rejectedSourceIds), sourceId])]
    override.geometry = null
    override.geometryOrigin = null
    override.sourceFeatureId = null
    override.osmFeatureId = null
    override.osmLayer = null
    override.lastEdited = new Date().toISOString()
    commitOverride(next, attraction.id, override)
  }
  writeStore(next)
  return null
}

export function restoreOsmCandidate(id: string, sourceId: string): string | null {
  if (!seedFor(id)) return 'That attraction is not in the visitor-map inventory.'
  const next = { ...readStore().overrides }
  const override: AttractionOverride = { ...next[id] }
  override.rejectedSourceIds = (override.rejectedSourceIds ?? []).filter((rejected) => rejected !== sourceId)
  commitOverride(next, id, override)
  writeStore(next)
  return null
}

export function resetAttractions() {
  writeStore({})
}

export function requestAttractionMapping(attractionId: string, mode: AttractionMappingMode) {
  const attraction = getAttraction(attractionId)
  if (!attraction) return
  if (mode === 'edit' && !attraction.geometry) return
  mappingToken += 1
  mappingRequest = { token: mappingToken, attractionId, mode }
  mappingListeners.forEach((listener) => listener())
}

export function getMappingRequest(): AttractionMappingRequest | null {
  return mappingRequest
}

export function consumeMappingRequest(token: number): AttractionMappingRequest | null {
  if (!mappingRequest || mappingRequest.token !== token) return null
  const request = mappingRequest
  mappingRequest = null
  return request
}

export function featureIdForAttraction(id: string) {
  return `attraction:${id}`
}

export function attractionIdFromFeature(featureId: string): string | null {
  return featureId.startsWith('attraction:') ? featureId.slice('attraction:'.length) : null
}

export function toEditorFeature(attraction: AttractionRecord): EditorFeature | null {
  if (!attraction.geometry) return null
  const properties: EditorProperties = {
    id: featureIdForAttraction(attraction.id),
    name: `${attraction.exhibitNumber}. ${attraction.name}`,
    category: 'animal-attraction',
    source: attraction.source,
    sourceId: attraction.id,
    description: attraction.description,
    editorOrigin: 'manual',
    editorCategory: 'animal-attraction',
  }
  return {
    type: 'Feature',
    id: properties.id,
    geometry: attraction.geometry,
    properties,
  }
}

export function exportAttractionCollection(): FeatureCollection<Geometry | null> {
  return {
    type: 'FeatureCollection',
    features: listAttractions().map((attraction) => ({
      type: 'Feature' as const,
      id: attraction.id,
      geometry: attraction.geometryOrigin === 'osm' ? null : attraction.geometry,
      properties: {
        id: attraction.id,
        name: attraction.name,
        exhibitNumber: attraction.exhibitNumber,
        category: attraction.category,
        description: attraction.description,
        source: attraction.source,
        verified: attraction.verified,
        status: attraction.status,
        geometrySource: attraction.geometryOrigin,
        sourceFeatureId: attraction.sourceFeatureId,
        osmFeatureId: attraction.osmFeatureId,
        osmLayer: attraction.osmLayer,
        lastEdited: attraction.lastEdited,
        rejectedSourceIds: attraction.rejectedSourceIds,
      },
    })),
  }
}

export function importAttractionCollection(raw: unknown): { applied: number; warnings: string[] } {
  const warnings: string[] = []
  if (!raw || typeof raw !== 'object') return { applied: 0, warnings: ['The file is not a GeoJSON object.'] }
  const collection = raw as FeatureCollection
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    return { applied: 0, warnings: ['Choose a GeoJSON FeatureCollection.'] }
  }
  const next = { ...readStore().overrides }
  let applied = 0
  for (const feature of collection.features) {
    const result = overrideFromFeature(feature)
    if (typeof result === 'string') {
      warnings.push(result)
      continue
    }
    commitOverride(next, result.id, result.override)
    applied += 1
  }
  if (applied === 0) return { applied, warnings: warnings.length > 0 ? warnings : ['Nothing in that file matched the visitor-map inventory.'] }
  writeStore(next)
  return { applied, warnings }
}

function overrideFromFeature(feature: Feature): { id: string; override: AttractionOverride } | string {
  const properties = feature.properties && typeof feature.properties === 'object' ? feature.properties : {}
  const record = properties as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id : typeof feature.id === 'string' ? feature.id : ''
  const exhibitNumber = typeof record.exhibitNumber === 'number' ? record.exhibitNumber : Number.NaN
  const inventory = inventorySeeds() ?? attractionRegistry
  const seed = inventory.find((item) => item.id === id) ?? (Number.isFinite(exhibitNumber) ? inventory.find((item) => item.exhibitNumber === exhibitNumber) : undefined)
  if (!seed) return 'Skipped a feature that is not in the attraction baseline.'
  if (Number.isFinite(exhibitNumber) && exhibitNumber !== seed.exhibitNumber) {
    return `Skipped exhibit ${exhibitNumber}. Its number does not match ${seed.name}.`
  }
  const override: AttractionOverride = {}
  if (typeof record.name === 'string' && record.name.trim()) override.name = record.name.trim()
  if (isCategory(record.category)) override.category = record.category
  if (typeof record.description === 'string') override.description = record.description.trim()
  if (typeof record.source === 'string' && record.source.trim()) override.source = record.source.trim()
  if (typeof record.verified === 'boolean') override.verified = record.verified
  if (isStatus(record.status)) override.status = record.status
  if (typeof record.lastEdited === 'string' && record.lastEdited) override.lastEdited = record.lastEdited
  if (Array.isArray(record.rejectedSourceIds)) {
    override.rejectedSourceIds = record.rejectedSourceIds.filter((item): item is string => typeof item === 'string')
  }
  const geometrySource = record.geometrySource === 'osm' || record.geometrySource === 'manual' ? record.geometrySource : null
  if (geometrySource === 'osm' && typeof record.sourceFeatureId === 'string') {
    const candidate = candidateBySource(seed.id, record.sourceFeatureId)
    if (!candidate) return `Skipped ${seed.name}: ${record.sourceFeatureId} is not an OpenStreetMap candidate for this exhibit.`
    override.geometry = null
    override.geometryOrigin = 'osm'
    override.sourceFeatureId = candidate.sourceId
    override.osmFeatureId = candidate.featureId
    override.osmLayer = candidate.layer
  } else if (feature.geometry === null) {
    clearGeometry(override)
  } else if (feature.geometry) {
    if (feature.geometry.type !== 'Point' && feature.geometry.type !== 'Polygon') return `Skipped ${seed.name}: use a Point or a Polygon.`
    const geometryError = validateGeometry(feature.geometry)
    if (geometryError) return `Skipped ${seed.name}: ${geometryError}`
    override.geometry = feature.geometry
    override.geometryOrigin = 'manual'
    override.sourceFeatureId = null
    override.osmFeatureId = null
    override.osmLayer = null
  }
  return { id: seed.id, override: { ...readStore().overrides[seed.id], ...override } }
}

function inventorySeeds(): AttractionRecord[] | null {
  const state = getBaselineState()
  if (state.status === 'loading') return null
  if (state.status === 'ready') return getBaselineRecords() ?? []
  return attractionRegistry
}

function seedFor(id: string): AttractionRecord | undefined {
  const seeds = inventorySeeds()
  if (seeds) return seeds.find((seed) => seed.id === id)
  return attractionById(id)
}

function commitOverride(overrides: Record<string, AttractionOverride>, id: string, override: AttractionOverride) {
  const seed = seedFor(id)
  if (!seed) {
    overrides[id] = override
    return
  }
  const pruned = pruneOverride(override, seed)
  if (Object.keys(pruned).length === 0) delete overrides[id]
  else overrides[id] = pruned
}

function mergeRecord(seed: AttractionRecord, override: AttractionOverride | undefined): AttractionRecord {
  if (!override) return withResolvedGeometry({ ...seed })
  const cleared = override.geometryOrigin === null || (override.geometry === null && override.geometryOrigin !== 'osm' && override.geometryOrigin !== 'manual')
  const geometryOrigin = cleared ? null : override.geometryOrigin !== undefined ? override.geometryOrigin : seed.geometryOrigin
  const record: AttractionRecord = {
    ...seed,
    name: override.name ?? seed.name,
    category: override.category ?? seed.category,
    description: override.description ?? seed.description,
    source: override.source ?? seed.source,
    verified: override.verified ?? seed.verified,
    status: override.status ?? seed.status,
    geometry: cleared ? null : override.geometry !== undefined ? override.geometry : seed.geometry,
    geometryOrigin,
    sourceFeatureId: cleared ? null : override.sourceFeatureId !== undefined ? override.sourceFeatureId : seed.sourceFeatureId,
    osmFeatureId: cleared ? null : override.osmFeatureId !== undefined ? override.osmFeatureId : seed.osmFeatureId,
    osmLayer: cleared ? null : override.osmLayer !== undefined ? override.osmLayer : seed.osmLayer,
    lastEdited: override.lastEdited ?? seed.lastEdited,
    rejectedSourceIds: override.rejectedSourceIds ?? seed.rejectedSourceIds,
  }
  if (record.rejectedSourceIds.includes(record.sourceFeatureId ?? '')) return withResolvedGeometry({ ...record, geometry: null, geometryOrigin: null, sourceFeatureId: null, osmFeatureId: null, osmLayer: null })
  return withResolvedGeometry(record)
}

function withResolvedGeometry(record: AttractionRecord): AttractionRecord {
  if (record.geometryOrigin === 'osm') return { ...record, geometry: lookupOsmGeometry(record.osmFeatureId, record.sourceFeatureId) }
  if (record.geometryOrigin === 'manual') return record
  return { ...record, geometry: null }
}

function lookupOsmGeometry(featureId: string | null, sourceId: string | null): AttractionGeometry | null {
  const geometry = (featureId ? geometryForFeature(featureId) : null) ?? (sourceId ? geometryForSource(sourceId) : null)
  return geometry ? structuredClone(geometry) : null
}

function pruneOverride(override: AttractionOverride, seed: AttractionRecord): AttractionOverride {
  const next: AttractionOverride = {}
  if (override.name && override.name !== seed.name) next.name = override.name
  if (override.category && override.category !== seed.category) next.category = override.category
  if (override.description !== undefined && override.description !== seed.description) next.description = override.description
  if (override.source && override.source !== seed.source) next.source = override.source
  if (override.verified !== undefined && override.verified !== seed.verified) next.verified = override.verified
  if (override.status && override.status !== seed.status) next.status = override.status
  if (override.geometry !== undefined && !sameJson(override.geometry, seed.geometry)) next.geometry = override.geometry
  if (override.geometryOrigin !== undefined && override.geometryOrigin !== seed.geometryOrigin) next.geometryOrigin = override.geometryOrigin
  if (override.sourceFeatureId !== undefined && override.sourceFeatureId !== seed.sourceFeatureId) next.sourceFeatureId = override.sourceFeatureId
  if (override.osmFeatureId !== undefined && override.osmFeatureId !== seed.osmFeatureId) next.osmFeatureId = override.osmFeatureId
  if (override.osmLayer !== undefined && override.osmLayer !== seed.osmLayer) next.osmLayer = override.osmLayer
  if (override.lastEdited && override.lastEdited !== seed.lastEdited) next.lastEdited = override.lastEdited
  if (override.rejectedSourceIds && !sameJson(override.rejectedSourceIds, seed.rejectedSourceIds)) next.rejectedSourceIds = override.rejectedSourceIds
  return next
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

function clearGeometry(override: AttractionOverride) {
  override.geometry = null
  override.geometryOrigin = null
  override.sourceFeatureId = null
  override.osmFeatureId = null
  override.osmLayer = null
}

function isCategory(value: unknown): value is AttractionCategory {
  return attractionCategories.some((category) => category.id === value)
}

function isStatus(value: unknown): value is AttractionStatus {
  return attractionStatuses.some((status) => status.id === value)
}

subscribeBaseline(() => {
  cachedList = null
  listeners.forEach((listener) => listener())
})

if (typeof window !== 'undefined') void loadAttractionBaseline()
