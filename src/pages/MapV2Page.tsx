import { useCallback, useEffect, useRef, useState } from 'react'
import type { LineString } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { AttractionAdmin } from '@/components/map-v2/attractions/AttractionAdmin'
import { AttractionDetails } from '@/components/map-v2/attractions/AttractionDetails'
import { AttractionLayer } from '@/components/map-v2/attractions/AttractionLayer'
import { useVisitorWalk, type RouteUpdate } from '@/components/map-v2/destinations/useVisitorWalk'
import { RouteLayer } from '@/components/map-v2/routes/RouteLayer'
import { EntranceLayer } from '@/components/map-v2/entrances/EntranceLayer'
import { PathAccessLayer } from '@/components/map-v2/paths/PathAccessLayer'
import { PathAdmin } from '@/components/map-v2/paths/PathAdmin'
import { PathLegend } from '@/components/map-v2/paths/PathLegend'
import { MapEditor } from '@/components/map-v2/editor/MapEditor'
import { ZooMap } from '@/components/map-v2/ZooMap'
import type { Map } from 'maplibre-gl'
import { extractedDatasets, mappedNotLayered, missingGeography } from '@/data/map-v2/availability'
import { mapSources } from '@/data/map-v2/sources'
import zooBoundary from '@/data/map-v2/zoo-boundary.geojson'
import { polygonRing } from '@/map-v2/zooBounds'
import { layerSwatches } from '@/map-v2/layers'
import { useAttractionBaseline } from '@/components/map-v2/attractions/useAttractions'
import { baselineServedFromCache, retryAttractionBaseline } from '@/attractions/baseline'
import { useGeolocation } from '@/hooks/useGeolocation'
import { visitorWalkingGraph } from '@/routing/visitorGraph'
import { isLowAccuracy } from '@/services/geolocation'
import { describeOffline, nextLocationNotice, showLocationBubble, visitorLocationExplanation } from '@/visitor/experience'
import { attractionCategories } from '@/attractions/types'
import { mapLayerIds, type MapLayerId } from '@/types/map-v2'

const initialLayers = Object.fromEntries(mapLayerIds.map((id) => [id, id !== 'trees'])) as Record<MapLayerId, boolean>
const zooRing = polygonRing(zooBoundary)
const visitorCategories = attractionCategories.map((category) => category.id)

