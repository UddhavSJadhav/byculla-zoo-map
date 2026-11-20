import { CRS, type LatLngBoundsExpression } from 'leaflet'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ImageOverlay, MapContainer, useMap, useMapEvents } from 'react-leaflet'
import { leafletToImagePixel } from '@/services/illustratedCoordinates'
import type { PixelPoint } from '@/types/calibration'
import illustratedMapUrl from '../../images/image.png'

export interface IllustratedImageSize {
  width: number
  height: number
}

interface MapFitPadding {
  topLeft: [number, number]
  bottomRight: [number, number]
}

const defaultFitPadding: MapFitPadding = {
  topLeft: [12, 128],
  bottomRight: [12, 200],
}

interface IllustratedMapProps {
  isTracking: boolean
  selecting?: boolean
  fitPadding?: MapFitPadding
  onImageClick?: (point: PixelPoint) => void
  children?: ReactNode | ((size: IllustratedImageSize) => ReactNode)
}

export function IllustratedMap({
  isTracking,
  selecting = false,
  fitPadding = defaultFitPadding,
  onImageClick,
  children,
}: IllustratedMapProps) {
  const size = useImageSize(illustratedMapUrl)
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (!size) return null
    return [
      [0, 0],
      [size.height, size.width],
    ]
  }, [size])

  return (
    <div className="relative h-full w-full bg-stone-200">
      {size && bounds ? (
        <MapContainer
          crs={CRS.Simple}
          center={[size.height / 2, size.width / 2]}
          zoom={0}
          minZoom={-4}
          maxZoom={4}
          zoomSnap={0}
          maxBounds={bounds}
          maxBoundsViscosity={1}
          scrollWheelZoom
          attributionControl={false}
          className={selecting ? 'illustrated-map calibration-select h-full w-full' : 'illustrated-map h-full w-full'}
        >
          <ImageOverlay url={illustratedMapUrl} bounds={bounds} interactive={false} />
          <FitIllustratedMap bounds={bounds} padding={fitPadding} />
          {onImageClick ? (
            <ImageClickCapture width={size.width} height={size.height} onImageClick={onImageClick} />
          ) : null}
          {typeof children === 'function' ? children(size) : children}
        </MapContainer>
      ) : null}
      {isTracking ? (
        <p className="pointer-events-none absolute inset-x-4 top-36 z-[500] mx-auto w-fit max-w-sm rounded-full bg-white/95 px-3 py-1.5 text-center text-xs font-medium text-neutral-700 shadow-md ring-1 ring-black/5">
          GPS is active. Alignment to this map is not set up yet.
        </p>
      ) : null}
    </div>
  )
}

function useImageSize(url: string): IllustratedImageSize | null {
  const [size, setSize] = useState<IllustratedImageSize | null>(null)

  useEffect(() => {
    const image = new Image()
    image.onload = () => {
      setSize({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.src = url

    return () => {
      image.onload = null
    }
  }, [url])

  return size
}

function FitIllustratedMap({
  bounds,
  padding,
}: {
  bounds: LatLngBoundsExpression
  padding: MapFitPadding
}) {
  const map = useMap()
  const fitted = useRef(false)

  useEffect(() => {
    if (fitted.current) return
    fitted.current = true
    map.fitBounds(bounds, {
      paddingTopLeft: padding.topLeft,
      paddingBottomRight: padding.bottomRight,
      animate: false,
    })
  }, [bounds, map, padding])

  return null
}

function ImageClickCapture({
  width,
  height,
  onImageClick,
}: {
  width: number
  height: number
  onImageClick: (point: PixelPoint) => void
}) {
  useMapEvents({
    click(event) {
      const pixel = leafletToImagePixel(event.latlng.lat, event.latlng.lng, height)
      if (pixel.x < 0 || pixel.y < 0 || pixel.x > width || pixel.y > height) return
      onImageClick(pixel)
    },
  })

  return null
}
