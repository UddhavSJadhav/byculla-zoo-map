import { useState } from 'react'
import type { CalibrationAssessment, CalibrationPoint } from '@/types/calibration'

interface CalibrationPointListProps {
  points: CalibrationPoint[]
  assessment: CalibrationAssessment
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onClear: () => void
  canClear: boolean
}

export function CalibrationPointList({
  points,
  assessment,
  onRename,
  onDelete,
  onClear,
  canClear,
}: CalibrationPointListProps) {
  const [confirmingClear, setConfirmingClear] = useState(false)
  const residuals = assessment.status === 'ready' ? assessment.residuals : []
  const residualById = new Map(residuals.map((residual) => [residual.id, residual.errorPixels]))
  const review = assessment.status === 'ready' && (assessment.highError || assessment.narrowSpread)

  return (
    <section className="space-y-3 border-t border-neutral-200 pt-3">
      <div>
        <h2 className="text-sm font-semibold">Transform check</h2>
        <p
          role="status"
          className={review || assessment.status === 'unusable' ? 'mt-1 text-sm text-amber-800' : 'mt-1 text-sm text-neutral-700'}
        >
          {assessment.message}
        </p>
        {assessment.status === 'ready' ? (
          <p className="mt-1 text-sm tabular-nums text-neutral-800">
            {`Average ${assessment.averageErrorPixels.toFixed(1)} px · Maximum ${assessment.maximumErrorPixels.toFixed(1)} px · Spread about ${Math.round(assessment.spreadMeters)} m`}
          </p>
        ) : null}
      </div>
      <ul className="space-y-1 text-xs text-neutral-600">
        <li className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full bg-blue-600" />
          Clicked landmark
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full border-2 border-amber-700 bg-amber-200" />
          Fitted position on the illustration, once a transform can be estimated
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full bg-violet-500" />
          Current selection, not saved yet
        </li>
      </ul>
      {points.length === 0 ? (
        <p className="text-sm text-neutral-600">No reference points yet. A click is kept only after you add it.</p>
      ) : (
        <ul className="space-y-2">
          {points.map((point) => (
            <PointRow
              key={point.id}
              point={point}
              errorPixels={residualById.get(point.id)}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
      {confirmingClear ? (
        <div className="space-y-2 rounded-xl bg-red-50 p-3">
          <p className="text-sm text-red-800">
            Clear all calibration data? This removes every saved landmark and the current selection from this browser.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onClear()
                setConfirmingClear(false)
              }}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => setConfirmingClear(false)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingClear(true)}
          disabled={!canClear}
          className="text-sm font-medium text-red-700 disabled:text-neutral-400"
        >
          Clear all calibration data
        </button>
      )}
    </section>
  )
}

function PointRow({
  point,
  errorPixels,
  onRename,
  onDelete,
}: {
  point: CalibrationPoint
  errorPixels: number | undefined
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}) {
  const [name, setName] = useState<string | null>(null)
  const editing = name != null

  const commit = () => {
    const trimmed = (name ?? '').trim()
    if (trimmed) onRename(point.id, trimmed)
    setName(null)
  }

  return (
    <li className="rounded-xl bg-neutral-50 px-3 py-2">
      {editing ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            commit()
          }}
        >
          <input
            value={name ?? ''}
            onChange={(event) => setName(event.target.value)}
            aria-label={`Name for ${point.name}`}
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm outline-none ring-blue-600 focus:ring-2"
          />
          <button type="submit" className="text-sm font-medium text-blue-700">
            Save
          </button>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-neutral-900">{point.name}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => setName(point.name)} className="text-sm font-medium text-blue-700">
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(point.id)}
              aria-label={`Delete ${point.name}`}
              className="text-sm font-medium text-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      )}
      <p className="mt-1 text-xs tabular-nums text-neutral-600">
        {`${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`}
      </p>
      <p className="text-xs tabular-nums text-neutral-600">
        {`x ${point.imageX.toFixed(1)}, y ${point.imageY.toFixed(1)}`}
        {errorPixels != null ? ` · residual ${errorPixels.toFixed(1)} px` : ''}
      </p>
    </li>
  )
}
