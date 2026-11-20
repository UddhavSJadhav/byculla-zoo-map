export interface CalibrationPoint {
  id: string
  name: string
  latitude: number
  longitude: number
  imageX: number
  imageY: number
}

export interface CalibrationDraft {
  name: string
  latitude: number | null
  longitude: number | null
  imageX: number | null
  imageY: number | null
}

export interface PixelPoint {
  x: number
  y: number
}

export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface AffineTransform {
  longitudeOrigin: number
  latitudeOrigin: number
  /** imageX = a * (longitude - origin) + b * (latitude - origin) + c */
  a: number
  b: number
  c: number
  /** imageY = d * (longitude - origin) + e * (latitude - origin) + f */
  d: number
  e: number
  f: number
}

export interface CalibrationResidual {
  id: string
  name: string
  clicked: PixelPoint
  predicted: PixelPoint
  errorPixels: number
}

export type CalibrationAssessment =
  | {
      status: 'insufficient'
      pointCount: number
      message: string
    }
  | {
      status: 'unusable'
      pointCount: number
      message: string
    }
  | {
      status: 'ready'
      pointCount: number
      transform: AffineTransform
      residuals: CalibrationResidual[]
      averageErrorPixels: number
      maximumErrorPixels: number
      spreadMeters: number
      highError: boolean
      narrowSpread: boolean
      message: string
    }
