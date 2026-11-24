import type { LineString, Position } from 'geojson'
import { haversineMeters } from './distance.ts'
import type { RouteSegment } from './graph.ts'
import { planVisitorWalk, shouldRecalculateRoute, type RouteFix } from './walk.ts'

/** Ignore backward jumps larger than this when a GPS fix snaps to an earlier part of the route. */
export const progressBackwardMeters = 8
/** A fix this far from the active route, and beyond its own accuracy, is off the route. */
export const offRouteMeters = 25
/** Arrival radius around a verified entrance. */
export const arrivalMeters = 20
/** A less accurate fix cannot confirm arrival. */
export const arrivalAccuracyMeters = 40
/** Bearing change required before a corner becomes a direction. */
export const minTurnDegrees = 40
/** A shorter corner is kept as continuation, not announced as a turn. */
export const minTurnLegMeters = 8
/** How far past a corner the previous turn stays behind the visitor. */
export const turnPassedMeters = 8
/** Matches the map's poor-accuracy threshold. */
export const poorAccuracyMeters = 100

export interface RouteProgress {
  point: Position
  distanceFromRoute: number
  traveledMeters: number
  remainingMeters: number
  totalMeters: number
  percent: number
}

export interface TurnInstruction {
  kind: 'left' | 'right' | 'continue' | 'unavailable'
  distanceMeters: number | null
  text: string
}

export interface VisitorGuidance {
  progress: RouteProgress | null
  direction: TurnInstruction
  offRoute: boolean
  arrived: boolean
  accuracyWarning: string | null
  headline: string
  detail: string
}

export interface NavigationSession {
  line: LineString
  progress: RouteProgress | null
  offRouteFix: RouteFix | null
  recalcMessage: string | null
}

export interface NavigationAdvance {
  session: NavigationSession | null
  guidance: VisitorGuidance
  replacedRoute: boolean
}

const unavailableDirection: TurnInstruction = {
  kind: 'unavailable',
  distanceMeters: null,
  text: 'Direction is not available from this route.',
}

export function projectOntoRoute(gps: Position, line: LineString): RouteProgress | null {
  const coordinates = line.coordinates.filter((position) => Number.isFinite(Number(position[0])) && Number.isFinite(Number(position[1])))
  const first = coordinates[0]
  if (!first) return null
  if (coordinates.length === 1) {
    return progressAt(first, haversineMeters(gps, first), 0, 0)
  }
  let best: { point: Position; distanceFromRoute: number; traveledMeters: number } | null = null
  let traveledBefore = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    const from = coordinates[index - 1]
    const to = coordinates[index]
    if (!from || !to) continue
    const projected = projectSegment(gps, from, to)
    const traveledMeters = traveledBefore + haversineMeters(from, projected.point)
    if (!best || projected.distanceMeters < best.distanceFromRoute) {
      best = { point: projected.point, distanceFromRoute: projected.distanceMeters, traveledMeters }
    }
    traveledBefore += haversineMeters(from, to)
  }
  if (!best) return null
  return progressAt(best.point, best.distanceFromRoute, best.traveledMeters, traveledBefore)
}

export function stabilizeProgress(previous: RouteProgress | null, next: RouteProgress, accuracy: number | null): RouteProgress {
  if (previous && accuracy != null && Number.isFinite(accuracy) && accuracy > poorAccuracyMeters) return previous
  if (previous && next.traveledMeters < previous.traveledMeters - progressBackwardMeters) return previous
  if (previous && isOffRoute(next.distanceFromRoute, accuracy ?? Number.POSITIVE_INFINITY)) return previous
  if (
    previous &&
    Math.abs(next.traveledMeters - previous.traveledMeters) < 0.5 &&
    Math.abs(next.remainingMeters - previous.remainingMeters) < 0.5
  ) {
    return previous
  }
  return next
}

export function isOffRoute(distanceFromRoute: number, accuracy: number, threshold = offRouteMeters): boolean {
  if (!Number.isFinite(distanceFromRoute) || !Number.isFinite(accuracy)) return false
  if (accuracy > poorAccuracyMeters) return false
  return distanceFromRoute > threshold && distanceFromRoute > accuracy
}

