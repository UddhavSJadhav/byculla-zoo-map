import { useEffect, useState } from 'react'
import type { Map } from 'maplibre-gl'
import { getCandidateHighlight, subscribeCandidateHighlight } from '@/attractions/candidates'
import type { AttractionGeometry } from '@/attractions/types'
import { syncAttractionRegistry, syncCandidateHighlight } from '@/map-v2/attractionRegistryLayer'
import { useAttractions } from '@/components/map-v2/attractions/useAttractions'

export function AttractionLayer({ map }: { map: Map | null }) {
  const attractions = useAttractions()
  const [highlightToken, setHighlightToken] = useState(0)
  useEffect(() => subscribeCandidateHighlight(() => setHighlightToken((current) => current + 1)), [])
  const highlight = getCandidateHighlight()
  void highlightToken

  useEffect(() => {
    if (!map) return
    const draw = () => {
      try {
        syncAttractionRegistry(map, attractions)
      } catch {
        // The map can be removed while the registry is updating.
      }
    }
    if (map.getStyle()) draw()
    map.on('load', draw)
    return () => {
      map.off('load', draw)
    }
  }, [map, attractions])

  useEffect(() => {
    if (!map) return
    const geometry = highlight?.geometry ?? null
    const frame = geometry ? boundsOf(geometry) : null
    const draw = () => {
      try {
        syncCandidateHighlight(map, geometry)
        if (!frame) return
        map.fitBounds(frame, {
          padding: { top: 160, right: 380, bottom: 90, left: 48 },
          maxZoom: 19,
          duration: 0,
        })
      } catch {
        // The map can be removed while the highlight is updating.
      }
    }
    if (map.getStyle()) draw()
    map.on('load', draw)
    map.once('idle', draw)
    return () => {
      map.off('load', draw)
      map.off('idle', draw)
    }
  }, [map, highlight])

  return null
}

function boundsOf(geometry: AttractionGeometry): [[number, number], [number, number]] {
  const positions = geometry.type === 'Point' ? [geometry.coordinates] : (geometry.coordinates[0] ?? [])
  let west = Number.POSITIVE_INFINITY
  let south = Number.POSITIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY
  for (const position of positions) {
    west = Math.min(west, Number(position[0]))
    east = Math.max(east, Number(position[0]))
    south = Math.min(south, Number(position[1]))
    north = Math.max(north, Number(position[1]))
  }
  if (geometry.type === 'Point') return [[west - 0.00045, south - 0.00045], [east + 0.00045, north + 0.00045]]
  return [[west, south], [east, north]]
}
