"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
  GitCompareArrows,
  Hexagon,
  MapPin,
  Phone,
  RefreshCw,
  X,
} from "lucide-react";

import { usePlatform } from "@/components/layout/PlatformContext";
import type { MapViewMode } from "@/components/map/MapCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TechnicalCellId } from "@/components/ui/TechnicalCellId";
import {
  formatZonePrimaryLabel,
  formatZoneSecondaryLabel,
} from "@/lib/location-labels";
import {
  fetchHyderabadPOIs,
  fetchHyderabadSummary,
  fetchHyderabadZoneDetail,
  fetchHyderabadZones,
  type ChoroplethMetricKey,
  type CitySummaryResponse,
  type POIFeature,
  type POIFeatureCollection,
  type ZoneDetailResponse,
  type ZoneMetrics,
  type ZonesFeatureCollection,
} from "@/lib/api";

const MapCanvas = dynamic(
  () => import("@/components/map/MapCanvas").then((mod) => mod.MapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-surface text-xs text-ink-secondary">
        Loading spatial canvas…
      </div>
    ),
  }
);

const CATEGORY_PILLS = [
  { slug: "cafes-coffee-shops", label: "Cafes & Coffee", dot: "bg-cobalt" },
  { slug: "restaurants", label: "Restaurants", dot: "bg-coral" },
  { slug: "food-businesses", label: "All Food & Drink", dot: "bg-orange" },
];

const METRIC_OPTIONS: { key: ChoroplethMetricKey; label: string }[] = [
  { key: "exploration_score", label: "Exploration Score" },
  { key: "cafe_density_per_km2", label: "Cafe Density /km²" },
  { key: "cafe_count", label: "Cafe Count" },
  { key: "food_density_per_km2", label: "Food Density /km²" },
  { key: "restaurant_count", label: "Restaurants" },
];

