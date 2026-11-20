import { HIGH_RESIDUAL_PIXELS } from '@/services/coordinateTransformation'
import type { CalibrationAssessment, CalibrationPoint, CalibrationResidual } from '@/types/calibration'

export interface PendingPointPosition {
  id: string
  latitude: number
  longitude: number
  imageX: number
  imageY: number
}

interface CalibrationInspectionPanelProps {
  points: CalibrationPoint[]
  assessment: CalibrationAssessment
  selectedPointId: string | null
  pendingEdit: PendingPointPosition | null
  onSelect: (id: string) => void
  onStartAdjust: (point: CalibrationPoint) => void
  onCancelAdjust: () => void
  onSavePositions: () => void
}

export function CalibrationInspectionPanel({
  points,
  assessment,
  selectedPointId,
  pendingEdit,
  onSelect,
  onStartAdjust,
  onCancelAdjust,
  onSavePositions,
}: CalibrationInspectionPanelProps) {
  const residuals = assessment.status === 'ready' ? assessment.residuals : []
  const residualById = new Map(residuals.map((residual) => [residual.id, residual]))

  return (
    <section className="space-y-3 border-t border-neutral-200 pt-3">
      <div>
        <h2 className="text-sm font-semibold">Calibration inspection</h2>
        <p className="mt-1 text-sm text-neutral-800">
          {`${points.length} genuine reference ${points.length === 1 ? 'point' : 'points'}`}
        </p>
        {assessment.status === 'ready' ? (
          <p className="mt-1 text-sm tabular-nums text-neutral-800">
            {`Average residual ${assessment.averageErrorPixels.toFixed(1)} px · Maximum residual ${assessment.maximumErrorPixels.toFixed(1)} px`}
          </p>
        ) : (
          <p className="mt-1 text-sm text-neutral-700">{assessment.message}</p>
        )}
        <p className="mt-1 text-xs leading-5 text-neutral-500">
          Fitted coordinates come from the current transform. They are not written back onto the landmarks.
          A residual above {HIGH_RESIDUAL_PIXELS} px is marked for review.
        </p>
      </div>
      {points.length === 0 ? (
        <p className="text-sm text-neutral-600">No saved reference points to inspect.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-neutral-200">
          <table className="w-full min-w-[52rem] border-collapse text-left text-xs">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-2 py-2 font-medium">Landmark</th>
                <th className="px-2 py-2 font-medium">Latitude</th>
                <th className="px-2 py-2 font-medium">Longitude</th>
                <th className="px-2 py-2 font-medium">Illustrated X</th>
                <th className="px-2 py-2 font-medium">Illustrated Y</th>
                <th className="px-2 py-2 font-medium">Fitted X</th>
                <th className="px-2 py-2 font-medium">Fitted Y</th>
                <th className="px-2 py-2 font-medium">Residual</th>
                <th className="px-2 py-2 font-medium">Source</th>
                <th className="px-2 py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <InspectionRow
                  key={point.id}
                  point={point}
                  residual={residualById.get(point.id)}
                  selected={point.id === selectedPointId}
                  editing={pendingEdit?.id === point.id}
                  onSelect={onSelect}
                  onStartAdjust={onStartAdjust}
                  onCancelAdjust={onCancelAdjust}
                  onSavePositions={onSavePositions}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pendingEdit ? (
        <p className="text-xs tabular-nums leading-5 text-neutral-700">
          {`Pending for this landmark, not saved: ${pendingEdit.latitude.toFixed(6)}, ${pendingEdit.longitude.toFixed(6)} · x ${pendingEdit.imageX.toFixed(1)}, y ${pendingEdit.imageY.toFixed(1)}. Click the Street Map or Explore Map to replace either position, then save.`}
        </p>
      ) : null}
    </section>
  )
}

function InspectionRow({
  point,
  residual,
  selected,
  editing,
  onSelect,
  onStartAdjust,
  onCancelAdjust,
  onSavePositions,
}: {
  point: CalibrationPoint
  residual: CalibrationResidual | undefined
  selected: boolean
  editing: boolean
  onSelect: (id: string) => void
  onStartAdjust: (point: CalibrationPoint) => void
  onCancelAdjust: () => void
  onSavePositions: () => void
}) {
  const largeResidual = residual != null && residual.errorPixels > HIGH_RESIDUAL_PIXELS
  const rowClass = [
    'cursor-pointer border-t border-neutral-200 align-top',
    largeResidual ? 'bg-amber-50' : selected ? 'bg-teal-50' : 'bg-white',
    selected ? 'outline outline-2 -outline-offset-2 outline-teal-700' : '',
  ].join(' ')

  return (
    <tr
      className={rowClass}
      aria-selected={selected}
      onClick={() => onSelect(point.id)}
    >
      <th scope="row" className="px-2 py-2 font-medium text-neutral-900">
        {point.name}
      </th>
      <td className="px-2 py-2 tabular-nums text-neutral-800">{point.latitude.toFixed(6)}</td>
      <td className="px-2 py-2 tabular-nums text-neutral-800">{point.longitude.toFixed(6)}</td>
      <td className="px-2 py-2 tabular-nums text-neutral-800">{point.imageX.toFixed(1)}</td>
      <td className="px-2 py-2 tabular-nums text-neutral-800">{point.imageY.toFixed(1)}</td>
      <td className="px-2 py-2 tabular-nums text-neutral-800">{formatFitted(residual?.predicted.x)}</td>
      <td className="px-2 py-2 tabular-nums text-neutral-800">{formatFitted(residual?.predicted.y)}</td>
      <td className="px-2 py-2 tabular-nums text-neutral-800">
        {residual ? `${residual.errorPixels.toFixed(1)} px` : '—'}
        {largeResidual ? (
          <span className="mt-1 block font-medium text-amber-800">Large residual</span>
        ) : null}
      </td>
      <td className="px-2 py-2 text-neutral-800">Manual</td>
      <td className="px-2 py-2">
        {editing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onSavePositions()
              }}
              className="font-medium text-blue-700"
            >
              Save positions
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onCancelAdjust()
              }}
              className="font-medium text-neutral-700"
            >
              Cancel
            </button>
          </div>
        ) : selected ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onStartAdjust(point)
            }}
            className="font-medium text-blue-700"
          >
            Adjust positions
          </button>
        ) : null}
      </td>
    </tr>
  )
}

function formatFitted(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toFixed(1)
}
