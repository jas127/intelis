# Intelis — Hyderabad Overture Places Data Quality Report

**Generated (UTC):** `2026-11-19T06:22:54.360141+00:00`  
**Source File:** `data/raw/overture/hyderabad_overture_places.geojson` (190.0 MB)  
**Manifest:** `data/manifests/overture_hyderabad.json`

---

## 1. Processed Output Record Counts

| Output File | Records | File Size |
| --- | ---: | ---: |
| `data/processed/hyderabad_all_places.parquet` | 159,323 | 14.46 MB |
| `data/processed/hyderabad_food_businesses.parquet` | 12,097 | 0.88 MB |
| `data/processed/hyderabad_cafes_coffee_shops.parquet` | 1,237 | 99.7 KB |
| `data/processed/hyderabad_category_summary.csv` | — (aggregated) | 81.9 KB |

---

## 2. Completeness & Coordinate Validation

| Check | Count | Share of Total |
| --- | ---: | ---: |
| Missing `primary_name` | 0 | 0.00% |
| Missing `basic_category` | 5,482 | 3.44% |
| Missing `taxonomy_primary` | 5,482 | 3.44% |
| Missing coordinates (`lon` or `lat` null) | 0 | 0.00% |
| Invalid coordinates (outside WGS84 range) | 0 | 0.00% |

### Geographic Extent (EPSG:4326)
- **Longitude:** `78.200221°E` to `78.699946°E`
- **Latitude:** `17.200000°N` to `17.600000°N`

---

## 3. Confidence Distribution

| Statistic | Value |
| --- | ---: |
| Minimum | 0.0159 |
| 25th Percentile (P25) | 0.3432 |
| Median (P50) | 0.5654 |
| Mean | 0.5657 |
| 75th Percentile (P75) | 0.7842 |
| Maximum | 1.0000 |

| Confidence Band | Records | Share |
| --- | ---: | ---: |
| `< 0.40` | 49,523 | 31.08% |
| `0.40 – 0.69` | 56,256 | 35.31% |
| `0.70 – 0.89` | 41,821 | 26.25% |
| `>= 0.90` | 11,723 | 7.36% |

---

## 4. Duplicate Identifiers & Suspected Duplicates

Raw records are preserved intact; suspected duplicates are **not** automatically deleted.

- **Duplicate `overture_id` values:** `0`
- **Suspected duplicate clusters (all places — identical normalized name + coordinates rounded to 4 decimals, ~11 m):** `155` groups (`155` excess records)
- **Suspected duplicate clusters (cafes & coffee shops subset):** `1` groups (`1` excess records)

---

## 5. Classification Disagreements

Records where `basic_category != taxonomy_primary` (both non-null) are flagged via `classification_disagreement = true` rather than silently overridden.

- **All Hyderabad places with `basic_category != taxonomy_primary`:** `74,025` (primarily reflects Overture's finer-grained `taxonomy_primary` specialisation relative to `basic_category`).
- **Cafes & coffee shops subset disagreements:** `55` records (`basic_category = 'cafe'` vs `taxonomy_primary = 'internet_cafe'`). These are retained and explicitly flagged so downstream analysts can decide whether to include or exclude internet cafes.

### Cafe & Coffee Shop Classification Breakdown

| `basic_category` | `taxonomy_primary` | Flagged Disagreement | Records |
| --- | --- | --- | ---: |
| `cafe` | `cafe` | No | 750 |
| `coffee_shop` | `coffee_shop` | No | 432 |
| `cafe` | `internet_cafe` | Yes | 55 |

---

## 6. Category Distribution

### Top-Level Taxonomy (`taxonomy_root`)

| Taxonomy Root | Records | Share |
| --- | ---: | ---: |
| `services_and_business` | 43,279 | 27.16% |
| `shopping` | 40,294 | 25.29% |
| `education` | 14,123 | 8.86% |
| `food_and_drink` | 12,097 | 7.59% |
| `health_care` | 11,510 | 7.22% |
| `cultural_and_historic` | 9,047 | 5.68% |
| `unclassified` | 5,482 | 3.44% |
| `travel_and_transportation` | 5,220 | 3.28% |
| `lodging` | 5,173 | 3.25% |
| `lifestyle_services` | 4,183 | 2.63% |
| `community_and_government` | 3,672 | 2.30% |
| `sports_and_recreation` | 3,367 | 2.11% |
| `arts_and_entertainment` | 1,688 | 1.06% |
| `geographic_entities` | 188 | 0.12% |

### Food & Drink Breakdown (`hyderabad_food_businesses.parquet`)

| `basic_category` | Records | Share of Food |
| --- | ---: | ---: |
| `restaurant` | 6,764 | 55.91% |
| `casual_eatery` | 2,394 | 19.79% |
| `cafe` | 805 | 6.65% |
| `fast_food_restaurant` | 626 | 5.17% |
| `bar` | 458 | 3.79% |
| `coffee_shop` | 432 | 3.57% |
| `non_alcoholic_beverage_venue` | 182 | 1.50% |
| `smoothie_juice_bar` | 144 | 1.19% |
| `food_and_drink` | 119 | 0.98% |
| `lounge` | 77 | 0.64% |
| `food_truck_stand` | 56 | 0.46% |
| `brewery` | 34 | 0.28% |
| `distillery` | 3 | 0.02% |
| `food_court` | 3 | 0.02% |

---

## 7. Source Provenance & Licence

Observed primary source records in Overture `properties.sources[0]`:

| Source Dataset | Licence | Records |
| --- | --- | ---: |
| `meta` | `CDLA-Permissive-2.0` | 131,041 |
| `Microsoft` | `CDLA-Permissive-2.0` | 21,909 |
| `Foursquare` | `Apache-2.0` | 3,466 |
| `AllThePlaces` | `CC0-1.0` | 1,912 |
| `DAC` | `CDLA-Permissive-2.0` | 709 |
| `Uberall` | `CDLA-Permissive-2.0` | 187 |
| `PinMeTo` | `CDLA-Permissive-2.0` | 99 |
