"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type * as echarts from "echarts";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Compass,
  GitCompareArrows,
  HelpCircle,
  Plus,
  Scale,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { EChartContainer } from "@/components/charts/EChartContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TechnicalCellId } from "@/components/ui/TechnicalCellId";
import {
  fetchHyderabadCompare,
  fetchHyderabadOpportunityDetail,
  fetchHyderabadZones,
  type OpportunityScoreBreakdown,
  type ZoneMetrics,
  type ZonesCompareResponse,
} from "@/lib/api";
import {
  buildDisambiguatedZoneLabels,
  formatZonePrimaryLabel,
  formatZoneSecondaryLabel,
} from "@/lib/location-labels";

const STORAGE_KEY = "intelis_founder_checklist_v1";

const FOUNDER_CHECKLIST_ITEMS = [
  { id: "footfall", label: "Morning & evening on-site pedestrian audit (8–11am & 4–8pm)" },
  { id: "informal", label: "Check unlisted tea stalls, bakeries & informal kiosks" },
  { id: "rent", label: "Survey actual commercial rent per sq. ft. & lease terms" },
  { id: "access", label: "Verify street frontage, 2-wheeler & car parking accessibility" },
  { id: "permits", label: "Confirm GHMC trade license, fire NOC & FSSAI feasibility" },
  { id: "unit_econ", label: "Model daily ticket volume required to cover fixed overheads" },
];

