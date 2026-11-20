import { useEffect, useState } from 'react'
import type { Map, MapMouseEvent } from 'maplibre-gl'
import { useAttractions } from '@/components/map-v2/attractions/useAttractions'
import { attractionCategories, attractionStatuses } from '@/attractions/types'
import { attractionRegistryLayerIds } from '@/map-v2/attractionRegistryLayer'

export function AttractionDetails({ map, enabled }: { map: Map | null; enabled: boolean }) {
  const [attractionId, setAttractionId] = useState<string | null>(null)
  const attractions = useAttractions()
  const attraction = attractions.find((item) => item.id === attractionId) ?? null

  useEffect(() => {
    if (!map || !enabled) return
    const onClick = (event: MapMouseEvent) => {
      const layers = attractionRegistryLayerIds.filter((id) => map.getLayer(id))
      if (layers.length === 0) {
        setAttractionId(null)
        return
      }
      const found = map.queryRenderedFeatures(event.point, { layers: [...layers] })
      const id = found.find((feature) => typeof feature.properties?.attractionId === 'string')?.properties?.attractionId
      setAttractionId(typeof id === 'string' ? id : null)
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [map, enabled])

  const [detailsEnabled, setDetailsEnabled] = useState(enabled)
  if (detailsEnabled !== enabled) {
    setDetailsEnabled(enabled)
    if (!enabled) setAttractionId(null)
  }

  if (!enabled || !attraction || !attraction.geometry) return null
  const category = attractionCategories.find((item) => item.id === attraction.category)?.label ?? attraction.category
  const status = attractionStatuses.find((item) => item.id === attraction.status)?.label ?? attraction.status
  return (
    <section className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-20 w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">Exhibit {attraction.exhibitNumber}</p>
          <h2 className="text-base font-semibold">{attraction.name}</h2>
        </div>
        <button type="button" onClick={() => setAttractionId(null)} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium">
          Close
        </button>
      </div>
      <p className="mt-1 text-xs text-neutral-600">
        {category} · {status} · {attraction.verified ? 'Verified' : 'Not verified'} · {attraction.geometry.type === 'Point' ? 'Point' : 'Polygon'}
        {attraction.geometryOrigin === 'osm' && attraction.sourceFeatureId ? ` · OpenStreetMap ${attraction.sourceFeatureId}` : ''}
        {attraction.geometryOrigin === 'manual' ? ' · Manual shape' : ''}
      </p>
      {attraction.description ? <p className="mt-2 text-sm text-neutral-800">{attraction.description}</p> : null}
      {attraction.status === 'reference' ? (
        <p className="mt-2 text-[11px] text-neutral-500">This name comes from the visitor map. It does not confirm the exhibit is open.</p>
      ) : null}
    </section>
  )
}
