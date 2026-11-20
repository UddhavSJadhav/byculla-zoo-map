import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { IllustratedMap } from "@/components/IllustratedMap";
import { LocationPanel } from "@/components/LocationPanel";
import { MapSwitcher, type MapMode } from "@/components/MapSwitcher";
import { StreetMap } from "@/components/StreetMap";
import { zoo } from "@/data/zoo";
import { useGeolocation } from "@/hooks/useGeolocation";

export function HomePage() {
  const {
    phase,
    position,
    message,
    isTracking,
    fixCount,
    requestLocation,
    stopTracking,
  } = useGeolocation();
  const [mapMode, setMapMode] = useState<MapMode>("explore");
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [awaitingFirstFix, setAwaitingFirstFix] = useState(false);
  const fixCountAtStart = useRef(0);
  const centeredFixCount = useRef(0);

  useEffect(() => {
    if (!awaitingFirstFix || !position || fixCount <= fixCountAtStart.current)
      return;
    if (centeredFixCount.current === fixCount) return;

    centeredFixCount.current = fixCount;
    setAwaitingFirstFix(false);
    setFocusRequestId((current) => current + 1);
  }, [awaitingFirstFix, fixCount, position]);

  const handleFindLocation = () => {
    fixCountAtStart.current = fixCount;
    setAwaitingFirstFix(true);
    requestLocation();
  };

  const handleStopTracking = () => {
    setAwaitingFirstFix(false);
    stopTracking();
  };

  const handleRecenter = () => {
    if (!position) return;
    setFocusRequestId((current) => current + 1);
  };

  return (
    <AppShell
      title={zoo.name}
      toolbar={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <MapSwitcher value={mapMode} onChange={setMapMode} />
          <a
            href="#/map-v2"
            className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-md ring-1 ring-black/5"
          >
            Map V2
          </a>
          {import.meta.env.DEV ? (
            <a
              href="#/calibrate"
              className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-md ring-1 ring-black/5"
            >
              Calibrate
            </a>
          ) : null}
        </div>
      }
      map={
        <div className="relative h-full w-full">
          <div
            className={mapLayerClass(mapMode === "explore")}
            aria-hidden={mapMode !== "explore"}
          >
            <IllustratedMap isTracking={isTracking} />
          </div>
          <div
            className={mapLayerClass(mapMode === "street")}
            aria-hidden={mapMode !== "street"}
          >
            <StreetMap position={position} focusRequestId={focusRequestId} />
          </div>
        </div>
      }
      panel={
        <LocationPanel
          phase={phase}
          message={message}
          position={position}
          isTracking={isTracking}
          onFindLocation={handleFindLocation}
          onRecenter={handleRecenter}
          onStopTracking={handleStopTracking}
        />
      }
    />
  );
}

function mapLayerClass(active: boolean): string {
  return active
    ? "absolute inset-0 z-10 opacity-100 transition-opacity duration-200"
    : "absolute inset-0 z-0 opacity-0 pointer-events-none transition-opacity duration-200";
}
