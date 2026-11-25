import { poorAccuracyMeters } from '../routing/guidance.ts'
import type { LocationPhase } from '../types/geolocation.ts'

export { poorAccuracyMeters }

export const visitorTouchTargetPx = 44

export interface VisitState {
  selectedId: string | null
  navigating: boolean
  listOpen: boolean
}

export function visitorChrome(input: { admin: boolean; navigating: boolean }) {
  if (input.admin) {
    return {
      mode: 'admin' as const,
      mapFillsScreen: true,
      sheet: null,
      searchPlacement: 'top' as const,
      instructionProminent: false,
      minTouchTargetPx: visitorTouchTargetPx,
    }
  }
  return {
    mode: 'visitor' as const,
    mapFillsScreen: true,
    sheet: null,
    searchPlacement: 'none' as const,
    instructionProminent: input.navigating,
    minTouchTargetPx: visitorTouchTargetPx,
  }
}

export function cancelNavigation(state: VisitState): VisitState {
  return { selectedId: state.selectedId, navigating: false, listOpen: true }
}

export function returnToMap(state: VisitState): VisitState {
  return { selectedId: state.selectedId, navigating: state.navigating, listOpen: false }
}

export function preserveVisit(state: VisitState): VisitState {
  return { selectedId: state.selectedId, navigating: state.navigating, listOpen: state.listOpen }
}

export interface GpsWatchInput {
  event: 'request' | 'visibility'
  visible: boolean
  hasSession: boolean
  watchActive: boolean
  interrupted: boolean
  pending: boolean
}

export function gpsWatchDecision(input: GpsWatchInput): 'start' | 'ignore-duplicate' | 'keep' | 'resume' {
  if (input.event === 'request') return input.hasSession ? 'ignore-duplicate' : 'start'
  if (!input.visible || !input.hasSession || input.pending) return 'keep'
  if (input.interrupted || !input.watchActive) return 'resume'
  return 'keep'
}

export function visitorLocationExplanation(input: {
  phase: LocationPhase
  wait: 'permission' | 'locating' | null
  errorKind: 'denied' | 'timeout' | 'unavailable' | null
  accuracy: number | null
  recovered: boolean
}): { title: string; detail: string; poorAccuracy: boolean } {
  if (input.phase === 'unsupported') {
    return {
      title: 'This device cannot share location',
      detail: 'You can still look around the map. A position is not guessed.',
      poorAccuracy: false,
    }
  }
  if (input.phase === 'denied' || input.errorKind === 'denied') {
    return {
      title: 'Location permission was denied',
      detail: 'Allow location for this site in the browser settings, then tap Locate me again.',
      poorAccuracy: false,
    }
  }
  if (input.phase === 'waiting' && input.wait !== 'locating') {
    return {
      title: 'Location permission is needed',
      detail: 'Allow location to show where you are. Nothing is guessed before you allow it.',
      poorAccuracy: false,
    }
  }
  if (input.phase === 'waiting') {
    return {
      title: 'Finding your position',
      detail: 'This can take a moment. Keep the map open.',
      poorAccuracy: false,
    }
  }
  if (input.phase === 'temporary-error' && input.errorKind === 'timeout') {
    return {
      title: 'Location took too long',
      detail: 'Move to an open area and tap Locate me again. A position is not invented.',
      poorAccuracy: false,
    }
  }
  if (input.phase === 'temporary-error') {
    return {
      title: 'Your position is unavailable',
      detail: 'The device could not provide a location. Try again in a moment.',
      poorAccuracy: false,
    }
  }
  if (input.phase === 'stopped') {
    return {
      title: 'Location is off',
      detail: 'Tap Locate me to use your position. A route is not started without it.',
      poorAccuracy: false,
    }
  }
  const poorAccuracy = input.accuracy != null && Number.isFinite(input.accuracy) && input.accuracy > poorAccuracyMeters
  const accuracyText = input.accuracy != null && Number.isFinite(input.accuracy) ? `Accuracy ${Math.round(input.accuracy)} m.` : 'Accuracy is not reported.'
  if (poorAccuracy) {
    return {
      title: 'Location accuracy is poor',
      detail: `${accuracyText} The route will stay steady until the reading improves.`,
      poorAccuracy: true,
    }
  }
  return {
    title: input.recovered ? 'Location is back' : 'Location is on',
    detail: input.recovered ? `${accuracyText} Updates have resumed.` : accuracyText,
    poorAccuracy: false,
  }
}

export function showLocationBubble(input: {
  phase: LocationPhase
  wait: 'permission' | 'locating' | null
  errorKind: 'denied' | 'timeout' | 'unavailable' | null
  poorAccuracy: boolean
}): boolean {
  if (input.phase === 'unsupported') return true
  if (input.phase === 'denied' || input.errorKind === 'denied') return true
  if (input.phase === 'waiting' && input.wait !== 'locating') return true
  if (input.phase === 'temporary-error') return true
  return input.poorAccuracy
}

export function nextLocationNotice(
  previous: { phase: LocationPhase; recovered: boolean },
  phase: LocationPhase,
): { phase: LocationPhase; recovered: boolean } {
  if (phase !== 'available') return { phase, recovered: false }
  const recovered = previous.recovered || previous.phase === 'temporary-error' || previous.phase === 'denied'
  return { phase, recovered }
}

export function describeOffline(input: {
  online: boolean
  attractionMetadataCached: boolean
  pathGeometriesCached: boolean
  graphReconstructed: boolean
}): { showIndicator: boolean; text: string; claimsRouting: boolean } {
  if (input.online) return { showIndicator: false, text: '', claimsRouting: false }
  const ready = input.attractionMetadataCached && input.pathGeometriesCached && input.graphReconstructed
  if (!ready) {
    return {
      showIndicator: true,
      text: 'Offline. Walking routes are not available until saved zoo data is on this device.',
      claimsRouting: false,
    }
  }
  return {
    showIndicator: true,
    text: 'Offline. Saved paths and attractions are on this device, so a walking route can be calculated. Map images may be missing.',
    claimsRouting: true,
  }
}
