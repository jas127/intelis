# Intelis — H3 Geospatial Methodology (Hyderabad)

**Generated (UTC):** `2026-11-19T06:49:08.443094+00:00`  
**Spatial Grid:** Uber H3 Resolution `8` (~0.74 km² nominal hexagon area)  
**Projected CRS for Area & Distance:** `EPSG:32644` (WGS 84 / UTM Zone 44N)  
**Manifest:** `data/manifests/h3_hyderabad.json`

---

## 1. Study Area Validation & Limitations

- **Source File:** `data/raw/boundaries/ghmc-area.geojson`
- **OSM Identifier & Vintage:** `relation/7868535` (`Greater Hyderabad Municipal Corporation`), timestamp `2018-01-03T13:15:26Z`.
- **Geometry Validity:** Initially valid = `True` (`Valid Geometry`).
- **Computed Study Area (`EPSG:32644`):** `609.48 km²`
- **Geographic Extent (`EPSG:4326`):** `78.238707°E – 78.622391°E`, `17.291638°N – 17.560832°N`.

> **Important Limitation:** This polygon is a **January 2018 historical OpenStreetMap boundary**, not a verified current official GHMC administrative boundary. It also contains 5 small disconnected outer fragments alongside the main municipal polygon. All metrics are scoped strictly to this historical reference area.

---

## 2. Point-in-Polygon Reconciliation

Actual polygon containment (`shapely.covers`) was evaluated for all `159,323` Overture Places records (not bounding-box approximation):

| Subset | In GHMC Polygon | Outside GHMC Polygon | Spatially Unevaluable | Total |
| --- | ---: | ---: | ---: | ---: |
| All Overture Places | 136,649 | 22,674 | 0 | 159,323 |
| Food & Drink Businesses | 10,567 | 1,530 | 0 | 12,097 |
| Cafes & Coffee Shops | 1,082 | 155 | 0 | 1,237 |
| Restaurants | 5,912 | — | 0 | — |

Every in-boundary record (`136,649`) reconciled 100% with the generated H3 cells (`unmatched_in_boundary_records = 0`).

---

## 3. H3 Cell Generation & Minimum-Area Threshold

- **Total H3 Res-8 Cells Intersecting GHMC:** `975`
- **Reliable-Area Cells (`clipped_area_km2 >= 0.15 km²`):** `878`
- **Low-Area Boundary Slivers (`clipped_area_km2 < 0.15 km²`):** `97` (`low_area_flag = true`)
- **Cells Containing ≥ 1 Cafe/Coffee Shop:** `359` (`36.8%`)
- **Cells Containing ≥ 1 Food Business:** `685` (`70.3%`)

To prevent tiny clipped boundary slivers from producing artificially inflated per-km² densities, `cafe_density_per_km2` and `food_density_per_km2` are set to `NULL` whenever `clipped_area_km2 < 0.15 km²` (`low_area_flag = true`). Raw counts and `area_coverage_pct` remain fully visible.

---

## 4. Analytical Metric Definitions

1. **`cafe_count`:** Count of in-boundary Overture records in the cell with `basic_category IN ('cafe', 'coffee_shop')` or `taxonomy_primary IN ('cafe', 'coffee_shop')`. Includes flagged `internet_cafe` disagreements (`cafe_disagreement_count` reported separately).
2. **`restaurant_count`:** Count of in-boundary records in the cell with `basic_category = 'restaurant'`.
3. **`food_business_count`:** Count of in-boundary records in the cell with `taxonomy_root = 'food_and_drink'`.
4. **`cafe_density_per_km2`:** `cafe_count / clipped_area_km2` (projected in `EPSG:32644`), computed only when `clipped_area_km2 >= 0.15 km²`.
5. **`food_density_per_km2`:** `food_business_count / clipped_area_km2`, computed only when `clipped_area_km2 >= 0.15 km²`.
6. **`median_nearest_cafe_distance_m`:** For each cafe in the cell, Euclidean distance in metres (`EPSG:32644`) to the nearest *other* in-boundary cafe (excluding the same business), then median across cafes in the cell (`NULL` when `cafe_count = 0`).
7. **`median_confidence` & `high_confidence_pct`:** Median Overture confidence score across places in the cell and percentage of records with `confidence >= 0.70`.
8. **`data_completeness_pct`:** Percentage of places in the cell having both non-null `basic_category` and non-null `address`.

> **Interpretation Guardrail:** Competitor counts and densities measure **observed supply presence in Overture Places**, not consumer demand, footfall, revenue, or profitability. Low cafe density does **not** prove an underserved or profitable market.

---

## 5. Highest Cafe-Density Reliable H3 Cells

| H3 Index | Dominant Postcode | Clipped Area (km²) | Cafes | Restaurants | Cafe Density (/km²) | Median Nearest Cafe |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `8860a25989fffff` | `500033` | 0.753 | 19 | 61 | 25.23 | 48 m |
| `8860a259c7fffff` | `500033` | 0.753 | 19 | 51 | 25.23 | 36 m |
| `8860a259bbfffff` | `500081` | 0.753 | 17 | 63 | 22.58 | 62 m |
| `8860a259b9fffff` | `500081` | 0.753 | 16 | 141 | 21.25 | 71 m |
| `8860a25963fffff` | `500016` | 0.242 | 5 | 15 | 20.66 | 42 m |
