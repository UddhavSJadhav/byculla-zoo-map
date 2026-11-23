import { useMemo, useState, type ChangeEvent } from 'react'
import type { Map } from 'maplibre-gl'
import { downloadJson } from '@/map-v2/editor/document'
import { pathAccessStatuses, type PathAccessStatus, type PathRecord } from '@/paths/types'
import {
  exportPathAccess,
  getPath,
  importPathAccess,
  orphanedPathIds,
  pathHasEdits,
  pathStatusCounts,
  resetPathAccess,
  updatePathAccess,
} from '@/paths/store'
import { usePaths } from '@/components/map-v2/paths/usePaths'

export function PathAdmin({
  map,
  selectedId,
  editing,
  onSelect,
}: {
  map: Map | null
  selectedId: string | null
  editing: boolean
  onSelect: (id: string | null) => void
}) {
  const paths = usePaths()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<PathAccessStatus | 'all'>('all')
  const [pendingReset, setPendingReset] = useState(false)
  const [pendingImport, setPendingImport] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const counts = pathStatusCounts()
  const orphans = orphanedPathIds()
  const selected = selectedId ? getPath(selectedId) : null
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return paths.filter((path) => {
      if (statusFilter !== 'all' && path.status !== statusFilter) return false
      if (!needle) return true
      return path.sourceId.toLowerCase().includes(needle) || path.osmFeatureId.toLowerCase().includes(needle) || path.highway.includes(needle)
    })
  }, [paths, query, statusFilter])

  const choose = (path: PathRecord) => {
    onSelect(path.osmFeatureId)
    if (!map) return
    const bounds = boundsOf(path)
    try {
      map.fitBounds(bounds, { padding: { top: 150, right: 380, bottom: 90, left: 48 }, maxZoom: 19, duration: 0 })
    } catch {
      // The map can be removed while the camera moves.
    }
  }

  const onImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      if (pathHasEdits()) setPendingImport(text)
      else applyImport(text)
    }
    reader.readAsText(file)
  }

  const applyImport = (text: string) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setMessage(null)
      setWarnings(['That file is not valid JSON.'])
      setPendingImport(null)
      return
    }
    const result = importPathAccess(parsed)
    setPendingImport(null)
    setWarnings(result.warnings)
    setMessage(result.applied > 0 ? `Imported ${result.applied} path${result.applied === 1 ? '' : 's'}.` : result.warnings[0] ?? 'Nothing was imported.')
  }

  return (
    <section className="pointer-events-auto absolute top-[calc(env(safe-area-inset-top)+7.75rem)] right-3 z-20 flex max-h-[min(68vh,38rem)] w-[min(22rem,calc(100%-1.5rem))] flex-col rounded-2xl bg-white/95 shadow-lg ring-1 ring-black/5">
      <div className="border-b border-neutral-200 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Path access</h2>
          <p className="text-[11px] text-neutral-600">{counts.unverified} to check · {counts.accessible} accessible · {counts.restricted} restricted</p>
        </div>
        <p className="mt-1 text-[11px] leading-4 text-neutral-500">
          Status and notes are stored separately from OpenStreetMap. The way id is kept, and the line is read from the original path.
        </p>
        {editing ? <p className="mt-1 text-[11px] text-neutral-700">Leave Edit map to choose a path on the map. Access colors return then.</p> : null}
        {orphans.length > 0 ? <p className="mt-1 text-[11px] text-neutral-600">{orphans.length} saved status{orphans.length === 1 ? '' : 'es'} kept for a path that is no longer in the OpenStreetMap data.</p> : null}
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search way id"
          aria-label="Search walking paths"
          className="mt-2 w-full rounded-xl border border-neutral-200 px-2 py-1.5 text-sm outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          <FilterChip label="All" pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
          {pathAccessStatuses.map((status) => (
            <FilterChip key={status.id} label={status.label} pressed={statusFilter === status.id} onClick={() => setStatusFilter(status.id)} />
          ))}
        </div>
      </div>
      <ul className="max-h-40 overflow-y-auto border-b border-neutral-200">
        {visible.map((path) => (
          <li key={path.osmFeatureId}>
            <button
              type="button"
              aria-pressed={path.osmFeatureId === selectedId}
              onClick={() => choose(path)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs ${path.osmFeatureId === selectedId ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-50'}`}
            >
              <span>{path.sourceId}</span>
              <span className={path.osmFeatureId === selectedId ? 'text-white/80' : 'text-neutral-500'}>{statusLabel(path.status)}</span>
            </button>
          </li>
        ))}
        {visible.length === 0 ? <li className="px-3 py-3 text-xs text-neutral-500">No paths match.</li> : null}
      </ul>
      <div className="overflow-y-auto px-3 py-2">
        {selected ? <PathForm key={selected.osmFeatureId} path={selected} onMessage={setMessage} /> : <p className="text-xs text-neutral-500">Select a path from the list or the map.</p>}
      </div>
      <div className="space-y-2 border-t border-neutral-200 px-3 py-2">
        {message ? <p className="text-[11px] text-neutral-700">{message}</p> : null}
        {warnings.slice(0, 3).map((warning) => (
          <p key={warning} className="text-[11px] text-neutral-500">{warning}</p>
        ))}
        {pendingReset ? (
          <Confirm
            title="Reset path access?"
            body="This removes path status and notes stored in this browser. The OpenStreetMap paths stay unchanged."
            confirmLabel="Reset"
            onConfirm={() => {
              resetPathAccess()
              setPendingReset(false)
              setMessage('Path access edits were removed.')
              setWarnings([])
            }}
            onCancel={() => setPendingReset(false)}
          />
        ) : null}
        {pendingImport ? (
          <Confirm
            title="Import path access?"
            body="Importing updates the path status and notes stored in this browser. Coordinates in the file are ignored."
            confirmLabel="Import"
            onConfirm={() => applyImport(pendingImport)}
            onCancel={() => setPendingImport(null)}
          />
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => downloadJson('byculla-zoo-path-access.geojson', exportPathAccess())} className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium">
            Export
          </button>
          <label className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium">
            Import
            <input type="file" accept=".geojson,.json,application/geo+json,application/json" className="sr-only" onChange={onImport} />
          </label>
          <button type="button" onClick={() => setPendingReset(true)} className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium">
            Reset
          </button>
        </div>
      </div>
    </section>
  )
}

function PathForm({ path, onMessage }: { path: PathRecord; onMessage: (message: string | null) => void }) {
  const [note, setNote] = useState(path.note)
  const saveStatus = (status: PathAccessStatus) => {
    const error = updatePathAccess(path.osmFeatureId, { status })
    onMessage(error)
  }
  const saveNote = () => {
    const error = updatePathAccess(path.osmFeatureId, { note })
    onMessage(error)
  }
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">{highwayLabel(path.highway)}</p>
        <h3 className="text-sm font-semibold">{path.sourceId}</h3>
        <p className="text-[11px] text-neutral-500">Feature {path.osmFeatureId}</p>
      </div>
      <p className="text-[11px] leading-4 text-neutral-600">OpenStreetMap tag: access={path.osmAccess || 'unset'}. This tag is kept for reference and does not set visitor access.</p>
      <p className="text-[11px] leading-4 text-neutral-600">
        {path.connectedIds.length === 0
          ? 'This segment does not share a point with another walking path. It stays its own record.'
          : `This segment shares a point with ${path.connectedIds.length} other segment${path.connectedIds.length === 1 ? '' : 's'}. Each segment keeps its own status.`}
      </p>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Visitor access">
        {pathAccessStatuses.map((status) => (
          <button
            key={status.id}
            type="button"
            aria-pressed={path.status === status.id}
            onClick={() => saveStatus(status.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${path.status === status.id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-800'}`}
          >
            {status.label}
          </button>
        ))}
      </div>
      <label className="block text-[11px] font-medium text-neutral-700">
        Admin note
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-neutral-200 px-2 py-1.5 text-sm outline-none" />
      </label>
      <button type="button" onClick={saveNote} className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white">
        Save note
      </button>
    </div>
  )
}

function FilterChip({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${pressed ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}>
      {label}
    </button>
  )
}

function Confirm({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="rounded-xl bg-amber-50 p-2 text-[11px] text-amber-950">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{body}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onConfirm} className="rounded-full bg-neutral-900 px-2.5 py-1 font-semibold text-white">{confirmLabel}</button>
        <button type="button" onClick={onCancel} className="rounded-full bg-white px-2.5 py-1 font-medium">Cancel</button>
      </div>
    </div>
  )
}

function statusLabel(status: PathAccessStatus) {
  return pathAccessStatuses.find((item) => item.id === status)?.label ?? status
}

function highwayLabel(highway: string) {
  if (highway === 'service') return 'Service way'
  if (highway === 'footway') return 'Footway'
  return highway
}

function boundsOf(path: PathRecord): [[number, number], [number, number]] {
  let west = Number.POSITIVE_INFINITY
  let south = Number.POSITIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY
  for (const position of path.geometry.coordinates) {
    const longitude = Number(position[0])
    const latitude = Number(position[1])
    west = Math.min(west, longitude)
    south = Math.min(south, latitude)
    east = Math.max(east, longitude)
    north = Math.max(north, latitude)
  }
  if (west === east) {
    west -= 0.00015
    east += 0.00015
  }
  if (south === north) {
    south -= 0.00015
    north += 0.00015
  }
  return [[west, south], [east, north]]
}
