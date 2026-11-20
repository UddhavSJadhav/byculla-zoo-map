import type { CalibrationDraft, CalibrationPoint } from '@/types/calibration'

export const CALIBRATION_STORAGE_KEY = 'zoo-map.calibration.v1'

export interface CalibrationStore {
  points: CalibrationPoint[]
  draft: CalibrationDraft
}

export function emptyCalibrationDraft(): CalibrationDraft {
  return {
    name: '',
    latitude: null,
    longitude: null,
    imageX: null,
    imageY: null,
  }
}

export function emptyCalibrationStore(): CalibrationStore {
  return {
    points: [],
    draft: emptyCalibrationDraft(),
  }
}

export function readCalibrationStore(): CalibrationStore {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY)
    if (!raw) return emptyCalibrationStore()
    return parseCalibrationStore(JSON.parse(raw))
  } catch {
    return emptyCalibrationStore()
  }
}

export function writeCalibrationStore(store: CalibrationStore): void {
  try {
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Keep the in-memory points when storage is unavailable.
  }
}

export function isCompleteDraft(
  draft: CalibrationDraft,
): draft is CalibrationDraft & {
  latitude: number
  longitude: number
  imageX: number
  imageY: number
} {
  return (
    draft.name.trim().length > 0 &&
    isFiniteNumber(draft.latitude) &&
    isFiniteNumber(draft.longitude) &&
    isFiniteNumber(draft.imageX) &&
    isFiniteNumber(draft.imageY)
  )
}

function parseCalibrationStore(value: unknown): CalibrationStore {
  if (!value || typeof value !== 'object') return emptyCalibrationStore()
  const record = value as { points?: unknown; draft?: unknown }
  const points = Array.isArray(record.points)
    ? record.points.flatMap((point) => {
        const parsed = parsePoint(point)
        return parsed ? [parsed] : []
      })
    : []

  return {
    points,
    draft: parseDraft(record.draft),
  }
}

function parsePoint(value: unknown): CalibrationPoint | null {
  if (!value || typeof value !== 'object') return null
  const point = value as Partial<CalibrationPoint>
  if (typeof point.id !== 'string' || point.id.length === 0) return null
  if (typeof point.name !== 'string' || point.name.trim().length === 0) return null
  if (!isFiniteNumber(point.latitude) || !isFiniteNumber(point.longitude)) return null
  if (!isFiniteNumber(point.imageX) || !isFiniteNumber(point.imageY)) return null

  return {
    id: point.id,
    name: point.name.trim(),
    latitude: point.latitude,
    longitude: point.longitude,
    imageX: point.imageX,
    imageY: point.imageY,
  }
}

function parseDraft(value: unknown): CalibrationDraft {
  const draft = emptyCalibrationDraft()
  if (!value || typeof value !== 'object') return draft
  const record = value as Partial<CalibrationDraft>
  if (typeof record.name === 'string') draft.name = record.name
  if (isFiniteNumber(record.latitude)) draft.latitude = record.latitude
  if (isFiniteNumber(record.longitude)) draft.longitude = record.longitude
  if (isFiniteNumber(record.imageX)) draft.imageX = record.imageX
  if (isFiniteNumber(record.imageY)) draft.imageY = record.imageY
  return draft
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
