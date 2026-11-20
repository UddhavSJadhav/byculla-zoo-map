import { useEffect, useMemo, useState } from 'react'
import {
  emptyCalibrationDraft,
  emptyCalibrationStore,
  isCompleteDraft,
  readCalibrationStore,
  writeCalibrationStore,
  type CalibrationStore,
} from '@/services/calibration'
import { assessCalibration } from '@/services/coordinateTransformation'
import type { CalibrationDraft, PixelPoint } from '@/types/calibration'

export function useCalibration() {
  const [store, setStore] = useState<CalibrationStore>(readCalibrationStore)
  const assessment = useMemo(() => assessCalibration(store.points), [store.points])

  useEffect(() => {
    writeCalibrationStore(store)
  }, [store])

  const update = (recipe: (current: CalibrationStore) => CalibrationStore) => {
    setStore((current) => recipe(current))
  }

  const setDraftName = (name: string) => {
    update((current) => ({
      ...current,
      draft: { ...current.draft, name },
    }))
  }

  const setDraftGeographic = (latitude: number, longitude: number) => {
    update((current) => ({
      ...current,
      draft: { ...current.draft, latitude, longitude },
    }))
  }

  const setDraftPixel = (pixel: PixelPoint) => {
    update((current) => ({
      ...current,
      draft: { ...current.draft, imageX: pixel.x, imageY: pixel.y },
    }))
  }

  const addPoint = () => {
    update((current) => {
      if (!isCompleteDraft(current.draft)) return current
      return {
        points: [
          ...current.points,
          {
            id: crypto.randomUUID(),
            name: current.draft.name.trim(),
            latitude: current.draft.latitude,
            longitude: current.draft.longitude,
            imageX: current.draft.imageX,
            imageY: current.draft.imageY,
          },
        ],
        draft: emptyCalibrationDraft(),
      }
    })
  }

  const renamePoint = (id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    update((current) => ({
      ...current,
      points: current.points.map((point) => (point.id === id ? { ...point, name: trimmed } : point)),
    }))
  }

  const deletePoint = (id: string) => {
    update((current) => ({
      ...current,
      points: current.points.filter((point) => point.id !== id),
    }))
  }

  const updatePointPosition = (
    id: string,
    position: { latitude: number; longitude: number; imageX: number; imageY: number },
  ) => {
    if (
      !Number.isFinite(position.latitude) ||
      !Number.isFinite(position.longitude) ||
      !Number.isFinite(position.imageX) ||
      !Number.isFinite(position.imageY)
    ) {
      return
    }

    update((current) => ({
      ...current,
      points: current.points.map((point) =>
        point.id === id
          ? {
              ...point,
              latitude: position.latitude,
              longitude: position.longitude,
              imageX: position.imageX,
              imageY: position.imageY,
            }
          : point,
      ),
    }))
  }

  const clearAll = () => {
    setStore(emptyCalibrationStore())
  }

  return {
    points: store.points,
    draft: store.draft,
    assessment,
    setDraftName,
    setDraftGeographic,
    setDraftPixel,
    addPoint,
    renamePoint,
    deletePoint,
    updatePointPosition,
    clearAll,
  }
}

export function draftHasGeographic(draft: CalibrationDraft): boolean {
  return draft.latitude != null && draft.longitude != null
}

export function draftHasPixel(draft: CalibrationDraft): boolean {
  return draft.imageX != null && draft.imageY != null
}
