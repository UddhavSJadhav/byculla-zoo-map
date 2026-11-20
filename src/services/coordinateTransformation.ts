import type {
  AffineTransform,
  CalibrationAssessment,
  CalibrationPoint,
  CalibrationResidual,
  GeoPoint,
  PixelPoint,
} from '@/types/calibration'

export const MINIMUM_CALIBRATION_POINTS = 3
/** Review flag for the collected landmarks. Not a certificate of accuracy. */
export const HIGH_RESIDUAL_PIXELS = 40
/** Approximate span below which a small residual still leaves the fit weakly determined. */
export const NARROW_SPREAD_METERS = 80
const METERS_PER_DEGREE = 111_320
const SINGULAR_PIVOT = 1e-12

export function assessCalibration(points: readonly CalibrationPoint[]): CalibrationAssessment {
  const pointCount = points.length

  if (pointCount < MINIMUM_CALIBRATION_POINTS) {
    return {
      status: 'insufficient',
      pointCount,
      message: `At least ${MINIMUM_CALIBRATION_POINTS} paired landmarks are needed before a transform can be estimated. ${pointCount} saved.`,
    }
  }

  const transform = fitAffine(points)
  if (!transform) {
    return {
      status: 'unusable',
      pointCount,
      message:
        'These landmarks do not determine a stable transform. Choose points spread across the map, not along a single line.',
    }
  }

  const residuals = points.map((point) => residualFor(point, transform))
  const averageErrorPixels = residuals.reduce((sum, residual) => sum + residual.errorPixels, 0) / residuals.length
  const maximumErrorPixels = residuals.reduce(
    (max, residual) => Math.max(max, residual.errorPixels),
    0,
  )
  const spreadMeters = geographicSpreadMeters(points)
  const highError = maximumErrorPixels > HIGH_RESIDUAL_PIXELS
  const narrowSpread = spreadMeters < NARROW_SPREAD_METERS

  return {
    status: 'ready',
    pointCount,
    transform,
    residuals,
    averageErrorPixels,
    maximumErrorPixels,
    spreadMeters,
    highError,
    narrowSpread,
    message: readyMessage(maximumErrorPixels, spreadMeters, highError, narrowSpread),
  }
}

export function geographicToPixel(transform: AffineTransform, point: GeoPoint): PixelPoint {
  const east = point.longitude - transform.longitudeOrigin
  const north = point.latitude - transform.latitudeOrigin
  return {
    x: transform.a * east + transform.b * north + transform.c,
    y: transform.d * east + transform.e * north + transform.f,
  }
}

export function pixelToGeographic(transform: AffineTransform, pixel: PixelPoint): GeoPoint | null {
  const determinant = transform.a * transform.e - transform.b * transform.d
  if (!Number.isFinite(determinant) || Math.abs(determinant) < SINGULAR_PIVOT) return null

  const x = pixel.x - transform.c
  const y = pixel.y - transform.f
  const east = (transform.e * x - transform.b * y) / determinant
  const north = (transform.a * y - transform.d * x) / determinant

  return {
    longitude: east + transform.longitudeOrigin,
    latitude: north + transform.latitudeOrigin,
  }
}

function fitAffine(points: readonly CalibrationPoint[]): AffineTransform | null {
  const longitudeOrigin = mean(points.map((point) => point.longitude))
  const latitudeOrigin = mean(points.map((point) => point.latitude))
  const samples = points.map((point) => ({
    east: point.longitude - longitudeOrigin,
    north: point.latitude - latitudeOrigin,
    x: point.imageX,
    y: point.imageY,
  }))

  const xCoefficients = solveLeastSquares(
    samples.map((sample) => [sample.east, sample.north, 1]),
    samples.map((sample) => sample.x),
  )
  const yCoefficients = solveLeastSquares(
    samples.map((sample) => [sample.east, sample.north, 1]),
    samples.map((sample) => sample.y),
  )
  if (!xCoefficients || !yCoefficients) return null

  const transform: AffineTransform = {
    longitudeOrigin,
    latitudeOrigin,
    a: xCoefficients[0],
    b: xCoefficients[1],
    c: xCoefficients[2],
    d: yCoefficients[0],
    e: yCoefficients[1],
    f: yCoefficients[2],
  }
  const determinant = transform.a * transform.e - transform.b * transform.d
  if (!Number.isFinite(determinant) || Math.abs(determinant) < SINGULAR_PIVOT) return null
  return transform
}

function residualFor(point: CalibrationPoint, transform: AffineTransform): CalibrationResidual {
  const predicted = geographicToPixel(transform, point)
  return {
    id: point.id,
    name: point.name,
    clicked: { x: point.imageX, y: point.imageY },
    predicted,
    errorPixels: Math.hypot(predicted.x - point.imageX, predicted.y - point.imageY),
  }
}

function readyMessage(
  maximumErrorPixels: number,
  spreadMeters: number,
  highError: boolean,
  narrowSpread: boolean,
): string {
  const residual = highError
    ? `Largest residual is ${maximumErrorPixels.toFixed(1)} px, above the ${HIGH_RESIDUAL_PIXELS} px review level. The clicked pixels and the fitted positions disagree.`
    : `Largest residual on the collected landmarks is ${maximumErrorPixels.toFixed(1)} px.`
  const spread = narrowSpread
    ? ` These landmarks span only about ${Math.round(spreadMeters)} m. Add points farther apart before using the fit away from this cluster.`
    : ''
  return `${residual}${spread} This describes only the collected landmarks. It is not a validation of the rest of the map.`
}

function geographicSpreadMeters(points: readonly CalibrationPoint[]): number {
  const latitudes = points.map((point) => point.latitude)
  const longitudes = points.map((point) => point.longitude)
  const midLatitude = mean(latitudes)
  const latitudeMeters = (Math.max(...latitudes) - Math.min(...latitudes)) * METERS_PER_DEGREE
  const longitudeMeters =
    (Math.max(...longitudes) - Math.min(...longitudes)) *
    METERS_PER_DEGREE *
    Math.cos((midLatitude * Math.PI) / 180)
  return Math.hypot(latitudeMeters, longitudeMeters)
}

function solveLeastSquares(rows: number[][], values: number[]): [number, number, number] | null {
  const normal = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const target = [0, 0, 0]

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const value = values[rowIndex]
    for (let i = 0; i < 3; i += 1) {
      target[i] += row[i] * value
      for (let j = 0; j < 3; j += 1) {
        normal[i][j] += row[i] * row[j]
      }
    }
  }

  return solveLinearSystem(normal, target)
}

function solveLinearSystem(matrix: number[][], vector: number[]): [number, number, number] | null {
  const rows = matrix.map((row, index) => [...row, vector[index]])

  for (let column = 0; column < 3; column += 1) {
    let pivot = column
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row
    }
    if (Math.abs(rows[pivot][column]) < SINGULAR_PIVOT) return null

    const pivotRow = rows[column]
    rows[column] = rows[pivot]
    rows[pivot] = pivotRow

    const scale = rows[column][column]
    for (let columnIndex = column; columnIndex < 4; columnIndex += 1) {
      rows[column][columnIndex] /= scale
    }

    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue
      const factor = rows[row][column]
      for (let columnIndex = column; columnIndex < 4; columnIndex += 1) {
        rows[row][columnIndex] -= factor * rows[column][columnIndex]
      }
    }
  }

  return [rows[0][3], rows[1][3], rows[2][3]]
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