export function shouldRecalculateOffRoute(offRoute: boolean, previous: RouteFix | null, gps: Position, now: number): boolean {
  if (!offRoute) return false
  return shouldRecalculateRoute(previous, gps, now)
}

export function hasArrived(gps: Position, entrance: Position, accuracy: number, entranceVerified: boolean): boolean {
  if (!entranceVerified) return false
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > arrivalAccuracyMeters) return false
  return haversineMeters(gps, entrance) <= arrivalMeters
}

export function accuracyWarning(accuracy: number | null): string | null {
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy <= poorAccuracyMeters) return null
  return `Location accuracy is poor (${Math.round(accuracy)} m).`
}

export function nextDirection(line: LineString, traveledMeters: number): TurnInstruction {
  const coordinates = line.coordinates.filter((position) => Number.isFinite(Number(position[0])) && Number.isFinite(Number(position[1])))
  if (coordinates.length < 2) return unavailableDirection
  let measurable = false
  for (let index = 1; index < coordinates.length; index += 1) {
    const from = coordinates[index - 1]
    const to = coordinates[index]
    if (from && to && bearing(from, to) != null) measurable = true
  }
  if (!measurable) return unavailableDirection
  const total = lengthOf(coordinates)
  const remaining = Math.max(0, total - traveledMeters)
  let traveledBefore = 0
  for (let index = 1; index < coordinates.length - 1; index += 1) {
    const previous = coordinates[index - 1]
    const corner = coordinates[index]
    const next = coordinates[index + 1]
    if (!previous || !corner || !next) continue
    const legIn = haversineMeters(previous, corner)
    const legOut = haversineMeters(corner, next)
    traveledBefore += legIn
    if (legIn < minTurnLegMeters || legOut < minTurnLegMeters) continue
    const inbound = bearing(previous, corner)
    const outbound = bearing(corner, next)
    if (inbound == null || outbound == null) continue
    const angle = signedTurn(inbound, outbound)
    if (Math.abs(angle) < minTurnDegrees) continue
    if (traveledBefore + turnPassedMeters < traveledMeters) continue
    const distanceMeters = Math.max(0, traveledBefore - traveledMeters)
    const kind = angle > 0 ? 'right' : 'left'
    const text = distanceMeters < 1 ? `Turn ${kind}` : `Turn ${kind} in ${Math.round(distanceMeters)} m`
    return { kind, distanceMeters, text }
  }
  return { kind: 'continue', distanceMeters: remaining, text: `Continue for ${Math.round(remaining)} m` }
}

export function guideVisitor(input: {
  gps: Position | null
  accuracy: number | null
  entrance: Position | null
  entranceVerified: boolean
  destinationName: string
  route: LineString | null
  previous: RouteProgress | null
}): VisitorGuidance {
  const warning = accuracyWarning(input.accuracy)
  if (!input.gps) {
    return {
      progress: input.previous,
      direction: unavailableDirection,
      offRoute: false,
      arrived: false,
      accuracyWarning: warning,
      headline: 'GPS is unavailable',
      detail: 'GPS is unavailable. The current route is still shown.',
    }
  }
  if (!input.route) {
    return {
      progress: null,
      direction: unavailableDirection,
      offRoute: false,
      arrived: false,
      accuracyWarning: warning,
      headline: input.destinationName,
      detail: unavailableDirection.text,
    }
  }
  const raw = projectOntoRoute(input.gps, input.route)
  const offRoute = raw ? isOffRoute(raw.distanceFromRoute, input.accuracy ?? Number.POSITIVE_INFINITY) : false
  const progress = raw ? stabilizeProgress(input.previous, raw, input.accuracy) : input.previous
  const arrived = input.entrance
    ? hasArrived(input.gps, input.entrance, input.accuracy ?? Number.POSITIVE_INFINITY, input.entranceVerified)
    : false
  const direction = nextDirection(input.route, progress?.traveledMeters ?? 0)
  if (arrived) {
    return {
      progress,
      direction,
      offRoute: false,
      arrived: true,
      accuracyWarning: warning,
      headline: input.destinationName,
      detail: 'You have reached the entrance.',
    }
  }
  if (offRoute) {
    return {
      progress,
      direction,
      offRoute: true,
      arrived: false,
      accuracyWarning: warning,
      headline: 'Off the route',
      detail: 'You are off the route.',
    }
  }
  const detail =
    progress == null
      ? direction.text
      : `${Math.round(progress.remainingMeters)} m remaining · ${Math.round(progress.percent)}% of the route.`
  return {
    progress,
    direction,
    offRoute: false,
    arrived: false,
    accuracyWarning: warning,
    headline: input.destinationName,
    detail,
  }
}

