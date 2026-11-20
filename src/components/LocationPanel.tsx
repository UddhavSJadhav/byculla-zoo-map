import { useEffect, useState } from 'react'
import { LOCATION_STALE_MS } from '@/services/geolocation'
import type { GeoPosition, LocationPhase } from '@/types/geolocation'

const FAIR_ACCURACY_METERS = 30
const LOW_ACCURACY_METERS = 100

interface LocationPanelProps {
  phase: LocationPhase
  message: string
  position: GeoPosition | null
  isTracking: boolean
  onFindLocation: () => void
  onRecenter: () => void
  onStopTracking: () => void
}

export function LocationPanel({
  phase,
  message,
  position,
  isTracking,
  onFindLocation,
  onRecenter,
  onStopTracking,
}: LocationPanelProps) {
  const now = useNow(position != null)
  const accuracy = position?.accuracy
  const hasAccuracy = accuracy != null && Number.isFinite(accuracy)
  const guidance = hasAccuracy ? accuracyGuidance(accuracy) : null
  const ageMs = position ? Math.max(0, now - position.timestamp) : null
  const isCurrent = phase === 'available' && ageMs != null && ageMs <= LOCATION_STALE_MS
  const reportedAccuracy = hasAccuracy ? formatReportedMeters(accuracy) : null
  const accuracyLabel =
    reportedAccuracy == null
      ? null
      : isCurrent
        ? `Accuracy ${reportedAccuracy} m`
        : `Previous accuracy ${reportedAccuracy} m`
  const timeLabel =
    ageMs == null ? null : isCurrent ? `Updated ${formatAge(ageMs)}` : `Last update ${formatAge(ageMs)}`
  const statusText = phase === 'available' && guidance ? guidance : message
  const showGuidance = guidance != null && statusText !== guidance
  const warning = position
    ? phase === 'temporary-error'
      ? 'Showing the last GPS fix. A new update failed.'
      : !isCurrent && phase !== 'waiting'
        ? 'This location is out of date.'
        : phase === 'waiting'
          ? 'Showing the last GPS fix while a new one is requested.'
          : null
    : null

  return (
    <section
      aria-label="Location"
      className="rounded-2xl bg-white/95 p-4 shadow-lg ring-1 ring-black/5 backdrop-blur-sm"
    >
      <p className={`text-center text-sm font-medium ${statusClassName(phase, accuracy)}`} role="status">
        {statusText}
      </p>
      {accuracyLabel ? (
        <p className="mt-1 text-center text-sm text-neutral-500">
          {timeLabel ? `${accuracyLabel} · ${timeLabel}` : accuracyLabel}
        </p>
      ) : null}
      {showGuidance && hasAccuracy ? (
        <p className={`mt-1 text-center text-sm ${guidanceClassName(accuracy)}`}>{guidance}</p>
      ) : null}
      {warning ? <p className="mt-1 text-center text-sm text-amber-800">{warning}</p> : null}
      {isTracking ? (
        <div className="mt-3 flex gap-2">
          {position ? (
            <button
              type="button"
              onClick={onRecenter}
              className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700 active:bg-blue-800"
            >
              Return to location
            </button>
          ) : null}
          <button
            type="button"
            onClick={onStopTracking}
            className={
              position
                ? 'shrink-0 rounded-xl bg-white px-4 py-3 text-sm font-medium text-neutral-800 ring-1 ring-black/10 transition hover:bg-neutral-50'
                : 'w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-neutral-800 ring-1 ring-black/10 transition hover:bg-neutral-50'
            }
          >
            Stop
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={onFindLocation}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-medium text-white transition hover:bg-blue-700 active:bg-blue-800"
          >
            Find My Location
          </button>
          {position ? (
            <button
              type="button"
              onClick={onRecenter}
              className="w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-neutral-800 ring-1 ring-black/10 transition hover:bg-neutral-50"
            >
              Return to location
            </button>
          ) : null}
        </div>
      )}
    </section>
  )
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return

    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [active])

  return now
}

function accuracyGuidance(accuracy: number): string {
  if (accuracy > LOW_ACCURACY_METERS) {
    return 'Location accuracy is low. Move to an open area or enable device location services.'
  }

  if (accuracy > FAIR_ACCURACY_METERS) {
    return 'Location detected, but accuracy could be better.'
  }

  return 'Location accuracy is good.'
}

function formatReportedMeters(accuracy: number): string {
  if (Number.isInteger(accuracy)) return String(accuracy)

  const tenths = Math.round(accuracy * 10) / 10
  if (Math.abs(accuracy - tenths) < 1e-6) {
    return Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1)
  }

  return String(accuracy)
}

function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return minutes === 1 ? '1 min ago' : `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours === 1 ? '1 hr ago' : `${hours} hr ago`
}

function statusClassName(phase: LocationPhase, accuracy: number | undefined): string {
  if (phase === 'denied' || phase === 'temporary-error' || phase === 'unsupported') {
    return 'text-red-700'
  }

  if (phase === 'available' && accuracy != null && Number.isFinite(accuracy)) {
    return guidanceClassName(accuracy)
  }

  return 'text-neutral-800'
}

function guidanceClassName(accuracy: number): string {
  if (accuracy > LOW_ACCURACY_METERS) return 'text-amber-800'
  if (accuracy > FAIR_ACCURACY_METERS) return 'text-amber-700'
  return 'text-emerald-800'
}
