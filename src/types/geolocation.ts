export type LocationPhase =
  | 'stopped'
  | 'waiting'
  | 'available'
  | 'temporary-error'
  | 'denied'
  | 'unsupported'

export type LocationWait = 'permission' | 'locating'

export interface GeoPosition {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
  heading: number | null
}

export interface GeolocationErrorInfo {
  code: number
  message: string
  kind: 'denied' | 'unavailable' | 'timeout'
}
