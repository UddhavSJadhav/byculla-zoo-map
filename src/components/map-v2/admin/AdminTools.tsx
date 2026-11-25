import { lazy, Suspense } from 'react'
import type { Map } from 'maplibre-gl'
import type { MapLayerId } from '@/types/map-v2'
import type { GeoPosition } from '@/types/geolocation'
import { AdminDataPanel } from '@/components/map-v2/admin/AdminDataPanel'

const AttractionAdmin = lazy(() => import('@/components/map-v2/attractions/AttractionAdmin').then((module) => ({ default: module.AttractionAdmin })))
const EntranceLayer = lazy(() => import('@/components/map-v2/entrances/EntranceLayer').then((module) => ({ default: module.EntranceLayer })))
const PathAdmin = lazy(() => import('@/components/map-v2/paths/PathAdmin').then((module) => ({ default: module.PathAdmin })))
const MapEditor = lazy(() => import('@/components/map-v2/editor/MapEditor').then((module) => ({ default: module.MapEditor })))

export function AdminTools({
  map,
  managingAttractions,
  managingPaths,
  editing,
  selectedPathId,
  onSelectPath,
  onEditMap,
  layers,
  onToggleLayer,
  locate,
  locating,
  message,
  phase,
  position,
  baselineError,
}: {
  map: Map | null
  managingAttractions: boolean
  managingPaths: boolean
  editing: boolean
  selectedPathId: string | null
  onSelectPath: (id: string | null) => void
  onEditMap: () => void
  layers: Record<MapLayerId, boolean>
  onToggleLayer: (id: MapLayerId) => void
  locate: () => void
  locating: boolean
  message: string
  phase: string
  position: GeoPosition | null
  baselineError: string | null
}) {
  return (
    <Suspense fallback={null}>
      <EntranceLayer map={map} active={managingAttractions} placingEnabled={!editing} />
      {managingPaths ? <PathAdmin map={map} selectedId={selectedPathId} editing={editing} onSelect={onSelectPath} /> : null}
      {managingAttractions ? <AttractionAdmin docked={editing} onEditMap={onEditMap} /> : null}
      <MapEditor map={map} editing={editing} />
      <AdminDataPanel
        layers={layers}
        onToggleLayer={onToggleLayer}
        locate={locate}
        locating={locating}
        message={message}
        phase={phase}
        position={position}
        baselineError={baselineError}
      />
    </Suspense>
  )
}
