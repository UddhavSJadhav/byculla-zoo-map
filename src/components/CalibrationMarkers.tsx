import { Fragment } from 'react'
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import { imagePixelToLeaflet } from '@/services/illustratedCoordinates'
import type { CalibrationDraft, CalibrationPoint, CalibrationResidual, PixelPoint } from '@/types/calibration'

const clickedOptions = {
  color: '#1d4ed8',
  fillColor: '#2563eb',
  fillOpacity: 0.95,
  weight: 2,
}

const fittedOptions = {
  color: '#b45309',
  fillColor: '#f59e0b',
  fillOpacity: 0.2,
  weight: 2,
}

const draftOptions = {
  color: '#6d28d9',
  fillColor: '#8b5cf6',
  fillOpacity: 0.35,
  weight: 2,
}

const residualOptions = {
  color: '#d97706',
  weight: 2,
  dashArray: '4 6',
}

const selectedOptions = {
  color: '#0f766e',
  fillOpacity: 0,
  weight: 3,
}

const pendingOptions = {
  color: '#be123c',
  fillColor: '#fb7185',
  fillOpacity: 0.45,
  weight: 2,
}

interface GeographicCalibrationMarkersProps {
  points: CalibrationPoint[]
  draft: CalibrationDraft
  selectedPointId?: string | null
  pending?: { latitude: number; longitude: number } | null
}

export function GeographicCalibrationMarkers({
  points,
  draft,
  selectedPointId = null,
  pending = null,
}: GeographicCalibrationMarkersProps) {
  const draftPosition =
    draft.latitude != null && draft.longitude != null
      ? { latitude: draft.latitude, longitude: draft.longitude }
      : null

  return (
    <>
      {points.map((point) => (
        <Fragment key={point.id}>
          {point.id === selectedPointId ? (
            <CircleMarker
              center={[point.latitude, point.longitude]}
              radius={14}
              pathOptions={selectedOptions}
              interactive={false}
            />
          ) : null}
          <CircleMarker
            center={[point.latitude, point.longitude]}
            radius={6}
            pathOptions={clickedOptions}
            interactive={false}
          >
            <Tooltip permanent direction="top" offset={[0, -6]}>
              {point.name}
            </Tooltip>
          </CircleMarker>
        </Fragment>
      ))}
      {draftPosition ? (
        <CircleMarker
          center={[draftPosition.latitude, draftPosition.longitude]}
          radius={8}
          pathOptions={draftOptions}
          interactive={false}
        >
          <Tooltip permanent direction="top" offset={[0, -8]}>
            Selected landmark
          </Tooltip>
        </CircleMarker>
      ) : null}
      {pending ? (
        <CircleMarker
          center={[pending.latitude, pending.longitude]}
          radius={8}
          pathOptions={pendingOptions}
          interactive={false}
        >
          <Tooltip permanent direction="top" offset={[0, -8]}>
            Pending street position
          </Tooltip>
        </CircleMarker>
      ) : null}
    </>
  )
}

interface IllustratedCalibrationMarkersProps {
  imageHeight: number
  points: CalibrationPoint[]
  draftPixel: PixelPoint | null
  residuals: CalibrationResidual[]
  selectedPointId?: string | null
  pendingPixel?: PixelPoint | null
}

export function IllustratedCalibrationMarkers({
  imageHeight,
  points,
  draftPixel,
  residuals,
  selectedPointId = null,
  pendingPixel = null,
}: IllustratedCalibrationMarkersProps) {
  const residualById = new Map(residuals.map((residual) => [residual.id, residual]))

  return (
    <>
      {points.map((point) => {
        const residual = residualById.get(point.id)
        const clicked = imagePixelToLeaflet({ x: point.imageX, y: point.imageY }, imageHeight)
        const predicted = residual
          ? imagePixelToLeaflet(residual.predicted, imageHeight)
          : null

        return (
          <Fragment key={point.id}>
            {point.id === selectedPointId ? (
              <CircleMarker
                center={[clicked.latitude, clicked.longitude]}
                radius={14}
                pathOptions={selectedOptions}
                interactive={false}
              />
            ) : null}
            <CircleMarker
              center={[clicked.latitude, clicked.longitude]}
              radius={6}
              pathOptions={clickedOptions}
              interactive={false}
            >
              <Tooltip permanent direction="top" offset={[0, -6]}>
                {point.name}
              </Tooltip>
            </CircleMarker>
            {predicted && residual ? (
              <>
                <CircleMarker
                  center={[predicted.latitude, predicted.longitude]}
                  radius={9}
                  pathOptions={fittedOptions}
                  interactive={false}
                >
                  <Tooltip permanent direction="bottom" offset={[0, 8]}>
                    {`${point.name} fitted · ${residual.errorPixels.toFixed(1)} px`}
                  </Tooltip>
                </CircleMarker>
                <Polyline
                  positions={[
                    [clicked.latitude, clicked.longitude],
                    [predicted.latitude, predicted.longitude],
                  ]}
                  pathOptions={residualOptions}
                  interactive={false}
                />
              </>
            ) : null}
          </Fragment>
        )
      })}
      {draftPixel ? (
        <DraftPixelMarker imageHeight={imageHeight} pixel={draftPixel} />
      ) : null}
      {pendingPixel ? (
        <PendingPixelMarker imageHeight={imageHeight} pixel={pendingPixel} />
      ) : null}
    </>
  )
}

function PendingPixelMarker({ imageHeight, pixel }: { imageHeight: number; pixel: PixelPoint }) {
  const position = imagePixelToLeaflet(pixel, imageHeight)
  return (
    <CircleMarker
      center={[position.latitude, position.longitude]}
      radius={8}
      pathOptions={pendingOptions}
      interactive={false}
    >
      <Tooltip permanent direction="top" offset={[0, -8]}>
        Pending illustration position
      </Tooltip>
    </CircleMarker>
  )
}

function DraftPixelMarker({ imageHeight, pixel }: { imageHeight: number; pixel: PixelPoint }) {
  const position = imagePixelToLeaflet(pixel, imageHeight)
  return (
    <CircleMarker
      center={[position.latitude, position.longitude]}
      radius={8}
      pathOptions={draftOptions}
      interactive={false}
    >
      <Tooltip permanent direction="top" offset={[0, -8]}>
        Selected pixel
      </Tooltip>
    </CircleMarker>
  )
}
