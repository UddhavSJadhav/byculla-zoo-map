import { useState } from 'react'
import { entranceReadiness, entranceStatusText } from '@/entrances/connection'
import { entrancesForAttraction } from '@/entrances/ids'
import {
  beginEntrancePlacement,
  cancelEntrancePlacement,
  removeEntrance,
  verifyEntrance,
} from '@/entrances/store'
import { usePaths } from '@/components/map-v2/paths/usePaths'
import { visitorWalkingGraph } from '@/routing/visitorGraph'
import { useEntrancePlacement, useEntrancePlacementAttraction, useEntrances } from '@/components/map-v2/entrances/useEntrances'

export function EntranceControls({ attractionId, editing }: { attractionId: string; editing: boolean }) {
  const entrances = entrancesForAttraction(useEntrances(), attractionId)
  const placingId = useEntrancePlacement()
  const placingAttraction = useEntrancePlacementAttraction()
  usePaths()
  const graph = visitorWalkingGraph()
  const placingHere = placingAttraction === attractionId
  const placingNew = placingHere && placingId != null && !entrances.some((entrance) => entrance.id === placingId)
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)

  return (
    <div className="space-y-1.5 rounded-xl bg-neutral-50 p-2">
      <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">Visitor entrances</p>
      {entrances.length === 0 ? <p className="text-[11px] leading-4 text-neutral-700">{entranceStatusText(entranceReadiness(null, graph))}</p> : null}
      {entrances.map((entrance, index) => {
        const readiness = entranceReadiness(entrance, graph)
        return (
          <div key={entrance.id} className="space-y-1 rounded-lg bg-white p-2 ring-1 ring-neutral-200">
            <p className="text-[11px] font-semibold text-neutral-800">Entrance {index + 1}</p>
            <p className={`text-[11px] leading-4 ${readiness.state === 'route-ready' ? 'text-green-800' : 'text-neutral-700'}`}>
              {entranceStatusText(readiness)}
            </p>
            <p className="text-[11px] text-neutral-500 tabular-nums">
              {entrance.coordinates[1].toFixed(6)}, {entrance.coordinates[0].toFixed(6)}
            </p>
            <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-700">
              <input
                type="checkbox"
                checked={entrance.verified}
                onChange={(event) => verifyEntrance(entrance.id, event.target.checked)}
              />
              Entrance verified
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={editing}
                onClick={() => (placingId === entrance.id ? cancelEntrancePlacement() : beginEntrancePlacement(attractionId, entrance.id))}
                className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
              >
                {placingId === entrance.id ? 'Cancel placement' : 'Move entrance'}
              </button>
              <button
                type="button"
                onClick={() => setPendingRemoveId(entrance.id)}
                className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        )
      })}
      {placingNew && placingHere ? <p className="text-[11px] text-neutral-700">Click the map to place another entrance. Moving it clears verification.</p> : null}
      {editing ? <p className="text-[11px] text-neutral-700">Leave Edit map to place an entrance.</p> : null}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={editing}
          onClick={() => (placingNew && placingHere ? cancelEntrancePlacement() : beginEntrancePlacement(attractionId))}
          className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
        >
          {placingNew && placingHere ? 'Cancel placement' : entrances.length === 0 ? 'Place entrance' : 'Add entrance'}
        </button>
      </div>
      {pendingRemoveId ? (
        <div className="rounded-xl bg-amber-50 p-2 text-[11px] text-amber-950">
          <p className="font-semibold">Remove this entrance?</p>
          <p className="mt-1">The exhibit and its shape stay as they are. Other entrances stay on the map.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                removeEntrance(pendingRemoveId)
                setPendingRemoveId(null)
              }}
              className="rounded-full bg-neutral-900 px-2.5 py-1 font-semibold text-white"
            >
              Remove entrance
            </button>
            <button type="button" onClick={() => setPendingRemoveId(null)} className="rounded-full bg-white px-2.5 py-1 font-medium">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
