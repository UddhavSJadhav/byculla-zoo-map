import type { GeoPosition, GeolocationErrorInfo } from '@/types/geolocation'

export const LOW_ACCURACY_METERS = 100
export const LOCATION_STALE_MS = 30_000

export const LOCATION_WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15_000,
}

export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

export function isLowAccuracy(accuracy: number): boolean {
  return !Number.isFinite(accuracy) || accuracy > LOW_ACCURACY_METERS
}

export function readGeolocationPermission(): Promise<PermissionStatus | null> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return Promise.resolve(null)
  }

  return navigator.permissions.query({ name: 'geolocation' }).catch(() => null)
}

export function startLocationWatch(
  onPosition: (position: GeoPosition) => void,
  onError: (error: GeolocationErrorInfo) => void,
): number {
  return navigator.geolocation.watchPosition(
    (position) => {
      onPosition(toGeoPosition(position))
    },
    (error) => {
      logGeolocationError(error)
      onError(toErrorInfo(error))
    },
    LOCATION_WATCH_OPTIONS,
  )
}

export function stopLocationWatch(watchId: number): void {
  navigator.geolocation.clearWatch(watchId)
}

function toGeoPosition(position: GeolocationPosition): GeoPosition {
  const { latitude, longitude, accuracy, heading } = position.coords

  return {
    latitude,
    longitude,
    accuracy,
    timestamp: position.timestamp,
    heading: typeof heading === 'number' && Number.isFinite(heading) ? heading : null,
  }
}

function toErrorInfo(error: GeolocationPositionError): GeolocationErrorInfo {
  return {
    code: error.code,
    message: error.message,
    kind: toKind(error),
  }
}

function toKind(error: GeolocationPositionError): GeolocationErrorInfo['kind'] {
  if (error.code === error.PERMISSION_DENIED) return 'denied'
  if (error.code === error.TIMEOUT) return 'timeout'
  return 'unavailable'
}

function logGeolocationError(error: GeolocationPositionError) {
  if (!import.meta.env.DEV) return

  console.warn('[geolocation]', error.code, error.message)
}
