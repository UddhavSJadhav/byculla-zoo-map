import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import type { GeoPosition } from '@/types/geolocation'

interface MapCameraProps {
  position: GeoPosition | null
  focusRequestId: number
}

export function MapCamera({ position, focusRequestId }: MapCameraProps) {
  const map = useMap()
  const appliedRequestId = useRef(0)

  useEffect(() => {
    if (!position || focusRequestId === 0 || focusRequestId === appliedRequestId.current) {
      return
    }

    appliedRequestId.current = focusRequestId
    map.panTo([position.latitude, position.longitude], {
      animate: true,
      duration: 0.45,
    })
  }, [focusRequestId, map, position])

  return null
}
