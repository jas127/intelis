"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Coffee,
  Compass,
  GitCompareArrows,
  MapPin,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TechnicalCellId } from "@/components/ui/TechnicalCellId";
import {
  fetchHyderabadOpportunities,
  fetchHyderabadSummary,
  type CitySummaryResponse,
  type OpportunityScoreBreakdown,
} from "@/lib/api";
import {
  formatCandidateAreaTitle,
  formatZoneSecondaryLabel,
} from "@/lib/location-labels";

export default function HomePage() {
  const [summary, setSummary] = useState<CitySummaryResponse | null>(null);
  const [topCandidates, setTopCandidates] = useState<
    OpportunityScoreBreakdown[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      fetchHyderabadSummary().catch(() => null),
      fetchHyderabadOpportunities({ limit: 3 }).catch(() => null),
    ]).then(([sumData, oppData]) => {
      if (!isMounted) return;
      if (sumData) setSummary(sumData);
      if (oppData?.candidates) setTopCandidates(oppData.candidates.slice(0, 3));
      setLoading(false);
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col bg-canvas">
      {/* 1. Hero Section */}
      <section className="relative overflow-hidden border-b border-borderSubtle bg-gradient-to-b from-canvas via-canvas to-surface/60 px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cobalt/20 bg-cobalt-soft px-3.5 py-1 text-xs font-medium text-cobalt">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Café Location Strategy · Hyderabad</span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-ink-primary sm:text-5xl lg:text-6xl">
            Where should you open your next café in Hyderabad?
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-ink-secondary sm:text-lg">
            Intelis screens over 150,000 verified commercial records across
            Hyderabad to uncover underserved dining pockets, evaluate competitor
            spacing, and guide on-the-ground research for prospective café
            founders.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/discover">
              <Button size="md" className="gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                <span>Discover Locations</span>
              </Button>
            </Link>
            <Link href="/explore">
              <Button size="md" variant="outline" className="gap-2">
                <Compass className="h-4 w-4" />
                <span>Explore City Map</span>
              </Button>
            </Link>
            <Link href="/compare">
              <Button size="md" variant="outline" className="gap-2">
                <GitCompareArrows className="h-4 w-4" />
                <span>Compare Areas</span>
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 2. Verified Hyderabad Study Area Statistics */}
      <section className="border-b border-borderSubtle bg-canvas px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-cobalt">
                Spatial Dataset Scope
              </span>
              <h2 className="text-xl font-semibold text-ink-primary">
                Verified Market Baseline (Historical GHMC Boundary)
              </h2>
            </div>
            <p className="text-xs text-ink-secondary">
              Measured within the 626.6 km² historical boundary
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-borderSubtle bg-surface p-4">
              <div className="flex items-center justify-between text-xs text-ink-secondary">
                <span>Cafes in Study Boundary</span>
                <Coffee className="h-4 w-4 text-orange" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-ink-primary">
                1,082
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                1,237 in raw regional extraction
              </p>
            </div>

            <div className="rounded-xl border border-borderSubtle bg-surface p-4">
              <div className="flex items-center justify-between text-xs text-ink-secondary">
                <span>Food in Study Boundary</span>
                <BarChart3 className="h-4 w-4 text-cobalt" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-ink-primary">
                10,567
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                12,097 in raw regional extraction
              </p>
            </div>

            <div className="rounded-xl border border-borderSubtle bg-surface p-4">
              <div className="flex items-center justify-between text-xs text-ink-secondary">
                <span>Scorable Areas</span>
                <SlidersHorizontal className="h-4 w-4 text-emeraldBrand" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-ink-primary">
                796
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                From 878 viable-area zones (≥ 0.15 km²; 975 total cells)
              </p>
            </div>

            <div className="rounded-xl border border-borderSubtle bg-surface p-4">
              <div className="flex items-center justify-between text-xs text-ink-secondary">
                <span>Study Area</span>
                <MapPin className="h-4 w-4 text-coral" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-ink-primary">
                626.6 km²
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                Historical GHMC reference boundary
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. The 3-Step Decision Flow */}
      <section className="border-b border-borderSubtle bg-surface/50 px-6 py-14">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-cobalt">
              Structured Methodology
            </span>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
              How Intelis guides your location research
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-ink-secondary">
              A transparent, step-by-step framework to narrow down candidate
              locations before conducting site visits.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="flex flex-col rounded-2xl border border-borderSubtle bg-canvas p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cobalt-soft text-cobalt">
                <Compass className="h-5 w-5" />
              </div>
              <span className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Step 1
              </span>
              <h3 className="mt-1 text-base font-semibold text-ink-primary">
                Explore the Market Canvas
              </h3>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-secondary">
                Browse the interactive city map to visualize where food
                businesses are clustered, how existing cafes are distributed, and
                where competition gaps exist.
              </p>
              <Link
                href="/explore"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-cobalt hover:underline"
              >
                <span>Launch city map</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="flex flex-col rounded-2xl border border-borderSubtle bg-canvas p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral-soft text-coral">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <span className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Step 2
              </span>
              <h3 className="mt-1 text-base font-semibold text-ink-primary">
                Discover Screened Areas
              </h3>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-secondary">
                Review screened candidate locations using business-oriented
                presets like Pioneer, Balanced, or High-Activity Hub. Inspect
                specific evidence for each area.
              </p>
              <Link
                href="/discover"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-coral hover:underline"
              >
                <span>Discover top candidates</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="flex flex-col rounded-2xl border border-borderSubtle bg-canvas p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lavender-soft text-lavender">
                <GitCompareArrows className="h-5 w-5" />
              </div>
              <span className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Step 3
              </span>
              <h3 className="mt-1 text-base font-semibold text-ink-primary">
                Compare &amp; Conduct Due Diligence
              </h3>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-secondary">
                Compare two or three shortlisted areas side by side, evaluate
                trade-offs in plain English, and complete an actionable founder
                checklist before signing a lease.
              </p>
              <Link
                href="/compare"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-lavender hover:underline"
              >
                <span>Compare candidate areas</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Featured Opportunities Preview */}
      <section className="border-b border-borderSubtle bg-canvas px-6 py-14">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-cobalt">
                Top Candidate Preview
              </span>
              <h2 className="text-2xl font-semibold tracking-tight text-ink-primary">
                Sample Screening Candidates
              </h2>
              <p className="mt-1 text-xs text-ink-secondary">
                Areas ranked under default screening weights (40% Competition
                Whitespace, 35% Food Context, 25% Reliability)
              </p>
            </div>
            <Link href="/discover">
              <Button variant="outline" size="sm" className="gap-1.5">
                <span>View all 10 candidates</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {loading &&
              [1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-48 animate-pulse rounded-2xl border border-borderSubtle bg-surface p-5"
                />
              ))}

            {!loading &&
              topCandidates.map((cand, idx) => {
                const secondary = formatZoneSecondaryLabel({
                  dominant_locality: cand.metrics.dominant_locality,
                });
                const title = formatCandidateAreaTitle(
                  { dominant_postcode: cand.metrics.dominant_postcode },
                  idx + 1
                );
                const score = cand.exploration_score ?? 0;
                const nearestKm =
                  cand.metrics.median_nearest_cafe_distance_m !== null
                    ? cand.metrics.median_nearest_cafe_distance_m / 1000
                    : null;

                return (
                  <div
                    key={cand.h3_index}
                    className="flex flex-col rounded-2xl border border-borderSubtle bg-surface p-5 shadow-sm transition-all hover:border-cobalt/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Badge tone="cobalt">Candidate 0{idx + 1}</Badge>
                      <span className="text-xs font-bold text-ink-primary">
                        Score {score.toFixed(1)}
                      </span>
                    </div>

                    <h3 className="mt-3 font-semibold text-ink-primary">
                      {title}
                    </h3>
                    {secondary && (
                      <p className="text-xs text-ink-secondary">{secondary}</p>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2 border-y border-borderSubtle py-3 text-xs">
                      <div>
                        <span className="text-ink-muted">Existing Cafes:</span>
                        <p className="font-semibold text-ink-primary">
                          {cand.metrics.cafe_count} observed
                        </p>
                      </div>
                      <div>
                        <span className="text-ink-muted">Food Context:</span>
                        <p className="font-semibold text-ink-primary">
                          {cand.metrics.restaurant_count} establishments
                        </p>
                      </div>
                      <div>
                        <span className="text-ink-muted">Nearest Rival:</span>
                        <p className="font-semibold text-ink-primary">
                          {nearestKm !== null
                            ? `${nearestKm.toFixed(2)} km`
                            : "Adjacent"}
                        </p>
                      </div>
                      <div>
                        <span className="text-ink-muted">Area Size:</span>
                        <p className="font-semibold text-ink-primary">
                          {cand.metrics.clipped_area_km2.toFixed(2)} km²
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-borderSubtle pt-3">
                      <TechnicalCellId h3Index={cand.h3_index} />
                      <Link
                        href={`/compare?zone_ids=${cand.h3_index}`}
                        className="text-xs font-medium text-cobalt hover:underline shrink-0 whitespace-nowrap"
                      >
                        Compare area &rarr;
                      </Link>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      {/* 5. Analytical Honesty Notice */}
      <section className="bg-surface/70 px-6 py-12">
        <div className="mx-auto max-w-4xl rounded-2xl border border-coral/30 bg-coral-soft/40 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-coral text-white">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-ink-primary">
                Analytical Honesty &amp; Core Caveats
              </h3>
              <p className="text-xs leading-relaxed text-ink-secondary">
                Intelis evaluates <strong>observed business supply</strong> and
                spatial competitor patterns from public geospatial records
                (Overture Maps). A high screening score indicates an area with
                many recorded dining businesses but few observed cafes.
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-ink-secondary">
                <li>
                  <strong>Not a guarantee of footfall or revenue:</strong>{" "}
                  Intelis does not measure actual customer spending, rent costs,
                  or retail pedestrian traffic.
                </li>
                <li>
                  <strong>Informal spots may not be recorded:</strong> Local
                  tea stalls and unlisted kiosks are not included in open
                  geospatial datasets.
                </li>
                <li>
                  <strong>Always conduct on-site verification:</strong> Use our
                  integrated Founder Checklist before signing any commercial
                  lease.
                </li>
              </ul>
              <div className="pt-2">
                <Link
                  href="/methodology"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-coral hover:underline"
                >
                  <span>Read full methodology and data provenance</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
