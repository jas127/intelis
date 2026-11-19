import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Database,
  Hexagon,
  Map,
  Scale,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PILLARS = [
  {
    icon: Database,
    tone: "text-cobalt bg-cobalt-soft",
    title: "1. Verifiable Data Provenance",
    body: "Every business record and boundary polygon originates from documented open geospatial releases. Raw places stem from Overture Maps (November 2024 release), and spatial extents are clipped against a historical GHMC administrative boundary (January 2018 OSM reference).",
  },
  {
    icon: Hexagon,
    tone: "text-coral bg-coral-soft",
    title: "2. Consistent Hexagonal Spatial Units",
    body: "Rather than irregular, politically Gerrymandered wards or coarse postcodes, Intelis indexes space using Uber H3 Resolution-8 hexagons (~0.74 km² nominal area), clipped to the municipal boundary with precise projected metric calculations (EPSG:32644).",
  },
  {
    icon: Scale,
    tone: "text-lavender bg-lavender-soft",
    title: "3. Decomposed Supply-Side Indicators",
    body: "Rather than an opaque black-box score, Intelis evaluates locations along observable, inspectable dimensions: distance to nearest existing cafe, competitor density, catchment dining depth, and spatial data completeness.",
  },
  {
    icon: ShieldAlert,
    tone: "text-emeraldBrand bg-emeraldBrand-soft",
    title: "4. Explicit Analytical Honesty",
    body: "Intelis measures observed business supply and geographic spacing. We explicitly do not fabricate customer foot traffic, purchasing power, or rental rates. High whitespace indicates an underserved observed area, not guaranteed revenue.",
  },
];

