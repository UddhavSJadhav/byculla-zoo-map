import { useSyncExternalStore } from 'react'
import { listEntrances, placingAttractionId, placingEntranceId, subscribeEntrances } from '@/entrances/store'

export function useEntrances() {
  return useSyncExternalStore(subscribeEntrances, listEntrances, listEntrances)
}

export function useEntrancePlacement() {
  return useSyncExternalStore(subscribeEntrances, placingEntranceId, placingEntranceId)
}

export function useEntrancePlacementAttraction() {
  return useSyncExternalStore(subscribeEntrances, placingAttractionId, placingAttractionId)
}
