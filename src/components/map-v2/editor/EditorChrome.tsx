import type { ChangeEvent } from 'react'
import { accessTypes, editorTools, toolHints } from '@/map-v2/editor/types'
import { useEditorSession } from '@/components/map-v2/editor/useEditorSession'

type Session = ReturnType<typeof useEditorSession>

export function EditorChrome({ session }: { session: Session }) {
  const showProperties = session.draftKind !== null || session.selected !== null
  const onImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    void file.text().then((text) => session.importText(text))
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+7.6rem)] z-20 px-3">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-1">
          <div className="flex gap-1 overflow-x-auto rounded-2xl bg-white/95 p-1 shadow-md ring-1 ring-black/5" role="toolbar" aria-label="Map editor">
            {editorTools.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={session.tool === item.id}
                onClick={() => session.chooseTool(item.id)}
                className={toolClass(session.tool === item.id, item.id === 'delete')}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="rounded-full bg-white/95 px-3 py-1 text-xs text-neutral-700 shadow-md ring-1 ring-black/5">
            {toolHints[session.tool]}
          </p>
        </div>
      </div>
      <section className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 z-20 max-h-[min(42vh,28rem)] w-[min(22rem,calc(100%-1.5rem))] overflow-y-auto rounded-3xl bg-white/95 p-4 shadow-lg ring-1 ring-black/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Zoo map editor</h2>
            <p className="text-xs text-neutral-600">Edits stay in this browser. OpenStreetMap files are not changed.</p>
          </div>
        </div>
        <p className="mt-2 text-xs font-medium text-neutral-800" role="status">
          {session.saveStatus}
        </p>
        {session.message ? <p className="mt-2 text-xs text-neutral-700">{session.message}</p> : null}
        {session.importWarnings.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-neutral-600">
            {session.importWarnings.slice(0, 4).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
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
        {showProperties ? (
          <form
            className="mt-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (session.draftKind) session.saveDraft()
              else session.saveProperties()
            }}
          >
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
              {session.selected ? session.origin : 'New feature'}
              {session.selected ? ` · ${session.vertexCount} vertices` : session.draftPoints.length > 0 ? ` · ${session.draftPoints.length} points` : ''}
            </p>
            {session.pointCoordinate ? (
              <p className="text-xs text-neutral-600 tabular-nums">
                {Number(session.pointCoordinate[1]).toFixed(6)}, {Number(session.pointCoordinate[0]).toFixed(6)} latitude, longitude
              </p>
            ) : null}
            <Field label="Name" value={session.form.name} onChange={(value) => session.updateForm({ name: value })} />
            <label className="block text-xs font-medium text-neutral-700">
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
            <label className="block text-xs font-medium text-neutral-700">
              Description
              <textarea
                value={session.form.description}
                rows={2}
                onChange={(event) => session.updateForm({ description: event.target.value })}
                className={fieldClass}
              />
            </label>
            <Field label="Feature ID" value={session.form.id} onChange={(value) => session.updateForm({ id: value })} />
            <label className="block text-xs font-medium text-neutral-700">
              Source
              <select value={session.form.source} onChange={(event) => session.updateForm({ source: event.target.value })} className={fieldClass}>
                {sourceOptions(session.form.source).map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-neutral-700">
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
            <Field
              label="3D model reference"
              value={session.form.modelReference}
              onChange={(value) => session.updateForm({ modelReference: value })}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" disabled={session.draftKind !== null && !session.draftReady} className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                {session.draftKind ? 'Save feature' : 'Save properties'}
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
                  onClick={() => session.setPendingDelete({ id: session.selected?.properties.id ?? '', label: session.selected?.properties.name || session.selected?.properties.id || 'feature' })}
                  className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700"
                >
                  Delete
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <p className="mt-3 text-xs text-neutral-600">Choose a drawing tool, or use Select to inspect a feature already on the map.</p>
        )}
        <div className="mt-4 space-y-2 border-t border-neutral-200 pt-3">
          <h3 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Data</h3>
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
      </section>
    </>
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
    <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-950">
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
}: {
  label: string
  value: string
  onChange: (value: string) => void
  inputMode?: 'decimal'
}) {
  return (
    <label className="block text-xs font-medium text-neutral-700">
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
  if (active && danger) return 'rounded-full bg-red-700 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white'
  if (active) return 'rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white'
  if (danger) return 'rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap text-red-700'
  return 'rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap text-neutral-800'
}

const fieldClass = 'mt-1 w-full rounded-xl border border-neutral-200 bg-white px-2 py-1.5 text-sm font-normal text-neutral-900 outline-none'
