"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
} from "maplibre-gl";
import { Compass, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_HYDERABAD_VIEWPORT,
  type ChoroplethMetricKey,
  type MapViewport,
  type POIFeature,
  type ZoneGeoJSONFeature,
  type ZoneMetrics,
} from "@/lib/api";
import {
  formatZonePrimaryLabel,
  formatZoneSecondaryLabel,
} from "@/lib/location-labels";

export type MapViewMode = "businesses" | "hexagons";

interface MapCanvasProps {
  viewport?: MapViewport;
  viewMode?: MapViewMode;
  pois?: POIFeature[];
  zones?: ZoneGeoJSONFeature[];
  choroplethMetric?: ChoroplethMetricKey;
  selectedPoiId?: string | null;
  selectedZoneId?: string | null;
  focusCoords?: [number, number] | null;
  onSelectPoi?: (poi: POIFeature | null) => void;
  onSelectZone?: (zone: ZoneMetrics | null) => void;
  onViewportChange?: (bbox: [number, number, number, number]) => void;
  isLoadingData?: boolean;
  className?: string;
}

const DEFAULT_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
  "https://tiles.openfreemap.org/styles/positron";

const POIS_SOURCE_ID = "intelis-pois";
const CLUSTERS_LAYER_ID = "intelis-clusters";
const CLUSTER_COUNT_LAYER_ID = "intelis-cluster-count";
const POINTS_LAYER_ID = "intelis-unclustered-points";
const SELECTED_POI_LAYER_ID = "intelis-selected-point";

const ZONES_SOURCE_ID = "intelis-h3-zones";
const ZONES_FILL_LAYER_ID = "intelis-h3-fill";
const ZONES_OUTLINE_LAYER_ID = "intelis-h3-outline";
const ZONES_SELECTED_LAYER_ID = "intelis-h3-selected";

const METRIC_SCALES: Record<
  ChoroplethMetricKey,
  {
    label: string;
    unit: string;
    stops: [number, string][];
  }
> = {
  exploration_score: {
    label: "Exploratory Screening Score",
    unit: "0–100",
    stops: [
      [25, "#e7f6f0"],
      [45, "#a7e3cc"],
      [60, "#49bf95"],
      [70, "#1b9a6b"],
      [75, "#1e4fd8"],
    ],
  },
  cafe_density_per_km2: {
    label: "Cafe Density",
    unit: "/ km²",
    stops: [
      [0.01, "#e9effd"],
      [2, "#bdd2fa"],
      [6, "#5b86f2"],
      [12, "#1e4fd8"],
      [20, "#eb5e47"],
    ],
  },
  cafe_count: {
    label: "Cafe Count",
    unit: "places",
    stops: [
      [1, "#e9effd"],
      [3, "#bdd2fa"],
      [6, "#5b86f2"],
      [10, "#1e4fd8"],
      [15, "#eb5e47"],
    ],
  },
  food_density_per_km2: {
    label: "Food Density",
    unit: "/ km²",
    stops: [
      [0.01, "#fef2e6"],
      [10, "#fcd6b0"],
      [30, "#f5a55d"],
      [60, "#f28c28"],
      [100, "#eb5e47"],
    ],
  },
  restaurant_count: {
    label: "Restaurants",
    unit: "places",
    stops: [
      [1, "#fdece9"],
      [5, "#f9c5bc"],
      [15, "#f39282"],
      [30, "#eb5e47"],
      [50, "#b93822"],
    ],
  },
};

function buildChoroplethFillExpression(
  metric: ChoroplethMetricKey
): ExpressionSpecification {
  const scale = METRIC_SCALES[metric];
  const stepExpr: unknown[] = ["step", ["coalesce", ["get", metric], -1], "#f3efe8"];
  for (const [threshold, color] of scale.stops) {
    stepExpr.push(threshold, color);
  }

  return [
    "case",
    ["==", ["typeof", ["get", metric]], "number"],
    stepExpr,
    "#e6e0d6",
  ] as unknown as ExpressionSpecification;
}

