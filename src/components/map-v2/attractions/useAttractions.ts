import { useSyncExternalStore } from 'react'
import { getBaselineState } from '@/attractions/baseline'
import { listAttractions, subscribeAttractions } from '@/attractions/store'

export function useAttractions() {
  return useSyncExternalStore(subscribeAttractions, listAttractions, listAttractions)
}

export function useAttractionBaseline() {
  return useSyncExternalStore(subscribeAttractions, getBaselineState, getBaselineState)
}
