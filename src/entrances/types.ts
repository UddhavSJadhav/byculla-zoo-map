export interface EntranceRecord {
  id: string
  attractionId: string
  coordinates: [number, number]
  verified: boolean
  lastEdited: string
}

export interface EntranceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