export function MapV2Page({ mode }: { mode: 'visitor' | 'admin' }) {
  const { phase, position, message, fixCount, requestLocation, wait, errorKind } = useGeolocation()
  const baseline = useAttractionBaseline()
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [notice, setNotice] = useState({ phase, recovered: false })
  if (notice.phase !== phase) setNotice(nextLocationNotice(notice, phase))
  const locationExplanation = visitorLocationExplanation({
    phase,
    wait: phase === 'waiting' ? wait : null,
    errorKind,
    accuracy: phase === 'available' && position ? position.accuracy : null,
    recovered: notice.recovered,
  })
  const offline = describeOffline({
    online,
    attractionMetadataCached: baseline.status === 'ready',
    pathGeometriesCached: mapSources.paths.features.length > 0,
    graphReconstructed: visitorWalkingGraph().nodes != null,
  })
  const [layers, setLayers] = useState(initialLayers)
  const [map, setMap] = useState<Map | null>(null)
  const [editing, setEditing] = useState(false)
  const [managingAttractions, setManagingAttractions] = useState(mode === 'admin')
  const [managingPaths, setManagingPaths] = useState(false)
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)
  const visitorMode = mode === 'visitor'
  const [focusRequestId, setFocusRequestId] = useState(0)
  const [routeGeometry, setRouteGeometry] = useState<LineString | null>(null)
  const [routeFitToken, setRouteFitToken] = useState(0)
  const handleRoute = useCallback((update: RouteUpdate) => {
    setRouteGeometry(update.geometry)
    if (update.fit) setRouteFitToken((current) => current + 1)
    if (update.focusPosition) setFocusRequestId((current) => current + 1)
  }, [])
  const walk = useVisitorWalk(phase === 'available' ? position : null, handleRoute)
  const [awaitingFix, setAwaitingFix] = useState(false)
  const fixCountAtStart = useRef(0)
  const centeredFixCount = useRef(0)

  useEffect(() => {
    if (!awaitingFix || !position || fixCount <= fixCountAtStart.current) return
    if (centeredFixCount.current === fixCount) return
    centeredFixCount.current = fixCount
    setAwaitingFix(false)
    setFocusRequestId((current) => current + 1)
  }, [awaitingFix, fixCount, position])

  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const update = () => {
      const next = navigator.onLine
      setOnline(next)
      if (next && (baseline.status === 'error' || baselineServedFromCache())) retryAttractionBaseline()
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [baseline.status])

  useEffect(() => {
    const node = headerRef.current
    const root = node?.closest('.map-v2')
    if (visitorMode || !(node instanceof HTMLElement) || !(root instanceof HTMLElement)) return
    const apply = () => root.style.setProperty('--admin-header-offset', `${node.offsetHeight + 12}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(node)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--admin-header-offset')
    }
  }, [visitorMode, offline.showIndicator])

  const locate = () => {
    fixCountAtStart.current = fixCount
    setAwaitingFix(true)
    requestLocation()
    if (position) setFocusRequestId((current) => current + 1)
  }
  const travelTo = (attractionId: string) => {
    if (walk.travel(attractionId) === 'need-location') locate()
  }
  const locationBubble = showLocationBubble({
    phase,
    wait: phase === 'waiting' ? wait : null,
    errorKind,
    poorAccuracy: locationExplanation.poorAccuracy,
  })

  return (
    <div className={`map-v2 relative h-dvh w-full overflow-hidden bg-[#f4ead7] text-neutral-900${visitorMode ? ' map-v2-visitor' : ''}${editing ? ' map-v2-editing' : ''}`}>
      <ZooMap position={position} focusRequestId={focusRequestId} layers={layers} confineToZoo={visitorMode} onMapReady={setMap} />
      {visitorMode ? (
        offline.showIndicator || baseline.status === 'error' ? (
          <p
            className="pointer-events-auto absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 left-14 z-10 rounded-2xl bg-white px-3 py-2 text-sm font-medium text-neutral-950 shadow-md ring-1 ring-neutral-300"
            role={baseline.status === 'error' ? 'alert' : 'status'}
          >
            {baseline.status === 'error' ? baseline.error : offline.text}
          </p>
        ) : null
      ) : (
        <header ref={headerRef} className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/"
                className="inline-flex min-h-11 items-center rounded-full bg-white/95 px-3 text-sm font-medium text-neutral-700 shadow-md ring-1 ring-black/5"
              >
                Visitor map
              </a>
              <button
                type="button"
                aria-pressed={managingAttractions}
                onClick={() => {
                  setManagingAttractions((current) => !current)
                  setManagingPaths(false)
                }}
                className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold shadow-md ring-1 ring-black/5 ${managingAttractions ? 'bg-neutral-900 text-white' : 'bg-white/95 text-neutral-800'}`}
              >
                Attractions
              </button>
              <button
                type="button"
                aria-pressed={managingPaths}
                onClick={() => {
                  setManagingPaths((current) => !current)
                  setManagingAttractions(false)
                }}
                className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold shadow-md ring-1 ring-black/5 ${managingPaths ? 'bg-neutral-900 text-white' : 'bg-white/95 text-neutral-800'}`}
              >
                Paths
              </button>
              <button
                type="button"
                aria-pressed={editing}
                onClick={() => setEditing((current) => !current)}
                className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold shadow-md ring-1 ring-black/5 ${editing ? 'bg-neutral-900 text-white' : 'bg-white/95 text-neutral-800'}`}
              >
                {editing ? 'Editing' : 'Edit map'}
              </button>
            </div>
            {offline.showIndicator ? (
              <p className="rounded-2xl bg-white px-3 py-2 text-sm font-medium text-neutral-950 shadow-md ring-1 ring-neutral-300" role="status">
                {offline.text}
              </p>
            ) : null}
            <input
              type="search"
              placeholder="Search attractions"
              aria-label="Search attractions"
              title="Search is not available yet"
              className="min-h-11 w-full rounded-2xl border-0 bg-white/95 px-4 text-base text-neutral-950 shadow-md ring-1 ring-black/5 outline-none placeholder:text-neutral-600"
            />
          </div>
        </header>
      )}
      {visitorMode ? (
        <>
          {walk.navigating && walk.instruction ? (
            <div className="pointer-events-auto absolute inset-x-3 bottom-[max(4.75rem,calc(env(safe-area-inset-bottom)+3.75rem))] z-20 mx-auto flex max-w-lg items-center gap-2 rounded-full bg-white py-1 pr-1 pl-4 shadow-md ring-1 ring-black/10">
              <p className="min-w-0 flex-1 text-sm font-semibold text-neutral-950">{walk.instruction}</p>
              <button type="button" onClick={walk.cancel} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white">
                Cancel
              </button>
            </div>
          ) : null}
          <div className="absolute right-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex max-w-[min(18rem,calc(100%-5rem))] flex-col items-end gap-2">
            {locationBubble ? (
              <p
                className={`pointer-events-none rounded-2xl px-3 py-2 text-sm font-medium shadow-md ring-1 ring-black/10 ${locationExplanation.poorAccuracy ? 'bg-amber-50 text-amber-950' : 'bg-white text-neutral-950'}`}
                role="alert"
              >
                {locationExplanation.title}. {locationExplanation.detail}
              </p>
            ) : null}
            <button
              type="button"
              onClick={locate}
              aria-label="Locate me"
              className="pointer-events-auto inline-flex size-11 items-center justify-center rounded-full bg-blue-800 text-white shadow-md"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
            </button>
          </div>
        </>
      ) : null}
      <AttractionLayer map={map} visitor={visitorMode} categories={visitorCategories} showClosed={false} />
      {visitorMode ? <RouteLayer map={map} geometry={routeGeometry} fitToken={routeFitToken} clipRing={zooRing} /> : null}
      <AttractionDetails map={map} enabled={!editing} visitor={visitorMode} onTravel={visitorMode ? travelTo : undefined} travelNote={visitorMode ? walk.note : null} />
      {import.meta.env.DEV ? <EntranceLayer map={map} active={managingAttractions} placingEnabled={!editing} /> : null}
      <PathAccessLayer
        map={map}
        visitor={visitorMode}
        editing={editing}
        pathsVisible={layers.paths}
        selectedId={selectedPathId}
        interactive={managingPaths && !editing}
        onSelect={setSelectedPathId}
      />
      {import.meta.env.DEV && managingPaths ? <PathAdmin map={map} selectedId={selectedPathId} editing={editing} onSelect={setSelectedPathId} /> : null}
      {editing ? null : <PathLegend visitor={visitorMode} />}
      {import.meta.env.DEV && managingAttractions ? (
        <AttractionAdmin
          docked={editing}
          onEditMap={() => {
            setEditing(true)
            setManagingAttractions(true)
          }}
        />
      ) : null}
      {import.meta.env.DEV ? <MapEditor map={map} editing={editing} /> : null}
      {visitorMode ? null : <div className="pointer-events-none absolute right-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex w-[min(22rem,calc(100%-1.5rem))] flex-col items-end gap-2">
        <button
          type="button"
          onClick={locate}
          className="pointer-events-auto rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md"
        >
          Locate me
        </button>
        <p
          className={`pointer-events-none max-w-full rounded-full bg-white/95 px-3 py-1 text-xs shadow-md ring-1 ring-black/5 ${phase === 'available' && position && isLowAccuracy(position.accuracy) ? 'text-amber-800' : 'text-neutral-700'}`}
          role="status"
        >
          {message}
          {phase === 'available' && position && Number.isFinite(position.accuracy)
            ? ` · Accuracy ${Math.round(position.accuracy)} m${isLowAccuracy(position.accuracy) ? ' · Location accuracy is poor.' : ''}`
            : ''}
        </p>
        {baseline.status === 'error' ? (
          <p className="pointer-events-none max-w-full rounded-full bg-white/95 px-3 py-1 text-xs text-red-700 shadow-md ring-1 ring-black/5" role="alert">
            {baseline.error}
          </p>
        ) : null}
        <details className="pointer-events-auto max-h-[42vh] w-full overflow-y-auto rounded-3xl bg-white/95 p-4 shadow-lg ring-1 ring-black/5">
          <summary className="cursor-pointer text-sm font-semibold">Legend and data</summary>
          <div className="mt-3 space-y-3">
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Layers</legend>
              {extractedDatasets.map((dataset) => (
                <label key={dataset.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={layers[dataset.id]}
                    onChange={() =>
                      setLayers((current) => ({ ...current, [dataset.id]: !current[dataset.id] }))
                    }
                  />
                  <span
                    className="inline-block size-3 rounded-full ring-1 ring-black/15"
                    style={{ background: layerSwatches[dataset.id] }}
                  />
                  <span className="flex-1">{dataset.title}</span>
                  <span className="tabular-nums text-neutral-500">{dataset.count}</span>
                </label>
              ))}
            </fieldset>
            <p className="text-xs leading-5 text-neutral-600">
              Shapes and names come from OpenStreetMap. Nothing missing from that data is drawn in. Map tiles
              © OpenFreeMap and OpenStreetMap contributors.
            </p>
            <div>
              <h2 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">On this map</h2>
              <ul className="mt-1 space-y-1 text-xs text-neutral-700">
                {extractedDatasets.map((dataset) => (
                  <li key={dataset.id}>
                    {dataset.title}: {dataset.count} {dataset.geometryTypes.join(', ')}. {dataset.tags.join('; ')}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Mapped, not drawn as its own layer</h2>
              <ul className="mt-1 space-y-1 text-xs text-neutral-700">
                {mappedNotLayered.map((group) => (
                  <li key={group.category}>
                    {group.category}: {group.count} {group.geometry}. {group.tags.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Not in OpenStreetMap</h2>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-neutral-700">
                {missingGeography.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            {phase === 'available' && position ? (
              <p className="text-xs tabular-nums text-neutral-600">
                GPS {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)} · accuracy {Math.round(position.accuracy)} m
              </p>
            ) : null}
          </div>
        </details>
      </div>}
    </div>
  )
}
