import { useEffect, useRef, useState } from 'react'
import {
  isGeolocationSupported,
  readGeolocationPermission,
  startLocationWatch,
  stopLocationWatch,
} from '@/services/geolocation'
import type {
  GeoPosition,
  GeolocationErrorInfo,
  LocationPhase,
  LocationWait,
} from '@/types/geolocation'
import { gpsWatchDecision } from '@/visitor/experience'

const FOUND_STATUS_MS = 1500

interface WatchSession {
  watchId: number | null
  permissionStatus: PermissionStatus | null
  onPermissionChange: (() => void) | null
  foundTimer: number | null
  seenFix: boolean
  pending: boolean
}

export interface UseGeolocationResult {
  phase: LocationPhase
  position: GeoPosition | null
  message: string
  isTracking: boolean
  fixCount: number
  wait: LocationWait
  errorKind: GeolocationErrorInfo['kind'] | null
  requestLocation: () => void
  stopTracking: () => void
}

function cleanupSession(session: WatchSession) {
  if (session.foundTimer != null) {
    window.clearTimeout(session.foundTimer)
    session.foundTimer = null
  }

  if (session.permissionStatus && session.onPermissionChange) {
    session.permissionStatus.removeEventListener('change', session.onPermissionChange)
    session.onPermissionChange = null
  }

  if (session.watchId != null) {
    const watchId = session.watchId
    session.watchId = null
    stopLocationWatch(watchId)
  }
}

function statusMessage(
  phase: LocationPhase,
  wait: LocationWait,
  showFoundNotice: boolean,
  error: GeolocationErrorInfo | null,
): string {
  switch (phase) {
    case 'unsupported':
      return 'Location is not available in this browser.'
    case 'waiting':
      return wait === 'locating' ? 'Locating...' : 'Requesting permission'
    case 'available':
      return showFoundNotice ? 'Location found' : 'Tracking location'
    case 'temporary-error':
      return error?.kind === 'timeout' ? 'Request timeout' : 'Position unavailable'
    case 'denied':
      return 'Permission denied'
    case 'stopped':
      return 'Location not requested'
  }
}