export function recalculateOffRoute(input: {
  gps: Position | null
  entrance: Position | null
  entranceVerified: boolean
  segments: readonly RouteSegment[]
}): { ok: true; geometry: LineString; pathIds: string[]; distanceMeters: number } | { ok: false; message: string } {
  if (!input.entranceVerified || !input.entrance) {
    return { ok: false, message: 'The entrance is not verified. No route is recalculated.' }
  }
  const walk = planVisitorWalk({ gps: input.gps, entrance: input.entrance, segments: input.segments })
  if (!walk.ok) {
    return { ok: false, message: 'No safe route can be recalculated. Restricted and unverified paths are not used.' }
  }
  return { ok: true, geometry: walk.geometry, pathIds: walk.pathIds, distanceMeters: walk.distanceMeters }
}

export function advanceNavigation(input: {
  session: NavigationSession | null
  gps: Position | null
  accuracy: number | null
  entrance: Position | null
  entranceVerified: boolean
  destinationName: string
  segments: readonly RouteSegment[]
  now: number
}): NavigationAdvance {
  if (!input.entranceVerified || !input.entrance) {
    return {
      session: null,
      replacedRoute: false,
      guidance: {
        progress: null,
        direction: unavailableDirection,
        offRoute: false,
        arrived: false,
        accuracyWarning: accuracyWarning(input.accuracy),
        headline: 'Entrance not verified',
        detail: 'The entrance is not verified. No route is drawn.',
      },
    }
  }
  if (!input.gps) {
    return {
      session: input.session,
      replacedRoute: false,
      guidance: guideVisitor({
        gps: null,
        accuracy: input.accuracy,
        entrance: input.entrance,
        entranceVerified: true,
        destinationName: input.destinationName,
        route: input.session?.line ?? null,
        previous: input.session?.progress ?? null,
      }),
    }
  }

  let line = input.session?.line ?? null
  let progress = input.session?.progress ?? null
  let offRouteFix = input.session?.offRouteFix ?? null
  let recalcMessage = input.session?.recalcMessage ?? null
  let replacedRoute = false

  if (!line) {
    const planned = recalculateOffRoute({
      gps: input.gps,
      entrance: input.entrance,
      entranceVerified: true,
      segments: input.segments,
    })
    if (!planned.ok) {
      return {
        session: null,
        replacedRoute: false,
        guidance: {
          progress: null,
          direction: unavailableDirection,
          offRoute: false,
          arrived: false,
          accuracyWarning: accuracyWarning(input.accuracy),
          headline: 'No route',
          detail: planned.message,
        },
      }
    }
    line = planned.geometry
    replacedRoute = true
  }

  let guidance = guideVisitor({
    gps: input.gps,
    accuracy: input.accuracy,
    entrance: input.entrance,
    entranceVerified: true,
    destinationName: input.destinationName,
    route: line,
    previous: progress,
  })

  if (guidance.offRoute && shouldRecalculateOffRoute(true, offRouteFix, input.gps, input.now)) {
    const planned = recalculateOffRoute({
      gps: input.gps,
      entrance: input.entrance,
      entranceVerified: true,
      segments: input.segments,
    })
    if (planned.ok && !sameLine(line, planned.geometry)) {
      line = planned.geometry
      progress = null
      recalcMessage = null
      offRouteFix = null
      replacedRoute = true
      guidance = guideVisitor({
        gps: input.gps,
        accuracy: input.accuracy,
        entrance: input.entrance,
        entranceVerified: true,
        destinationName: input.destinationName,
        route: line,
        previous: null,
      })
    } else {
      offRouteFix = { at: input.now, position: input.gps }
      if (!planned.ok) recalcMessage = planned.message
    }
  } else if (!guidance.offRoute && (recalcMessage !== null || offRouteFix !== null)) {
    recalcMessage = null
    offRouteFix = null
  }

  if (guidance.progress !== progress) progress = guidance.progress
  const next: NavigationSession = { line, progress, offRouteFix, recalcMessage }
  if (input.session && sameSession(input.session, next)) {
    return { session: input.session, replacedRoute: false, guidance }
  }
  return { session: next, replacedRoute, guidance }
}

