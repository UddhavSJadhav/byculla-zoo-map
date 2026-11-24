export const baselineCacheKey = 'zoo-map.baseline-cache.v1'

export interface BaselineCacheStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function saveBaselineCache(raw: unknown, storage: BaselineCacheStorage): boolean {
  if (!isCacheableBaseline(raw)) return false
  try {
    storage.setItem(baselineCacheKey, JSON.stringify(raw))
    return true
  } catch {
    return false
  }
}

export function readBaselineCache(storage: BaselineCacheStorage): unknown | null {
  try {
    const stored = storage.getItem(baselineCacheKey)
    if (!stored) return null
    const raw: unknown = JSON.parse(stored)
    return isCacheableBaseline(raw) ? raw : null
  } catch {
    return null
  }
}

export function isCacheableBaseline(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const value = raw as { type?: unknown; features?: unknown; latitude?: unknown; longitude?: unknown; accuracy?: unknown }
  if ('latitude' in value || 'longitude' in value || 'accuracy' in value) return false
  return value.type === 'FeatureCollection' && Array.isArray(value.features)
}
