import { useEffect, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapEditor } from '@/components/map-v2/editor/MapEditor'
import { ZooMap } from '@/components/map-v2/ZooMap'
import type { Map } from 'maplibre-gl'
import { extractedDatasets, mappedNotLayered, missingGeography } from '@/data/map-v2/availability'
import { layerSwatches } from '@/map-v2/layers'
import { useGeolocation } from '@/hooks/useGeolocation'
import { mapLayerIds, type MapLayerId } from '@/types/map-v2'

const initialLayers = Object.fromEntries(mapLayerIds.map((id) => [id, true])) as Record<MapLayerId, boolean>

export function MapV2Page() {
  const { phase, position, message, fixCount, requestLocation } = useGeolocation()
  const [layers, setLayers] = useState(initialLayers)
  const [map, setMap] = useState<Map | null>(null)
  const [editing, setEditing] = useState(false)
  const [focusRequestId, setFocusRequestId] = useState(0)
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

  const locate = () => {
    fixCountAtStart.current = fixCount
    setAwaitingFix(true)
    requestLocation()
    if (position) setFocusRequestId((current) => current + 1)
  }

  return (
    <div className={`map-v2 relative h-dvh w-full overflow-hidden bg-[#f4ead7] text-neutral-900${editing ? ' map-v2-editing' : ''}`}>
      <ZooMap position={position} focusRequestId={focusRequestId} layers={layers} onMapReady={setMap} />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <a
              href="#/"
              className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-md ring-1 ring-black/5"
            >
              Visitor map
            </a>
            <div className="flex items-center gap-2">
              {import.meta.env.DEV ? (
                <button
                  type="button"
                  aria-pressed={editing}
                  onClick={() => setEditing((current) => !current)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold shadow-md ring-1 ring-black/5 ${editing ? 'bg-neutral-900 text-white' : 'bg-white/95 text-neutral-800'}`}
                >
                  {editing ? 'Editing' : 'Edit map'}
                </button>
              ) : null}
              <p className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-semibold shadow-md ring-1 ring-black/5">
                Map V2
              </p>
            </div>
          </div>
          <input
            type="search"
            placeholder="Search attractions"
            aria-label="Search attractions"
            title="Search is not available yet"
            className="w-full rounded-2xl border-0 bg-white/95 px-4 py-3 text-base shadow-md ring-1 ring-black/5 outline-none"
          />
        </div>
      </header>
      {import.meta.env.DEV ? <MapEditor map={map} editing={editing} /> : null}
      <div className="pointer-events-none absolute right-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex w-[min(22rem,calc(100%-1.5rem))] flex-col items-end gap-2">
        <button
          type="button"
          onClick={locate}
          className="pointer-events-auto rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md"
        >
          Locate me
        </button>
        <p className="pointer-events-none max-w-full rounded-full bg-white/95 px-3 py-1 text-xs text-neutral-700 shadow-md ring-1 ring-black/5" role="status">
          {message}
        </p>
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
      </div>
    </div>
  )
}