export function MapCanvas({
  viewport = DEFAULT_HYDERABAD_VIEWPORT,
  viewMode = "hexagons",
  pois = [],
  zones = [],
  choroplethMetric = "cafe_density_per_km2",
  selectedPoiId = null,
  selectedZoneId = null,
  focusCoords = null,
  onSelectPoi,
  onSelectZone,
  onViewportChange,
  isLoadingData = false,
  className = "",
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const poisByIdRef = useRef<Record<string, POIFeature>>({});
  const zonesByIdRef = useRef<Record<string, ZoneMetrics>>({});
  const onSelectPoiRef = useRef(onSelectPoi);
  const onSelectZoneRef = useRef(onSelectZone);
  const onViewportChangeRef = useRef(onViewportChange);
  const viewModeRef = useRef(viewMode);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [cursorCoords, setCursorCoords] = useState<[number, number] | null>(
    null
  );
  const [hoveredZone, setHoveredZone] = useState<{
    zone: ZoneMetrics;
    x: number;
    y: number;
  } | null>(null);

  onSelectPoiRef.current = onSelectPoi;
  onSelectZoneRef.current = onSelectZone;
  onViewportChangeRef.current = onViewportChange;
  viewModeRef.current = viewMode;

  useEffect(() => {
    const mapLookup: Record<string, POIFeature> = {};
    for (const poi of pois) mapLookup[poi.id] = poi;
    poisByIdRef.current = mapLookup;
  }, [pois]);

  useEffect(() => {
    const zLookup: Record<string, ZoneMetrics> = {};
    for (const z of zones) zLookup[z.id] = z.properties;
    zonesByIdRef.current = zLookup;
  }, [zones]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: MapLibreMap;
    try {
      setWorkerUrl("/maplibre-gl-worker.mjs");
      map = new MapLibreMap({
        container: containerRef.current,
        style: DEFAULT_STYLE_URL,
        center: viewport.center,
        zoom: viewport.zoom,
        attributionControl: { compact: true },
      });
    } catch (err) {
      setMapError(
        err instanceof Error
          ? err.message
          : "WebGL map context could not be initialised."
      );
      return;
    }

    map.addControl(
      new NavigationControl({ showCompass: true }),
      "top-right"
    );
    map.addControl(
      new ScaleControl({ maxWidth: 100, unit: "metric" }),
      "bottom-left"
    );

    const emitBounds = () => {
      const bounds = map.getBounds();
      onViewportChangeRef.current?.([
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ]);
    };

    map.on("load", () => {
      // 1. H3 Hexagon Choropleth Source & Layers
      map.addSource(ZONES_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: ZONES_FILL_LAYER_ID,
        type: "fill",
        source: ZONES_SOURCE_ID,
        paint: {
          "fill-color": buildChoroplethFillExpression(choroplethMetric),
          "fill-opacity": 0.68,
        },
      });

      map.addLayer({
        id: ZONES_OUTLINE_LAYER_ID,
        type: "line",
        source: ZONES_SOURCE_ID,
        paint: {
          "line-color": "#ffffff",
          "line-width": 0.9,
          "line-opacity": 0.85,
        },
      });

      map.addLayer({
        id: ZONES_SELECTED_LAYER_ID,
        type: "line",
        source: ZONES_SOURCE_ID,
        filter: ["==", ["get", "h3_index"], ""],
        paint: {
          "line-color": "#181a1f",
          "line-width": 2.6,
        },
      });

      // 2. Business POIs Clustered Source & Layers
      map.addSource(POIS_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 46,
      });

      map.addLayer({
        id: CLUSTERS_LAYER_ID,
        type: "circle",
        source: POIS_SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#1e4fd8",
            15,
            "#f28c28",
            50,
            "#eb5e47",
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            16,
            15,
            21,
            50,
            26,
          ],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.92,
        },
      });

      map.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: "symbol",
        source: POIS_SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: POINTS_LAYER_ID,
        type: "circle",
        source: POIS_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            4.5,
            14,
            6.5,
            16,
            8,
          ],
          "circle-color": [
            "match",
            ["get", "basic_category"],
            "cafe",
            "#1e4fd8",
            "coffee_shop",
            "#f28c28",
            "restaurant",
            "#eb5e47",
            "#7e6df2",
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.addLayer({
        id: SELECTED_POI_LAYER_ID,
        type: "circle",
        source: POIS_SOURCE_ID,
        filter: ["==", ["get", "overture_id"], ""],
        paint: {
          "circle-radius": 11,
          "circle-color": "rgba(30, 79, 216, 0.18)",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#1e4fd8",
        },
      });

      // Interactions
      map.on("click", CLUSTERS_LAYER_ID, async (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: [CLUSTERS_LAYER_ID],
        });
        const clusterId = features[0]?.properties?.cluster_id;
        if (clusterId === undefined) return;
        const source = map.getSource(POIS_SOURCE_ID) as GeoJSONSource | undefined;
        if (!source) return;
        try {
          const zoom = await source.getClusterExpansionZoom(Number(clusterId));
          const geom = features[0].geometry;
          if (geom.type === "Point") {
            map.easeTo({
              center: geom.coordinates as [number, number],
              zoom: zoom + 0.5,
              duration: 450,
            });
          }
        } catch {
          // ignore
        }
      });

      map.on("click", POINTS_LAYER_ID, (e) => {
        const feat = e.features?.[0];
        const overtureId = feat?.properties?.overture_id;
        if (typeof overtureId === "string" && poisByIdRef.current[overtureId]) {
          onSelectPoiRef.current?.(poisByIdRef.current[overtureId]);
        }
      });

      map.on("click", ZONES_FILL_LAYER_ID, (e) => {
        if (viewModeRef.current !== "hexagons") return;
        const feat = e.features?.[0];
        const h3Index = feat?.properties?.h3_index;
        if (typeof h3Index === "string" && zonesByIdRef.current[h3Index]) {
          onSelectZoneRef.current?.(zonesByIdRef.current[h3Index]);
        }
      });

      for (const layerId of [
        CLUSTERS_LAYER_ID,
        POINTS_LAYER_ID,
        ZONES_FILL_LAYER_ID,
      ]) {
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
          if (layerId === ZONES_FILL_LAYER_ID) {
            setHoveredZone(null);
          }
        });
      }

      map.on("mousemove", ZONES_FILL_LAYER_ID, (e) => {
        if (viewModeRef.current !== "hexagons") {
          setHoveredZone(null);
          return;
        }
        const h3Index = e.features?.[0]?.properties?.h3_index;
        if (typeof h3Index === "string" && zonesByIdRef.current[h3Index]) {
          setHoveredZone({
            zone: zonesByIdRef.current[h3Index],
            x: e.point.x,
            y: e.point.y,
          });
        }
      });

      setMapReady(true);
      emitBounds();
    });

    let moveTimer: ReturnType<typeof setTimeout> | null = null;
    map.on("moveend", () => {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(emitBounds, 250);
    });

    map.on("mousemove", (event) => {
      setCursorCoords([event.lngLat.lng, event.lngLat.lat]);
    });

    map.on("error", (event) => {
      if (event.error && !mapReady) {
        setMapError("Basemap tiles could not be loaded. Check network access.");
      }
    });

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      if (moveTimer) clearTimeout(moveTimer);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle layer visibility between Businesses and Hexagons views
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const poiVis = viewMode === "businesses" ? "visible" : "none";
    const zoneVis = viewMode === "hexagons" ? "visible" : "none";

    for (const id of [
      CLUSTERS_LAYER_ID,
      CLUSTER_COUNT_LAYER_ID,
      POINTS_LAYER_ID,
      SELECTED_POI_LAYER_ID,
    ]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", poiVis);
    }

    for (const id of [
      ZONES_FILL_LAYER_ID,
      ZONES_OUTLINE_LAYER_ID,
      ZONES_SELECTED_LAYER_ID,
    ]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", zoneVis);
    }
  }, [viewMode, mapReady]);

  // Update POI GeoJSON data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(POIS_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: "FeatureCollection",
      features: pois.map((poi) => ({
        type: "Feature",
        id: poi.id,
        geometry: poi.geometry,
        properties: {
          overture_id: poi.properties.overture_id,
          primary_name: poi.properties.primary_name ?? "Unnamed place",
          basic_category: poi.properties.basic_category ?? "unclassified",
        },
      })),
    });
  }, [pois, mapReady]);

  // Update H3 Zones GeoJSON data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource(ZONES_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    source.setData({
      type: "FeatureCollection",
      features: zones.map((z) => ({
        type: "Feature",
        id: z.id,
        geometry: z.geometry,
        properties: { ...z.properties },
      })),
    });
  }, [zones, mapReady]);

  // Update choropleth color expression when metric changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer(ZONES_FILL_LAYER_ID)) return;
    map.setPaintProperty(
      ZONES_FILL_LAYER_ID,
      "fill-color",
      buildChoroplethFillExpression(choroplethMetric)
    );
  }, [choroplethMetric, mapReady]);

  // Update selected marker / zone filters
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer(SELECTED_POI_LAYER_ID)) {
      map.setFilter(SELECTED_POI_LAYER_ID, [
        "==",
        ["get", "overture_id"],
        selectedPoiId ?? "",
      ]);
    }
    if (map.getLayer(ZONES_SELECTED_LAYER_ID)) {
      map.setFilter(ZONES_SELECTED_LAYER_ID, [
        "==",
        ["get", "h3_index"],
        selectedZoneId ?? "",
      ]);
    }
  }, [selectedPoiId, selectedZoneId, mapReady]);

  // Fly to focused coordinates when requested (e.g. from Shortlist -> Open on Map)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !focusCoords) return;
    map.flyTo({
      center: focusCoords,
      zoom: 13.8,
      duration: 700,
    });
  }, [focusCoords, mapReady]);

  const handleResetView = () => {
    mapRef.current?.flyTo({
      center: viewport.center,
      zoom: viewport.zoom,
      duration: 500,
    });
  };

  const activeScale = METRIC_SCALES[choroplethMetric];

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-surface ${className}`}
    >
      <div ref={containerRef} className="h-full w-full" />

      {!mapReady && !mapError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/80 backdrop-blur-[1px]">
          <div className="flex items-center gap-2.5 rounded-full border border-borderSubtle bg-elevated px-4 py-2 text-xs font-medium text-ink-secondary shadow-sm">
            <Compass className="h-4 w-4 animate-spin text-cobalt" />
            <span>Initialising Hyderabad spatial canvas…</span>
          </div>
        </div>
      )}

      {mapReady && isLoadingData && (
        <div className="pointer-events-none absolute right-14 top-4">
          <div className="flex items-center gap-2 rounded-full border border-borderSubtle bg-elevated/95 px-3 py-1.5 text-xs font-medium text-ink-secondary shadow-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cobalt" />
            <span>Loading layer…</span>
          </div>
        </div>
      )}

      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface p-6">
          <div className="max-w-sm rounded-xl border border-borderSubtle bg-elevated p-5 text-center shadow-sm">
            <p className="text-sm font-semibold text-ink-primary">
              Map canvas unavailable
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">
              {mapError}
            </p>
          </div>
        </div>
      )}

      {/* Human-readable hover tooltip for H3 hexagons */}
      {viewMode === "hexagons" && hoveredZone && (
        <div
          className="pointer-events-none absolute z-20 max-w-[230px] rounded-xl border border-borderSubtle bg-elevated/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm"
          style={{
            left: Math.min(hoveredZone.x + 14, 520),
            top: Math.max(hoveredZone.y - 12, 12),
          }}
        >
          <p className="font-semibold text-ink-primary">
            {formatZonePrimaryLabel(hoveredZone.zone)}
          </p>
          {formatZoneSecondaryLabel(hoveredZone.zone) && (
            <p className="text-[11px] text-ink-secondary">
              {formatZoneSecondaryLabel(hoveredZone.zone)}
            </p>
          )}
          <p className="mt-1 font-mono text-[11px] text-cobalt tabular-nums">
            {choroplethMetric === "exploration_score"
              ? hoveredZone.zone.exploration_score !== null &&
                hoveredZone.zone.exploration_score !== undefined
                ? `Score ${hoveredZone.zone.exploration_score.toFixed(1)} / 100`
                : "Not scored (low area / sparse)"
              : choroplethMetric === "cafe_density_per_km2"
                ? hoveredZone.zone.cafe_density_per_km2 !== null
                  ? `${hoveredZone.zone.cafe_density_per_km2.toFixed(1)} cafes / km²`
                  : "Density suppressed (<0.15 km²)"
                : choroplethMetric === "food_density_per_km2"
                  ? hoveredZone.zone.food_density_per_km2 !== null
                    ? `${hoveredZone.zone.food_density_per_km2.toFixed(1)} food / km²`
                    : "Density suppressed (<0.15 km²)"
                  : choroplethMetric === "cafe_count"
                    ? `${hoveredZone.zone.cafe_count} cafes`
                    : `${hoveredZone.zone.restaurant_count} restaurants`}
          </p>
        </div>
      )}

      {/* Choropleth Legend (Hexagon view) */}
      {viewMode === "hexagons" && mapReady && (
        <div className="pointer-events-auto absolute bottom-10 left-3 rounded-xl border border-borderSubtle bg-elevated/95 px-3 py-2.5 shadow-sm backdrop-blur-sm">
          <p className="text-[11px] font-semibold text-ink-primary">
            {activeScale.label}{" "}
            <span className="font-normal text-ink-secondary">
              ({activeScale.unit})
            </span>
          </p>
          <div className="mt-1.5 flex items-center gap-1">
            <span
              className="h-2.5 w-5 rounded-sm border border-borderSubtle"
              style={{ backgroundColor: "#f3efe8" }}
              title="0"
            />
            {activeScale.stops.map(([val, color]) => (
              <span
                key={val}
                className="h-2.5 w-5 rounded-sm"
                style={{ backgroundColor: color }}
                title={`>= ${val}`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-muted tabular-nums">
            <span>0</span>
            <span>{activeScale.stops[2][0]}</span>
            <span>{activeScale.stops[4][0]}+</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-ink-secondary">
            <span
              className="h-2.5 w-2.5 rounded-sm border border-borderSubtle"
              style={{ backgroundColor: "#e6e0d6" }}
            />
            <span>Low-area sliver (&lt;0.15 km², suppressed)</span>
          </div>
        </div>
      )}

      {/* Subtle floating reset control & live coordinates */}
      <div className="pointer-events-none absolute bottom-10 right-3 flex items-center gap-2">
        {cursorCoords && (
          <div className="hidden rounded-lg border border-borderSubtle bg-elevated/95 px-2.5 py-1 font-mono text-[11px] text-ink-secondary shadow-sm tabular-nums sm:block">
            {cursorCoords[1].toFixed(4)}°N, {cursorCoords[0].toFixed(4)}°E
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleResetView}
          className="pointer-events-auto h-7 gap-1.5 px-2.5 text-xs shadow-sm"
          title="Recentre on Hyderabad"
        >
          <RotateCcw className="h-3.5 w-3.5 text-cobalt" />
          <span>Recentre</span>
        </Button>
      </div>
    </div>
  );
}
