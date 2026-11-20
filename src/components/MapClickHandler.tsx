import { useMapEvents } from 'react-leaflet'

interface MapClickHandlerProps {
  onClick: (latitude: number, longitude: number) => void
}

export function MapClickHandler({ onClick }: MapClickHandlerProps) {
  useMapEvents({
    click(event) {
      onClick(event.latlng.lat, event.latlng.lng)
    },
  })

  return null
}
