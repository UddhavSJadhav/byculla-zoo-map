import type { PixelPoint } from '@/types/calibration'

/**
 * Illustrated map CRS.
 *
 * Leaflet CRS.Simple uses [lat, lng] as [y, x]. The image overlay bounds are
 * [[0, 0], [height, width]], so the top-left pixel is lat = height, lng = 0
 * and the bottom-right pixel is lat = 0, lng = width.
 * imageY increases downward, matching the image file.
 */
export function leafletToImagePixel(latitude: number, longitude: number, imageHeight: number): PixelPoint {
  return {
    x: longitude,
    y: imageHeight - latitude,
  }
}

export function imagePixelToLeaflet(
  pixel: PixelPoint,
  imageHeight: number,
): { latitude: number; longitude: number } {
  return {
    latitude: imageHeight - pixel.y,
    longitude: pixel.x,
  }
}
