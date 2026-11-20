import { isCompleteDraft } from '@/services/calibration'
import type { CalibrationDraft } from '@/types/calibration'
import type { MapMode } from '@/components/MapSwitcher'

interface CalibrationPointSelectorProps {
  draft: CalibrationDraft
  mapMode: MapMode
  adjusting?: boolean
  onNameChange: (name: string) => void
  onAdd: () => void
}

export function CalibrationPointSelector({
  draft,
  mapMode,
  adjusting = false,
  onNameChange,
  onAdd,
}: CalibrationPointSelectorProps) {
  const ready = isCompleteDraft(draft)

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) onAdd()
      }}
    >
      <div>
        <h2 className="text-sm font-semibold">New reference point</h2>
        <p className="mt-1 text-sm text-neutral-700">{nextStep(draft, mapMode, adjusting)}</p>
      </div>
      <dl className="space-y-1 text-sm tabular-nums text-neutral-800">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Street</dt>
          <dd>{formatGeographic(draft)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Illustration</dt>
          <dd>{formatPixel(draft)}</dd>
        </div>
      </dl>
      <label className="block text-sm font-medium text-neutral-800">
        Landmark name
        <input
          value={draft.name}
          onChange={(event) => onNameChange(event.target.value)}
          autoComplete="off"
          placeholder="Name this landmark"
          className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-base font-normal outline-none ring-blue-600 focus:ring-2"
        />
      </label>
      <button
        type="submit"
        disabled={!ready}
        className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-neutral-300"
      >
        Add reference point
      </button>
    </form>
  )
}

function nextStep(draft: CalibrationDraft, mapMode: MapMode, adjusting: boolean): string {
  if (adjusting) {
    return mapMode === 'street'
      ? 'Clicks update the pending street position for the landmark you are adjusting.'
      : 'Clicks update the pending illustration position for the landmark you are adjusting.'
  }

  const hasGeographic = draft.latitude != null && draft.longitude != null
  const hasPixel = draft.imageX != null && draft.imageY != null

  if (!hasGeographic) {
    return mapMode === 'street'
      ? 'Click a landmark on the Street Map.'
      : 'Switch to the Street Map and click a landmark.'
  }
  if (!hasPixel) {
    return mapMode === 'explore'
      ? 'Click the same landmark on the Explore Map.'
      : 'Switch to the Explore Map and click the same landmark.'
  }
  if (draft.name.trim().length === 0) return 'Name this landmark, then add the reference point.'
  return 'Add the reference point, or click either map again to replace a selection.'
}

function formatGeographic(draft: CalibrationDraft): string {
  if (draft.latitude == null || draft.longitude == null) return 'Not selected'
  return `${draft.latitude.toFixed(6)}, ${draft.longitude.toFixed(6)}`
}

function formatPixel(draft: CalibrationDraft): string {
  if (draft.imageX == null || draft.imageY == null) return 'Not selected'
  return `x ${draft.imageX.toFixed(1)}, y ${draft.imageY.toFixed(1)}`
}
