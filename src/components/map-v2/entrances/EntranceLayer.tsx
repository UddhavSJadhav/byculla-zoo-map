import { useEffect } from 'react'
import { Marker, type Map, type MapMouseEvent } from 'maplibre-gl'
import { useAttractions } from '@/components/map-v2/attractions/useAttractions'
import { entranceReadiness } from '@/entrances/connection'
import { placingAttractionId, placingEntranceId, setEntrance } from '@/entrances/store'
import { usePaths } from '@/components/map-v2/paths/usePaths'
import { visitorWalkingGraph } from '@/routing/visitorGraph'
import { useEntrances, useEntrancePlacement } from '@/components/map-v2/entrances/useEntrances'

export function EntranceLayer({ map, active, placingEnabled }: { map: Map | null; active: boolean; placingEnabled: boolean }) {
  const entrances = useEntrances()
  const placingId = useEntrancePlacement()
  const attractions = useAttractions()
  usePaths()
  const graph = visitorWalkingGraph()

  useEffect(() => {
    if (!map || !active) return
    const markers = entrances.map((entrance) => {
      const attraction = attractions.find((item) => item.id === entrance.attractionId)
      const readiness = entranceReadiness(entrance, graph)
      const siblings = entrances.filter((item) => item.attractionId === entrance.attractionId)
      const index = siblings.findIndex((item) => item.id === entrance.id) + 1
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'entrance-marker'
      element.textContent = siblings.length > 1 ? String(index) : 'E'
      element.setAttribute(
        'aria-label',
        `${attraction ? `${attraction.exhibitNumber}. ${attraction.name}` : entrance.attractionId} entrance${siblings.length > 1 ? ` ${index}` : ''}`,
      )
      element.style.width = '22px'
      element.style.height = '22px'
      element.style.borderRadius = '999px'
      element.style.border = `2px solid ${markerColor(readiness)}`
      element.style.background = '#fffaf3'
      element.style.color = '#1e3a5f'
      element.style.fontSize = '11px'
      element.style.fontWeight = '700'
      element.style.lineHeight = '18px'
      element.style.boxShadow = '0 1px 3px rgba(0,0,0,0.25)'
      const marker = new Marker({ element, anchor: 'center', draggable: true }).setLngLat(entrance.coordinates).addTo(map)
      marker.on('dragend', () => {
        const lngLat = marker.getLngLat()
        setEntrance(entrance.id, [lngLat.lng, lngLat.lat], entrance.attractionId)
      })
      return marker
    })
    return () => {
      for (const marker of markers) marker.remove()
    }
  }, [map, active, entrances, attractions, graph])

  useEffect(() => {
    if (!map) return
    const canvas = map.getCanvas()
    canvas.style.cursor = active && placingEnabled && placingId ? 'crosshair' : ''
    if (!active || !placingEnabled || !placingId) return
    const onClick = (event: MapMouseEvent) => {
      if (placingEntranceId() !== placingId) return
      const target = event.originalEvent.target
      if (target instanceof Element && target.closest('.entrance-marker')) return
      const attractionId = placingAttractionId() ?? placingId
      setEntrance(placingId, [event.lngLat.lng, event.lngLat.lat], attractionId)
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
      canvas.style.cursor = ''
    }
  }, [map, active, placingEnabled, placingId])

  return null
}

function markerColor(readiness: ReturnType<typeof entranceReadiness>) {
  if (readiness.state === 'route-ready') return '#1f7a4d'
  if (readiness.state === 'not-connected') return '#b86a1a'
  if (readiness.state === 'unverified' && readiness.connection !== 'on-network') return '#b86a1a'
  return '#1e3a5f'
}
