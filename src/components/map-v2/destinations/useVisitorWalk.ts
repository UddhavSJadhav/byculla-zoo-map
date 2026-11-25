import { useEffect, useMemo, useState } from 'react'
import type { LineString, Position } from 'geojson'
import { useAttractions } from '@/components/map-v2/attractions/useAttractions'
import { useEntrances } from '@/components/map-v2/entrances/useEntrances'
import { usePaths } from '@/components/map-v2/paths/usePaths'
import { destinationReadiness, destinationStatusDetail, destinationStatusLabel } from '@/destinations/readiness'
import type { RouteSegment } from '@/routing/graph'
import { advanceNavigation, type NavigationSession, type VisitorGuidance } from '@/routing/guidance'
import { visitorWalkingGraph } from '@/routing/visitorGraph'
import { shouldRecalculateRoute, type RouteFix } from '@/routing/walk'
import type { GeoPosition } from '@/types/geolocation'

export interface RouteUpdate {
  geometry: LineString | null
  fit: boolean
  focusPosition: boolean
}

export function useVisitorWalk(position: GeoPosition | null, onRoute: (update: RouteUpdate) => void) {
  const attractions = useAttractions()
  const entrances = useEntrances()
  const paths = usePaths()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [followGps, setFollowGps] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [acceptedFix, setAcceptedFix] = useState<RouteFix | null>(null)
  const [navigation, setNavigation] = useState<NavigationSession | null>(null)
  const network = useMemo<RouteSegment[]>(
    () => paths.map((path) => ({ id: path.osmFeatureId, status: path.status, coordinates: path.geometry.coordinates })),
    [paths],
  )
  const selected = attractions.find((attraction) => attraction.id === selectedId) ?? null
  const entrance = selected ? (entrances.find((item) => item.attractionId === selected.id) ?? null) : null
  const longitude = position?.longitude
  const latitude = position?.latitude
  const live = longitude != null && latitude != null ? ([longitude, latitude] as Position) : null
  const usingGps = followGps && live != null
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
  const readiness = selected
    ? destinationReadiness({
        status: selected.status,
        geometry: selected.geometry,
        entrance,
        start,
        graph: visitorWalkingGraph(),
        network,
      })
    : null
  const walking = navigating || (usingGps && readiness?.state === 'ready')
  if (walking && !navigating) setNavigating(true)
  const advanced = walking && selected
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
  const session = walking ? (advanced?.session ?? null) : null
  if (walking && session !== navigation) setNavigation(session)
  if (!walking && navigation !== null) setNavigation(null)
  const line = session?.line ?? null
  const guidance = advanced?.guidance ?? null
  const instruction = walking ? instructionText(selected?.name ?? 'Destination', guidance, session?.recalcMessage ?? null) : null
  const note =
    selected && !walking && usingGps && readiness
      ? { attractionId: selected.id, text: `${destinationStatusLabel(readiness)}. ${destinationStatusDetail(readiness)}` }
      : null

  useEffect(() => {
    if (!walking || !line) {
      onRoute({ geometry: null, fit: false, focusPosition: false })
      return
    }
    onRoute({ geometry: line, fit: true, focusPosition: false })
  }, [walking, line, onRoute])

  useEffect(() => {
    return () => {
      onRoute({ geometry: null, fit: false, focusPosition: false })
    }
  }, [onRoute])

  const travel = (attractionId: string): 'need-location' | 'checking' => {
    setSelectedId(attractionId)
    setNavigating(false)
    setNavigation(null)
    setFollowGps(true)
    return live ? 'checking' : 'need-location'
  }

  const cancel = () => {
    setNavigating(false)
    setFollowGps(false)
    setNavigation(null)
    setSelectedId(null)
  }

  return { selectedId, navigating: walking, instruction, note, travel, cancel }
}

function instructionText(name: string, guidance: VisitorGuidance | null, recalcMessage: string | null): string {
  if (!guidance) return name
  if (guidance.arrived) return 'You have reached the entrance.'
  if (recalcMessage) return recalcMessage
  const meters = guidance.progress ? `${Math.round(guidance.progress.remainingMeters)} m` : ''
  const turn = guidance.direction.kind === 'unavailable' ? guidance.detail : guidance.direction.text
  return [meters, turn].filter((part) => part.length > 0).join(' · ')
}
