import { useEffect, useRef, useState } from 'react'
import type { Map, MapLayerMouseEvent, MapLayerTouchEvent, MapMouseEvent } from 'maplibre-gl'
import { categoriesFor, osmRecord } from '@/map-v2/editor/catalog'
import {
  adoptFeature,
  buildManualFeature,
  clearEditorDocument,
  collectionOf,
  composeAdded,
  composeLayer,
  deleteFromDocument,
  downloadJson,
  emptyEditorDocument,
  emptyForm,
  featureId,
  formFromFeature,
  formsEqual,
  idConflict,
  loadEditorDocument,
  normalizeDocument,
  resolveFeature,
  restoreOriginal,
  saveEditorDocument,
  visibleFeatures,
  applyForm,
} from '@/map-v2/editor/document'
import {
  geometryWithVertices,
  insertVertex,
  lineGeometry,
  outerVertices,
  pointGeometry,
  polygonGeometry,
  validateGeometry,
  validatePoints,
  type LngLat,
} from '@/map-v2/editor/geometry'
import { paintMap, selectableLayerIds, vertexFeatures } from '@/map-v2/editor/render'
import {
  assignAttractionGeometry,
  attractionIdFromFeature,
  featureIdForAttraction,
  getAttraction,
  getMappingRequest,
  subscribeAttractionMapping,
  subscribeAttractions,
  toEditorFeature,
} from '@/attractions/store'
import {
  editorCategories,
  type DrawGeometry,
  type EditorCategory,
  type EditorDocument,
  type EditorFeature,
  type EditorTool,
  type FeatureFormValues,
} from '@/map-v2/editor/types'
import type { MapLayerId } from '@/types/map-v2'

interface PendingDelete {
  id: string
  label: string
}

interface DragState {
  id: string
  vertexIndex: number
  origin: EditorFeature
}

const datasetOptions: { id: MapLayerId | 'added'; label: string }[] = [
  { id: 'paths', label: 'Walking paths' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'gardens', label: 'Gardens' },
  { id: 'enclosures', label: 'Animal enclosures' },
  { id: 'trees', label: 'Trees' },
  { id: 'attractions', label: 'Attractions' },
  { id: 'water', label: 'Water' },
  { id: 'boundary', label: 'Zoo boundary' },
  { id: 'added', label: 'Entrances, facilities, and added points' },
]

function toolGeometry(tool: EditorTool): DrawGeometry | null {
  if (tool === 'path') return 'LineString'
  if (tool === 'polygon') return 'Polygon'
  if (tool === 'point') return 'Point'
  return null
}

function defaultCategory(tool: EditorTool): EditorCategory {
  if (tool === 'polygon') return 'animal-enclosure'
  if (tool === 'point') return 'tree'
  return 'walking-path'
}

function featureLabel(feature: EditorFeature): string {
  return feature.properties.name?.trim() || feature.properties.id || 'Unnamed feature'
}

function resolveEditorFeature(source: EditorDocument, id: string | null): EditorFeature | null {
  if (!id) return null
  const attractionId = attractionIdFromFeature(id)
  if (!attractionId) return resolveFeature(source, id)
  const attraction = getAttraction(attractionId)
  return attraction ? toEditorFeature(attraction) : null
}

