import { attractionCategories, type AttractionCategory, type AttractionRecord, type AttractionStatus } from '@/attractions/types'

export const categoryPresentation: Record<AttractionCategory, { color: string; mark: string }> = {
  animal: { color: '#c47b4a', mark: 'A' },
  birds: { color: '#3d7ea6', mark: 'B' },
  garden: { color: '#5f8f4e', mark: 'G' },
  habitat: { color: '#8a6a3b', mark: 'H' },
  venue: { color: '#6b5b95', mark: 'V' },
  amenity: { color: '#3f7d6e', mark: 'S' },
}

export function visitorAttractions(attractions: AttractionRecord[], categories: readonly AttractionCategory[], showClosed: boolean): AttractionRecord[] {
  const selected = new Set(categories)
  return attractions.filter((attraction) => {
    if (!attraction.geometry) return false
    if (!selected.has(attraction.category)) return false
    if (attraction.status === 'closed' && !showClosed) return false
    return true
  })
}

export function availabilityLabel(status: AttractionStatus): string {
  if (status === 'open') return 'Open'
  if (status === 'closed') return 'Closed'
  if (status === 'unknown') return 'Availability unknown'
  return 'Listed on the visitor map'
}

export function categoryLabel(category: AttractionCategory): string {
  return attractionCategories.find((item) => item.id === category)?.label ?? category
}
