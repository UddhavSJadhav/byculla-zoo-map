import { useEffect, useRef, useState } from 'react'
import { type GeoJSONSource, LngLatBounds, Map, Marker, NavigationControl } from 'maplibre-gl'
import '@/map-v2/configureWorker'
import { zoo } from '@/data/zoo'
import zooBoundary from '@/data/map-v2/zoo-boundary.geojson'
import { accuracyCircle, emptyFeatureCollection } from '@/map-v2/accuracyCircle'
import { addZooLayers, layerGroupIds } from '@/map-v2/layers'
import { pointInRing, polygonRing, ringBounds } from '@/map-v2/zooBounds'
import { isLowAccuracy } from '@/services/geolocation'
import type { GeoPosition } from '@/types/geolocation'
import type { MapLayerId } from '@/types/map-v2'

const zooRing = polygonRing(zooBoundary)

const libertyStyle = 'https://tiles.openfreemap.org/styles/liberty'

interface ZooMapProps {
  position: GeoPosition | null
  focusRequestId: number
  layers: Record<MapLayerId, boolean>
  confineToZoo?: boolean
  onMapReady?: (map: Map | null) => void
}

export function ZooMap({ position, focusRequestId, layers, confineToZoo = false, onMapReady }: ZooMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const appliedFocusRef = useRef(0)
  const onMapReadyRef = useRef(onMapReady)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    onMapReadyRef.current = onMapReady
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new Map({
      container,
      style: libertyStyle,
      center: [zoo.center.longitude, zoo.center.latitude],
      zoom: 16.4,
      attributionControl: { compact: false },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    })
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), 'top-left')
    map.on('load', () => {
      addZooLayers(map)
      setReady(true)
      onMapReadyRef.current?.(map)
    })
    mapRef.current = map

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      onMapReadyRef.current?.(null)
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    for (const [layerId, visible] of Object.entries(layers) as [MapLayerId, boolean][]) {
      for (const styleLayerId of layerGroupIds[layerId]) {
        if (!map.getLayer(styleLayerId)) continue
        map.setLayoutProperty(styleLayerId, 'visibility', visible ? 'visible' : 'none')
      }
    }
  }, [layers, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const source = map.getSource('gps-accuracy')
    if (!source || source.type !== 'geojson') return

    if (!position || !Number.isFinite(position.accuracy) || position.accuracy <= 0) {
      ;(source as GeoJSONSource).setData(emptyFeatureCollection())
      markerRef.current?.remove()
      markerRef.current = null
      return
    }

    const lowAccuracy = isLowAccuracy(position.accuracy)
    const color = lowAccuracy ? '#d97706' : '#2563eb'
    ;(source as GeoJSONSource).setData(accuracyCircle(position.latitude, position.longitude, position.accuracy))
    map.setPaintProperty('gps-accuracy', 'fill-color', color)
    map.setPaintProperty('gps-accuracy-line', 'line-color', color)

    const lngLat: [number, number] = [position.longitude, position.latitude]
    if (!markerRef.current) {
      markerRef.current = new Marker({ element: locationDot(color), anchor: 'center' })
        .setLngLat(lngLat)
        .addTo(map)
    } else {
      markerRef.current.setLngLat(lngLat)
      const element = markerRef.current.getElement().firstElementChild
      if (element instanceof HTMLElement) element.style.background = color
    }
  }, [position, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !confineToZoo) return
    const box = ringBounds(zooRing)
    if (!box) return
    const bounds = new LngLatBounds([box.west, box.south], [box.east, box.north])
    map.setMaxBounds(bounds)
    const camera = map.cameraForBounds(bounds, { padding: 24 })
    if (camera?.zoom == null) return
    map.setMinZoom(camera.zoom)
    if (map.getZoom() < camera.zoom) map.jumpTo({ zoom: camera.zoom })
  }, [confineToZoo, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !position || focusRequestId === 0 || appliedFocusRef.current === focusRequestId) {
      return
    }
    appliedFocusRef.current = focusRequestId
    if (confineToZoo && !pointInRing([position.longitude, position.latitude], zooRing)) return
    map.flyTo({
      center: [position.longitude, position.latitude],
      zoom: Math.max(map.getZoom(), 17),
      essential: true,
    })
  }, [confineToZoo, focusRequestId, position, ready])

  return <div ref={containerRef} className="h-full w-full" />
}

function locationDot(color: string) {
  const element = document.createElement('div')
  element.style.width = '18px'
  element.style.height = '18px'
  const dot = document.createElement('div')
  dot.style.width = '14px'
  dot.style.height = '14px'
  dot.style.margin = '2px'
  dot.style.borderRadius = '999px'
  dot.style.background = color
  dot.style.border = '2px solid #fff'
  dot.style.boxShadow = '0 1px 4px rgba(15, 23, 42, 0.35)'
  element.append(dot)
  return element
}