function progressAt(point: Position, distanceFromRoute: number, traveledMeters: number, totalMeters: number): RouteProgress {
  const remainingMeters = Math.max(0, totalMeters - traveledMeters)
  const percent = totalMeters < 0.5 ? 100 : Math.min(100, Math.max(0, (traveledMeters / totalMeters) * 100))
  return {
    point: [Number(point[0]), Number(point[1])],
    distanceFromRoute,
    traveledMeters,
    remainingMeters,
    totalMeters,
    percent,
  }
}

function projectSegment(gps: Position, from: Position, to: Position): { point: Position; distanceMeters: number } {
  const originLat = Number(gps[1])
  const metersPerLat = 111132
  const metersPerLon = 111320 * Math.cos((originLat * Math.PI) / 180)
  if (!Number.isFinite(metersPerLon) || Math.abs(metersPerLon) < 1) {
    return { point: [Number(from[0]), Number(from[1])], distanceMeters: haversineMeters(gps, from) }
  }
  const ax = (Number(from[0]) - Number(gps[0])) * metersPerLon
  const ay = (Number(from[1]) - Number(gps[1])) * metersPerLat
  const bx = (Number(to[0]) - Number(gps[0])) * metersPerLon
  const by = (Number(to[1]) - Number(gps[1])) * metersPerLat
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (-ax * dx + -ay * dy) / lengthSquared))
  const endpoint = t <= 0 ? from : t >= 1 ? to : null
  const point = endpoint
    ? ([Number(endpoint[0]), Number(endpoint[1])] as Position)
    : ([Number(gps[0]) + (ax + t * dx) / metersPerLon, Number(gps[1]) + (ay + t * dy) / metersPerLat] as Position)
  return { point, distanceMeters: haversineMeters(gps, point) }
}

function bearing(from: Position, to: Position): number | null {
  const metersPerLat = 111132
  const metersPerLon = 111320 * Math.cos((Number(from[1]) * Math.PI) / 180)
  const east = (Number(to[0]) - Number(from[0])) * metersPerLon
  const north = (Number(to[1]) - Number(from[1])) * metersPerLat
  if (Math.hypot(east, north) < 1) return null
  return (Math.atan2(east, north) * 180) / Math.PI
}

function signedTurn(inbound: number, outbound: number): number {
  let delta = outbound - inbound
  while (delta > 180) delta -= 360
  while (delta <= -180) delta += 360
  return delta
}

function lengthOf(coordinates: readonly Position[]): number {
  let total = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    const from = coordinates[index - 1]
    const to = coordinates[index]
    if (from && to) total += haversineMeters(from, to)
  }
  return total
}

function sameLine(left: LineString, right: LineString): boolean {
  if (left.coordinates.length !== right.coordinates.length) return false
  return left.coordinates.every((position, index) => {
    const other = right.coordinates[index]
    return other != null && Number(position[0]) === Number(other[0]) && Number(position[1]) === Number(other[1])
  })
}

function sameSession(left: NavigationSession, right: NavigationSession): boolean {
  return left.line === right.line && left.progress === right.progress && left.offRouteFix === right.offRouteFix && left.recalcMessage === right.recalcMessage
}
