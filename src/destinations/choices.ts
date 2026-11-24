import type { AttractionCategory, AttractionRecord } from '../attractions/types.ts'

export function destinationChoices(
  attractions: readonly AttractionRecord[],
  categories: readonly AttractionCategory[],
  showClosed: boolean,
  query: string,
): AttractionRecord[] {
  const selected = new Set(categories)
  const needle = query.trim().toLowerCase()
  return attractions.filter((attraction) => {
    if (!selected.has(attraction.category)) return false
    if (attraction.status === 'closed' && !showClosed) return false
    if (!needle) return true
    return attraction.name.toLowerCase().includes(needle) || String(attraction.exhibitNumber) === needle
  })
}
