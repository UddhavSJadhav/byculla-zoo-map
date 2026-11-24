import { useEffect, useState } from 'react'
import type { Map, MapMouseEvent } from 'maplibre-gl'
import { useAttractions } from '@/components/map-v2/attractions/useAttractions'
import { attractionStatuses, type AttractionRecord } from '@/attractions/types'
import { availabilityLabel, categoryLabel } from '@/attractions/visitor'
import { placingEntranceId } from '@/entrances/store'
import { attractionRegistryLayerIds } from '@/map-v2/attractionRegistryLayer'

export function AttractionDetails({ map, enabled, visitor }: { map: Map | null; enabled: boolean; visitor: boolean }) {
  const [attractionIds, setAttractionIds] = useState<string[]>([])
  const attractions = useAttractions()
  const selected = attractionIds
    .map((id) => attractions.find((item) => item.id === id) ?? null)
    .filter((item): item is AttractionRecord => item !== null && item.geometry !== null)

  useEffect(() => {
    if (!map || !enabled) return
    const onClick = (event: MapMouseEvent) => {
      if (placingEntranceId()) return
      const layers = attractionRegistryLayerIds.filter((id) => map.getLayer(id))
      if (layers.length === 0) {
        setAttractionIds([])
        return
      }
      const found = map.queryRenderedFeatures(event.point, { layers: [...layers] })
      const raw = found.find((feature) => typeof feature.properties?.attractionIds === 'string')?.properties?.attractionIds
      if (typeof raw === 'string' && raw) {
        setAttractionIds(raw.split(',').filter(Boolean))
        return
      }
      const id = found.find((feature) => typeof feature.properties?.attractionId === 'string')?.properties?.attractionId
      setAttractionIds(typeof id === 'string' ? [id] : [])
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [map, enabled])

  const [detailsEnabled, setDetailsEnabled] = useState(enabled)
  if (detailsEnabled !== enabled) {
    setDetailsEnabled(enabled)
    if (!enabled) setAttractionIds([])
  }

  if (!enabled || selected.length === 0) return null
  const shared = selected.length > 1
  const sourceId = selected.find((item) => item.sourceFeatureId)?.sourceFeatureId
  return (
    <section className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-20 w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">{shared ? 'Shared polygon' : `Exhibit ${selected[0]?.exhibitNumber}`}</p>
          <h2 className="text-base font-semibold">{shared ? selected.map((item) => item.name).join(' · ') : selected[0]?.name}</h2>
        </div>
        <button type="button" onClick={() => setAttractionIds([])} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium">
          Close
        </button>
      </div>
      {shared ? (
        <p className="mt-1 text-[11px] text-neutral-500">
          {visitor ? 'These exhibits share this place. Each keeps its own listing.' : `These exhibits reference one OpenStreetMap feature, ${sourceId}. Each keeps its own record.`}
        </p>
      ) : null}
      <div className="mt-2 space-y-2">
        {selected.map((attraction) => (
          <AttractionSummary key={attraction.id} attraction={attraction} numbered={shared} visitor={visitor} />
        ))}
      </div>
    </section>
  )
}

function AttractionSummary({ attraction, numbered, visitor }: { attraction: AttractionRecord; numbered: boolean; visitor: boolean }) {
  const category = categoryLabel(attraction.category)
  const status = attractionStatuses.find((item) => item.id === attraction.status)?.label ?? attraction.status
  const availability = availabilityLabel(attraction.status)
  return (
    <div>
      {numbered ? <p className="text-sm font-semibold">{attraction.exhibitNumber}. {attraction.name}</p> : null}
      {visitor ? (
        <p className={`text-xs ${attraction.status === 'closed' ? 'font-semibold text-neutral-800' : 'text-neutral-600'}`}>
          {category} · {availability}
        </p>
      ) : (
        <p className="text-xs text-neutral-600">
          {category} · {status} · {attraction.verified ? 'Verified' : 'Not verified'} · {attraction.geometry?.type === 'Point' ? 'Point' : 'Polygon'}
          {attraction.geometryOrigin === 'osm' && attraction.sourceFeatureId ? ` · OpenStreetMap ${attraction.sourceFeatureId}` : ''}
          {attraction.geometryOrigin === 'manual' ? ' · Manual shape' : ''}
        </p>
      )}
      {attraction.description ? <p className="mt-1 text-sm text-neutral-800">{attraction.description}</p> : null}
      {attraction.status === 'reference' ? <p className="mt-1 text-[11px] text-neutral-500">This listing does not confirm the exhibit is open.</p> : null}
    </div>
  )
}
