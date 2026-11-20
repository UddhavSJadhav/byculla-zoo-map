import type { ReactNode } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { MapCamera } from "@/components/MapCamera";
import { UserLocationMarker } from "@/components/UserLocationMarker";
import { zoo } from "@/data/zoo";
import type { GeoPosition } from "@/types/geolocation";

const OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

interface StreetMapProps {
  position: GeoPosition | null;
  focusRequestId: number;
  selecting?: boolean;
  children?: ReactNode;
}

export function StreetMap({
  position,
  focusRequestId,
  selecting = false,
  children,
}: StreetMapProps) {
  return (
    <MapContainer
      center={[zoo.center.latitude, zoo.center.longitude]}
      zoom={zoo.defaultZoom}
      scrollWheelZoom
      className={
        selecting ? "calibration-select h-full w-full" : "h-full w-full"
      }
    >
      <TileLayer
        attribution={OSM_ATTRIBUTION}
        url={OSM_TILE_URL}
        maxZoom={19}
      />
      <MapCamera position={position} focusRequestId={focusRequestId} />
      {position ? <UserLocationMarker position={position} /> : null}
      {children}
    </MapContainer>
  );
}
