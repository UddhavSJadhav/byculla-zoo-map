import { useSyncExternalStore } from 'react'
import { listEntrances, placingEntranceId, subscribeEntrances } from '@/entrances/store'

export function useEntrances() {
  return useSyncExternalStore(subscribeEntrances, listEntrances, listEntrances)
}

export function useEntrancePlacement() {
  return useSyncExternalStore(subscribeEntrances, placingEntranceId, placingEntranceId)
}
