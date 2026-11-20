import { divIcon } from 'leaflet'
import { useMemo } from 'react'
import { Circle, Marker } from 'react-leaflet'
import { isLowAccuracy } from '@/services/geolocation'
import type { GeoPosition } from '@/types/geolocation'

const ACCURATE_COLOR = '#2563eb'
const LOW_ACCURACY_COLOR = '#d97706'

interface UserLocationMarkerProps {
  position: GeoPosition
}

export function UserLocationMarker({ position }: UserLocationMarkerProps) {
  const lowAccuracy = isLowAccuracy(position.accuracy)
  const color = lowAccuracy ? LOW_ACCURACY_COLOR : ACCURATE_COLOR
  const showAccuracyCircle = Number.isFinite(position.accuracy) && position.accuracy > 0
  const pathOptions = useMemo(
    () => ({
      color,
      weight: 1,
      opacity: lowAccuracy ? 0.75 : 0.5,
      fillColor: color,
      fillOpacity: lowAccuracy ? 0.1 : 0.15,
      dashArray: lowAccuracy ? '6 7' : undefined,
    }),
    [color, lowAccuracy],
  )
  const icon = useMemo(
    () => createUserLocationIcon(position.heading, color),
    [position.heading, color],
  )

  return (
    <>
      {showAccuracyCircle ? (
        <Circle
          center={[position.latitude, position.longitude]}
          radius={position.accuracy}
          interactive={false}
          pathOptions={pathOptions}
          {...pathOptions}
        />
      ) : null}
      <Marker
        position={[position.latitude, position.longitude]}
        icon={icon}
        interactive={false}
        keyboard={false}
        zIndexOffset={1000}
      />
    </>
  )
}

function createUserLocationIcon(heading: number | null, color: string) {
  const headingMarkup =
    heading == null
      ? ''
      : `<svg class="user-location-heading" viewBox="0 0 64 64" style="transform: rotate(${Math.round(heading)}deg)" aria-hidden="true"><path d="M32 33 L20 8 L44 8 Z" fill="${color}" fill-opacity="0.4"/></svg>`

  return divIcon({
    className: 'user-location-icon',
    iconSize: [64, 64],
    iconAnchor: [32, 32],
    html: `<div class="user-location-marker" role="img" aria-label="Current location">${headingMarkup}<span class="user-location-dot" style="background:${color}"></span></div>`,
  })
}