export function useEditorSession(map: Map | null, editing: boolean) {
  const [tool, setTool] = useState<EditorTool>('select')
  const [document, setDocument] = useState<EditorDocument>(loadEditorDocument)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [initialForm] = useState(() => emptyForm('walking-path'))
  const [form, setForm] = useState(initialForm)
  const [baseline, setBaseline] = useState(initialForm)
  const [draftPoints, setDraftPoints] = useState<LngLat[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [pendingReset, setPendingReset] = useState(false)
  const [pendingImport, setPendingImport] = useState<EditorDocument | null>(null)
  const [importWarnings, setImportWarnings] = useState<string[]>([])
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [activeVertex, setActiveVertex] = useState<number | null>(null)
  const [dataset, setDataset] = useState<MapLayerId | 'added'>('paths')
  const [mappingAttractionId, setMappingAttractionId] = useState<string | null>(null)
  const [appliedMapToken, setAppliedMapToken] = useState(0)
  const [attractionRevision, setAttractionRevision] = useState(0)
  const [mappingTick, setMappingTick] = useState(0)

  const documentRef = useRef(document)
  const draftRef = useRef(draftPoints)
  const previewRef = useRef<EditorFeature | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)
  const mapRef = useRef(map)
  const vertexPanLockRef = useRef(false)
  const spacePanRef = useRef(false)
  const editingRef = useRef(editing)
  const toolRef = useRef(tool)
  const selectedIdRef = useRef(selectedId)
  const activeVertexRef = useRef(activeVertex)
  const formRef = useRef(form)
  const baselineRef = useRef(baseline)
  const mappingIdRef = useRef<string | null>(null)

  const pendingMap = editing ? getMappingRequest() : null
  if (pendingMap && pendingMap.token !== appliedMapToken) {
    const nextTool: EditorTool = pendingMap.mode === 'edit' ? 'edit' : pendingMap.mode
    const values = emptyForm(defaultCategory(nextTool))
    setAppliedMapToken(pendingMap.token)
    setTool(nextTool)
    setMappingAttractionId(pendingMap.attractionId)
    setDraftPoints([])
    setPendingDelete(null)
    if (pendingMap.mode === 'edit') setSelectedId(featureIdForAttraction(pendingMap.attractionId))
    else {
      setSelectedId(null)
      setForm(values)
      setBaseline(values)
    }
  }
  void mappingTick

  const dirty = !formsEqual(form, baseline)
  const selected = resolveEditorFeature(document, selectedId)
  const mappingAttraction = mappingAttractionId ? getAttraction(mappingAttractionId) : null
  const selectedAttractionId = selected ? attractionIdFromFeature(selected.properties.id) : null
  const selectedAttraction = selectedAttractionId ? getAttraction(selectedAttractionId) : null
  const draftKind = toolGeometry(tool)
  const drawing = draftKind !== null && draftPoints.length > 0

  const paint = () => {
    const currentMap = mapRef.current
    if (!currentMap) return
    const currentId = selectedIdRef.current
    const selection = resolveEditorFeature(documentRef.current, currentId)
    try {
      paintMap(currentMap, {
        document: documentRef.current,
        preview: previewRef.current,
        draftKind: toolGeometry(toolRef.current),
        draftPoints: draftRef.current,
        selection,
        showVertices: editingRef.current && toolRef.current === 'edit' && selection !== null,
        activeVertex: activeVertexRef.current,
        editing: editingRef.current,
      })
    } catch {
      // The map can be removed while a pointer event is still finishing.
    }
  }

  const commit = (next: EditorDocument, status: string | null = null) => {
    try {
      saveEditorDocument(next)
    } catch {
      setMessage('Could not store the edit in this browser.')
      return
    }
    documentRef.current = next
    setDocument(next)
    setSavedAt(Date.now())
    if (status) setMessage(status)
    paint()
  }

  const select = (id: string | null) => {
    setSelectedId(id)
    selectedIdRef.current = id
    setActiveVertex(null)
    activeVertexRef.current = null
    setPendingDelete(null)
    if (!id) return
    const feature = resolveEditorFeature(documentRef.current, id)
    if (!feature) return
    const values = formFromFeature(feature)
    setForm(values)
    setBaseline(values)
    formRef.current = values
    baselineRef.current = values
    paint()
  }

  const saveDraft = () => {
    const kind = toolGeometry(toolRef.current)
    const points = draftRef.current
    if (!kind) return
    const geometryError = validatePoints(kind, points)
    if (geometryError) {
      setMessage(geometryError)
      return
    }
    const geometry = kind === 'Point' ? pointGeometry(points[0]) : kind === 'LineString' ? lineGeometry(points) : polygonGeometry(points)
    const mappingId = mappingIdRef.current
    if (mappingId) {
      if (geometry.type !== 'Point' && geometry.type !== 'Polygon') {
        setMessage('This attraction needs a point or a polygon.')
        return
      }
      const geometryError = assignAttractionGeometry(mappingId, geometry)
      if (geometryError) {
        setMessage(geometryError)
        return
      }
      draftRef.current = []
      setDraftPoints([])
      mappingIdRef.current = null
      setMappingAttractionId(null)
      setTool('select')
      toolRef.current = 'select'
      select(featureIdForAttraction(mappingId))
      const saved = getAttraction(mappingId)
      setMessage(saved ? `Saved the shape for ${saved.exhibitNumber}. ${saved.name}.` : 'Saved the attraction shape locally.')
      return
    }
    const built = buildManualFeature(formRef.current, geometry)
    if ('error' in built) {
      setMessage(built.error)
      return
    }
    const conflict = idConflict(documentRef.current, built.feature.properties.id, '')
    if (conflict) {
      setMessage(conflict)
      return
    }
    commit(adoptFeature(documentRef.current, built.feature))
    draftRef.current = []
    setDraftPoints([])
    select(built.feature.properties.id)
    setTool('select')
    toolRef.current = 'select'
    setMessage('Saved locally.')
  }

  const saveProperties = () => {
    if (!selectedIdRef.current) return
    if (attractionIdFromFeature(selectedIdRef.current)) {
      setMessage('Change this exhibit in Attractions. The shape stays with the attraction.')
      return
    }
    const current = resolveEditorFeature(documentRef.current, selectedIdRef.current)
    if (!current) return
    const nextId = formRef.current.id.trim()
    const conflict = idConflict(documentRef.current, nextId, current.properties.id)
    if (conflict) {
      setMessage(conflict)
      return
    }
    const adopted = adoptFeature(documentRef.current, current)
    const stored = adopted.features.find((feature) => featureId(feature) === current.properties.id) ?? current
    const applied = applyForm(stored, formRef.current)
    if ('error' in applied) {
      setMessage(applied.error)
      return
    }
    const features = adopted.features.filter((feature) => featureId(feature) !== current.properties.id)
    commit({ ...adopted, features: [...features, applied.feature] })
    select(applied.feature.properties.id)
    setMessage('Saved locally.')
  }

  const addPoint = (point: LngLat) => {
    const kind = toolGeometry(toolRef.current)
    if (!kind) return
    const next = kind === 'Point' ? [point] : [...draftRef.current, point]
    draftRef.current = next
    setDraftPoints(next)
    setMessage(null)
    paint()
  }

  const requestDelete = (id: string) => {
    const feature = resolveEditorFeature(documentRef.current, id)
    if (!feature) return
    if (dirty && id !== selectedIdRef.current) {
      setMessage('Save or revert properties before deleting another feature.')
      return
    }
    select(id)
    setPendingDelete({ id, label: featureLabel(feature) })
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    const attractionId = attractionIdFromFeature(pendingDelete.id)
    if (attractionId) {
      assignAttractionGeometry(attractionId, null)
      setPendingDelete(null)
      setSelectedId(null)
      selectedIdRef.current = null
      setMessage('Removed the shape from this attraction. The exhibit stays in the inventory.')
      paint()
      return
    }
    const next = deleteFromDocument(documentRef.current, pendingDelete.id)
    setPendingDelete(null)
    setSelectedId(null)
    selectedIdRef.current = null
    commit(next, 'Deleted from the local map. The OpenStreetMap file was not changed.')
  }

  const finishDrag = () => {
    const drag = dragRef.current
    const preview = previewRef.current
    dragRef.current = null
    previewRef.current = null
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
    const currentMap = mapRef.current
    if (vertexPanLockRef.current && currentMap) {
      vertexPanLockRef.current = false
      try {
        currentMap.dragPan.enable()
      } catch {
        // The map may already be gone.
      }
    }
    if (!drag || !preview) return
    const draggedAttractionId = attractionIdFromFeature(drag.id)
    if (draggedAttractionId) {
      const sameShape = JSON.stringify(drag.origin.geometry) === JSON.stringify(preview.geometry)
      if (sameShape) {
        paint()
        return
      }
      if (preview.geometry.type !== 'Point' && preview.geometry.type !== 'Polygon') {
        setMessage('Use a point or a polygon for an attraction.')
        paint()
        return
      }
      const geometryError = assignAttractionGeometry(draggedAttractionId, preview.geometry)
      setMessage(geometryError ?? 'Saved the attraction shape locally.')
      paint()
      return
    }
    const unchanged = JSON.stringify(drag.origin.geometry) === JSON.stringify(preview.geometry)
    const stored = documentRef.current.features.some((feature) => featureId(feature) === drag.id)
    if (unchanged && !stored) {
      paint()
      return
    }
    const geometryError = validateGeometry(preview.geometry)
    if (geometryError) {
      setMessage(geometryError)
      paint()
      return
    }
    commit(adoptFeature(documentRef.current, preview), 'Saved locally.')
  }

  const commandsRef = useRef({ addPoint, saveDraft, select, requestDelete, finishDrag, saveProperties })

  useEffect(() => {
    documentRef.current = document
    draftRef.current = draftPoints
    mapRef.current = map
    editingRef.current = editing
    toolRef.current = tool
    selectedIdRef.current = selectedId
    activeVertexRef.current = activeVertex
    formRef.current = form
    baselineRef.current = baseline
    mappingIdRef.current = mappingAttractionId
    commandsRef.current = { addPoint, saveDraft, select, requestDelete, finishDrag, saveProperties }
  })

  useEffect(() => {
    paint()
  }, [map, editing, document, selectedId, draftPoints, tool, activeVertex, attractionRevision])

  useEffect(() => subscribeAttractions(() => setAttractionRevision((current) => current + 1)), [])
  useEffect(() => subscribeAttractionMapping(() => setMappingTick((current) => current + 1)), [])

  useEffect(() => {
    if (!map) return
    const canvas = map.getCanvas()
    const drawingTool = editing && (tool === 'path' || tool === 'polygon' || tool === 'point')
    canvas.style.cursor = drawingTool ? 'crosshair' : ''
    if (drawingTool) {
      map.doubleClickZoom.disable()
      map.boxZoom.disable()
      if (!spacePanRef.current) map.dragPan.disable()
    } else {
      map.doubleClickZoom.enable()
      map.boxZoom.enable()
      map.dragPan.enable()
    }
    return () => {
      canvas.style.cursor = ''
      try {
        map.doubleClickZoom.enable()
        map.boxZoom.enable()
        map.dragPan.enable()
      } catch {
        // The map may already be gone.
      }
    }
  }, [map, editing, tool])

  useEffect(() => {
    if (!map || !editing) return

    const clickedFeatureId = (event: MapMouseEvent) => {
      const layers = selectableLayerIds.filter((id) => map.getLayer(id))
      if (layers.length === 0) return null
      const found = map.queryRenderedFeatures(event.point, { layers })
      for (const feature of found) {
        const id = feature.properties && typeof feature.properties.id === 'string' ? feature.properties.id : ''
        if (id) return id
      }
      return null
    }

    const onClick = (event: MapMouseEvent) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      const currentTool = toolRef.current
      if (currentTool === 'path' || currentTool === 'polygon' || currentTool === 'point') {
        if (spacePanRef.current) return
        commandsRef.current.addPoint([event.lngLat.lng, event.lngLat.lat])
        return
      }
      const id = clickedFeatureId(event)
      if (currentTool === 'delete') {
        if (id) commandsRef.current.requestDelete(id)
        return
      }
      if (!id) {
        if (formsEqual(formRef.current, baselineRef.current)) commandsRef.current.select(null)
        else setMessage('Save or revert properties before clearing the selection.')
        return
      }
      if (!formsEqual(formRef.current, baselineRef.current) && id !== selectedIdRef.current) {
        setMessage('Save or revert properties before selecting another feature.')
        return
      }
      commandsRef.current.select(id)
    }

    const onDoubleClick = (event: MapMouseEvent) => {
      const currentTool = toolRef.current
      if (currentTool !== 'path' && currentTool !== 'polygon' && currentTool !== 'point') return
      event.preventDefault()
      if (currentTool === 'point') {
        commandsRef.current.saveDraft()
        return
      }
      // The second click of this double-click already added a vertex. Drop it, and drop
      // another when the first click landed on the previous vertex.
      const points = draftRef.current
      if (points.length > 0) {
        const trimmed = points.slice(0, -1)
        draftRef.current = trimmed
        setDraftPoints(trimmed)
      }
      const remaining = draftRef.current
      if (remaining.length >= 2) {
        const last = map.project(remaining[remaining.length - 1])
        const previous = map.project(remaining[remaining.length - 2])
        const dx = last.x - previous.x
        const dy = last.y - previous.y
        if (dx * dx + dy * dy <= 64) {
          const trimmed = remaining.slice(0, -1)
          draftRef.current = trimmed
          setDraftPoints(trimmed)
        }
      }
      commandsRef.current.saveDraft()
    }

    const onVertexDown = (event: MapLayerMouseEvent | MapLayerTouchEvent) => {
      if (toolRef.current !== 'edit') return
      event.preventDefault()
      const properties = event.features?.[0]?.properties
      const selected = resolveEditorFeature(documentRef.current, selectedIdRef.current)
      if (dragRef.current || !selected || !properties) return
      const vertexIndex = Number(properties.vertexIndex)
      if (!Number.isInteger(vertexIndex)) return
      let geometry = selected.geometry
      if (properties.kind === 'midpoint') {
        const vertices = outerVertices(geometry)
        const nextVertices = vertices ? insertVertex(vertices, vertexIndex, [event.lngLat.lng, event.lngLat.lat]) : null
        const inserted = nextVertices ? geometryWithVertices(geometry, nextVertices) : null
        if (!inserted) return
        geometry = inserted
      }
      suppressClickRef.current = true
      vertexPanLockRef.current = true
      map.dragPan.disable()
      const preview: EditorFeature = { ...selected, geometry }
      dragRef.current = { id: selected.properties.id, vertexIndex, origin: selected }
      previewRef.current = preview
      activeVertexRef.current = vertexIndex
      setActiveVertex(vertexIndex)
      paint()
    }

    const onMove = (event: MapMouseEvent) => {
      const drag = dragRef.current
      const preview = previewRef.current
      if (!drag || !preview) return
      const vertices = outerVertices(preview.geometry)
      if (!vertices || !vertices[drag.vertexIndex]) return
      vertices[drag.vertexIndex] = [event.lngLat.lng, event.lngLat.lat]
      const geometry = geometryWithVertices(preview.geometry, vertices)
      if (!geometry) return
      previewRef.current = { ...preview, geometry }
      paint()
    }

    const drawingToolActive = () => toolRef.current === 'path' || toolRef.current === 'polygon' || toolRef.current === 'point'

    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
      if (event.code === 'Space' && drawingToolActive() && !typing) {
        event.preventDefault()
        if (!event.repeat) {
          spacePanRef.current = true
          map.dragPan.enable()
          map.getCanvas().style.cursor = 'grab'
        }
        return
      }
      if (typing) return
      if (event.key === 'Enter' && drawingToolActive()) {
        event.preventDefault()
        commandsRef.current.saveDraft()
      }
      if (event.key === 'Backspace' && (toolRef.current === 'path' || toolRef.current === 'polygon')) {
        event.preventDefault()
        const next = draftRef.current.slice(0, -1)
        draftRef.current = next
        setDraftPoints(next)
        paint()
      }
      if (event.key === 'Escape') {
        if (draftRef.current.length > 0 || mappingIdRef.current) {
          draftRef.current = []
          setDraftPoints([])
          mappingIdRef.current = null
          setMappingAttractionId(null)
          setMessage('Drawing cancelled.')
          paint()
          return
        }
        if (formsEqual(formRef.current, baselineRef.current)) commandsRef.current.select(null)
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !spacePanRef.current) return
      spacePanRef.current = false
      if (!drawingToolActive()) return
      map.dragPan.disable()
      map.getCanvas().style.cursor = 'crosshair'
    }

    const onPointerUp = () => commandsRef.current.finishDrag()

    map.on('click', onClick)
    map.on('dblclick', onDoubleClick)
    map.on('mousedown', 'editor-vertices', onVertexDown)
    map.on('touchstart', 'editor-vertices', onVertexDown)
    map.on('mousemove', onMove)
    map.on('mouseup', onPointerUp)
    window.addEventListener('mouseup', onPointerUp)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      map.off('click', onClick)
      map.off('dblclick', onDoubleClick)
      map.off('mousedown', 'editor-vertices', onVertexDown)
      map.off('touchstart', 'editor-vertices', onVertexDown)
      map.off('mousemove', onMove)
      map.off('mouseup', onPointerUp)
      window.removeEventListener('mouseup', onPointerUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      dragRef.current = null
      previewRef.current = null
      vertexPanLockRef.current = false
      spacePanRef.current = false
      try {
        map.dragPan.enable()
      } catch {
        // The map may already be gone.
      }
    }
  }, [map, editing])

  const chooseTool = (next: EditorTool) => {
    if (draftRef.current.length > 0 && next !== tool) {
      draftRef.current = []
      setDraftPoints([])
      setMessage('Drawing cancelled.')
    }
    mappingIdRef.current = null
    setMappingAttractionId(null)
    setTool(next)
    toolRef.current = next
    setPendingDelete(null)
    if (next === 'path' || next === 'polygon' || next === 'point') {
      const values = emptyForm(defaultCategory(next))
      setSelectedId(null)
      selectedIdRef.current = null
      setForm(values)
      setBaseline(values)
      formRef.current = values
      baselineRef.current = values
    }
    paint()
  }

  const updateForm = (patch: Partial<FeatureFormValues>) => {
    setForm((current) => {
      const next = { ...current, ...patch }
      formRef.current = next
      return next
    })
  }

  const revertForm = () => {
    setForm(baseline)
    formRef.current = baseline
    setMessage(null)
  }

  const cancelDrawing = () => {
    draftRef.current = []
    setDraftPoints([])
    mappingIdRef.current = null
    setMappingAttractionId(null)
    setMessage('Drawing cancelled.')
    paint()
  }

  const removeActiveVertex = () => {
    if (!selected || activeVertex === null) return
    const vertices = outerVertices(selected.geometry)
    if (!vertices) return
    const nextVertices = vertices.filter((_, index) => index !== activeVertex)
    const geometry = geometryWithVertices(selected.geometry, nextVertices)
    if (!geometry) {
      setMessage('That vertex cannot be removed.')
      return
    }
    const geometryError = validateGeometry(geometry)
    if (geometryError) {
      setMessage(geometryError)
      return
    }
    setActiveVertex(null)
    activeVertexRef.current = null
    const attractionId = attractionIdFromFeature(selected.properties.id)
    if (attractionId) {
      if (geometry.type !== 'Point' && geometry.type !== 'Polygon') {
        setMessage('Use a point or a polygon for an attraction.')
        return
      }
      const savedError = assignAttractionGeometry(attractionId, geometry)
      setMessage(savedError ?? 'Saved the attraction shape locally.')
      paint()
      return
    }
    commit(adoptFeature(documentRef.current, { ...selected, geometry }), 'Saved locally.')
  }

  const applyImported = (imported: EditorDocument, warnings: string[]) => {
    setPendingImport(null)
    setImportWarnings(warnings)
    setSelectedId(null)
    selectedIdRef.current = null
    draftRef.current = []
    setDraftPoints([])
    commit(imported, `Imported ${imported.features.length} feature${imported.features.length === 1 ? '' : 's'}.`)
  }

  const importText = (text: string) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setMessage('That file is not valid JSON.')
      return
    }
    const result = normalizeDocument(parsed)
    if (result.document.features.length === 0 && result.document.hiddenIds.length === 0) {
      setMessage(result.warnings[0] ?? 'Nothing in that file could be imported.')
      return
    }
    const hasEdits = documentRef.current.features.length > 0 || documentRef.current.hiddenIds.length > 0
    if (hasEdits) {
      setPendingImport(result.document)
      setImportWarnings(result.warnings)
      return
    }
    applyImported(result.document, result.warnings)
  }

  const confirmReset = () => {
    clearEditorDocument()
    const next = emptyEditorDocument()
    documentRef.current = next
    setDocument(next)
    setPendingReset(false)
    setSelectedId(null)
    selectedIdRef.current = null
    draftRef.current = []
    setDraftPoints([])
    setSavedAt(null)
    setMessage('Manual edits were removed. The map is showing the OpenStreetMap data again.')
    paint()
  }

  const downloadEdits = () => downloadJson('byculla-zoo-edits.geojson', document)
  const downloadMap = () => downloadJson('byculla-zoo-edited.geojson', collectionOf(visibleFeatures(document)))
  const downloadDataset = () => {
    if (dataset === 'added') {
      downloadJson('byculla-zoo-added.geojson', composeAdded(document, null))
      return
    }
    downloadJson(`byculla-zoo-${dataset}.geojson`, composeLayer(dataset, document, null))
  }

  const geometry = selected?.geometry.type ?? draftKind
  const categoryChoices = editorCategories.filter((category) => {
    if (!geometry || geometry === 'GeometryCollection' || geometry === 'MultiPoint' || geometry === 'MultiLineString' || geometry === 'MultiPolygon') {
      return category.id === form.category
    }
    return (category.geometries as readonly string[]).includes(geometry) || category.id === form.category
  })

  const origin = !selected
    ? null
    : selected.properties.editorOrigin === 'manual'
      ? 'Manual feature'
      : selected.properties.editorOrigin === 'modified'
        ? 'Local copy of an OpenStreetMap feature'
        : 'OpenStreetMap feature'

  const saveStatus = drawing
    ? 'Drawing is not saved yet'
    : document.features.length === 0 && document.hiddenIds.length === 0
      ? 'No manual edits'
      : `Saved locally${savedAt ? ` at ${new Date(savedAt).toLocaleTimeString()}` : ''} · ${document.features.length} edited`

  const draftReady = draftKind ? validatePoints(draftKind, draftPoints) === null : false
  const pointCoordinate = selected?.geometry.type === 'Point' ? selected.geometry.coordinates : draftKind === 'Point' ? draftPoints[0] : null

  return {
    tool,
    chooseTool,
    form,
    updateForm,
    dirty,
    selected,
    mappingAttraction,
    selectedAttraction,
    origin,
    draftPoints,
    draftKind,
    draftReady,
    message,
    saveStatus,
    pendingDelete,
    setPendingDelete,
    confirmDelete,
    pendingReset,
    setPendingReset,
    confirmReset,
    pendingImport,
    setPendingImport,
    importWarnings,
    confirmImport: () => {
      if (pendingImport) applyImported(pendingImport, importWarnings)
    },
    categoryChoices,
    activeVertex,
    dataset,
    setDataset,
    datasetOptions,
    pointCoordinate,
    saveDraft,
    saveProperties,
    revertForm,
    cancelDrawing,
    removeActiveVertex,
    importText,
    downloadEdits,
    downloadMap,
    downloadDataset,
    restoreSelected: () => {
      if (!selectedId) return
      const next = restoreOriginal(documentRef.current, selectedId)
      setSelectedId(null)
      selectedIdRef.current = null
      commit(next, 'Restored the OpenStreetMap feature.')
    },
    canRestore: Boolean(selected?.properties.replacesSourceId),
    vertexCount: selected ? vertexFeatures(selected.geometry, null).filter((feature) => feature.properties?.kind === 'vertex').length : draftPoints.length,
    categoriesFor,
    osmBacked: selected ? Boolean(osmRecord(selected.properties.id) || selected.properties.replacesSourceId) : false,
  }
}
