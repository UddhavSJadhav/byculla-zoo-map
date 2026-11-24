import { useMemo, useState } from 'react'
import type { Position } from 'geojson'
import { availabilityLabel, categoryLabel } from '@/attractions/visitor'
import { useAttractions } from '@/components/map-v2/attractions/useAttractions'
import { useEntrances } from '@/components/map-v2/entrances/useEntrances'
import { usePaths } from '@/components/map-v2/paths/usePaths'
import { destinationChoices } from '@/destinations/choices'
import { destinationReadiness, destinationStatusDetail, destinationStatusLabel } from '@/destinations/readiness'
import { visitorWalkingGraph } from '@/routing/visitorGraph'
import type { AttractionCategory } from '@/attractions/types'
import type { GeoPosition } from '@/types/geolocation'

export function DestinationSearch({
  categories,
  showClosed,
  position,
}: {
  categories: readonly AttractionCategory[]
  showClosed: boolean
  position: GeoPosition | null
}) {
  const attractions = useAttractions()
  const entrances = useEntrances()
  usePaths()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [start, setStart] = useState<Position | null>(null)
  const matches = useMemo(
    () => destinationChoices(attractions, categories, showClosed, query),
    [attractions, categories, showClosed, query],
  )
  const selected = attractions.find((attraction) => attraction.id === selectedId) ?? null
  const graph = visitorWalkingGraph()
  const readiness = selected
    ? destinationReadiness({
        status: selected.status,
        geometry: selected.geometry,
        entrance: entrances.find((entrance) => entrance.attractionId === selected.id) ?? null,
        start,
        graph,
      })
    : null
  const gps = position ? ([position.longitude, position.latitude] as Position) : null

  return (
    <div className="rounded-2xl bg-white/95 shadow-md ring-1 ring-black/5">
      <input
        type="search"
        value={query}
        placeholder="Search attractions"
        aria-label="Search attractions"
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded-2xl border-0 bg-transparent px-4 py-3 text-base outline-none"
      />
      <ul className="max-h-52 overflow-y-auto border-t border-neutral-200" aria-label="Destinations">
        {matches.length === 0 ? (
          <li className="px-4 py-3 text-sm text-neutral-600">No attractions match.</li>
        ) : (
          matches.map((attraction) => {
            const pressed = attraction.id === selectedId
            return (
              <li key={attraction.id}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setSelectedId(attraction.id)}
                  className={`flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left ${pressed ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-50'}`}
                >
                  <span className="text-sm font-semibold">
                    {attraction.exhibitNumber}. {attraction.name}
                  </span>
                  <span className={`shrink-0 text-xs ${pressed ? 'text-neutral-200' : 'text-neutral-500'}`}>
                    {categoryLabel(attraction.category)} · {availabilityLabel(attraction.status)}
                  </span>
                </button>
              </li>
            )
          })
        )}
      </ul>
      {selected && readiness ? (
        <div className="space-y-2 border-t border-neutral-200 px-4 py-3" role="status">
          <p className="text-sm font-semibold">{destinationStatusLabel(readiness)}</p>
          <p className="text-xs leading-5 text-neutral-600">{destinationStatusDetail(readiness)}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!gps}
              onClick={() => {
                if (gps) setStart(gps)
              }}
              className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
            >
              Use my position
            </button>
            {start ? (
              <button type="button" onClick={() => setStart(null)} className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium">
                Clear starting point
              </button>
            ) : null}
          </div>
          <p className="text-[11px] leading-4 text-neutral-500">
            {gps
              ? `GPS ${gps[1].toFixed(5)}, ${gps[0].toFixed(5)} is available.`
              : 'Current GPS position is not available.'}
            {start ? ` Starting point ${start[1].toFixed(5)}, ${start[0].toFixed(5)}.` : ' No starting point has been chosen.'}
          </p>
        </div>
      ) : null}
    </div>
  )
}
