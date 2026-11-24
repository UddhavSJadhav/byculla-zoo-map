import { useEffect, useMemo, useState } from 'react'
import type { LineString, Position } from 'geojson'
import { availabilityLabel, categoryLabel } from '@/attractions/visitor'
import { useAttractions } from '@/components/map-v2/attractions/useAttractions'
import { useEntrances } from '@/components/map-v2/entrances/useEntrances'
import { usePaths } from '@/components/map-v2/paths/usePaths'
import { destinationChoices } from '@/destinations/choices'
import { destinationReadiness, destinationStatusDetail, destinationStatusLabel } from '@/destinations/readiness'
import type { RouteSegment } from '@/routing/graph'
import { accuracyWarning, advanceNavigation, type NavigationSession } from '@/routing/guidance'
import { cancelNavigation, returnToMap } from '@/visitor/experience'
import { visitorWalkingGraph } from '@/routing/visitorGraph'
import { shouldRecalculateRoute, type RouteFix } from '@/routing/walk'
import type { AttractionCategory } from '@/attractions/types'
import type { GeoPosition } from '@/types/geolocation'

export interface RouteUpdate {
  geometry: LineString | null
  fit: boolean
  focusPosition: boolean
}

export function DestinationSearch({
  categories,
  showClosed,
  position,
  onRoute,
  onNavigatingChange,
}: {
  categories: readonly AttractionCategory[]
  showClosed: boolean
  position: GeoPosition | null
  onRoute: (update: RouteUpdate) => void
  onNavigatingChange?: (navigating: boolean) => void
}) {
  const attractions = useAttractions()
  const entrances = useEntrances()
  const paths = usePaths()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [usingGps, setUsingGps] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [listOpen, setListOpen] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)
  const [acceptedFix, setAcceptedFix] = useState<RouteFix | null>(null)
  const [navigation, setNavigation] = useState<NavigationSession | null>(null)
  const network = useMemo<RouteSegment[]>(
    () => paths.map((path) => ({ id: path.osmFeatureId, status: path.status, coordinates: path.geometry.coordinates })),
    [paths],
  )
  const matches = useMemo(
    () => destinationChoices(attractions, categories, showClosed, query),
    [attractions, categories, showClosed, query],
  )
  const selected = attractions.find((attraction) => attraction.id === selectedId) ?? null
  const entrance = selected ? entrances.find((item) => item.attractionId === selected.id) ?? null : null
  const longitude = position?.longitude
  const latitude = position?.latitude
  const live = longitude != null && latitude != null ? ([longitude, latitude] as Position) : null
  const observed = usingGps ? live : null
  let fix = acceptedFix
  if (observed) {
    const at = position?.timestamp ?? 0
    if (shouldRecalculateRoute(fix, observed, at)) {
      fix = { at, position: observed }
      setAcceptedFix(fix)
    }
  } else if (fix) {
    fix = null
    setAcceptedFix(null)
  }
  const start = fix?.position ?? null
  const graph = visitorWalkingGraph()
  const readiness = selected
    ? destinationReadiness({
        status: selected.status,
        geometry: selected.geometry,
        entrance,
        start,
        graph,
        network,
      })
    : null
  const advanced = navigating && selected
    ? advanceNavigation({
        session: navigation,
        gps: observed,
        accuracy: position?.accuracy ?? null,
        entrance: entrance?.coordinates ?? null,
        entranceVerified: entrance?.verified === true,
        destinationName: selected.name,
        segments: network,
        now: position?.timestamp ?? 0,
      })
    : null
  const session = navigating ? advanced?.session ?? null : null
  if (navigating && session !== navigation) setNavigation(session)
  if (!navigating && navigation !== null) setNavigation(null)
  const line = session?.line ?? null
  useEffect(() => {
    onNavigatingChange?.(navigating)
  }, [navigating, onNavigatingChange])
  const guidance = advanced?.guidance ?? null
  const recalcMessage = session?.recalcMessage ?? null
  const warning = accuracyWarning(position?.accuracy ?? null)
  const title = navigating
    ? recalcMessage
      ? 'Off the route'
      : guidance?.headline ?? selected?.name ?? 'Navigation'
    : banner
      ? banner.replace(/\.$/, '')
      : readiness
        ? destinationStatusLabel(readiness)
        : ''
  const detail = navigating
    ? recalcMessage ?? guidance?.detail ?? ''
    : banner ?? (readiness ? destinationStatusDetail(readiness) : '')
  const showDirection = navigating && guidance != null && !guidance.arrived && !guidance.offRoute && recalcMessage == null && guidance.direction.kind !== 'unavailable'

  useEffect(() => {
    if (!navigating) return
    if (!line) {
      onRoute({ geometry: null, fit: false, focusPosition: false })
      return
    }
    onRoute({ geometry: line, fit: true, focusPosition: false })
  }, [navigating, line, onRoute])

  useEffect(() => {
    return () => {
      onRoute({ geometry: null, fit: false, focusPosition: false })
    }
  }, [onRoute])

  const clearRoute = (focusPosition: boolean) => {
    const next = cancelNavigation({ selectedId, navigating, listOpen })
    setNavigating(next.navigating)
    setListOpen(next.listOpen)
    setNavigation(null)
    onRoute({ geometry: null, fit: false, focusPosition })
  }

  return (
    <div className="flex flex-col rounded-t-3xl bg-white text-neutral-950">
      {!navigating || listOpen ? (
        <>
          <input
            type="search"
            value={query}
            placeholder="Search attractions"
            aria-label="Search attractions"
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-11 w-full rounded-none border-0 bg-transparent px-4 py-3 text-base text-neutral-950 outline-none"
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
                      onClick={() => {
                        if (attraction.id !== selectedId) {
                          setBanner(null)
                          clearRoute(false)
                        }
                        setSelectedId(attraction.id)
                      }}
                      className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left ${pressed ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-950 hover:bg-neutral-50'}`}
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
        </>
      ) : null}
      {selected && readiness ? (
        <div className={`space-y-2 border-t border-neutral-200 px-4 py-3 ${navigating ? 'order-first border-t-0' : ''}`} role="status">
          {navigating ? (
            <>
              <p className="text-xs font-semibold tracking-wide text-neutral-700 uppercase">To {guidance?.headline ?? selected.name}</p>
              {guidance?.arrived ? (
                <p className="text-2xl font-semibold text-neutral-950">You have reached the entrance.</p>
              ) : recalcMessage ? (
                <p className="text-lg font-semibold text-neutral-950">{recalcMessage}</p>
              ) : (
                <>
                  <p className="text-3xl font-semibold text-neutral-950 tabular-nums">
                    {guidance?.progress ? `${Math.round(guidance.progress.remainingMeters)} m` : detail}
                  </p>
                  <p className="text-lg font-semibold text-neutral-950">{showDirection ? guidance.direction.text : detail}</p>
                </>
              )}
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-neutral-950">{title}</p>
              <p className="text-sm leading-5 text-neutral-800">{detail}</p>
            </>
          )}
          {warning ? <p className="text-sm font-medium text-amber-950">{warning}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {navigating ? null : (
              <button
                type="button"
                disabled={live == null}
                onClick={() => setUsingGps(true)}
                className="inline-flex min-h-11 items-center rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                Use my position
              </button>
            )}
            {readiness.state === 'ready' && !navigating ? (
              <button
                type="button"
                onClick={() => {
                  setBanner(null)
                  setListOpen(false)
                  setNavigation(null)
                  setNavigating(true)
                }}
                className="inline-flex min-h-11 items-center rounded-full bg-blue-800 px-4 text-sm font-semibold text-white"
              >
                Start navigation
              </button>
            ) : null}
            {navigating ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setBanner('Navigation cancelled.')
                    clearRoute(live != null)
                  }}
                  className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-neutral-950 ring-1 ring-neutral-400"
                >
                  Cancel navigation
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = returnToMap({ selectedId, navigating, listOpen })
                    setListOpen(next.listOpen)
                    onRoute({ geometry: line, fit: line != null, focusPosition: line == null && live != null })
                  }}
                  className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-neutral-950 ring-1 ring-neutral-400"
                >
                  Return to the map
                </button>
                {listOpen ? null : (
                  <button
                    type="button"
                    onClick={() => setListOpen(true)}
                    className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-neutral-950 ring-1 ring-neutral-400"
                  >
                    Destinations
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRoute({ geometry: line, fit: false, focusPosition: true })}
                  className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-neutral-950 ring-1 ring-neutral-400"
                >
                  Current position
                </button>
              </>
            ) : null}
            {usingGps && !navigating ? (
              <button
                type="button"
                onClick={() => setUsingGps(false)}
                className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-neutral-950 ring-1 ring-neutral-400"
              >
                Clear starting point
              </button>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-neutral-800">
            {live ? `GPS ${live[1].toFixed(5)}, ${live[0].toFixed(5)}.` : 'Current GPS position is not available.'}
            {position && Number.isFinite(position.accuracy) ? ` Accuracy ${Math.round(position.accuracy)} m.` : ''}
            {start && !navigating ? ` Starting point ${start[1].toFixed(5)}, ${start[0].toFixed(5)}.` : ''}
            {!start && !navigating ? ' No starting point has been chosen.' : ''}
          </p>
        </div>
      ) : null}
    </div>
  )
}
