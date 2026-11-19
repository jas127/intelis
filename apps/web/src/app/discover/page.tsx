"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  MapPin,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import { EChartContainer } from "@/components/charts/EChartContainer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TechnicalCellId } from "@/components/ui/TechnicalCellId";
import {
  fetchHyderabadOpportunities,
  fetchHyderabadSensitivity,
  type OpportunitiesListResponse,
  type SensitivityResponse,
} from "@/lib/api";
import {
  buildDisambiguatedZoneLabels,
  formatCandidateLabel,
  formatZonePrimaryLabel,
  formatZoneSecondaryLabel,
} from "@/lib/location-labels";

interface PresetConfig {
  id: string;
  name: string;
  tagline: string;
  description: string;
  weights: { cw: number; fc: number; dr: number };
}

const STORAGE_KEY = "intelis_founder_checklist_v1";

const DISCOVERY_PRESETS: PresetConfig[] = [
  {
    id: "pioneer",
    name: "Pioneer / First-Mover",
    tagline: "Prioritise unserved pockets with lowest observed café density",
    description:
      "Allocates 60% weight to competition whitespace (computed from inverse observed café density per km²). Ideal for founders seeking unserved pockets with zero or minimal existing cafes, accepting lower baseline food clustering.",
    weights: { cw: 60, fc: 25, dr: 15 },
  },
  {
    id: "balanced",
    name: "Balanced Opportunity",
    tagline: "Pragmatic trade-off between competition & dining context",
    description:
      "Default baseline (40% Whitespace / 35% Food Context / 25% Reliability). Balances low competitor density with observed dining activity and high spatial data completeness.",
    weights: { cw: 40, fc: 35, dr: 25 },
  },
  {
    id: "hub",
    name: "High-Activity Hub",
    tagline: "Focus on dense dining and commercial corridors",
    description:
      "Allocates 55% weight to dining establishment density. Suitable for specialty concepts targeting dense commercial food clusters who plan to compete directly alongside existing cafes.",
    weights: { cw: 20, fc: 55, dr: 25 },
  },
];

const DEFAULT_CHECKLIST = [
  { id: "footfall", label: "Morning & evening pedestrian audit (8–11am & 4–8pm)" },
  { id: "informal", label: "Check unlisted tea stalls, bakeries & informal kiosks" },
  { id: "rent", label: "Survey real commercial rent per sq. ft. & security deposit" },
  { id: "access", label: "Verify street frontage, 2-wheeler & car parking accessibility" },
  { id: "permits", label: "Confirm GHMC trade license, fire NOC & FSSAI feasibility" },
  { id: "unit_econ", label: "Model daily ticket volume required to cover fixed overheads" },
];

