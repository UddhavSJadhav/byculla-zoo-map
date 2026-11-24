import { useState } from 'react'
import { entranceReadiness, entranceStatusText } from '@/entrances/connection'
import { beginEntrancePlacement, cancelEntrancePlacement, removeEntrance, verifyEntrance } from '@/entrances/store'
import { usePaths } from '@/components/map-v2/paths/usePaths'
import { visitorWalkingGraph } from '@/routing/visitorGraph'
import { useEntrancePlacement, useEntrances } from '@/components/map-v2/entrances/useEntrances'

export function EntranceControls({ attractionId, editing }: { attractionId: string; editing: boolean }) {
  const entrances = useEntrances()
  const placingId = useEntrancePlacement()
  usePaths()
  const entrance = entrances.find((item) => item.attractionId === attractionId) ?? null
  const readiness = entranceReadiness(entrance, visitorWalkingGraph())
  const placing = placingId === attractionId
  const [pendingRemove, setPendingRemove] = useState(false)

  return (
    <div className="space-y-1.5 rounded-xl bg-neutral-50 p-2">
      <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">Visitor entrance</p>
      <p className={`text-[11px] leading-4 ${readiness.state === 'route-ready' ? 'text-green-800' : 'text-neutral-700'}`}>{entranceStatusText(readiness)}</p>
      {entrance ? (
        <p className="text-[11px] text-neutral-500 tabular-nums">
          {entrance.coordinates[1].toFixed(6)}, {entrance.coordinates[0].toFixed(6)}
        </p>
      ) : null}
      {placing ? <p className="text-[11px] text-neutral-700">Click the map to place this entrance. Moving it clears verification.</p> : null}
      {editing ? <p className="text-[11px] text-neutral-700">Leave Edit map to place an entrance.</p> : null}
      <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-700">
        <input
          type="checkbox"
          checked={entrance?.verified ?? false}
          disabled={!entrance}
          onChange={(event) => verifyEntrance(attractionId, event.target.checked)}
        />
        Entrance verified
      </label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={editing}
          onClick={() => (placing ? cancelEntrancePlacement() : beginEntrancePlacement(attractionId))}
          className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
        >
          {placing ? 'Cancel placement' : entrance ? 'Move entrance' : 'Place entrance'}
        </button>
        {entrance ? (
          <button type="button" onClick={() => setPendingRemove(true)} className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700">
            Remove entrance
          </button>
        ) : null}
      </div>
      {pendingRemove ? (
        <div className="rounded-xl bg-amber-50 p-2 text-[11px] text-amber-950">
          <p className="font-semibold">Remove this entrance?</p>
          <p className="mt-1">The exhibit and its shape stay as they are.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                removeEntrance(attractionId)
                setPendingRemove(false)
              }}
              className="rounded-full bg-neutral-900 px-2.5 py-1 font-semibold text-white"
            >
              Remove entrance
            </button>
            <button type="button" onClick={() => setPendingRemove(false)} className="rounded-full bg-white px-2.5 py-1 font-medium">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
