import { pathAccessStatuses, type PathAccessStatus } from '@/paths/types'
import { pathStatusCounts } from '@/paths/store'
import { usePaths } from '@/components/map-v2/paths/usePaths'

const swatches: Record<PathAccessStatus, { color: string; dash: string }> = {
  accessible: { color: '#1f7a4d', dash: 'solid' },
  restricted: { color: '#9a3412', dash: '8 6' },
  unverified: { color: '#b86a1a', dash: '2 6' },
}

export function PathLegend({ visitor }: { visitor: boolean }) {
  usePaths()
  const counts = pathStatusCounts()
  const rows = visitor ? pathAccessStatuses.filter((status) => status.id === 'accessible') : pathAccessStatuses
  return (
    <aside className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 z-10 w-[min(18rem,calc(100%-1.5rem))] rounded-2xl bg-white/95 p-3 shadow-md ring-1 ring-black/5">
      <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">Walking paths</p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((status) => (
          <li key={status.id} className="flex items-center gap-2 text-xs text-neutral-800">
            <span className="inline-block h-0.5 w-7" style={{ background: swatches[status.id].dash === 'solid' ? swatches[status.id].color : 'transparent', borderTop: swatches[status.id].dash === 'solid' ? undefined : `2px dashed ${swatches[status.id].color}` }} />
            <span className="flex-1">{status.label}</span>
            {visitor ? null : <span className="tabular-nums text-neutral-500">{counts[status.id]}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-4 text-neutral-600">
        {visitor
          ? counts.accessible === 0
            ? 'No path has been marked visitor accessible. Unverified and restricted paths stay off this map.'
            : 'Only paths marked visitor accessible are shown. Unverified and restricted paths stay off this map.'
          : 'Every OpenStreetMap path starts as needs verification. A private tag does not decide visitor access.'}
      </p>
    </aside>
  )
}