export default function DiscoverPage() {
  const [activePreset, setActivePreset] = useState<string>("balanced");
  const [wCompetition, setWCompetition] = useState<number>(40);
  const [wFoodContext, setWFoodContext] = useState<number>(35);
  const [wReliability, setWReliability] = useState<number>(25);
  const [minPlaces, setMinPlaces] = useState<number>(5);
  const [showAdvancedCalibration, setShowAdvancedCalibration] =
    useState<boolean>(false);

  const [data, setData] = useState<OpportunitiesListResponse | null>(null);
  const [sensitivity, setSensitivity] = useState<SensitivityResponse | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Per-candidate checklist state stored with localStorage persistence
  const [completedChecks, setCompletedChecks] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [expandedChecklist, setExpandedChecklist] = useState<
    Record<string, boolean>
  >({});

  // Hydrate checklist from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setCompletedChecks(JSON.parse(saved));
      }
    } catch {}
  }, []);

  const toggleCheckItem = (h3Index: string, itemId: string) => {
    setCompletedChecks((prev) => {
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

  const toggleChecklistExpand = (h3Index: string) => {
    setExpandedChecklist((prev) => ({
      ...prev,
      [h3Index]: !prev[h3Index],
    }));
  };

  const weightSum =
    Math.round((wCompetition + wFoodContext + wReliability) * 100) / 100;
  const weightsValid = Math.abs(weightSum - 100) <= 0.05;

  const handleSelectPreset = (preset: PresetConfig) => {
    setActivePreset(preset.id);
    setWCompetition(preset.weights.cw);
    setWFoodContext(preset.weights.fc);
    setWReliability(preset.weights.dr);
  };

  useEffect(() => {
    if (!weightsValid) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      fetchHyderabadOpportunities(
        {
          wCompetition,
          wFoodContext,
          wReliability,
          minPlaces,
          limit: 10,
        },
        controller.signal
      ),
      fetchHyderabadSensitivity(
        {
          wCompetition,
          wFoodContext,
          wReliability,
          minPlaces,
        },
        controller.signal
      ),
    ])
      .then(([oppRes, sensRes]) => {
        setData(oppRes);
        setSensitivity(sensRes);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to compute exploratory screening scores"
        );
        setLoading(false);
      });

    return () => controller.abort();
  }, [wCompetition, wFoodContext, wReliability, minPlaces, weightsValid]);

  // Disambiguate postcodes across candidate zones
  const candidateZoneInputs = useMemo(() => {
    return (data?.candidates ?? []).map((c) => ({
      h3_index: c.h3_index,
      dominant_postcode: c.metrics.dominant_postcode,
      dominant_locality: c.metrics.dominant_locality,
    }));
  }, [data]);

  const disambiguatedTitles = useMemo(() => {
    return buildDisambiguatedZoneLabels(candidateZoneInputs, false);
  }, [candidateZoneInputs]);

  const componentChartOption = useMemo<echarts.EChartsOption>(() => {
    const candidates = data?.candidates ?? [];
    const labels = candidates.map((c) => {
      const tag = formatCandidateLabel(c.rank);
      const disTitle = disambiguatedTitles.get(c.h3_index);
      return disTitle ? `${tag}\n${disTitle}` : tag;
    });
    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { bottom: 0, textStyle: { color: "#555b66", fontSize: 12 } },
      grid: { top: 20, left: 42, right: 16, bottom: 50 },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { interval: 0, fontSize: 10 },
      },
      yAxis: { type: "value", max: 100, name: "Percentile" },
      series: [
        {
          name: "Competition Whitespace",
          type: "bar",
          data: candidates.map((c) => c.competition_whitespace_score ?? 0),
          itemStyle: { color: "#1e4fd8", borderRadius: [3, 3, 0, 0] },
        },
        {
          name: "Food-Business Context",
          type: "bar",
          data: candidates.map((c) => c.food_context_score ?? 0),
          itemStyle: { color: "#f28c28", borderRadius: [3, 3, 0, 0] },
        },
        {
          name: "Data Reliability",
          type: "bar",
          data: candidates.map((c) => c.data_reliability_score ?? 0),
          itemStyle: { color: "#1b9a6b", borderRadius: [3, 3, 0, 0] },
        },
      ],
    };
  }, [data, disambiguatedTitles]);

  const top3CompareHref = useMemo(() => {
    const ids = (data?.candidates ?? []).slice(0, 3).map((c) => c.h3_index);
    return ids.length > 0
      ? `/compare?zone_ids=${encodeURIComponent(ids.join(","))}`
      : "/compare";
  }, [data]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {/* 1. Header & Scoping */}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge tone="cobalt">Market Intelligence</Badge>
            <Badge tone="orange">Cafes &amp; Coffee Shops</Badge>
          </div>
          {data && (
            <Link href={top3CompareHref}>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <GitCompareArrows className="h-3.5 w-3.5 text-cobalt" />
                <span>Compare Top 3 Candidates</span>
              </Button>
            </Link>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
            Discover Café Locations in Hyderabad
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Screening <strong>796 eligible areas</strong> (from 878 reliable
            zones meeting the 0.15 km² clipped-area threshold across the 626.6
            km² historical GHMC boundary) based on observed café supply and dining
            clustering.
          </p>
        </div>
      </header>

      {/* 2. Strategy Presets */}
      <section className="mt-6 rounded-2xl border border-borderSubtle bg-surface p-5">
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-semibold text-ink-primary">
              Discovery Screening Presets
            </h2>
            <p className="text-xs text-ink-secondary">
              Select a screening preference to re-rank candidate areas based on
              your expansion strategy.
            </p>
          </div>
          <span className="text-[11px] text-ink-muted">
            Preferences reflect screening priorities, not guaranteed business
            success
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {DISCOVERY_PRESETS.map((p) => {
            const isSelected = activePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p)}
                className={`flex flex-col rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? "border-cobalt bg-elevated shadow-sm ring-2 ring-cobalt/20"
                    : "border-borderSubtle bg-canvas hover:border-ink-secondary/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink-primary">
                    {p.name}
                  </span>
                  {isSelected && (
                    <Badge tone="cobalt" className="text-[10px] py-0 px-1.5">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-[11px] font-medium text-cobalt">
                  {p.tagline}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
                  {p.description}
                </p>
                <div className="mt-3 flex items-center gap-2 border-t border-borderSubtle pt-2 text-[10px] text-ink-muted">
                  <span>Whitespace: {p.weights.cw}%</span>
                  <span>·</span>
                  <span>Food Context: {p.weights.fc}%</span>
                  <span>·</span>
                  <span>Reliability: {p.weights.dr}%</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Advanced Slider Disclosure */}
        <div className="mt-4 border-t border-borderSubtle/60 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvancedCalibration(!showAdvancedCalibration)}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary hover:text-ink-primary"
          >
            {showAdvancedCalibration ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            <span>Advanced: Custom Weight Calibration &amp; Thresholds</span>
          </button>

          {showAdvancedCalibration && (
            <div className="mt-4 space-y-4 rounded-xl border border-borderSubtle bg-canvas p-4 text-xs">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <div className="flex justify-between font-medium">
                    <span>Competition Whitespace:</span>
                    <span className="font-mono text-cobalt">{wCompetition}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={wCompetition}
                    onChange={(e) => {
                      setActivePreset("custom");
                      setWCompetition(Number(e.target.value));
                    }}
                    className="mt-2 w-full accent-cobalt"
                  />
                  <p className="mt-1 text-[11px] text-ink-muted">
                    Lowest observed café density per km² (inverse percentile)
                  </p>
                </div>

                <div>
                  <div className="flex justify-between font-medium">
                    <span>Food-Business Context:</span>
                    <span className="font-mono text-orange">{wFoodContext}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={wFoodContext}
                    onChange={(e) => {
                      setActivePreset("custom");
                      setWFoodContext(Number(e.target.value));
                    }}
                    className="mt-2 w-full accent-orange"
                  />
                  <p className="mt-1 text-[11px] text-ink-muted">
                    Total restaurants &amp; commercial dining cluster depth
                  </p>
                </div>

                <div>
                  <div className="flex justify-between font-medium">
                    <span>Data Reliability:</span>
                    <span className="font-mono text-emeraldBrand">
                      {wReliability}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={wReliability}
                    onChange={(e) => {
                      setActivePreset("custom");
                      setWReliability(Number(e.target.value));
                    }}
                    className="mt-2 w-full accent-emeraldBrand"
                  />
                  <p className="mt-1 text-[11px] text-ink-muted">
                    Clipped cell coverage &amp; Overture record completeness
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-borderSubtle pt-2">
                <span
                  className={
                    weightsValid
                      ? "text-emeraldBrand font-medium"
                      : "text-coral font-semibold"
                  }
                >
                  Total Weight: {weightSum}% (must equal 100%)
                </span>
                <label className="flex items-center gap-2 text-ink-secondary">
                  <span>Min Places per Cell:</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={minPlaces}
                    onChange={(e) => setMinPlaces(Number(e.target.value))}
                    className="w-16 rounded border border-borderSubtle bg-surface px-2 py-0.5 text-center font-mono"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. Analytical Caution Banner */}
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-coral/30 bg-coral-soft/50 p-4 text-xs text-ink-secondary">
        <ShieldAlert className="h-4 w-4 shrink-0 text-coral mt-0.5" />
        <p>
          <strong>Exploratory screening signal:</strong> Intelis identifies
          geographic areas with favorable observed supply conditions (existing
          dining anchors with few or distant cafes). It does{" "}
          <strong>not</strong> predict sales volume, customer foot traffic, or
          commercial profitability. Always perform field due diligence.
        </p>
      </div>

      {/* 4. Shortlisted Candidate Cards */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink-primary">
              Top 10 Screened Candidate Locations
            </h2>
            <p className="text-xs text-ink-secondary">
              Ranked by composite exploration score under the active screening
              parameters
            </p>
          </div>
          {data && (
            <span className="text-xs text-ink-muted">
              {data.eligible_cells} eligible zones analyzed
            </span>
          )}
        </div>

        {loading && (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-2xl border border-borderSubtle bg-surface p-5"
              />
            ))}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-coral bg-coral-soft p-4 text-xs text-coral">
            {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
          {data?.candidates.map((cand) => {
            const h3Index = cand.h3_index;
            const primaryTitle =
              disambiguatedTitles.get(h3Index) ??
              formatZonePrimaryLabel({
                dominant_postcode: cand.metrics.dominant_postcode,
              });
            const secondaryLocality = formatZoneSecondaryLabel({
              dominant_locality: cand.metrics.dominant_locality,
            });
            const candidateTag = formatCandidateLabel(cand.rank);
            const isChecklistOpen = expandedChecklist[h3Index];
            const checks = completedChecks[h3Index] ?? {};
            const doneCount = Object.values(checks).filter(Boolean).length;
            const nearestKm =
              cand.metrics.median_nearest_cafe_distance_m !== null
                ? cand.metrics.median_nearest_cafe_distance_m / 1000
                : null;
            const score = cand.exploration_score ?? 0;

            return (
              <div
                key={h3Index}
                className="flex flex-col rounded-2xl border border-borderSubtle bg-surface p-5 shadow-sm transition-all hover:border-cobalt/40"
              >
                {/* Header row: Candidate tag + Score */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="cobalt">{candidateTag}</Badge>
                    {secondaryLocality && (
                      <Badge tone="lavender">{secondaryLocality}</Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-ink-muted">Score</span>
                    <p className="text-base font-bold text-ink-primary">
                      {score.toFixed(1)}
                    </p>
                  </div>
                </div>

                {/* Primary Disambiguated Area Label */}
                <h3 className="mt-2 text-base font-semibold text-ink-primary">
                  {primaryTitle}
                </h3>

                {/* Evidence Metrics Grid */}
                <div className="mt-3 grid grid-cols-2 gap-2.5 rounded-xl border border-borderSubtle/60 bg-canvas p-3 text-xs">
                  <div>
                    <span className="text-[11px] text-ink-muted">
                      Existing Cafes
                    </span>
                    <p className="font-semibold text-ink-primary">
                      {cand.metrics.cafe_count} observed
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-ink-muted">
                      Nearest Competitor
                    </span>
                    <p className="font-semibold text-ink-primary">
                      {nearestKm !== null
                        ? `${nearestKm.toFixed(2)} km`
                        : "Adjacent"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-ink-muted">
                      Food Context (Restaurants)
                    </span>
                    <p className="font-semibold text-ink-primary">
                      {cand.metrics.restaurant_count} establishments
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-ink-muted">
                      Area Coverage
                    </span>
                    <p className="font-semibold text-ink-primary">
                      {cand.metrics.area_coverage_pct.toFixed(0)}% (
                      {cand.metrics.clipped_area_km2.toFixed(2)} km²)
                    </p>
                  </div>
                </div>

                {/* Component Sub-Scores */}
                <div className="mt-3 flex items-center justify-between text-[11px] text-ink-secondary">
                  <span>
                    Whitespace:{" "}
                    <strong className="text-cobalt">
                      {cand.competition_whitespace_score?.toFixed(1)}
                    </strong>
                  </span>
                  <span>
                    Food Context:{" "}
                    <strong className="text-orange">
                      {cand.food_context_score?.toFixed(1)}
                    </strong>
                  </span>
                  <span>
                    Reliability:{" "}
                    <strong className="text-emeraldBrand">
                      {cand.data_reliability_score?.toFixed(1)}
                    </strong>
                  </span>
                </div>

                {/* Founder Due Diligence Checklist Accordion */}
                <div className="mt-4 border-t border-borderSubtle pt-3">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => toggleChecklistExpand(h3Index)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-primary hover:text-cobalt"
                    >
                      <ClipboardList className="h-3.5 w-3.5 text-coral" />
                      <span>Founder On-Site Due Diligence</span>
                      <span className="rounded-full bg-surface border border-borderSubtle px-2 py-0.2 text-[10px] text-ink-secondary">
                        {doneCount}/{DEFAULT_CHECKLIST.length} completed
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleChecklistExpand(h3Index)}
                      className="text-xs text-ink-muted hover:text-ink-primary"
                    >
                      {isChecklistOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {isChecklistOpen && (
                    <div className="mt-3 space-y-2 rounded-xl border border-borderSubtle bg-canvas p-3 text-xs">
                      <p className="text-[11px] text-ink-secondary leading-relaxed">
                        Verify real-world conditions on the ground. Checklist
                        completion organises research notes but does not certify
                        profitability:
                      </p>
                      <div className="space-y-1.5 pt-1">
                        {DEFAULT_CHECKLIST.map((item) => {
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
                                  toggleCheckItem(h3Index, item.id)
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
                  )}
                </div>

                {/* Footer Controls: Technical ID & Navigation */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-borderSubtle pt-3">
                  <TechnicalCellId h3Index={h3Index} />
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/explore?h3=${h3Index}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-cobalt"
                    >
                      <Compass className="h-3.5 w-3.5" />
                      <span>Inspect Map</span>
                    </Link>
                    <span>·</span>
                    <Link
                      href={`/compare?zone_ids=${encodeURIComponent(h3Index)}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-cobalt hover:underline"
                    >
                      <GitCompareArrows className="h-3.5 w-3.5" />
                      <span>Compare Area</span>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Sensitivity Analysis & Component Profiles */}
      {data && sensitivity && (
        <section className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-borderSubtle bg-surface p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-ink-primary">
              Shortlist Component Dimension Profiles
            </h2>
            <p className="mt-0.5 text-xs text-ink-secondary">
              Percentile ranks (0–100) across all {data.eligible_cells} eligible
              study areas.
            </p>
            <EChartContainer
              option={componentChartOption}
              className="mt-4 h-72 w-full"
            />
          </div>

          <div className="rounded-2xl border border-borderSubtle bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-ink-primary">
                  Ranking Sensitivity Across Presets
                </h2>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  Checks stability of Top-10 areas under Default, Equal, and
                  Current weights.
                </p>
              </div>
              <Badge tone="lavender" className="font-mono text-xs">
                {sensitivity.stable_in_all_three_top_10}/10 stable in all 3
              </Badge>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left font-mono text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-borderSubtle font-sans text-[11px] text-ink-secondary">
                    <th className="py-2 pr-2">Candidate Location</th>
                    <th className="py-2 px-2">Default</th>
                    <th className="py-2 px-2">Equal</th>
                    <th className="py-2 px-2">Current</th>
                    <th className="py-2 pl-2">Shift</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borderSubtle">
                  {sensitivity.candidates.map((row) => {
                    const tag = formatCandidateLabel(row.default_rank);
                    const disTitle = disambiguatedTitles.get(row.h3_index);
                    return (
                      <tr key={row.h3_index}>
                        <td className="py-2 pr-2 font-sans text-ink-primary">
                          <span className="font-medium">
                            {disTitle ?? formatZonePrimaryLabel(row)}
                          </span>
                          <span className="ml-1.5 text-[10px] text-ink-muted">
                            ({tag})
                          </span>
                        </td>
                        <td className="py-2 px-2">#{row.default_rank}</td>
                        <td className="py-2 px-2">#{row.equal_rank}</td>
                        <td className="py-2 px-2 font-semibold text-cobalt">
                          #{row.custom_rank}
                        </td>
                        <td className="py-2 pl-2 text-ink-secondary">
                          ±{row.max_rank_shift}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
