import { extractedDatasets, mappedNotLayered, missingGeography } from '@/data/map-v2/availability'
import { layerSwatches } from '@/map-v2/layers'
import { isLowAccuracy } from '@/services/geolocation'
import type { MapLayerId } from '@/types/map-v2'
import type { GeoPosition } from '@/types/geolocation'

export function AdminDataPanel({
  layers,
  onToggleLayer,
  locate,
  locating,
  message,
  phase,
  position,
  baselineError,
}: {
  layers: Record<MapLayerId, boolean>
  onToggleLayer: (id: MapLayerId) => void
  locate: () => void
  locating: boolean
  message: string
  phase: string
  position: GeoPosition | null
  baselineError: string | null
}) {
  return (
    <div className="pointer-events-none absolute right-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex w-[min(22rem,calc(100%-1.5rem))] flex-col items-end gap-2">
      <button
        type="button"
        onClick={locate}
        disabled={locating}
        aria-busy={locating}
        className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-70"
      >
        {locating ? (
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
            <circle cx="12" cy="12" r="9" opacity="0.25" />
            <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
          </svg>
        ) : null}
        {locating ? 'Finding position' : 'Locate me'}
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
      {baselineError ? (
        <p className="pointer-events-none max-w-full rounded-full bg-white/95 px-3 py-1 text-xs text-red-700 shadow-md ring-1 ring-black/5" role="alert">
          {baselineError}
        </p>
      ) : null}
      <details className="pointer-events-auto max-h-[42vh] w-full overflow-y-auto rounded-3xl bg-white/95 p-4 shadow-lg ring-1 ring-black/5">
        <summary className="cursor-pointer text-sm font-semibold">Legend and data</summary>
        <div className="mt-3 space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Layers</legend>
            {extractedDatasets.map((dataset) => (
              <label key={dataset.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={layers[dataset.id]} onChange={() => onToggleLayer(dataset.id)} />
                <span className="inline-block size-3 rounded-full ring-1 ring-black/15" style={{ background: layerSwatches[dataset.id] }} />
                <span className="flex-1">{dataset.title}</span>
                <span className="tabular-nums text-neutral-500">{dataset.count}</span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs leading-5 text-neutral-600">
            Shapes and names come from OpenStreetMap. Nothing missing from that data is drawn in. Map tiles © OpenFreeMap and OpenStreetMap contributors.
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
  )
}
