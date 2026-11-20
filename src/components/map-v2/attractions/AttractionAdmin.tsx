import { useMemo, useState, type ChangeEvent } from 'react'
import { attractionCategories, attractionStatuses, type AttractionCategory, type AttractionRecord, type AttractionStatus } from '@/attractions/types'
import {
  attractionHasEdits,
  exportAttractionCollection,
  importAttractionCollection,
  orphanedAttractionIds,
  requestAttractionMapping,
  resetAttractions,
  updateAttraction,
  assignAttractionGeometry,
} from '@/attractions/store'
import { setCandidateHighlight } from '@/attractions/candidates'
import { downloadJson } from '@/map-v2/editor/document'
import { CandidateReview } from '@/components/map-v2/attractions/CandidateReview'
import { useAttractionBaseline, useAttractions } from '@/components/map-v2/attractions/useAttractions'

export function AttractionAdmin({ onEditMap, docked }: { onEditMap: () => void; docked: boolean }) {
  const attractions = useAttractions()
  const baseline = useAttractionBaseline()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<AttractionCategory | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingReset, setPendingReset] = useState(false)
  const [pendingImport, setPendingImport] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const activeId = selectedId ?? attractions[0]?.id ?? null
  const selected = attractions.find((attraction) => attraction.id === activeId) ?? null
  const orphans = orphanedAttractionIds()
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return attractions.filter((attraction) => {
      if (category !== 'all' && attraction.category !== category) return false
      if (!needle) return true
      return attraction.name.toLowerCase().includes(needle) || String(attraction.exhibitNumber) === needle
    })
  }, [attractions, category, query])
  const mappedCount = attractions.filter((attraction) => attraction.geometry).length

  const onImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void file.text().then((text) => {
      if (attractionHasEdits()) {
        setPendingImport(text)
        return
      }
      applyImport(text)
    })
  }

  const applyImport = (text: string) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setMessage('That file is not valid JSON.')
      setPendingImport(null)
      return
    }
    const result = importAttractionCollection(parsed)
    setWarnings(result.warnings)
    setPendingImport(null)
    setMessage(result.applied > 0 ? `Imported ${result.applied} attraction${result.applied === 1 ? '' : 's'}.` : result.warnings[0] ?? 'Nothing was imported.')
  }

  const mapAttraction = (attraction: AttractionRecord, mode: 'point' | 'polygon' | 'edit') => {
    onEditMap()
    requestAttractionMapping(attraction.id, mode)
    setMessage(
      mode === 'edit'
        ? `Drag the handles to reshape ${attraction.exhibitNumber}. ${attraction.name}.`
        : `Draw ${mode === 'point' ? 'a point' : 'a polygon'} for ${attraction.exhibitNumber}. ${attraction.name}, then press Finish.`,
    )
  }

  return (
    <section className={`pointer-events-auto absolute right-3 z-20 flex max-h-[min(68vh,38rem)] w-[min(22rem,calc(100%-1.5rem))] flex-col rounded-2xl bg-white/95 shadow-lg ring-1 ring-black/5 ${docked ? 'top-[calc(env(safe-area-inset-top)+11.4rem)]' : 'top-[calc(env(safe-area-inset-top)+7.75rem)]'}`}>
      <div className="border-b border-neutral-200 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Attractions</h2>
          <p className="text-[11px] text-neutral-600">
            {baseline.status === 'loading' ? 'Loading baseline…' : `${mappedCount} mapped · ${attractions.length - mappedCount} unmapped`}
          </p>
        </div>
        <p className="mt-1 text-[11px] leading-4 text-neutral-500">
          The saved baseline provides the attraction records. Edits in this browser override it and are kept when the baseline changes. A name does not mean the exhibit is open.
        </p>
        {baseline.status === 'loading' ? <p className="mt-1 text-[11px] text-neutral-600">Loading the attraction baseline…</p> : null}
        {baseline.status === 'error' ? <p className="mt-1 text-[11px] text-red-700" role="alert">{baseline.error} Showing the visitor-map list without saved shapes.</p> : null}
        {baseline.warnings.slice(0, 2).map((warning) => (
          <p key={warning} className="mt-1 text-[11px] text-neutral-500">{warning}</p>
        ))}
        {orphans.length > 0 ? (
          <p className="mt-1 text-[11px] text-neutral-600">
            {orphans.length} local edit{orphans.length === 1 ? '' : 's'} kept for {orphans.length === 1 ? 'an attraction' : 'attractions'} that {orphans.length === 1 ? 'is' : 'are'} no longer in the baseline.
          </p>
        ) : null}
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name or number"
          aria-label="Search attractions"
          className="mt-2 w-full rounded-xl border border-neutral-200 px-2 py-1.5 text-sm outline-none"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as AttractionCategory | 'all')}
          aria-label="Filter by category"
          className="mt-2 w-full rounded-xl border border-neutral-200 px-2 py-1.5 text-sm outline-none"
        >
          <option value="all">All categories</option>
          {attractionCategories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[7.5rem_1fr]">
        <ul className="overflow-y-auto border-r border-neutral-200" aria-label="Attraction inventory">
          {visible.map((attraction) => (
            <li key={attraction.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(attraction.id)
                  setCandidateHighlight(null)
                }}
                aria-pressed={attraction.id === activeId}
                className={`flex w-full items-start gap-1 px-2 py-1.5 text-left text-xs ${attraction.id === activeId ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-50'}`}
              >
                <span className="w-4 shrink-0 tabular-nums">{attraction.exhibitNumber}</span>
                <span className="min-w-0 flex-1 truncate">{attraction.name}</span>
              </button>
            </li>
          ))}
          {visible.length === 0 ? <li className="px-2 py-3 text-xs text-neutral-500">No matches.</li> : null}
        </ul>
        <div className="overflow-y-auto px-2 py-2">
          {selected ? (
            <AttractionForm
              key={selected.id}
              attraction={selected}
              onMap={mapAttraction}
              onMessage={setMessage}
            />
          ) : (
            <p className="text-xs text-neutral-500">Select an attraction.</p>
          )}
        </div>
      </div>
      <div className="space-y-2 border-t border-neutral-200 px-3 py-2">
        {message ? <p className="text-[11px] text-neutral-700">{message}</p> : null}
        {warnings.slice(0, 3).map((warning) => (
          <p key={warning} className="text-[11px] text-neutral-500">{warning}</p>
        ))}
        {pendingReset ? (
          <Confirm
            title="Reset attraction edits?"
            body="This removes attraction edits stored in this browser. The saved baseline stays in place."
            confirmLabel="Reset"
            onConfirm={() => {
              resetAttractions()
              setPendingReset(false)
              setMessage('Attraction edits were removed.')
            }}
            onCancel={() => setPendingReset(false)}
          />
        ) : null}
        {pendingImport ? (
          <Confirm
            title="Replace attraction edits?"
            body="Importing replaces the attraction text and shapes stored in this browser."
            confirmLabel="Import"
            onConfirm={() => applyImport(pendingImport)}
            onCancel={() => setPendingImport(null)}
          />
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => downloadJson('byculla-zoo-attractions.geojson', exportAttractionCollection())} className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium">
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

function AttractionForm({
  attraction,
  onMap,
  onMessage,
}: {
  attraction: AttractionRecord
  onMap: (attraction: AttractionRecord, mode: 'point' | 'polygon' | 'edit') => void
  onMessage: (message: string) => void
}) {
  const [name, setName] = useState(attraction.name)
  const [description, setDescription] = useState(attraction.description)
  const [category, setCategory] = useState(attraction.category)
  const [status, setStatus] = useState(attraction.status)
  const [source, setSource] = useState(attraction.source)
  const [verified, setVerified] = useState(attraction.verified)
  const [pendingClear, setPendingClear] = useState(false)
  const dirty = name !== attraction.name || description !== attraction.description || category !== attraction.category || status !== attraction.status || source !== attraction.source || verified !== attraction.verified

  const save = () => {
    const error = updateAttraction(attraction.id, { name, description, category, status, source, verified })
    onMessage(error ?? `Saved details for ${attraction.exhibitNumber}. ${name.trim() || attraction.name}.`)
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">Exhibit {attraction.exhibitNumber}</p>
      <p className={`text-[11px] font-medium ${attraction.geometry ? 'text-green-800' : 'text-neutral-500'}`}>
        {geometryLabel(attraction)}
        {' · '}
        {verified ? 'Verified' : 'Not verified'}
      </p>
      <CandidateReview attraction={attraction} onMessage={onMessage} />
      <Field label="Name" value={name} onChange={setName} />
      <label className="block text-[11px] font-medium text-neutral-700">
        Category
        <select value={category} onChange={(event) => setCategory(event.target.value as AttractionCategory)} className={fieldClass}>
          {attractionCategories.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <label className="block text-[11px] font-medium text-neutral-700">
        Description
        <textarea value={description} rows={2} onChange={(event) => setDescription(event.target.value)} className={fieldClass} />
      </label>
      <label className="block text-[11px] font-medium text-neutral-700">
        Status
        <select value={status} onChange={(event) => setStatus(event.target.value as AttractionStatus)} className={fieldClass}>
          {attractionStatuses.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>
      <Field label="Source" value={source} onChange={setSource} />
      <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-700">
        <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
        Verified
      </label>
      <div className="sticky bottom-0 flex flex-wrap gap-1.5 bg-white/95 py-1">
        <button type="submit" disabled={!dirty} className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40">
          Save details
        </button>
        <button type="button" onClick={() => onMap(attraction, 'point')} className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium">
          Map point
        </button>
        <button type="button" onClick={() => onMap(attraction, 'polygon')} className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium">
          Map polygon
        </button>
        {attraction.geometry ? (
          <button type="button" onClick={() => onMap(attraction, 'edit')} className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium">
            Edit shape
          </button>
        ) : null}
        {attraction.geometry ? (
          <button type="button" onClick={() => setPendingClear(true)} className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700">
            Clear shape
          </button>
        ) : null}
      </div>
      {pendingClear ? (
        <div className="rounded-xl bg-amber-50 p-2 text-[11px] text-amber-950">
          <p className="font-semibold">Remove this shape?</p>
          <p className="mt-1">The exhibit stays in the inventory. Only the drawn point or polygon is removed.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                assignAttractionGeometry(attraction.id, null)
                setPendingClear(false)
                onMessage(`Removed the shape from ${attraction.exhibitNumber}. ${attraction.name}.`)
              }}
              className="rounded-full bg-neutral-900 px-2.5 py-1 font-semibold text-white"
            >
              Remove shape
            </button>
            <button type="button" onClick={() => setPendingClear(false)} className="rounded-full bg-white px-2.5 py-1 font-medium">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </form>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-[11px] font-medium text-neutral-700">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass} />
    </label>
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

function geometryLabel(attraction: AttractionRecord): string {
  if (attraction.geometryOrigin === 'osm') {
    const edited = attraction.lastEdited ? ` · ${new Date(attraction.lastEdited).toLocaleString()}` : ''
    return attraction.geometry ? `Linked · ${attraction.sourceFeatureId}${edited}` : `Linked · ${attraction.sourceFeatureId} is missing from the dataset`
  }
  if (attraction.geometryOrigin === 'manual' && attraction.geometry) {
    const edited = attraction.lastEdited ? ` · ${new Date(attraction.lastEdited).toLocaleString()}` : ''
    return `Manual · ${attraction.geometry.type}${edited}`
  }
  return attraction.geometry ? `Mapped · ${attraction.geometry.type}` : 'Unmapped'
}

const fieldClass = 'mt-0.5 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-normal text-neutral-900 outline-none'