function ExploreWorkspace() {
  const searchParams = useSearchParams();
  const focusH3Param = searchParams.get("h3");

  const {
    selectedCity,
    selectedCategory,
    selectedCategorySlug,
    setSelectedCategorySlug,
  } = usePlatform();

  const [viewMode, setViewMode] = useState<MapViewMode>("hexagons");
  const [choroplethMetric, setChoroplethMetric] =
    useState<ChoroplethMetricKey>(
      focusH3Param ? "exploration_score" : "cafe_density_per_km2"
    );
  const [focusCoords, setFocusCoords] = useState<[number, number] | null>(null);

  const [summary, setSummary] = useState<CitySummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [poiCollection, setPoiCollection] =
    useState<POIFeatureCollection | null>(null);
  const [poisLoading, setPoisLoading] = useState<boolean>(false);
  const [poisError, setPoisError] = useState<string | null>(null);

  const [zonesCollection, setZonesCollection] =
    useState<ZonesFeatureCollection | null>(null);
  const [zonesLoading, setZonesLoading] = useState<boolean>(true);
  const [zonesError, setZonesError] = useState<string | null>(null);

  const [viewportBbox, setViewportBbox] = useState<
    [number, number, number, number] | null
  >(null);
  const [excludeDisagreements, setExcludeDisagreements] =
    useState<boolean>(false);

  const [selectedPoi, setSelectedPoi] = useState<POIFeature | null>(null);
  const [selectedZone, setSelectedZone] = useState<ZoneMetrics | null>(null);
  const [zoneDetail, setZoneDetail] = useState<ZoneDetailResponse | null>(null);
  const [zoneDetailLoading, setZoneDetailLoading] = useState<boolean>(false);
  const [reloadTick, setReloadTick] = useState<number>(0);

  // Fetch verified Hyderabad summary
  useEffect(() => {
    const controller = new AbortController();
    setSummaryError(null);
    fetchHyderabadSummary(controller.signal)
      .then((data) => setSummary(data))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setSummaryError(
          err instanceof Error ? err.message : "Failed to load city summary"
        );
      });
    return () => controller.abort();
  }, [reloadTick]);

  // Fetch H3 zones (975 clipped hexagons)
  useEffect(() => {
    const controller = new AbortController();
    setZonesLoading(true);
    setZonesError(null);
    fetchHyderabadZones(
      { category: selectedCategorySlug, metric: choroplethMetric, limit: 1000 },
      controller.signal
    )
      .then((data) => {
        setZonesCollection(data);
        setZonesLoading(false);
        if (focusH3Param) {
          const hit = data.features.find((f) => f.id === focusH3Param);
          if (hit) {
            setSelectedZone(hit.properties);
            setFocusCoords([
              hit.properties.centroid_lon,
              hit.properties.centroid_lat,
            ]);
          }
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setZonesError(
          err instanceof Error ? err.message : "Failed to load H3 zones"
        );
        setZonesLoading(false);
      });
    return () => controller.abort();
  }, [selectedCategorySlug, choroplethMetric, reloadTick]);

  // Fetch business POIs when in businesses mode
  useEffect(() => {
    if (viewMode !== "businesses") return;
    const controller = new AbortController();
    setPoisLoading(true);
    setPoisError(null);

    fetchHyderabadPOIs(
      {
        category: selectedCategorySlug,
        bbox: viewportBbox,
        limit: 2000,
        excludeDisagreements:
          selectedCategorySlug === "cafes-coffee-shops" && excludeDisagreements,
      },
      controller.signal
    )
      .then((data) => {
        setPoiCollection(data);
        setPoisLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setPoisError(
          err instanceof Error ? err.message : "Failed to load places"
        );
        setPoisLoading(false);
      });

    return () => controller.abort();
  }, [
    viewMode,
    selectedCategorySlug,
    viewportBbox,
    excludeDisagreements,
    reloadTick,
  ]);

  // Fetch individual H3 zone detail when a hexagon is clicked
  useEffect(() => {
    if (!selectedZone) {
      setZoneDetail(null);
      return;
    }
    const controller = new AbortController();
    setZoneDetailLoading(true);
    fetchHyderabadZoneDetail(selectedZone.h3_index, controller.signal)
      .then((data) => {
        setZoneDetail(data);
        setZoneDetailLoading(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setZoneDetailLoading(false);
      });
    return () => controller.abort();
  }, [selectedZone]);

  useEffect(() => {
    setSelectedPoi(null);
  }, [selectedCategorySlug, viewMode]);

  const handleViewportChange = useCallback(
    (bbox: [number, number, number, number]) => {
      setViewportBbox(bbox);
    },
    []
  );

  const poiFeatures = poiCollection?.features ?? [];
  const zoneFeatures = zonesCollection?.features ?? [];
  const totalPoisInView = poiCollection?.metadata.total_matching ?? 0;
  const returnedPois = poiCollection?.metadata.returned ?? 0;
  const activeError =
    viewMode === "hexagons"
      ? zonesError || summaryError
      : poisError || summaryError;

  return (
    <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_410px]">
      {/* Map-centred primary workspace */}
      <section
        aria-label="Interactive city map"
        className="relative min-h-[60vh] border-b border-borderSubtle lg:min-h-[calc(100vh-3.5rem)] lg:border-b-0 lg:border-r"
      >
        <MapCanvas
          viewport={selectedCity.viewport}
          viewMode={viewMode}
          pois={poiFeatures}
          zones={zoneFeatures}
          choroplethMetric={choroplethMetric}
          selectedPoiId={selectedPoi?.id ?? null}
          selectedZoneId={selectedZone?.h3_index ?? null}
          focusCoords={focusCoords}
          onSelectPoi={setSelectedPoi}
          onSelectZone={setSelectedZone}
          onViewportChange={handleViewportChange}
          isLoadingData={viewMode === "hexagons" ? zonesLoading : poisLoading}
        />

        {/* Top-left floating mode toggle + filters */}
        <div className="pointer-events-none absolute left-4 top-4 flex max-w-[calc(100%-5rem)] flex-col gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            {/* Segmented Mode Toggle: H3 Hexagons vs Businesses */}
            <div className="inline-flex rounded-full border border-borderSubtle bg-elevated/95 p-0.5 shadow-sm backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setViewMode("hexagons")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "hexagons"
                    ? "bg-cobalt text-white"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <Hexagon className="h-3.5 w-3.5" />
                H3 Hexagons
              </button>
              <button
                type="button"
                onClick={() => setViewMode("businesses")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "businesses"
                    ? "bg-cobalt text-white"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <MapPin className="h-3.5 w-3.5" />
                Businesses
              </button>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-full border border-borderSubtle bg-elevated/95 px-3 py-1.5 text-xs text-ink-secondary shadow-sm backdrop-blur-sm">
              <span className="font-mono tabular-nums">
                {viewMode === "hexagons"
                  ? `${zoneFeatures.length.toLocaleString()} H3 res-8 cells`
                  : poisLoading
                    ? "Loading…"
                    : `${returnedPois.toLocaleString()} / ${totalPoisInView.toLocaleString()} in view`}
              </span>
            </div>
          </div>

          {/* Metric selector (Hexagons) OR Category pills (Businesses) */}
          {viewMode === "hexagons" ? (
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
              {METRIC_OPTIONS.map((opt) => {
                const active = choroplethMetric === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setChoroplethMetric(opt.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium shadow-sm transition-colors ${
                      active
                        ? "border-ink-primary bg-ink-primary text-white"
                        : "border-borderSubtle bg-elevated/95 text-ink-secondary hover:text-ink-primary"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
              {CATEGORY_PILLS.map((pill) => {
                const active = selectedCategorySlug === pill.slug;
                return (
                  <button
                    key={pill.slug}
                    type="button"
                    onClick={() => setSelectedCategorySlug(pill.slug)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-sm transition-colors ${
                      active
                        ? "border-cobalt bg-cobalt text-white"
                        : "border-borderSubtle bg-elevated/95 text-ink-secondary hover:text-ink-primary"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        active ? "bg-white" : pill.dot
                      }`}
                    />
                    {pill.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Right-hand editorial inspector & verified summary rail */}
      <aside className="flex flex-col justify-between overflow-y-auto bg-canvas px-6 py-6 lg:max-h-[calc(100vh-3.5rem)]">
        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="green">Overture · Real Data</Badge>
              <Badge tone="cobalt">
                {viewMode === "hexagons" ? "H3 Res-8 Grid" : selectedCategory.name}
              </Badge>
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink-primary">
              {selectedCity.name} Market Explorer
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              {viewMode === "hexagons"
                ? "Click any H3 hexagon to inspect competition density, nearest-cafe spacing, and verified business records."
                : "Click a cluster to zoom in or select any marker to inspect its verified Overture record."}
            </p>
          </div>

          {activeError && (
            <div className="rounded-xl border border-coral/30 bg-coral-soft p-3.5 text-xs text-coral">
              <p className="font-semibold">Unable to load Hyderabad data</p>
              <p className="mt-1 opacity-90">{activeError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReloadTick((t) => t + 1)}
                className="mt-2.5 h-7 text-xs"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            </div>
          )}

          {/* Inspector: Hexagon View */}
          {viewMode === "hexagons" &&
            (selectedZone ? (
              <div className="rounded-xl border border-cobalt/25 bg-elevated p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-cobalt">
                      Selected Area · Hyderabad
                    </p>
                    <h2 className="mt-0.5 text-base font-semibold leading-snug text-ink-primary">
                      {formatZonePrimaryLabel(selectedZone)}
                    </h2>
                    {formatZoneSecondaryLabel(selectedZone) && (
                      <p className="text-xs text-ink-secondary">
                        {formatZoneSecondaryLabel(selectedZone)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedZone(null)}
                    aria-label="Clear hexagon selection"
                    className="rounded-md p-1 text-ink-muted hover:bg-surface hover:text-ink-primary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {selectedZone.low_area_flag && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-orange/30 bg-orange-soft px-2.5 py-2 text-[11px] text-ink-primary">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange" />
                    <span>
                      Low-area boundary sliver ({selectedZone.clipped_area_km2.toFixed(3)} km²,{" "}
                      {selectedZone.area_coverage_pct.toFixed(1)}% coverage).
                      Per-km² densities are suppressed.
                    </span>
                  </div>
                )}

                {selectedZone.exploration_score !== null &&
                  selectedZone.exploration_score !== undefined && (
                    <div className="mt-3 rounded-lg border border-cobalt/20 bg-cobalt-soft/50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-cobalt">
                          Exploratory Screening Score
                        </span>
                        <span className="font-mono text-base font-bold text-cobalt tabular-nums">
                          {selectedZone.exploration_score.toFixed(1)} / 100
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px] tabular-nums">
                        <div>
                          <span className="block font-sans text-[10px] text-ink-secondary">
                            Whitespace
                          </span>
                          <span className="font-semibold text-ink-primary">
                            {selectedZone.competition_whitespace_score?.toFixed(0)}
                          </span>
                        </div>
                        <div>
                          <span className="block font-sans text-[10px] text-ink-secondary">
                            Food Context
                          </span>
                          <span className="font-semibold text-ink-primary">
                            {selectedZone.food_context_score?.toFixed(0)}
                          </span>
                        </div>
                        <div>
                          <span className="block font-sans text-[10px] text-ink-secondary">
                            Reliability
                          </span>
                          <span className="font-semibold text-ink-primary">
                            {selectedZone.data_reliability_score?.toFixed(0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                <dl className="mt-3.5 grid grid-cols-2 gap-3 border-t border-borderSubtle pt-3 text-xs">
                  <div>
                    <dt className="text-ink-muted">Cafes &amp; Coffee</dt>
                    <dd className="mt-0.5 font-mono text-base font-semibold text-cobalt tabular-nums">
                      {selectedZone.cafe_count}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Cafe Density</dt>
                    <dd className="mt-0.5 font-mono text-base font-semibold text-ink-primary tabular-nums">
                      {selectedZone.cafe_density_per_km2 !== null
                        ? `${selectedZone.cafe_density_per_km2.toFixed(1)}/km²`
                        : "Suppressed"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Restaurants</dt>
                    <dd className="mt-0.5 font-mono text-sm font-semibold text-coral tabular-nums">
                      {selectedZone.restaurant_count}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">All Food &amp; Drink</dt>
                    <dd className="mt-0.5 font-mono text-sm font-semibold text-orange tabular-nums">
                      {selectedZone.food_business_count}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Median Nearest Cafe</dt>
                    <dd className="mt-0.5 font-mono text-ink-primary tabular-nums">
                      {selectedZone.median_nearest_cafe_distance_m !== null
                        ? `${Math.round(selectedZone.median_nearest_cafe_distance_m)} m`
                        : "N/A"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Clipped Area</dt>
                    <dd className="mt-0.5 font-mono text-ink-primary tabular-nums">
                      {selectedZone.clipped_area_km2.toFixed(3)} km² (
                      {selectedZone.area_coverage_pct.toFixed(0)}%)
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Median Confidence</dt>
                    <dd className="mt-0.5 font-mono text-ink-primary tabular-nums">
                      {selectedZone.median_confidence !== null
                        ? `${(selectedZone.median_confidence * 100).toFixed(0)}%`
                        : "N/A"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Data Completeness</dt>
                    <dd className="mt-0.5 font-mono text-ink-primary tabular-nums">
                      {selectedZone.data_completeness_pct !== null
                        ? `${selectedZone.data_completeness_pct.toFixed(0)}%`
                        : "N/A"}
                    </dd>
                  </div>
                </dl>

                {/* Cafes inside selected hexagon */}
                <div className="mt-3.5 border-t border-borderSubtle pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">
                    Cafes in Cell ({selectedZone.cafe_count})
                  </p>
                  {zoneDetailLoading ? (
                    <p className="mt-1.5 text-xs text-ink-muted">
                      Loading cell records…
                    </p>
                  ) : zoneDetail && zoneDetail.cafes.length > 0 ? (
                    <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto pr-1 text-xs">
                      {zoneDetail.cafes.slice(0, 12).map((cafe) => (
                        <li
                          key={cafe.overture_id}
                          className="flex items-center justify-between gap-2 rounded-md bg-surface/70 px-2 py-1"
                        >
                          <span className="truncate font-medium text-ink-primary">
                            {cafe.primary_name || "Unnamed cafe"}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-ink-secondary tabular-nums">
                            {cafe.confidence !== null
                              ? `${(cafe.confidence * 100).toFixed(0)}%`
                              : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-xs text-ink-muted">
                      No cafes recorded in this hexagon.
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button asChild variant="primary" size="sm" className="flex-1">
                    <Link
                      href={`/compare?zone_ids=${encodeURIComponent(
                        selectedZone.h3_index
                      )}`}
                    >
                      <GitCompareArrows className="h-3.5 w-3.5" />
                      Compare This Area
                    </Link>
                  </Button>
                </div>

                <div className="mt-3 border-t border-borderSubtle pt-2.5">
                  <TechnicalCellId
                    h3Index={selectedZone.h3_index}
                    label="Technical ID (H3 Res-8)"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-borderSubtle bg-surface/60 px-4 py-3 text-xs text-ink-secondary">
                Select any H3 hexagon on the map to inspect verified cafe
                density, nearest-cafe spacing, and completeness metrics.
              </div>
            ))}

          {/* Inspector: Businesses View */}
          {viewMode === "businesses" &&
            (selectedPoi ? (
              <div className="rounded-xl border border-cobalt/25 bg-elevated p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-cobalt">
                      Selected Place
                    </p>
                    <h2 className="mt-1 text-base font-semibold leading-snug text-ink-primary">
                      {selectedPoi.properties.primary_name || "Unnamed place"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPoi(null)}
                    aria-label="Clear selection"
                    className="rounded-md p-1 text-ink-muted hover:bg-surface hover:text-ink-primary"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {selectedPoi.properties.basic_category && (
                    <Badge tone="cobalt">
                      {selectedPoi.properties.basic_category}
                    </Badge>
                  )}
                  {selectedPoi.properties.taxonomy_primary &&
                    selectedPoi.properties.taxonomy_primary !==
                      selectedPoi.properties.basic_category && (
                      <Badge tone="lavender">
                        {selectedPoi.properties.taxonomy_primary}
                      </Badge>
                    )}
                  {selectedPoi.properties.confidence !== null && (
                    <Badge tone="green" className="font-mono tabular-nums">
                      Conf {(selectedPoi.properties.confidence * 100).toFixed(0)}%
                    </Badge>
                  )}
                </div>

                {selectedPoi.properties.classification_disagreement && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-orange/30 bg-orange-soft px-2.5 py-2 text-[11px] text-ink-primary">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange" />
                    <span>
                      Classification disagreement:{" "}
                      <span className="font-mono">
                        {selectedPoi.properties.classification_disagreement_note}
                      </span>
                    </span>
                  </div>
                )}

                <dl className="mt-4 space-y-2 border-t border-borderSubtle pt-3 text-xs">
                  <div>
                    <dt className="text-ink-muted">Address</dt>
                    <dd className="mt-0.5 text-ink-primary">
                      {selectedPoi.properties.address || "Not provided in source"}
                      {selectedPoi.properties.locality
                        ? ` · ${selectedPoi.properties.locality}`
                        : ""}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-muted">Coordinates</dt>
                    <dd className="font-mono text-ink-secondary tabular-nums">
                      {selectedPoi.geometry.coordinates[1].toFixed(5)}°N,{" "}
                      {selectedPoi.geometry.coordinates[0].toFixed(5)}°E
                    </dd>
                  </div>
                </dl>

                {(selectedPoi.properties.website ||
                  selectedPoi.properties.phone) && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-borderSubtle pt-3 text-xs">
                    {selectedPoi.properties.website && (
                      <a
                        href={selectedPoi.properties.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-cobalt hover:underline"
                      >
                        Website
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {selectedPoi.properties.phone && (
                      <span className="inline-flex items-center gap-1 font-mono text-ink-secondary tabular-nums">
                        <Phone className="h-3 w-3 text-ink-muted" />
                        {selectedPoi.properties.phone}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-borderSubtle bg-surface/60 px-4 py-3 text-xs text-ink-secondary">
                Select a business marker on the map to inspect its name,
                taxonomy, address, and confidence score.
              </div>
            ))}

          {viewMode === "businesses" &&
            selectedCategorySlug === "cafes-coffee-shops" &&
            summary && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-borderSubtle bg-elevated px-3.5 py-2.5 text-xs">
                <input
                  type="checkbox"
                  checked={excludeDisagreements}
                  onChange={(e) => setExcludeDisagreements(e.target.checked)}
                  className="mt-0.5 rounded border-borderSubtle text-cobalt focus:ring-cobalt"
                />
                <span className="leading-relaxed text-ink-secondary">
                  Exclude{" "}
                  <span className="font-mono font-medium text-ink-primary">
                    {summary.data_coverage.cafe_classification_disagreements}
                  </span>{" "}
                  flagged{" "}
                  <span className="font-mono text-ink-primary">
                    internet_cafe
                  </span>{" "}
                  disagreements
                </span>
              </label>
            )}

          <hr className="border-borderSubtle" />

          {/* Verified Dataset Summary */}
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">
              Verified Hyderabad Dataset Counts
            </p>
            {summary ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <div>
                  <dt className="text-xs text-ink-secondary">Total Places</dt>
                  <dd className="font-mono text-base font-semibold text-ink-primary tabular-nums">
                    {summary.total_places.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-secondary">
                    Cafes &amp; Coffee
                  </dt>
                  <dd className="font-mono text-base font-semibold text-cobalt tabular-nums">
                    {summary.cafes_coffee_shops_count.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-secondary">Restaurants</dt>
                  <dd className="font-mono text-base font-semibold text-coral tabular-nums">
                    {summary.restaurant_count.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-secondary">
                    All Food &amp; Drink
                  </dt>
                  <dd className="font-mono text-base font-semibold text-orange tabular-nums">
                    {summary.food_business_count.toLocaleString()}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-ink-muted">Loading summary…</p>
            )}

            <p className="pt-1 text-[11px] leading-relaxed text-ink-muted">
              H3 cells reference the Jan 2018 historical OSM GHMC boundary.
              Counts measure observed competitor presence, not demand or revenue.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3 border-t border-borderSubtle pt-4">
          <Button asChild variant="secondary" size="sm" className="flex-1">
            <Link href="/discover">
              Discover Candidates
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/compare">Compare</Link>
          </Button>
        </div>
      </aside>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-surface text-xs text-ink-secondary">
          Loading Hyderabad Explorer…
        </div>
      }
    >
      <ExploreWorkspace />
    </Suspense>
  );
}
