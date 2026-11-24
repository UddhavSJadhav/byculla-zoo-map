import { useEffect, useRef } from 'react'
import type { FeatureCollection, LineString } from 'geojson'
import type { GeoJSONSource, Map } from 'maplibre-gl'

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }

export function RouteLayer({ map, geometry, fitToken }: { map: Map | null; geometry: LineString | null; fitToken: number }) {
  const fitted = useRef(0)

  useEffect(() => {
    if (!map) return
    const draw = () => {
      if (!map.getStyle()) return
      const data: FeatureCollection = geometry
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry, properties: {} }] }
        : empty
      const source = map.getSource('visitor-route')
      if (!source) {
        map.addSource('visitor-route', { type: 'geojson', data })
        map.addLayer({
          id: 'visitor-route',
          type: 'line',
          source: 'visitor-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#1d4e89', 'line-width': 5, 'line-opacity': 0.95 },
        })
        return
      }
      if (source.type === 'geojson') (source as GeoJSONSource).setData(data)
    }
    if (map.getStyle()) draw()
    map.on('load', draw)
    return () => {
      map.off('load', draw)
    }
  }, [map, geometry])

  useEffect(() => {
    if (!map) return
    return () => {
      if (!map.getStyle()) return
      if (map.getLayer('visitor-route')) map.removeLayer('visitor-route')
      if (map.getSource('visitor-route')) map.removeSource('visitor-route')
    }
  }, [map])

  useEffect(() => {
    if (!map || !geometry || fitToken === 0 || fitted.current === fitToken || !map.getStyle()) return
    fitted.current = fitToken
    let west = Infinity
    let south = Infinity
    let east = -Infinity
    let north = -Infinity
    for (const position of geometry.coordinates) {
      west = Math.min(west, Number(position[0]))
      south = Math.min(south, Number(position[1]))
      east = Math.max(east, Number(position[0]))
      north = Math.max(north, Number(position[1]))
    }
    if (!Number.isFinite(west)) return
    if (west === east && south === north) {
      map.flyTo({ center: [west, south], zoom: Math.max(map.getZoom(), 17), essential: true })
      return
    }
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: { top: 220, bottom: 140, left: 48, right: 48 }, maxZoom: 18, duration: 700 },
    )
  }, [map, geometry, fitToken])

  return null
}
