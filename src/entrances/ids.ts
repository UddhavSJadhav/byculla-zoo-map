import type { EntranceRecord } from './types.ts'

export function nextEntranceId(attractionId: string, existing: ReadonlyMap<string, EntranceRecord> | Record<string, EntranceRecord>): string {
  const records = existing instanceof Map ? existing : new Map(Object.entries(existing))
  if (!records.has(attractionId)) return attractionId
  let index = 2
  while (records.has(`${attractionId}-${index}`)) index += 1
  return `${attractionId}-${index}`
}

export function entrancesForAttraction(
  entrances: readonly EntranceRecord[],
  attractionId: string,
): EntranceRecord[] {
  return entrances
    .filter((entrance) => entrance.attractionId === attractionId)
    .sort((left, right) => left.id.localeCompare(right.id))
}
