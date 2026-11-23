import { useSyncExternalStore } from 'react'
import { listPaths, subscribePaths } from '@/paths/store'

export function usePaths() {
  return useSyncExternalStore(subscribePaths, listPaths, listPaths)
}
