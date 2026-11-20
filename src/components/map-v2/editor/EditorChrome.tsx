import { useState, type ChangeEvent } from 'react'
import { editorTools, toolHints, accessTypes, type EditorTool } from '@/map-v2/editor/types'
import { useEditorSession } from '@/components/map-v2/editor/useEditorSession'

type Session = ReturnType<typeof useEditorSession>

export function EditorChrome({ session }: { session: Session }) {
  const showProperties = session.draftKind !== null || session.selected !== null
  const selectionId = session.selected?.properties.id ?? null
  const confirmOpen = Boolean(session.pendingDelete || session.pendingReset || session.pendingImport)
  const drawing = session.draftKind !== null
  const focusKey = `${session.tool}|${selectionId ?? ''}|${confirmOpen ? 'confirm' : ''}`
  const [focus, setFocus] = useState(focusKey)
  const [expanded, setExpanded] = useState(false)
  if (focus !== focusKey) {
    setFocus(focusKey)
    if (confirmOpen || selectionId || drawing) setExpanded(true)
  }
  const activeTool = editorTools.find((item) => item.id === session.tool) ?? editorTools[0]

  const onImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void file.text().then((text) => session.importText(text))
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+7.6rem)] z-20 px-3">
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-1 rounded-2xl bg-white/95 p-1 shadow-md ring-1 ring-black/5">
          <div className="flex shrink-0 gap-0.5" role="toolbar" aria-label="Map editor">
            {editorTools.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                aria-pressed={session.tool === item.id}
                onClick={() => session.chooseTool(item.id)}
                className={toolClass(session.tool === item.id, item.id === 'delete')}
              >
                <ToolIcon id={item.id} />
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-xs font-semibold text-neutral-900">
              {activeTool.label}
              {drawing && session.draftPoints.length > 0 ? ` · ${session.draftPoints.length} points` : ''}
            </p>
            <p className="truncate text-[11px] text-neutral-600">{toolHints[session.tool]}</p>
          </div>
          {drawing ? (
            <button
              type="button"
              onClick={session.saveDraft}
              disabled={!session.draftReady}
              className="shrink-0 rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Finish
            </button>
          ) : null}
          <p className="hidden shrink-0 rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-700 sm:block" role="status">
            {shortStatus(session)}
          </p>
        </div>
      </div>
      <section className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 z-20 w-[min(18.5rem,calc(100%-1.5rem))] rounded-2xl bg-white/95 shadow-lg ring-1 ring-black/5">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <Chevron open={expanded} />
          <span className="text-sm font-semibold">Editor</span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-600">{panelSummary(session)}</span>
        </button>
        {expanded && confirmOpen ? (
          <div className="space-y-2 px-3 pb-2">
            {session.pendingDelete ? (
              <Confirm
                title={`Delete ${session.pendingDelete.label}?`}
                body="This removes it from your local map. The imported OpenStreetMap file stays as it is."
                confirmLabel="Delete"
                onConfirm={session.confirmDelete}
                onCancel={() => session.setPendingDelete(null)}
              />
            ) : null}
            {session.pendingReset ? (
              <Confirm
                title="Reset manual edits?"
                body="This clears every local edit and shows the original OpenStreetMap data again."
                confirmLabel="Reset"
                onConfirm={session.confirmReset}
                onCancel={() => session.setPendingReset(false)}
              />
            ) : null}
            {session.pendingImport ? (
              <Confirm
                title="Replace manual edits?"
                body="Importing replaces the edits stored in this browser."
                confirmLabel="Import"
                onConfirm={session.confirmImport}
                onCancel={() => session.setPendingImport(null)}
              />
            ) : null}
          </div>
        ) : null}
        {expanded ? (
          <div className="max-h-[min(38vh,22rem)] space-y-2 overflow-y-auto px-3 pb-3">
            <p className="text-[11px] text-neutral-600">Edits stay in this browser. OpenStreetMap files are not changed.</p>
            <p className="text-xs font-medium text-neutral-800" role="status">
              {session.saveStatus}
            </p>
            {session.message ? <p className="text-xs text-neutral-700">{session.message}</p> : null}
            {session.importWarnings.length > 0 ? (
              <ul className="list-disc space-y-1 pl-4 text-[11px] text-neutral-600">
                {session.importWarnings.slice(0, 4).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {showProperties ? (
              <form
                className="grid grid-cols-2 gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (session.draftKind) session.saveDraft()
                  else session.saveProperties()
                }}
              >
                <p className="col-span-2 text-[11px] font-medium tracking-wide text-neutral-500 uppercase">
                  {session.selected ? session.origin : 'New feature'}
                  {session.selected
                    ? ` · ${session.vertexCount} vertices`
                    : session.draftPoints.length > 0
                      ? ` · ${session.draftPoints.length} points`
                      : ''}
                </p>
                {session.pointCoordinate ? (
                  <p className="col-span-2 text-[11px] text-neutral-600 tabular-nums">
                    {Number(session.pointCoordinate[1]).toFixed(6)}, {Number(session.pointCoordinate[0]).toFixed(6)} latitude, longitude
                  </p>
                ) : null}
                <Field className="col-span-2" label="Name" value={session.form.name} onChange={(value) => session.updateForm({ name: value })} />
                <label className="block text-[11px] font-medium text-neutral-700">
                  Category
                  <select
                    value={session.form.category}
                    onChange={(event) => session.updateForm({ category: event.target.value as Session['form']['category'] })}
                    className={fieldClass}
                  >
                    {session.categoryChoices.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[11px] font-medium text-neutral-700">
                  Access type
                  <select value={session.form.access} onChange={(event) => session.updateForm({ access: event.target.value })} className={fieldClass}>
                    <option value="">Not set</option>
                    {accessOptions(session.form.access).map((access) => (
                      <option key={access} value={access}>
                        {access}
                      </option>
                    ))}
                  </select>
                </label>
                <Field label="Height" value={session.form.height} onChange={(value) => session.updateForm({ height: value })} inputMode="decimal" />
                <label className="block text-[11px] font-medium text-neutral-700">
                  Source
                  <select value={session.form.source} onChange={(event) => session.updateForm({ source: event.target.value })} className={fieldClass}>
                    {sourceOptions(session.form.source).map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 block text-[11px] font-medium text-neutral-700">
                  Description
                  <textarea
                    value={session.form.description}
                    rows={2}
                    onChange={(event) => session.updateForm({ description: event.target.value })}
                    className={fieldClass}
                  />
                </label>
                <Field className="col-span-2" label="Feature ID" value={session.form.id} onChange={(value) => session.updateForm({ id: value })} />
                <label className="col-span-2 block text-[11px] font-medium text-neutral-700">
                  3D model reference
                  <input
                    value={session.form.modelReference}
                    onChange={(event) => session.updateForm({ modelReference: event.target.value })}
                    className={fieldClass}
                  />
                </label>
                <div className="sticky bottom-0 col-span-2 flex flex-wrap gap-2 bg-white/95 py-1">
                  <button
                    type="submit"
                    disabled={session.draftKind !== null && !session.draftReady}
                    className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    {session.draftKind ? 'Finish' : 'Save properties'}
                  </button>
                  {session.dirty && !session.draftKind ? (
                    <button type="button" onClick={session.revertForm} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium">
                      Revert
                    </button>
                  ) : null}
                  {session.draftPoints.length > 0 ? (
                    <button type="button" onClick={session.cancelDrawing} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium">
                      Cancel drawing
                    </button>
                  ) : null}
                  {session.tool === 'edit' && session.activeVertex !== null ? (
                    <button type="button" onClick={session.removeActiveVertex} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium">
                      Delete vertex
                    </button>
                  ) : null}
                  {session.canRestore ? (
                    <button type="button" onClick={session.restoreSelected} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium">
                      Restore original
                    </button>
                  ) : null}
                  {session.selected ? (
                    <button
                      type="button"
                      onClick={() =>
                        session.setPendingDelete({
                          id: session.selected?.properties.id ?? '',
                          label: session.selected?.properties.name || session.selected?.properties.id || 'feature',
                        })
                      }
                      className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <p className="text-xs text-neutral-600">Choose a drawing tool, or use Select to inspect a feature already on the map.</p>
            )}
            <div className="space-y-2 border-t border-neutral-200 pt-2">
              <h3 className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">Data</h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={session.downloadEdits} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium">
                  Export edits
                </button>
                <label className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium">
                  Import GeoJSON
                  <input type="file" accept=".geojson,.json,application/geo+json,application/json" className="sr-only" onChange={onImport} />
                </label>
                <button type="button" onClick={session.downloadMap} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium">
                  Download edited map
                </button>
                <button type="button" onClick={() => session.setPendingReset(true)} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium">
                  Reset edits
                </button>
              </div>
              <div className="flex gap-2">
                <select value={session.dataset} onChange={(event) => session.setDataset(event.target.value as Session['dataset'])} className={fieldClass}>
                  {session.datasetOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={session.downloadDataset} className="shrink-0 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium">
                  Download dataset
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </>
  )
}

function panelSummary(session: Session) {
  if (session.draftKind && session.draftPoints.length > 0) return `${session.draftPoints.length} unsaved points`
  if (session.selected) return session.form.name.trim() || session.selected.properties.id
  return shortStatus(session)
}

function shortStatus(session: Session) {
  if (session.draftKind && session.draftPoints.length > 0) return 'Unsaved drawing'
  if (session.saveStatus === 'No manual edits') return 'No edits'
  if (session.saveStatus.startsWith('Saved locally')) {
    const count = session.saveStatus.match(/(\d+) edited/)?.[1] ?? '0'
    return `Saved · ${count}`
  }
  return session.saveStatus
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
    <div className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-950">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{body}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onConfirm} className="rounded-full bg-neutral-900 px-3 py-1.5 font-semibold text-white">
          {confirmLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-full bg-white px-3 py-1.5 font-medium">
          Cancel
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  inputMode?: 'decimal'
  className?: string
}) {
  return (
    <label className={`block text-[11px] font-medium text-neutral-700 ${className ?? ''}`}>
      {label}
      <input value={value} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} className={fieldClass} />
    </label>
  )
}

function sourceOptions(current: string) {
  const options = ['Manual', 'OpenStreetMap']
  if (current && !options.includes(current)) options.push(current)
  return options
}

function accessOptions(current: string) {
  const options: string[] = [...accessTypes]
  if (current && !options.includes(current)) options.unshift(current)
  return options
}

function toolClass(active: boolean, danger: boolean) {
  const base = 'grid size-8 place-items-center rounded-xl'
  if (active && danger) return `${base} bg-red-700 text-white`
  if (active) return `${base} bg-neutral-900 text-white`
  if (danger) return `${base} text-red-700 hover:bg-red-50`
  return `${base} text-neutral-800 hover:bg-neutral-100`
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className={`shrink-0 text-neutral-500 ${open ? 'rotate-90' : ''}`}>
      <path d="M5 3.2 9.2 7 5 10.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ToolIcon({ id }: { id: EditorTool }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (id === 'select') {
    return (
      <svg {...props}>
        <path d="M3.2 2.4 3.2 12.2 6.1 9.4 8.1 13.2 9.7 12.4 7.7 8.6 11.4 8.4 3.2 2.4Z" />
      </svg>
    )
  }
  if (id === 'path') {
    return (
      <svg {...props}>
        <path d="M3 12.2 6.4 7.2 9.2 9.2 13 3.6" />
        <circle cx="3" cy="12.2" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="6.4" cy="7.2" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="9.2" cy="9.2" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="13" cy="3.6" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  if (id === 'polygon') {
    return (
      <svg {...props}>
        <path d="M8 2.4 13.2 6.1 11.2 13.2 4.8 13.2 2.8 6.1Z" />
      </svg>
    )
  }
  if (id === 'point') {
    return (
      <svg {...props}>
        <path d="M8 14.2s4.2-3.7 4.2-7A4.2 4.2 0 0 0 3.8 7.2c0 3.3 4.2 7 4.2 7Z" />
        <circle cx="8" cy="7.1" r="1.3" />
      </svg>
    )
  }
  if (id === 'edit') {
    return (
      <svg {...props}>
        <path d="M3.2 11.6 8 4.2 12.8 11.6" />
        <circle cx="3.2" cy="11.6" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="8" cy="4.2" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="12.8" cy="11.6" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="5.6" cy="7.9" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  return (
    <svg {...props}>
      <path d="M3.2 4.2h9.6" />
      <path d="M6.2 4.2V3.2h3.6v1" />
      <path d="M4.4 4.2 5 13h6l.6-8.8" />
    </svg>
  )
}

const fieldClass = 'mt-0.5 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-normal text-neutral-900 outline-none'
