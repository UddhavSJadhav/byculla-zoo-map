import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  GeographicCalibrationMarkers,
  IllustratedCalibrationMarkers,
} from "@/components/CalibrationMarkers";
import {
  CalibrationInspectionPanel,
  type PendingPointPosition,
} from "@/components/CalibrationInspectionPanel";
import { CalibrationPointList } from "@/components/CalibrationPointList";
import { CalibrationPointSelector } from "@/components/CalibrationPointSelector";
import { IllustratedMap } from "@/components/IllustratedMap";
import { MapClickHandler } from "@/components/MapClickHandler";
import { MapSwitcher, type MapMode } from "@/components/MapSwitcher";
import { StreetMap } from "@/components/StreetMap";
import { useCalibration } from "@/hooks/useCalibration";
import type { CalibrationPoint, PixelPoint } from "@/types/calibration";

const fitPadding = {
  topLeft: [12, 150] as [number, number],
  bottomRight: [12, 320] as [number, number],
};

export function CalibrationPage() {
  const [mapMode, setMapMode] = useState<MapMode>("street");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingPointPosition | null>(
    null
  );
  const {
    points,
    draft,
    assessment,
    setDraftName,
    setDraftGeographic,
    setDraftPixel,
    addPoint,
    renamePoint,
    deletePoint,
    updatePointPosition,
    clearAll,
  } = useCalibration();
  const selectedId =
    selectedPointId && points.some((point) => point.id === selectedPointId)
      ? selectedPointId
      : null;
  const activePending =
    pendingEdit && points.some((point) => point.id === pendingEdit.id)
      ? pendingEdit
      : null;
  const draftPixel =
    draft.imageX != null && draft.imageY != null
      ? { x: draft.imageX, y: draft.imageY }
      : null;
  const pendingPoint = activePending
    ? points.find((point) => point.id === activePending.id)
    : undefined;
  const pendingGeographic =
    activePending &&
    pendingPoint &&
    (activePending.latitude !== pendingPoint.latitude ||
      activePending.longitude !== pendingPoint.longitude)
      ? { latitude: activePending.latitude, longitude: activePending.longitude }
      : null;
  const pendingPixel =
    activePending &&
    pendingPoint &&
    (activePending.imageX !== pendingPoint.imageX ||
      activePending.imageY !== pendingPoint.imageY)
      ? { x: activePending.imageX, y: activePending.imageY }
      : null;
  const canClear =
    points.length > 0 ||
    draft.name.length > 0 ||
    draft.latitude != null ||
    draft.imageX != null;

  const selectPoint = (id: string) => {
    setSelectedPointId(id);
    setPendingEdit((current) =>
      current && current.id !== id ? null : current
    );
  };

  const startAdjust = (point: CalibrationPoint) => {
    setSelectedPointId(point.id);
    setPendingEdit({
      id: point.id,
      latitude: point.latitude,
      longitude: point.longitude,
      imageX: point.imageX,
      imageY: point.imageY,
    });
  };

  const savePositions = () => {
    if (!activePending) return;
    updatePointPosition(activePending.id, activePending);
    setPendingEdit(null);
  };

  const onStreetClick = (latitude: number, longitude: number) => {
    if (activePending) {
      setPendingEdit({ ...activePending, latitude, longitude });
      return;
    }
    setDraftGeographic(latitude, longitude);
  };

  const onImageClick = (pixel: PixelPoint) => {
    if (activePending) {
      setPendingEdit({ ...activePending, imageX: pixel.x, imageY: pixel.y });
      return;
    }
    setDraftPixel(pixel);
  };

  return (
    <AppShell
      className="calibration-page"
      panelClassName="max-w-5xl"
      title="Map calibration"
      toolbar={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <MapSwitcher value={mapMode} onChange={setMapMode} />
          <a
            href="/"
            className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-md ring-1 ring-black/5"
          >
            Visitor map
          </a>
        </div>
      }
      map={
        <div className="relative h-full w-full">
          <div
            className={mapLayerClass(mapMode === "explore")}
            aria-hidden={mapMode !== "explore"}
          >
            <IllustratedMap
              isTracking={false}
              selecting
              fitPadding={fitPadding}
              onImageClick={onImageClick}
            >
              {(size) => (
                <IllustratedCalibrationMarkers
                  imageHeight={size.height}
                  points={points}
                  draftPixel={draftPixel}
                  residuals={
                    assessment.status === "ready" ? assessment.residuals : []
                  }
                  selectedPointId={selectedId}
                  pendingPixel={pendingPixel}
                />
              )}
            </IllustratedMap>
          </div>
          <div
            className={mapLayerClass(mapMode === "street")}
            aria-hidden={mapMode !== "street"}
          >
            <StreetMap position={null} focusRequestId={0} selecting>
              <MapClickHandler onClick={onStreetClick} />
              <GeographicCalibrationMarkers
                points={points}
                draft={draft}
                selectedPointId={selectedId}
                pending={pendingGeographic}
              />
            </StreetMap>
          </div>
        </div>
      }
      panel={
        <div className="max-h-[42vh] space-y-3 overflow-y-auto rounded-3xl bg-white/95 p-4 shadow-lg ring-1 ring-black/5">
          <p className="text-xs leading-5 text-neutral-500">
            Developer tool. Added landmarks are stored in this browser. GPS
            position is not drawn on the illustration.
          </p>
          <CalibrationInspectionPanel
            points={points}
            assessment={assessment}
            selectedPointId={selectedId}
            pendingEdit={activePending}
            onSelect={selectPoint}
            onStartAdjust={startAdjust}
            onCancelAdjust={() => setPendingEdit(null)}
            onSavePositions={savePositions}
          />
          <CalibrationPointSelector
            draft={draft}
            mapMode={mapMode}
            adjusting={activePending != null}
            onNameChange={setDraftName}
            onAdd={addPoint}
          />
          <CalibrationPointList
            points={points}
            assessment={assessment}
            onRename={renamePoint}
            onDelete={deletePoint}
            onClear={clearAll}
            canClear={canClear}
          />
        </div>
      }
    />
  );
}

function mapLayerClass(active: boolean): string {
  return active
    ? "absolute inset-0 z-10 opacity-100 transition-opacity duration-200"
    : "absolute inset-0 z-0 opacity-0 pointer-events-none transition-opacity duration-200";
}
