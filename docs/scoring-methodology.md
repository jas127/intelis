# Intelis — Exploratory Market Screening Score Methodology

**Scope:** Hyderabad, India (H3 Resolution 8 cells clipped to the Jan 2018 historical OSM GHMC reference boundary)  
**Label:** **Exploratory Market Screening Score**  
**Status:** Exploratory screening index — **NOT** a commercial viability, demand, revenue, or profitability prediction model.

---

## 1. Input Datasets

All calculations derive exclusively from curated, real datasets produced in Phases 2 and 3:

- `data/processed/hyderabad_h3_metrics.parquet` — 975 H3 resolution 8 cells intersecting the historical GHMC boundary, reconciled to 136,649 in-boundary Overture Places records (1,082 cafes & coffee shops, 5,912 restaurants, 10,567 food & drink businesses).
- `data/raw/boundaries/ghmc-area.geojson` — January 2018 historical OpenStreetMap administrative boundary (`relation/7868535`), projected in `EPSG:32644` (UTM Zone 44N) for all area calculations.

---

## 2. Eligibility & Missing-Data Rules

Cells are **not** scored if they lack sufficient spatial area or data reliability. A cell is eligible (`is_eligible = true`) if and only if:

1. **`low_area_flag == false`** (`clipped_area_km2 >= 0.15 km²`) — excludes **97** low-area boundary slivers so clipped edge fragments never produce misleading per-km² densities.
2. **`total_places_count >= min_places`** (default `min_places = 5`, user-adjustable) — excludes ultra-sparse cells where confidence or completeness percentages are statistically unstable.
3. **All required metrics are non-null:** `cafe_density_per_km2`, `food_density_per_km2`, `median_confidence`, `high_confidence_pct`, and `data_completeness_pct`.
4. **`data_completeness_pct >= min_completeness_pct`** (default `0%`, user-adjustable).

Under default settings, **796** of 975 cells are eligible and **179** are excluded with explicit `exclusion_reason` values. Missing metrics are never invented or treated as zero.

---

## 3. Three Normalised Component Dimensions (0–100 Scale)

Each component is normalised across the $N$ eligible cells using **average-rank percentiles** so tied values (such as cells with 0 observed cafes) receive identical scores:

$$\text{pct\_rank}(x_i) = 100 \times \frac{\text{rank}_{\text{avg}}(x_i) - 1}{N - 1}$$

### A. Competition Whitespace (`competition_whitespace_score`, Default Weight: 40%)
- **Input:** Inverted `cafe_density_per_km2` ($-\text{cafe\_density\_per\_km}^2$).
- **Rationale:** Lower observed cafe density indicates greater relative competition whitespace. Cells with `0` observed cafes are explicitly marked `zero_observed_cafes = true` (distinguished from missing/ineligible cells) and tie fairly at the top average-rank percentile.

### B. Food-Business Context (`food_context_score`, Default Weight: 35%)
- **Input:** `food_density_per_km2`.
- **Rationale:** Measures the concentration of an established food-and-drink business ecosystem (restaurants, eateries, beverage venues). This is a **supply-side contextual proxy**, **not** a direct measure of consumer demand or footfall.

### C. Data Reliability (`data_reliability_score`, Default Weight: 25%)
- **Input:** Equal-weighted mean of three percentile-ranked quality metrics across eligible cells:
  1. `pct_rank(median_confidence)`
  2. `pct_rank(high_confidence_pct)` (share of records with confidence ≥ 0.70)
  3. `pct_rank(data_completeness_pct)` (share of records with both category and address)
- **Rationale:** Prioritises locations where Overture Places coverage is more complete and higher confidence, reducing the risk of acting on data-coverage blind spots.

---

## 4. Composite Formula & Adjustable Weights

$$\text{Exploratory Market Screening Score} = \frac{w_{\text{cw}}}{100} S_{\text{whitespace}} + \frac{w_{\text{fc}}}{100} S_{\text{food\_context}} + \frac{w_{\text{dr}}}{100} S_{\text{reliability}}$$

- **Default Weights:** `40%` Competition Whitespace, `35%` Food-Business Context, `25%` Data Reliability.
- **Validation:** All three weights are user-adjustable in `[0, 100]` and must sum to `100%`.
- **Deterministic Tie-Breaking:** Ties in composite score break by higher `food_density_per_km2`, lower `cafe_density_per_km2`, then ascending `h3_index`.

---

## 5. Sensitivity Analysis

Because component weights are exploratory assumptions rather than empirically calibrated coefficients, `/api/v1/cities/hyderabad/opportunities/sensitivity` compares top-10 rankings across:

1. **Default weighting:** `40 / 35 / 25`
2. **Equal weighting:** `33.33 / 33.33 / 33.34`
3. **User-adjusted weighting** (default comparison preset: `55 / 30 / 15`)

The analysis reports top-10 overlap counts, per-cell rank shifts, and whether each shortlisted candidate remains in the top 10 across all three weight profiles.

---

## 6. Known Limitations & Why This Does Not Establish Commercial Viability

- **No Demand or Financial Data:** Intelis does not currently incorporate verified consumer demand, footfall, household income, rent/lease costs, parking/access, or sales data.
- **Zero Observed Cafes ≠ Underserved Market:** A cell with 0 observed cafes in Overture may reflect residential zoning, industrial land use, low spending power, or incomplete Overture mapping rather than unmet commercial demand.
- **Historical Boundary Vintage:** All cells are clipped to a **January 2018 OpenStreetMap GHMC boundary**, not a current official municipal boundary. Fast-growing outer corridors outside this 2018 polygon are excluded.
- **Cafe Classification Disagreements:** 55 records in Hyderabad have `basic_category='cafe'` with `taxonomy_primary='internet_cafe'`; these are preserved and flagged rather than silently deleted.
