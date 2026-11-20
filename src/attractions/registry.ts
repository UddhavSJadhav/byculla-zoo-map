import type { AttractionCategory, AttractionRecord } from '@/attractions/types'

interface Seed {
  exhibitNumber: number
  name: string
  category: AttractionCategory
}

/** Numbered exhibits from the original Byculla Zoo visitor map. Names are not a statement that the exhibit is open. */
const seeds: Seed[] = [
  { exhibitNumber: 1, name: 'Aqua Birds', category: 'birds' },
  { exhibitNumber: 2, name: 'Otter', category: 'animal' },
  { exhibitNumber: 3, name: 'Crocodile', category: 'animal' },
  { exhibitNumber: 4, name: 'Butterfly Garden', category: 'garden' },
  { exhibitNumber: 5, name: 'Turtle', category: 'animal' },
  { exhibitNumber: 6, name: 'Birds Paradise', category: 'birds' },
  { exhibitNumber: 7, name: 'Biome Park', category: 'habitat' },
  { exhibitNumber: 8, name: 'Amphitheatre', category: 'venue' },
  { exhibitNumber: 9, name: 'Auditorium', category: 'venue' },
  { exhibitNumber: 10, name: 'Penguin', category: 'birds' },
  { exhibitNumber: 11, name: 'Deer', category: 'animal' },
  { exhibitNumber: 12, name: 'Hippo', category: 'animal' },
  { exhibitNumber: 13, name: 'Macaque', category: 'animal' },
  { exhibitNumber: 14, name: 'Tiger', category: 'animal' },
  { exhibitNumber: 15, name: 'Jackal', category: 'animal' },
  { exhibitNumber: 16, name: 'Hyena', category: 'animal' },
  { exhibitNumber: 17, name: 'Leopard', category: 'animal' },
  { exhibitNumber: 18, name: 'Bear', category: 'animal' },
  { exhibitNumber: 19, name: 'Lion', category: 'animal' },
]

export const attractionRegistry: AttractionRecord[] = seeds.map((seed) => ({
  id: `exhibit-${seed.exhibitNumber}`,
  name: seed.name,
  exhibitNumber: seed.exhibitNumber,
  category: seed.category,
  description: '',
  geometry: null,
  source: 'Visitor map',
  verified: false,
  status: 'reference',
  geometryOrigin: null,
  sourceFeatureId: null,
  osmFeatureId: null,
  osmLayer: null,
  lastEdited: null,
  rejectedSourceIds: [],
}))

export function attractionById(id: string): AttractionRecord | undefined {
  return attractionRegistry.find((attraction) => attraction.id === id)
}

export function attractionByNumber(exhibitNumber: number): AttractionRecord | undefined {
  return attractionRegistry.find((attraction) => attraction.exhibitNumber === exhibitNumber)
}