export default function MethodologyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-12 sm:py-16">
      {/* 1. Header */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="cobalt">Methodology &amp; Provenance</Badge>
          <Badge tone="green">Verified Analytical Scope</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
          How Intelis Evaluates Market Opportunities
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-ink-secondary">
          Intelis is designed to provide reproducible, evidence-based location
          screening for prospective café founders in Hyderabad. This page
          documents the exact data sources, spatial indexing framework, and
          scoring methodology.
        </p>
      </header>

      <hr className="my-10 border-borderSubtle" />

      {/* 2. Population & Dataset Scope Table */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-ink-primary">
          Verified Dataset Scope &amp; Population Distinctions
        </h2>
        <p className="text-xs text-ink-secondary leading-relaxed">
          It is critical to distinguish between raw regional source extractions
          and the reconciled records situated within the historical study
          boundary:
        </p>

        <div className="overflow-x-auto rounded-xl border border-borderSubtle bg-surface">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-borderSubtle bg-canvas text-[11px] uppercase tracking-wider text-ink-secondary">
                <th className="px-4 py-3 font-semibold">Entity / Metric</th>
                <th className="px-4 py-3 font-semibold text-ink-primary">
                  Inside Study Boundary
                </th>
                <th className="px-4 py-3 font-semibold text-ink-muted">
                  Regional Source Extraction
                </th>
                <th className="px-4 py-3 font-semibold">Methodological Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderSubtle font-mono text-xs tabular-nums">
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                  Cafes &amp; Coffee Shops
                </td>
                <td className="px-4 py-3 font-bold text-cobalt">
                  1,082 records
                </td>
                <td className="px-4 py-3 text-ink-muted">1,237 records</td>
                <td className="px-4 py-3 font-sans text-ink-secondary">
                  Filtered to historical GHMC MultiPolygon
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                  Food &amp; Drink Businesses
                </td>
                <td className="px-4 py-3 font-bold text-orange">
                  10,567 records
                </td>
                <td className="px-4 py-3 text-ink-muted">12,097 records</td>
                <td className="px-4 py-3 font-sans text-ink-secondary">
                  Includes restaurants, bakeries &amp; eateries
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                  Total Places of Interest
                </td>
                <td className="px-4 py-3 font-bold text-ink-primary">
                  136,649 records
                </td>
                <td className="px-4 py-3 text-ink-muted">159,323 records</td>
                <td className="px-4 py-3 font-sans text-ink-secondary">
                  All commercial &amp; civic categories combined
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                  H3 Cells (Res-8) Intersecting
                </td>
                <td className="px-4 py-3 font-bold text-ink-primary">
                  975 cells
                </td>
                <td className="px-4 py-3 text-ink-muted">—</td>
                <td className="px-4 py-3 font-sans text-ink-secondary">
                  All cells touching the boundary polygon
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                  Viable-Area Cells
                </td>
                <td className="px-4 py-3 font-bold text-emeraldBrand">
                  878 cells
                </td>
                <td className="px-4 py-3 text-ink-muted">—</td>
                <td className="px-4 py-3 font-sans text-ink-secondary">
                  Clipped area &ge; 0.15 km² (97 peripheral slivers suppressed to prevent density distortion)
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                  Score-Eligible Cells
                </td>
                <td className="px-4 py-3 font-bold text-cobalt">796 cells</td>
                <td className="px-4 py-3 text-ink-muted">—</td>
                <td className="px-4 py-3 font-sans text-ink-secondary">
                  Reliable area AND &ge; 5 total recorded places
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-sans font-medium text-ink-primary">
                  Study Boundary Area
                </td>
                <td className="px-4 py-3 font-bold text-ink-primary">
                  626.6 km²
                </td>
                <td className="px-4 py-3 text-ink-muted">—</td>
                <td className="px-4 py-3 font-sans text-ink-secondary">
                  Historical GHMC MultiPolygon (EPSG:32644)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <hr className="my-10 border-borderSubtle" />

      {/* 3. Core Architectural Pillars */}
      <section
        aria-label="Analytical pillars"
        className="grid gap-8 sm:grid-cols-2"
      >
        {PILLARS.map(({ icon: Icon, tone, title, body }) => (
          <div key={title} className="space-y-3">
            <div
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold text-ink-primary">
              {title}
            </h2>
            <p className="text-sm leading-relaxed text-ink-secondary">{body}</p>
          </div>
        ))}
      </section>

      <hr className="my-10 border-borderSubtle" />

      {/* 4. Opportunity Scoring Formulation */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-ink-primary">
          Exploratory Screening Formulation
        </h2>
        <p className="text-sm leading-relaxed text-ink-secondary">
          For every eligible cell, three normalized sub-indicators (percentiles
          0–100) are computed relative to the city baseline:
        </p>

        <div className="grid gap-4 sm:grid-cols-3 pt-2 text-xs">
          <div className="rounded-xl border border-borderSubtle bg-surface p-4">
            <span className="font-semibold text-cobalt">
              1. Competition Whitespace
            </span>
            <p className="mt-1 text-ink-secondary">
              Computed from inverse observed café density per km²
              (-cafe_density_per_km2). A higher score indicates lower or zero
              existing café density, giving prospective founders maximum
              competitive breathing room.
            </p>
          </div>
          <div className="rounded-xl border border-borderSubtle bg-surface p-4">
            <span className="font-semibold text-orange">
              2. Food-Business Context
            </span>
            <p className="mt-1 text-ink-secondary">
              Percentile rank of observed food and restaurant density per km²
              (food_density_per_km2). Serves as an observable supply-side
              measure of commercial dining cluster depth.
            </p>
          </div>
          <div className="rounded-xl border border-borderSubtle bg-surface p-4">
            <span className="font-semibold text-emeraldBrand">
              3. Data Reliability
            </span>
            <p className="mt-1 text-ink-secondary">
              Average percentile rank of Overture median confidence score,
              high-confidence record share (&ge; 0.8), and attribute
              completeness percentage. (Distinct from the geometric 0.15 km²
              minimum clipped-area threshold).
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-borderSubtle bg-canvas p-4 text-xs font-mono text-ink-secondary">
          Score = (w_whitespace &times; P_whitespace) + (w_food &times; P_food)
          + (w_reliability &times; P_reliability)
        </div>
      </section>

      <hr className="my-10 border-borderSubtle" />

      {/* 5. Discovery Presets Rationale */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold text-ink-primary">
          Strategic Screening Presets
        </h2>
        <p className="text-sm leading-relaxed text-ink-secondary">
          The Discover Locations workspace provides three curated strategic
          presets to explore different business hypotheses:
        </p>

        <ul className="space-y-3 text-xs leading-relaxed text-ink-secondary">
          <li className="rounded-lg border border-borderSubtle bg-surface p-3">
            <strong className="text-ink-primary">
              Pioneer / First-Mover (60 / 25 / 15):
            </strong>{" "}
            Prioritizes lowest observed café density per km² (60% weight on
            inverse café density). Best for founders seeking unserved local
            pockets in emerging residential or commercial corridors.
          </li>
          <li className="rounded-lg border border-borderSubtle bg-surface p-3">
            <strong className="text-ink-primary">
              Balanced Opportunity (40 / 35 / 25):
            </strong>{" "}
            Default analytical calibration. Balances competitive breathing room
            with observed dining activity and high spatial data coverage.
          </li>
          <li className="rounded-lg border border-borderSubtle bg-surface p-3">
            <strong className="text-ink-primary">
              High-Activity Hub (20 / 55 / 25):
            </strong>{" "}
            Prioritizes high dining establishment density per km² (55% weight).
            Best for differentiated specialty roasters that plan to compete
            alongside existing cafes in dense commercial pockets.
          </li>
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button asChild variant="primary">
          <Link href="/discover">
            Discover Top Locations
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/explore">Explore City Map</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/compare">Compare Candidate Areas</Link>
        </Button>
      </div>
    </div>
  );
}