function CompareWorkspace() {
  const searchParams = useSearchParams();
  const initialParam = searchParams.get("zone_ids") || "";

  const [allZones, setAllZones] = useState<ZoneMetrics[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    initialParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3)
  );
  const [pickerValue, setPickerValue] = useState<string>("");
  const [compareData, setCompareData] = useState<ZonesCompareResponse | null>(
    null
  );
  const [scoreById, setScoreById] = useState<
    Record<string, OpportunityScoreBreakdown>
  >({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Per-location checklist items marked complete with localStorage persistence
  const [checklistState, setChecklistState] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [showChecklistSection, setShowChecklistSection] = useState(true);

  // Hydrate checklist from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setChecklistState(JSON.parse(saved));
      }
    } catch {}
  }, []);

  const toggleCheck = (h3Index: string, itemId: string) => {
    setChecklistState((prev) => {
      const next = {
        ...prev,
        [h3Index]: {
          ...(prev[h3Index] ?? {}),
          [itemId]: !prev[h3Index]?.[itemId],
        },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Load ranked H3 zones for selection
  useEffect(() => {
    const controller = new AbortController();
    fetchHyderabadZones(
      { metric: "cafe_density_per_km2", limit: 1000 },
      controller.signal
    )
      .then((data) => {
        const metrics = data.features.map((f) => f.properties);
        setAllZones(metrics);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Fetch comparison data when selectedIds changes
  useEffect(() => {
    if (selectedIds.length === 0) {
      setCompareData(null);
      setScoreById({});
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchHyderabadCompare(selectedIds, controller.signal)
      .then((res) => {
        setCompareData(res);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to compare selected zones"
        );
        setLoading(false);
      });

    // Also fetch individual opportunity detail for each cell
    selectedIds.forEach((id) => {
      fetchHyderabadOpportunityDetail(id, undefined, controller.signal)
        .then((detail) => {
          setScoreById((prev) => ({ ...prev, [id]: detail.candidate }));
        })
        .catch(() => {});
    });

    return () => controller.abort();
  }, [selectedIds]);

  const addZone = (h3Index: string) => {
    if (!h3Index || selectedIds.includes(h3Index) || selectedIds.length >= 3) {
      return;
    }
    const next = [...selectedIds, h3Index];
    setSelectedIds(next);
    setPickerValue("");
    window.history.replaceState(
      null,
      "",
      `/compare?zone_ids=${encodeURIComponent(next.join(","))}`
    );
  };

  const removeZone = (h3Index: string) => {
    const next = selectedIds.filter((id) => id !== h3Index);
    setSelectedIds(next);
    window.history.replaceState(
      null,
      "",
      next.length > 0
        ? `/compare?zone_ids=${encodeURIComponent(next.join(","))}`
        : "/compare"
    );
  };

  const disambiguatedLabels = useMemo(() => {
    const zonesToLabel = compareData?.zones ?? [];
    return buildDisambiguatedZoneLabels(zonesToLabel, false);
  }, [compareData?.zones]);

  const labelForZone = (zone: ZoneMetrics): string => {
    return disambiguatedLabels.get(zone.h3_index) ?? formatZonePrimaryLabel(zone);
  };

  // ECharts visualisations
  const dimensionsChartOption = useMemo<echarts.EChartsOption>(() => {
    const zones = compareData?.zones ?? [];
    const names = zones.map((z) => labelForZone(z));
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { bottom: 0, textStyle: { color: "#555b66", fontSize: 11 } },
      grid: { top: 20, left: 40, right: 16, bottom: 40 },
      xAxis: { type: "category", data: names },
      yAxis: { type: "value", max: 100, name: "Percentile" },
      series: [
        {
          name: "Whitespace",
          type: "bar",
          data: zones.map(
            (z) => scoreById[z.h3_index]?.competition_whitespace_score ?? 0
          ),
          itemStyle: { color: "#1e4fd8" },
        },
        {
          name: "Food Context",
          type: "bar",
          data: zones.map(
            (z) => scoreById[z.h3_index]?.food_context_score ?? 0
          ),
          itemStyle: { color: "#f28c28" },
        },
        {
          name: "Reliability",
          type: "bar",
          data: zones.map(
            (z) => scoreById[z.h3_index]?.data_reliability_score ?? 0
          ),
          itemStyle: { color: "#1b9a6b" },
        },
      ],
    };
  }, [compareData, scoreById, disambiguatedLabels]);

  const countsChartOption = useMemo<echarts.EChartsOption>(() => {
    const zones = compareData?.zones ?? [];
    const names = zones.map((z) => labelForZone(z));
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { bottom: 0, textStyle: { color: "#555b66", fontSize: 11 } },
      grid: { top: 20, left: 40, right: 16, bottom: 40 },
      xAxis: { type: "category", data: names },
      yAxis: { type: "value", name: "Places" },
      series: [
        {
          name: "Cafes & Coffee",
          type: "bar",
          data: zones.map((z) => z.cafe_count),
          itemStyle: { color: "#1e4fd8" },
        },
        {
          name: "Restaurants",
          type: "bar",
          data: zones.map((z) => z.restaurant_count),
          itemStyle: { color: "#f28c28" },
        },
        {
          name: "All Food",
          type: "bar",
          data: zones.map((z) => z.food_business_count),
          itemStyle: { color: "#7856ff" },
        },
      ],
    };
  }, [compareData, disambiguatedLabels]);

  const densityChartOption = useMemo<echarts.EChartsOption>(() => {
    const zones = compareData?.zones ?? [];
    const names = zones.map((z) => labelForZone(z));
    return {
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, textStyle: { color: "#555b66", fontSize: 11 } },
      grid: { top: 20, left: 40, right: 16, bottom: 40 },
      xAxis: { type: "category", data: names },
      yAxis: { type: "value", name: "/km²" },
      series: [
        {
          name: "Cafe Density",
          type: "line",
          data: zones.map((z) => z.cafe_density_per_km2 ?? 0),
          itemStyle: { color: "#1e4fd8" },
        },
        {
          name: "Food Density",
          type: "line",
          data: zones.map((z) => z.food_density_per_km2 ?? 0),
          itemStyle: { color: "#f28c28" },
        },
      ],
    };
  }, [compareData, disambiguatedLabels]);

  const selectableZones = useMemo(() => {
    return allZones
      .filter((z) => !selectedIds.includes(z.h3_index))
      .slice(0, 100);
  }, [allZones, selectedIds]);

  const selectableLabels = useMemo(() => {
    return buildDisambiguatedZoneLabels(selectableZones, false);
  }, [selectableZones]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* 1. Header */}
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge tone="cobalt">Location Evaluation</Badge>
          <Badge tone="lavender">Trade-Off Analysis</Badge>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
          Compare Candidate Café Locations
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-ink-secondary">
          Compare observed café supply, dining cluster depth, and spatial data
          reliability across up to three candidate areas. Evaluated against the{" "}
          <strong>626.6 km² historical GHMC study boundary</strong>.
        </p>
      </header>

      {/* 2. Zone Selection Bar */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-borderSubtle bg-surface p-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
          Selected Areas ({selectedIds.length}/3):
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.map((id) => {
            const z = compareData?.zones.find((item) => item.h3_index === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-cobalt/30 bg-cobalt-soft px-3 py-1 text-xs font-medium text-cobalt"
              >
                <span>{z ? labelForZone(z) : "Candidate area"}</span>
                <button
                  type="button"
                  onClick={() => removeZone(id)}
                  aria-label={`Remove ${z ? labelForZone(z) : id}`}
                  className="rounded-full p-0.5 hover:bg-cobalt/15"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>

        {selectedIds.length < 3 && (
          <div className="ml-auto flex items-center gap-2">
            <select
              aria-label="Add location area to compare"
              value={pickerValue}
              onChange={(e) => setPickerValue(e.target.value)}
              className="h-8 rounded-lg border border-borderSubtle bg-canvas px-2.5 text-xs text-ink-primary focus:outline-none"
            >
              <option value="">Select a Hyderabad area to add…</option>
              {selectableZones.map((z) => {
                const label =
                  selectableLabels.get(z.h3_index) ?? formatZonePrimaryLabel(z);
                const sec = formatZoneSecondaryLabel(z);
                return (
                  <option key={z.h3_index} value={z.h3_index}>
                    {label}
                    {sec ? ` (${sec})` : ""} — {z.cafe_count} cafes,{" "}
                    {z.restaurant_count} restaurants
                  </option>
                );
              })}
            </select>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!pickerValue}
              onClick={() => addZone(pickerValue)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-coral/30 bg-coral-soft p-4 text-xs text-coral">
          {error}
        </div>
      )}

      {selectedIds.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-borderSubtle bg-surface p-12 text-center">
          <GitCompareArrows className="mx-auto h-10 w-10 text-cobalt" />
          <h2 className="mt-3 text-base font-semibold text-ink-primary">
            Select up to three candidate areas to compare
          </h2>
          <p className="mt-1 text-xs text-ink-secondary">
            Add locations using the dropdown above, or choose candidates from the{" "}
            <Link href="/discover" className="text-cobalt underline">
              Discover Locations
            </Link>{" "}
            shortlist or the{" "}
            <Link href="/explore" className="text-cobalt underline">
              Explore Map
            </Link>
            .
          </p>
        </div>
      ) : loading && !compareData ? (
        <div className="mt-8 text-sm text-ink-secondary">
          Loading comparison metrics…
        </div>
      ) : (
        compareData && (
          <div className="mt-8 space-y-8">
            {/* 3. Trade-Off Evaluation Cards (Plain English) */}
            <section className="rounded-2xl border border-borderSubtle bg-surface p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-cobalt" />
                <h2 className="text-base font-semibold text-ink-primary">
                  Plain-English Trade-Off Summary
                </h2>
              </div>
              <p className="mt-1 text-xs text-ink-secondary leading-relaxed">
                Intelis evaluates the observable trade-offs between locations.
                We do not declare an automatic &ldquo;winner&rdquo; because the best choice
                depends on whether your concept thrives on solitary whitespace
                or heavy restaurant clustering.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                {compareData.zones.map((z) => {
                  const s = scoreById[z.h3_index];
                  const hasZeroCafes = z.cafe_count === 0;
                  const isDenseFood = z.restaurant_count >= 20;

                  return (
                    <div
                      key={z.h3_index}
                      className="flex flex-col rounded-xl border border-borderSubtle bg-canvas p-4 text-xs"
                    >
                      <div className="flex items-start justify-between">
                        <span className="font-semibold text-ink-primary text-sm">
                          {labelForZone(z)}
                        </span>
                        <Badge tone="cobalt">
                          Score {s?.exploration_score?.toFixed(1) ?? "—"}
                        </Badge>
                      </div>
                      {formatZoneSecondaryLabel(z) && (
                        <span className="text-[11px] text-ink-muted">
                          {formatZoneSecondaryLabel(z)}
                        </span>
                      )}

                      <div className="mt-3 space-y-2 border-t border-borderSubtle pt-2.5">
                        <div>
                          <strong className="text-ink-primary">
                            Café Supply:{" "}
                          </strong>
                          <span className="text-ink-secondary">
                            {hasZeroCafes
                              ? "0 observed cafes (Unserved pocket, high spacing)"
                              : `${z.cafe_count} observed cafes (Existing competitor presence)`}
                          </span>
                        </div>
                        <div>
                          <strong className="text-ink-primary">
                            Dining Catchment:{" "}
                          </strong>
                          <span className="text-ink-secondary">
                            {isDenseFood
                              ? `${z.restaurant_count} restaurants (High-density dining cluster)`
                              : `${z.restaurant_count} restaurants (Emerging commercial activity)`}
                          </span>
                        </div>
                        <div>
                          <strong className="text-ink-primary">
                            Geographical Size:{" "}
                          </strong>
                          <span className="text-ink-secondary">
                            {z.clipped_area_km2.toFixed(2)} km² (
                            {z.area_coverage_pct.toFixed(0)}% full cell)
                          </span>
                        </div>
                        <div>
                          <strong className="text-ink-primary">
                            Data Reliability:{" "}
                          </strong>
                          <span className="text-ink-secondary">
                            {z.data_completeness_pct?.toFixed(0) ?? "—"}%
                            completeness
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 border-t border-borderSubtle/60 pt-2 text-[11px] text-ink-secondary leading-relaxed">
                        <em>Trade-Off Note:</em>{" "}
                        {hasZeroCafes
                          ? "Offers maximum competitor breathing room, but requires independent verification that dining foot traffic extends to daytime coffee hours."
                          : "Benefits from established daytime customer habits, but requires a clearly differentiated menu or branding against existing cafes."}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 4. Side-by-side Verified Metrics Table */}
            <div className="overflow-x-auto rounded-2xl border border-borderSubtle bg-surface shadow-sm">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-borderSubtle bg-canvas text-[11px] uppercase tracking-wider text-ink-secondary">
                    <th className="px-4 py-3 font-semibold">
                      Verified Spatial Indicator
                    </th>
                    {compareData.zones.map((z) => (
                      <th
                        key={z.h3_index}
                        className="px-4 py-3 font-sans font-semibold normal-case tracking-normal text-ink-primary"
                      >
                        <span className="block text-sm">{labelForZone(z)}</span>
                        {formatZoneSecondaryLabel(z) && (
                          <span className="block text-[10px] font-normal text-ink-muted">
                            {formatZoneSecondaryLabel(z)}
                          </span>
                        )}
                      </th>
                    ))}
                    <th className="px-4 py-3 font-semibold text-ink-muted">
                      Study Area Median ({compareData.benchmarks.reliable_cells_count} cells)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderSubtle font-mono text-xs tabular-nums">
                  <tr className="bg-cobalt-soft/20 font-sans">
                    <td className="px-4 py-3 font-semibold text-cobalt">
                      Exploration Screening Score
                    </td>
                    {compareData.zones.map((z) => {
                      const s = scoreById[z.h3_index];
                      return (
                        <td
                          key={z.h3_index}
                          className="px-4 py-3 font-bold text-cobalt"
                        >
                          {s?.exploration_score !== null &&
                          s?.exploration_score !== undefined
                            ? `${s.exploration_score.toFixed(1)} (#${s.rank})`
                            : "Excluded"}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-ink-muted">
                      Default (40 / 35 / 25)
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                      Observed Cafes &amp; Coffee Shops
                    </td>
                    {compareData.zones.map((z) => (
                      <td
                        key={z.h3_index}
                        className="px-4 py-3 font-semibold text-cobalt"
                      >
                        {z.cafe_count}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-ink-muted">—</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                      Observed Restaurants (Food Anchors)
                    </td>
                    {compareData.zones.map((z) => (
                      <td
                        key={z.h3_index}
                        className="px-4 py-3 font-semibold text-orange"
                      >
                        {z.restaurant_count}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-ink-muted">—</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                      All Food &amp; Drink Places
                    </td>
                    {compareData.zones.map((z) => (
                      <td key={z.h3_index} className="px-4 py-3">
                        {z.food_business_count}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-ink-muted">—</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                      Nearest Competitor Spacing
                    </td>
                    {compareData.zones.map((z) => (
                      <td key={z.h3_index} className="px-4 py-3">
                        {z.median_nearest_cafe_distance_m !== null
                          ? `${(z.median_nearest_cafe_distance_m / 1000).toFixed(2)} km`
                          : "N/A"}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-ink-muted">
                      {compareData.benchmarks.median_nearest_cafe_distance_m !== null
                        ? `${(compareData.benchmarks.median_nearest_cafe_distance_m / 1000).toFixed(2)} km`
                        : "—"}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                      Food Density (/km²)
                    </td>
                    {compareData.zones.map((z) => (
                      <td key={z.h3_index} className="px-4 py-3">
                        {z.food_density_per_km2 !== null
                          ? z.food_density_per_km2.toFixed(1)
                          : "Suppressed"}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-ink-muted">
                      {compareData.benchmarks.median_food_density_per_km2?.toFixed(1) ?? "—"}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                      Clipped Zone Area (H3 Res-8)
                    </td>
                    {compareData.zones.map((z) => (
                      <td key={z.h3_index} className="px-4 py-3">
                        {z.clipped_area_km2.toFixed(3)} km² ({z.area_coverage_pct.toFixed(0)}%)
                      </td>
                    ))}
                    <td className="px-4 py-3 text-ink-muted">~0.74 km² full cell</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                      Data Completeness %
                    </td>
                    {compareData.zones.map((z) => (
                      <td key={z.h3_index} className="px-4 py-3">
                        {z.data_completeness_pct !== null
                          ? `${z.data_completeness_pct.toFixed(0)}%`
                          : "N/A"}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-ink-muted">—</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 5. Interactive Founder Due-Diligence Checklist */}
            <section className="rounded-2xl border border-borderSubtle bg-surface p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-coral" />
                  <h2 className="text-base font-semibold text-ink-primary">
                    On-Site Founder Due-Diligence Checklist
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChecklistSection(!showChecklistSection)}
                  className="text-xs text-ink-secondary hover:text-ink-primary flex items-center gap-1"
                >
                  <span>{showChecklistSection ? "Collapse" : "Expand"}</span>
                  {showChecklistSection ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-secondary">
                Track research tasks completed for each candidate area during
                your in-person site audits.
              </p>

              {showChecklistSection && (
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  {compareData.zones.map((z) => {
                    const checks = checklistState[z.h3_index] ?? {};
                    const doneCount = Object.values(checks).filter(Boolean).length;

                    return (
                      <div
                        key={z.h3_index}
                        className="rounded-xl border border-borderSubtle bg-canvas p-4 text-xs"
                      >
                        <div className="flex items-center justify-between border-b border-borderSubtle pb-2">
                          <span className="font-semibold text-ink-primary">
                            {labelForZone(z)}
                          </span>
                          <span className="rounded-full bg-surface border border-borderSubtle px-2 py-0.5 text-[10px] text-ink-secondary">
                            {doneCount}/{FOUNDER_CHECKLIST_ITEMS.length} done
                          </span>
                        </div>

                        <div className="mt-3 space-y-2">
                          {FOUNDER_CHECKLIST_ITEMS.map((item) => {
                            const checked = Boolean(checks[item.id]);
                            return (
                              <label
                                key={item.id}
                                className="flex items-start gap-2 cursor-pointer select-none"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    toggleCheck(z.h3_index, item.id)
                                  }
                                  className="mt-0.5 rounded border-borderSubtle text-cobalt focus:ring-cobalt"
                                />
                                <span
                                  className={
                                    checked
                                      ? "text-ink-muted line-through"
                                      : "text-ink-primary"
                                  }
                                >
                                  {item.label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-3 text-[11px] text-ink-muted">
                Note: Marking checklist items complete assists your field
                investigation, but does not certify commercial viability or
                profitability.
              </p>
            </section>

            {/* 6. Technical Zone Details */}
            <div className="grid gap-4 md:grid-cols-3">
              {compareData.zones.map((z) => (
                <div
                  key={z.h3_index}
                  className="rounded-xl border border-borderSubtle bg-surface p-4"
                >
                  <p className="text-xs font-semibold text-ink-primary">
                    {labelForZone(z)}
                  </p>
                  <div className="mt-2">
                    <TechnicalCellId h3Index={z.h3_index} />
                  </div>
                  <div className="mt-3">
                    <Link
                      href={`/explore?h3=${z.h3_index}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-cobalt hover:underline"
                    >
                      <Compass className="h-3.5 w-3.5" />
                      <span>Inspect on City Map</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* 7. ECharts Comparative Visualisations */}
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-borderSubtle bg-surface p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-ink-primary">
                  Screening Dimensions (0–100)
                </h3>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  Percentile scores across eligible Hyderabad study cells.
                </p>
                <EChartContainer
                  option={dimensionsChartOption}
                  className="mt-4 h-72 w-full"
                />
              </div>

              <div className="rounded-2xl border border-borderSubtle bg-surface p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-ink-primary">
                  Business Counts by Category
                </h3>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  Observed places inside each clipped H3 cell.
                </p>
                <EChartContainer
                  option={countsChartOption}
                  className="mt-4 h-72 w-full"
                />
              </div>

              <div className="rounded-2xl border border-borderSubtle bg-surface p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-ink-primary">
                  Competitor Density per km²
                </h3>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  Computed over clipped cell area (EPSG:32644).
                </p>
                <EChartContainer
                  option={densityChartOption}
                  className="mt-4 h-72 w-full"
                />
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-6 py-12 text-sm text-ink-secondary">
          Loading comparison workspace…
        </div>
      }
    >
      <CompareWorkspace />
    </Suspense>
  );
}
