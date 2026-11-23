import { useEffect } from 'react'
import type { Map, MapMouseEvent } from 'maplibre-gl'
import { pathAccessLayerIds, syncPathAccess } from '@/map-v2/pathAccessLayer'
import { usePaths } from '@/components/map-v2/paths/usePaths'

export function PathAccessLayer({
  map,
  visitor,
  editing,
  pathsVisible,
  selectedId,
  interactive,
  onSelect,
}: {
  map: Map | null
  visitor: boolean
  editing: boolean
  pathsVisible: boolean
  selectedId: string | null
  interactive: boolean
  onSelect: (id: string | null) => void
}) {
  const paths = usePaths()

  useEffect(() => {
    if (!map) return
    const draw = () => {
      try {
        syncPathAccess(map, paths, { visitor, selectedId: interactive ? selectedId : null, visible: pathsVisible, editing })
      } catch {
        // The map can be removed while path access is updating.
      }
    }
    if (map.getStyle()) draw()
    map.on('load', draw)
    return () => {
      map.off('load', draw)
    }
  }, [map, paths, visitor, editing, pathsVisible, selectedId, interactive])

  useEffect(() => {
    if (!map || !interactive) return
    const onClick = (event: MapMouseEvent) => {
      const layers = pathAccessLayerIds.filter((id) => map.getLayer(id))
      if (layers.length === 0) return
      const found = map.queryRenderedFeatures(event.point, { layers: [...layers] })
      const id = found.find((feature) => typeof feature.properties?.osmFeatureId === 'string')?.properties?.osmFeatureId
      onSelect(typeof id === 'string' ? id : null)
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [map, interactive, onSelect])

  return null
}
