import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
} from "geojson";
import type { GeoJSONSource, LayerSpecification, Map } from "maplibre-gl";
import type { PathRecord } from "@/paths/types";

export const pathAccessLayerIds = [
  "path-access-casing",
  "path-access-accessible",
  "path-access-restricted",
  "path-access-unverified",
  "path-access-selected",
] as const;

const osmPathLayerIds = ["zoo-paths-casing", "zoo-paths"] as const;

const lineWidth = [
  "interpolate",
  ["linear"],
  ["zoom"],
  15,
  ["case", ["==", ["get", "highway"], "service"], 1.6, 2.8],
  18,
  ["case", ["==", ["get", "highway"], "service"], 5, 11],
  20,
  ["case", ["==", ["get", "highway"], "service"], 8, 18],
] as const;

export function syncPathAccess(
  map: Map,
  paths: readonly PathRecord[],
  options: {
    visitor: boolean;
    selectedId: string | null;
    visible: boolean;
    editing: boolean;
  }
) {
  const data = collectionFor(paths, options.visitor, options.selectedId);
  if (!map.getSource("path-access")) {
    map.addSource("path-access", { type: "geojson", data });
    const before = map.getLayer("zoo-buildings") ? "zoo-buildings" : undefined;
    for (const layer of pathAccessLayers) map.addLayer(layer, before);
  } else {
    const source = map.getSource("path-access");
    if (source && source.type === "geojson")
      (source as GeoJSONSource).setData(data);
  }
  const showOsm = options.visible && options.editing;
  const showAccess = options.visible && !options.editing;
  for (const id of osmPathLayerIds) {
    if (map.getLayer(id))
      map.setLayoutProperty(id, "visibility", showOsm ? "visible" : "none");
  }
  for (const id of pathAccessLayerIds) {
    if (map.getLayer(id))
      map.setLayoutProperty(id, "visibility", showAccess ? "visible" : "none");
  }
}

function collectionFor(
  paths: readonly PathRecord[],
  visitor: boolean,
  selectedId: string | null
): FeatureCollection<Geometry, GeoJsonProperties> {
  const features: Feature<Geometry, GeoJsonProperties>[] = [];
  for (const path of paths) {
    if (visitor && path.status !== "accessible") continue;
    features.push({
      type: "Feature",
      id: path.osmFeatureId,
      geometry: path.geometry,
      properties: {
        osmFeatureId: path.osmFeatureId,
        sourceId: path.sourceId,
        highway: path.highway,
        status: path.status,
        selected: path.osmFeatureId === selectedId ? "yes" : "no",
      },
    });
  }
  return { type: "FeatureCollection", features };
}

const pathAccessLayers = [
  {
    id: "path-access-casing",
    type: "line",
    source: "path-access",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": [
        "match",
        ["get", "status"],
        "accessible",
        "#e5e7eb",
        "restricted",
        "#f3d0c4",
        "#f6e2c4",
      ],
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        15,
        4.2,
        18,
        12,
        20,
        18,
      ],
    },
  },
  {
    id: "path-access-accessible",
    type: "line",
    source: "path-access",
    filter: ["==", ["get", "status"], "accessible"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#9ca3af", "line-width": lineWidth },
  },
  {
    id: "path-access-restricted",
    type: "line",
    source: "path-access",
    filter: ["==", ["get", "status"], "restricted"],
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": "#9a3412",
      "line-width": lineWidth,
      "line-dasharray": [1.1, 1.4],
    },
  },
  {
    id: "path-access-unverified",
    type: "line",
    source: "path-access",
    filter: ["==", ["get", "status"], "unverified"],
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": "#b86a1a",
      "line-width": lineWidth,
      "line-dasharray": [0.45, 1.15],
    },
  },
  {
    id: "path-access-selected",
    type: "line",
    source: "path-access",
    filter: ["==", ["get", "selected"], "yes"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#1e3a5f",
      "line-width": ["interpolate", ["linear"], ["zoom"], 15, 4, 18, 8, 20, 12],
      "line-opacity": 0.85,
    },
  },
] as LayerSpecification[];