export function useGeolocation(): UseGeolocationResult {
  const [phase, setPhase] = useState<LocationPhase>('stopped')
  const [wait, setWait] = useState<LocationWait>('permission')
  const [position, setPosition] = useState<GeoPosition | null>(null)
  const [lastError, setLastError] = useState<GeolocationErrorInfo | null>(null)
  const [showFoundNotice, setShowFoundNotice] = useState(false)
  const [isTracking, setIsTracking] = useState(false)
  const [fixCount, setFixCount] = useState(0)
  const sessionRef = useRef<WatchSession | null>(null)
  const interruptedRef = useRef(false)

  const finishSession = () => {
    const session = sessionRef.current
    sessionRef.current = null
    if (session) cleanupSession(session)
  }

  const attachWatch = (session: WatchSession) => {
    if (session.watchId != null) {
      stopLocationWatch(session.watchId)
      session.watchId = null
    }
    const handlePosition = (next: GeoPosition) => {
      if (sessionRef.current !== session) return
      interruptedRef.current = false
      setPosition(next)
      setLastError(null)
      setFixCount((count) => count + 1)
      setPhase('available')
      if (!session.seenFix) {
        session.seenFix = true
        setShowFoundNotice(true)
        session.foundTimer = window.setTimeout(() => {
          if (sessionRef.current !== session) return
          setShowFoundNotice(false)
        }, FOUND_STATUS_MS)
        return
      }
      if (session.foundTimer != null) {
        window.clearTimeout(session.foundTimer)
        session.foundTimer = null
      }
      setShowFoundNotice(false)
    }
    const handleError = (error: GeolocationErrorInfo) => {
      if (sessionRef.current !== session) return
      setLastError(error)
      if (error.kind === 'denied') {
        interruptedRef.current = false
        finishSession()
        setIsTracking(false)
        setShowFoundNotice(false)
        setPhase('denied')
        return
      }
      interruptedRef.current = true
      setShowFoundNotice(false)
      setPhase('temporary-error')
    }
    session.pending = true
    let watchId: number
    try {
      watchId = startLocationWatch(handlePosition, handleError)
    } catch (error) {
      session.pending = false
      if (sessionRef.current === session) {
        finishSession()
        setIsTracking(false)
        setPhase('unsupported')
      }
      if (import.meta.env.DEV) console.warn('[geolocation] failed to start watch', error)
      return
    }
    if (sessionRef.current !== session) {
      stopLocationWatch(watchId)
      return
    }
    session.pending = false
    session.watchId = watchId
  }

  useEffect(() => {
    const onVisibility = () => {
      const session = sessionRef.current
      const decision = gpsWatchDecision({
        event: 'visibility',
        visible: document.visibilityState === 'visible',
        hasSession: session != null,
        watchActive: session?.watchId != null,
        interrupted: interruptedRef.current,
        pending: session?.pending === true,
      })
      if (decision === 'resume' && session) attachWatch(session)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      const session = sessionRef.current
      sessionRef.current = null
      if (session) cleanupSession(session)
    }
  }, [])

  const requestLocation = () => {
    const decision = gpsWatchDecision({
      event: 'request',
      visible: typeof document === 'undefined' ? true : document.visibilityState === 'visible',
      hasSession: sessionRef.current != null,
      watchActive: sessionRef.current?.watchId != null,
      interrupted: interruptedRef.current,
      pending: sessionRef.current?.pending === true,
    })
    if (decision === 'ignore-duplicate') return

    if (!isGeolocationSupported()) {
      setIsTracking(false)
      setPhase('unsupported')
      return
    }

    const session: WatchSession = {
      watchId: null,
      permissionStatus: null,
      onPermissionChange: null,
      foundTimer: null,
      seenFix: false,
      pending: true,
    }
    sessionRef.current = session
    setIsTracking(true)
    setWait('permission')
    setLastError(null)
    setShowFoundNotice(false)
    setPhase('waiting')

    void beginWatch(session)
  }

  const stopTracking = () => {
    interruptedRef.current = false
    finishSession()
    setIsTracking(false)
    setShowFoundNotice(false)
    setPhase('stopped')
  }

  const beginWatch = async (session: WatchSession) => {
    const permissionStatus = await readGeolocationPermission()
    if (sessionRef.current !== session) return

    if (permissionStatus?.state === 'denied') {
      if (import.meta.env.DEV) {
        console.warn('[geolocation]', 1, 'Geolocation permission denied')
      }
      finishSession()
      setIsTracking(false)
      setLastError({
        code: 1,
        message: 'Geolocation permission denied',
        kind: 'denied',
      })
      setPhase('denied')
      return
    }

    if (permissionStatus?.state === 'granted') {
      setWait('locating')
    }

    const onPermissionChange = () => {
      if (sessionRef.current !== session) return

      if (permissionStatus?.state === 'granted') {
        setWait('locating')
        return
      }

      if (permissionStatus?.state === 'denied') {
        if (import.meta.env.DEV) {
          console.warn('[geolocation]', 1, 'Geolocation permission denied')
        }
        finishSession()
        setIsTracking(false)
        setLastError({
          code: 1,
          message: 'Geolocation permission denied',
          kind: 'denied',
        })
        setPhase('denied')
      }
    }

    if (permissionStatus) {
      session.permissionStatus = permissionStatus
      session.onPermissionChange = onPermissionChange
      permissionStatus.addEventListener('change', onPermissionChange)
    }

    if (sessionRef.current !== session) {
      if (permissionStatus) {
        permissionStatus.removeEventListener('change', onPermissionChange)
      }
      return
    }

    attachWatch(session)
  }

  const message =
    phase === 'stopped' && position
      ? 'Tracking stopped'
      : statusMessage(phase, wait, showFoundNotice, lastError)

  return {
    phase,
    position,
    message,
    isTracking,
    fixCount,
    wait,
    errorKind: lastError?.kind ?? null,
    requestLocation,
    stopTracking,
  }
}
