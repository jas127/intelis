"""H3 resolution 8 geospatial intelligence pipeline for Hyderabad (GHMC study area).

Uses:
  - data/raw/boundaries/ghmc-area.geojson (Jan 2018 historical OSM GHMC reference)
  - data/processed/hyderabad_all_places.parquet
  - data/processed/hyderabad_food_businesses.parquet
  - data/processed/hyderabad_cafes_coffee_shops.parquet

Generates:
  - data/processed/hyderabad_h3_cells.geojson
  - data/processed/hyderabad_h3_metrics.parquet
  - data/processed/hyderabad_h3_pois.parquet
  - data/processed/hyderabad_h3_quality_report.csv
  - data/manifests/h3_hyderabad.json
  - docs/h3-methodology.md
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
import shapely
from pyproj import Transformer
from shapely.geometry import Polygon, mapping
from shapely.validation import explain_validity, make_valid

REPO_ROOT = Path(__file__).resolve().parents[2]
BOUNDARY_GEOJSON = REPO_ROOT / "data" / "raw" / "boundaries" / "ghmc-area.geojson"
PROCESSED_DIR = REPO_ROOT / "data" / "processed"
MANIFEST_PATH = REPO_ROOT / "data" / "manifests" / "h3_hyderabad.json"
METHODOLOGY_PATH = REPO_ROOT / "docs" / "h3-methodology.md"

ALL_PLACES_PARQUET = PROCESSED_DIR / "hyderabad_all_places.parquet"

OUT_CELLS_GEOJSON = PROCESSED_DIR / "hyderabad_h3_cells.geojson"
OUT_METRICS_PARQUET = PROCESSED_DIR / "hyderabad_h3_metrics.parquet"
OUT_POIS_PARQUET = PROCESSED_DIR / "hyderabad_h3_pois.parquet"
OUT_QUALITY_CSV = PROCESSED_DIR / "hyderabad_h3_quality_report.csv"

H3_RESOLUTION = 8
PROJECTED_CRS = "EPSG:32644"  # WGS 84 / UTM zone 44N (Hyderabad ~78.5°E)
MIN_RELIABLE_AREA_KM2 = 0.15  # ~20% of a full H3 res-8 hex (~0.74 km²)
HIGH_CONFIDENCE_THRESHOLD = 0.70


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_and_validate_study_area(boundary_path: Path = BOUNDARY_GEOJSON) -> dict[str, Any]:
    """Load GHMC reference boundary, validate geometry, and compute area in EPSG:32644."""
    if not boundary_path.exists():
        raise FileNotFoundError(f"GHMC boundary file not found: {boundary_path}")

    raw_json = json.loads(boundary_path.read_text(encoding="utf-8"))
    props = (raw_json.get("features") or [{}])[0].get("properties") or {}

    gdf = gpd.read_file(boundary_path)
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")

    raw_geom = gdf.geometry.union_all()
    was_valid = bool(raw_geom.is_valid)
    validity_reason = explain_validity(raw_geom)
    study_geom = raw_geom if was_valid else make_valid(raw_geom)

    proj_series = gpd.GeoSeries([study_geom], crs="EPSG:4326").to_crs(PROJECTED_CRS)
    area_km2 = float(proj_series.area.iloc[0] / 1_000_000.0)
    min_lon, min_lat, max_lon, max_lat = study_geom.bounds

    return {
        "geometry": study_geom,
        "was_valid": was_valid,
        "validity_reason": validity_reason,
        "area_km2": area_km2,
        "bounds": {
            "min_longitude": round(float(min_lon), 6),
            "min_latitude": round(float(min_lat), 6),
            "max_longitude": round(float(max_lon), 6),
            "max_latitude": round(float(max_lat), 6),
        },
        "source_properties": props,
        "sha256": _sha256_file(boundary_path),
        "size_bytes": boundary_path.stat().st_size,
    }


def _h3_cell_to_polygon(cell: str) -> Polygon:
    """Convert an H3 cell index to a Shapely Polygon in (lon, lat) EPSG:4326 order."""
    boundary_latlon = h3.cell_to_boundary(cell)
    coords_lonlat = [(lng, lat) for lat, lng in boundary_latlon]
    if coords_lonlat[0] != coords_lonlat[-1]:
        coords_lonlat.append(coords_lonlat[0])
    return Polygon(coords_lonlat)


def generate_intersecting_h3_cells(
    study_geom: shapely.Geometry, resolution: int = H3_RESOLUTION
) -> gpd.GeoDataFrame:
    """Generate all H3 cells intersecting the study geometry with full & clipped areas."""
    # Seed cells from H3 geo_to_cells + 1-ring buffer so edge-intersecting cells are never missed
    seed_cells = set(h3.geo_to_cells(mapping(study_geom), res=resolution))
    candidate_cells: set[str] = set()
    for cell in seed_cells:
        candidate_cells.update(h3.grid_disk(cell, 1))

    # Also ensure every polygon vertex's cell & 1-ring is included (handles tiny exclaves)
    if hasattr(study_geom, "geoms"):
        polys = list(study_geom.geoms)
    else:
        polys = [study_geom]
    for poly in polys:
        if hasattr(poly, "exterior"):
            for lon, lat in poly.exterior.coords:
                c = h3.latlng_to_cell(lat, lon, resolution)
                candidate_cells.update(h3.grid_disk(c, 1))

    shapely.prepare(study_geom)
    rows: list[dict[str, Any]] = []
    full_geoms: list[Polygon] = []
    clipped_geoms: list[shapely.Geometry] = []

    for cell in sorted(candidate_cells):
        full_poly = _h3_cell_to_polygon(cell)
        if not study_geom.intersects(full_poly):
            continue
        clipped = full_poly.intersection(study_geom)
        if clipped.is_empty:
            continue
        # Only retain polygonal intersections (ignore 0D/1D boundary touches)
        if clipped.geom_type in ("Point", "MultiPoint", "LineString", "MultiLineString"):
            continue
        if clipped.geom_type == "GeometryCollection":
            poly_parts = [
                g for g in clipped.geoms if g.geom_type in ("Polygon", "MultiPolygon")
            ]
            if not poly_parts:
                continue
            clipped = shapely.unary_union(poly_parts)

        center_lat, center_lon = h3.cell_to_latlng(cell)
        rows.append(
            {
                "h3_index": cell,
                "resolution": resolution,
                "centroid_lon": round(float(center_lon), 6),
                "centroid_lat": round(float(center_lat), 6),
            }
        )
        full_geoms.append(full_poly)
        clipped_geoms.append(clipped)

    full_areas_km2 = (
        gpd.GeoSeries(full_geoms, crs="EPSG:4326").to_crs(PROJECTED_CRS).area.to_numpy()
        / 1_000_000.0
    )
    clipped_areas_km2 = (
        gpd.GeoSeries(clipped_geoms, crs="EPSG:4326").to_crs(PROJECTED_CRS).area.to_numpy()
        / 1_000_000.0
    )

    df = pd.DataFrame(rows)
    df["full_area_km2"] = np.round(full_areas_km2, 6)
    df["clipped_area_km2"] = np.round(clipped_areas_km2, 6)
    df["area_coverage_pct"] = np.round(
        100.0 * clipped_areas_km2 / full_areas_km2, 2
    )
    df["low_area_flag"] = df["clipped_area_km2"] < MIN_RELIABLE_AREA_KM2

    # Drop degenerate 0-area slivers if any
    keep_mask = df["clipped_area_km2"] > 0
    df = df.loc[keep_mask].reset_index(drop=True)
    kept_geoms = [g for g, keep in zip(clipped_geoms, keep_mask) if keep]

    return gpd.GeoDataFrame(df, geometry=kept_geoms, crs="EPSG:4326")


def compute_nearest_other_cafe_distances_m(
    lons: np.ndarray, lats: np.ndarray
) -> np.ndarray:
    """Compute Euclidean distance (metres, EPSG:32644) to nearest OTHER cafe."""
    n = len(lons)
    if n < 2:
        return np.full(n, np.nan, dtype=np.float64)

    transformer = Transformer.from_crs("EPSG:4326", PROJECTED_CRS, always_xy=True)
    xs, ys = transformer.transform(lons, lats)
    coords = np.column_stack([xs, ys])

    # Pairwise distance matrix (n ~ 1,200 -> ~11 MB float64, runs in <30 ms)
    diff = coords[:, np.newaxis, :] - coords[np.newaxis, :, :]
    dist_sq = np.sum(diff * diff, axis=-1)
    np.fill_diagonal(dist_sq, np.inf)
    nearest_m = np.sqrt(np.min(dist_sq, axis=1))
    return nearest_m


def run_h3_pipeline() -> dict[str, Any]:
    if not ALL_PLACES_PARQUET.exists():
        raise FileNotFoundError(
            f"Curated all-places Parquet not found: {ALL_PLACES_PARQUET}. "
            "Run overture_hyderabad.py first."
        )

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    METHODOLOGY_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Part 1: Validate study area
    study = load_and_validate_study_area(BOUNDARY_GEOJSON)
    study_geom = study["geometry"]

    # Load all Overture places
    places_df = pd.read_parquet(ALL_PLACES_PARQUET)
    total_input_records = len(places_df)

    valid_coord_mask = (
        places_df["longitude"].notna()
        & places_df["latitude"].notna()
        & (places_df["longitude"] >= -180.0)
        & (places_df["longitude"] <= 180.0)
        & (places_df["latitude"] >= -90.0)
        & (places_df["latitude"] <= 90.0)
    )
    unevaluable_count = int((~valid_coord_mask).sum())

    eval_df = places_df.loc[valid_coord_mask].copy()
    points_arr = shapely.points(
        eval_df["longitude"].to_numpy(), eval_df["latitude"].to_numpy()
    )
    shapely.prepare(study_geom)
    # Actual polygon containment (covers includes points strictly on boundary)
    in_polygon_mask = shapely.covers(study_geom, points_arr)

    eval_df["in_ghmc_boundary"] = in_polygon_mask
    in_df = eval_df.loc[in_polygon_mask].copy()
    outside_df = eval_df.loc[~in_polygon_mask]

    in_boundary_total = len(in_df)
    outside_total = len(outside_df)
    in_boundary_cafes = int(in_df["is_cafe_or_coffee_shop"].sum())
    outside_cafes = int(outside_df["is_cafe_or_coffee_shop"].sum())
    in_boundary_food = int(in_df["is_food_business"].sum())
    outside_food = int(outside_df["is_food_business"].sum())
    in_boundary_restaurants = int((in_df["basic_category"] == "restaurant").sum())

    # Part 2: Generate H3 res-8 cells clipped to GHMC study area
    cells_gdf = generate_intersecting_h3_cells(study_geom, resolution=H3_RESOLUTION)
    valid_cell_set = set(cells_gdf["h3_index"].tolist())

    # Part 3: Assign in-boundary POIs to H3 cells
    in_df["h3_index"] = [
        h3.latlng_to_cell(lat, lon, H3_RESOLUTION)
        for lat, lon in zip(in_df["latitude"].to_numpy(), in_df["longitude"].to_numpy())
    ]

    # Strict reconciliation check: every in-boundary point must belong to a generated cell
    unmatched_in_boundary = int((~in_df["h3_index"].isin(valid_cell_set)).sum())
    if unmatched_in_boundary > 0:
        raise RuntimeError(
            f"Spatial reconciliation failed: {unmatched_in_boundary} in-boundary "
            "points did not match any generated H3 cell."
        )

    # Nearest-other-cafe distance (metres in EPSG:32644) across all in-boundary cafes
    cafe_mask = in_df["is_cafe_or_coffee_shop"].to_numpy()
    cafe_sub = in_df.loc[cafe_mask].copy()
    cafe_sub["nearest_cafe_distance_m"] = np.round(
        compute_nearest_other_cafe_distances_m(
            cafe_sub["longitude"].to_numpy(), cafe_sub["latitude"].to_numpy()
        ),
        1,
    )
    in_df["nearest_cafe_distance_m"] = np.nan
    in_df.loc[cafe_mask, "nearest_cafe_distance_m"] = cafe_sub[
        "nearest_cafe_distance_m"
    ].to_numpy()

    # Aggregate metrics per H3 cell
    in_df["is_restaurant"] = in_df["basic_category"] == "restaurant"
    in_df["is_high_conf"] = in_df["confidence"] >= HIGH_CONFIDENCE_THRESHOLD
    in_df["has_address_and_cat"] = (
        in_df["basic_category"].notna() & in_df["address"].notna()
    )
    in_df["is_cafe_disagreement"] = (
        in_df["is_cafe_or_coffee_shop"] & in_df["classification_disagreement"]
    )

    agg_all = (
        in_df.groupby("h3_index", as_index=False)
        .agg(
            total_places_count=("overture_id", "count"),
            cafe_count=("is_cafe_or_coffee_shop", "sum"),
            restaurant_count=("is_restaurant", "sum"),
            food_business_count=("is_food_business", "sum"),
            median_confidence=("confidence", "median"),
            high_confidence_count=("is_high_conf", "sum"),
            complete_records_count=("has_address_and_cat", "sum"),
            cafe_disagreement_count=("is_cafe_disagreement", "sum"),
        )
    )

    cafe_dist_agg = (
        cafe_sub.groupby("h3_index", as_index=False)
        .agg(median_nearest_cafe_distance_m=("nearest_cafe_distance_m", "median"))
    )

    # Most common non-null postcode per cell as a real geographic reference label
    postcode_mode = (
        in_df.dropna(subset=["postcode"])
        .groupby("h3_index")["postcode"]
        .agg(lambda s: s.mode().iloc[0] if not s.mode().empty else None)
        .reset_index()
        .rename(columns={"postcode": "dominant_postcode"})
    )

    merged = (
        cells_gdf.merge(agg_all, on="h3_index", how="left")
        .merge(cafe_dist_agg, on="h3_index", how="left")
        .merge(postcode_mode, on="h3_index", how="left")
    )

    int_cols = [
        "total_places_count",
        "cafe_count",
        "restaurant_count",
        "food_business_count",
        "high_confidence_count",
        "complete_records_count",
        "cafe_disagreement_count",
    ]
    for col in int_cols:
        merged[col] = merged[col].fillna(0).astype(int)

    # Densities per km² of clipped area (NULL when low_area_flag is True to prevent sliver distortion)
    reliable = ~merged["low_area_flag"]
    merged["cafe_density_per_km2"] = np.where(
        reliable,
        np.round(merged["cafe_count"] / merged["clipped_area_km2"], 2),
        np.nan,
    )
    merged["food_density_per_km2"] = np.where(
        reliable,
        np.round(merged["food_business_count"] / merged["clipped_area_km2"], 2),
        np.nan,
    )

    merged["median_confidence"] = np.round(merged["median_confidence"], 4)
    merged["high_confidence_pct"] = np.where(
        merged["total_places_count"] > 0,
        np.round(100.0 * merged["high_confidence_count"] / merged["total_places_count"], 2),
        np.nan,
    )
    merged["data_completeness_pct"] = np.where(
        merged["total_places_count"] > 0,
        np.round(100.0 * merged["complete_records_count"] / merged["total_places_count"], 2),
        np.nan,
    )
    merged["median_nearest_cafe_distance_m"] = np.round(
        merged["median_nearest_cafe_distance_m"], 1
    )

    # Reconciliation assertions
    assert int(merged["total_places_count"].sum()) == in_boundary_total
    assert int(merged["cafe_count"].sum()) == in_boundary_cafes
    assert int(merged["food_business_count"].sum()) == in_boundary_food
    assert int(merged["restaurant_count"].sum()) == in_boundary_restaurants

    # Part 4: Write outputs
    # 1. GeoJSON of clipped H3 cells + metrics
    merged.to_file(OUT_CELLS_GEOJSON, driver="GeoJSON")

    # 2. Metrics Parquet (without geometry column for fast DuckDB queries)
    metrics_df = pd.DataFrame(merged.drop(columns=["geometry"]))
    metrics_df.to_parquet(OUT_METRICS_PARQUET, index=False, compression="zstd")

    # 3. H3-tagged POIs Parquet (in-boundary food & drink businesses, which includes all cafes & restaurants)
    pois_out_cols = [
        "overture_id",
        "h3_index",
        "primary_name",
        "basic_category",
        "taxonomy_primary",
        "taxonomy_root",
        "confidence",
        "longitude",
        "latitude",
        "address",
        "locality",
        "postcode",
        "website",
        "phone",
        "operating_status",
        "classification_disagreement",
        "classification_disagreement_note",
        "is_food_business",
        "is_cafe_or_coffee_shop",
        "nearest_cafe_distance_m",
    ]
    in_food_df = in_df.loc[in_df["is_food_business"], pois_out_cols].copy()
    in_food_df.to_parquet(OUT_POIS_PARQUET, index=False, compression="zstd")

    # 4. Quality report CSV
    quality_cols = [
        "h3_index",
        "dominant_postcode",
        "full_area_km2",
        "clipped_area_km2",
        "area_coverage_pct",
        "low_area_flag",
        "total_places_count",
        "cafe_count",
        "restaurant_count",
        "food_business_count",
        "cafe_density_per_km2",
        "food_density_per_km2",
        "median_nearest_cafe_distance_m",
        "median_confidence",
        "high_confidence_pct",
        "data_completeness_pct",
        "cafe_disagreement_count",
    ]
    metrics_df[quality_cols].sort_values(
        by=["cafe_count", "food_business_count"], ascending=False
    ).to_csv(OUT_QUALITY_CSV, index=False)

    # Summary stats for manifest & methodology doc
    total_cells = len(metrics_df)
    low_area_cells = int(metrics_df["low_area_flag"].sum())
    reliable_cells = total_cells - low_area_cells
    cells_with_cafes = int((metrics_df["cafe_count"] > 0).sum())
    cells_with_food = int((metrics_df["food_business_count"] > 0).sum())

    top_cafe_cells = (
        metrics_df.loc[~metrics_df["low_area_flag"]]
        .sort_values(by=["cafe_density_per_km2", "cafe_count"], ascending=False)
        .head(5)
    )

    processed_at = datetime.now(UTC).isoformat()

    manifest = {
        "dataset_id": "hyderabad_h3_res8_intelligence",
        "city": "Hyderabad (GHMC Historical Reference Boundary)",
        "h3_resolution": H3_RESOLUTION,
        "projected_crs": PROJECTED_CRS,
        "min_reliable_area_km2": MIN_RELIABLE_AREA_KM2,
        "high_confidence_threshold": HIGH_CONFIDENCE_THRESHOLD,
        "processed_at_utc": processed_at,
        "boundary_reference": {
            "path": "data/raw/boundaries/ghmc-area.geojson",
            "osm_id": study["source_properties"].get("@id"),
            "osm_timestamp": study["source_properties"].get("@timestamp"),
            "name": study["source_properties"].get("name"),
            "vintage_warning": (
                "Historical OpenStreetMap administrative boundary from January 2018; "
                "not a verified current official GHMC boundary."
            ),
            "geometry_initially_valid": study["was_valid"],
            "validity_note": study["validity_reason"],
            "area_km2": round(study["area_km2"], 3),
            "bounds": study["bounds"],
            "sha256": study["sha256"],
        },
        "reconciliation": {
            "total_overture_input": total_input_records,
            "spatially_unevaluable": unevaluable_count,
            "in_ghmc_boundary_total": in_boundary_total,
            "outside_ghmc_boundary_total": outside_total,
            "in_ghmc_boundary_cafes": in_boundary_cafes,
            "outside_ghmc_boundary_cafes": outside_cafes,
            "in_ghmc_boundary_food": in_boundary_food,
            "outside_ghmc_boundary_food": outside_food,
            "in_ghmc_boundary_restaurants": in_boundary_restaurants,
            "unmatched_in_boundary_records": unmatched_in_boundary,
        },
        "h3_summary": {
            "total_intersecting_cells": total_cells,
            "reliable_area_cells": reliable_cells,
            "low_area_flagged_cells": low_area_cells,
            "cells_with_cafes": cells_with_cafes,
            "cells_with_food_businesses": cells_with_food,
            "max_cafes_in_cell": int(metrics_df["cafe_count"].max()),
            "max_reliable_cafe_density_per_km2": float(
                metrics_df["cafe_density_per_km2"].max()
            ),
        },
        "outputs": {
            "cells_geojson": {
                "path": "data/processed/hyderabad_h3_cells.geojson",
                "size_bytes": OUT_CELLS_GEOJSON.stat().st_size,
            },
            "metrics_parquet": {
                "path": "data/processed/hyderabad_h3_metrics.parquet",
                "size_bytes": OUT_METRICS_PARQUET.stat().st_size,
            },
            "pois_parquet": {
                "path": "data/processed/hyderabad_h3_pois.parquet",
                "size_bytes": OUT_POIS_PARQUET.stat().st_size,
            },
            "quality_report_csv": {
                "path": "data/processed/hyderabad_h3_quality_report.csv",
                "size_bytes": OUT_QUALITY_CSV.stat().st_size,
            },
        },
    }

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    top_rows_md = "\n".join(
        f"| `{row.h3_index}` | `{row.dominant_postcode or '—'}` | {row.clipped_area_km2:.3f} | "
        f"{int(row.cafe_count)} | {int(row.restaurant_count)} | "
        f"{row.cafe_density_per_km2:.2f} | "
        f"{f'{row.median_nearest_cafe_distance_m:.0f} m' if pd.notna(row.median_nearest_cafe_distance_m) else '—'} |"
        for row in top_cafe_cells.itertuples()
    )

    methodology_md = f"""# Intelis — H3 Geospatial Methodology (Hyderabad)

**Generated (UTC):** `{processed_at}`  
**Spatial Grid:** Uber H3 Resolution `{H3_RESOLUTION}` (~0.74 km² nominal hexagon area)  
**Projected CRS for Area & Distance:** `{PROJECTED_CRS}` (WGS 84 / UTM Zone 44N)  
**Manifest:** `data/manifests/h3_hyderabad.json`

---

## 1. Study Area Validation & Limitations

- **Source File:** `data/raw/boundaries/ghmc-area.geojson`
- **OSM Identifier & Vintage:** `{study["source_properties"].get("@id")}` (`{study["source_properties"].get("name")}`), timestamp `{study["source_properties"].get("@timestamp")}`.
- **Geometry Validity:** Initially valid = `{study["was_valid"]}` (`{study["validity_reason"]}`).
- **Computed Study Area (`{PROJECTED_CRS}`):** `{study["area_km2"]:.2f} km²`
- **Geographic Extent (`EPSG:4326`):** `{study["bounds"]["min_longitude"]}°E – {study["bounds"]["max_longitude"]}°E`, `{study["bounds"]["min_latitude"]}°N – {study["bounds"]["max_latitude"]}°N`.

> **Important Limitation:** This polygon is a **January 2018 historical OpenStreetMap boundary**, not a verified current official GHMC administrative boundary. It also contains 5 small disconnected outer fragments alongside the main municipal polygon. All metrics are scoped strictly to this historical reference area.

---

## 2. Point-in-Polygon Reconciliation

Actual polygon containment (`shapely.covers`) was evaluated for all `{total_input_records:,}` Overture Places records (not bounding-box approximation):

| Subset | In GHMC Polygon | Outside GHMC Polygon | Spatially Unevaluable | Total |
| --- | ---: | ---: | ---: | ---: |
| All Overture Places | {in_boundary_total:,} | {outside_total:,} | {unevaluable_count:,} | {total_input_records:,} |
| Food & Drink Businesses | {in_boundary_food:,} | {outside_food:,} | 0 | {in_boundary_food + outside_food:,} |
| Cafes & Coffee Shops | {in_boundary_cafes:,} | {outside_cafes:,} | 0 | {in_boundary_cafes + outside_cafes:,} |
| Restaurants | {in_boundary_restaurants:,} | — | 0 | — |

Every in-boundary record (`{in_boundary_total:,}`) reconciled 100% with the generated H3 cells (`unmatched_in_boundary_records = {unmatched_in_boundary}`).

---

## 3. H3 Cell Generation & Minimum-Area Threshold

- **Total H3 Res-8 Cells Intersecting GHMC:** `{total_cells:,}`
- **Reliable-Area Cells (`clipped_area_km2 >= {MIN_RELIABLE_AREA_KM2} km²`):** `{reliable_cells:,}`
- **Low-Area Boundary Slivers (`clipped_area_km2 < {MIN_RELIABLE_AREA_KM2} km²`):** `{low_area_cells:,}` (`low_area_flag = true`)
- **Cells Containing ≥ 1 Cafe/Coffee Shop:** `{cells_with_cafes:,}` (`{100.0 * cells_with_cafes / total_cells:.1f}%`)
- **Cells Containing ≥ 1 Food Business:** `{cells_with_food:,}` (`{100.0 * cells_with_food / total_cells:.1f}%`)

To prevent tiny clipped boundary slivers from producing artificially inflated per-km² densities, `cafe_density_per_km2` and `food_density_per_km2` are set to `NULL` whenever `clipped_area_km2 < {MIN_RELIABLE_AREA_KM2} km²` (`low_area_flag = true`). Raw counts and `area_coverage_pct` remain fully visible.

---

## 4. Analytical Metric Definitions

1. **`cafe_count`:** Count of in-boundary Overture records in the cell with `basic_category IN ('cafe', 'coffee_shop')` or `taxonomy_primary IN ('cafe', 'coffee_shop')`. Includes flagged `internet_cafe` disagreements (`cafe_disagreement_count` reported separately).
2. **`restaurant_count`:** Count of in-boundary records in the cell with `basic_category = 'restaurant'`.
3. **`food_business_count`:** Count of in-boundary records in the cell with `taxonomy_root = 'food_and_drink'`.
4. **`cafe_density_per_km2`:** `cafe_count / clipped_area_km2` (projected in `{PROJECTED_CRS}`), computed only when `clipped_area_km2 >= {MIN_RELIABLE_AREA_KM2} km²`.
5. **`food_density_per_km2`:** `food_business_count / clipped_area_km2`, computed only when `clipped_area_km2 >= {MIN_RELIABLE_AREA_KM2} km²`.
6. **`median_nearest_cafe_distance_m`:** For each cafe in the cell, Euclidean distance in metres (`{PROJECTED_CRS}`) to the nearest *other* in-boundary cafe (excluding the same business), then median across cafes in the cell (`NULL` when `cafe_count = 0`).
7. **`median_confidence` & `high_confidence_pct`:** Median Overture confidence score across places in the cell and percentage of records with `confidence >= {HIGH_CONFIDENCE_THRESHOLD:.2f}`.
8. **`data_completeness_pct`:** Percentage of places in the cell having both non-null `basic_category` and non-null `address`.

> **Interpretation Guardrail:** Competitor counts and densities measure **observed supply presence in Overture Places**, not consumer demand, footfall, revenue, or profitability. Low cafe density does **not** prove an underserved or profitable market.

---

## 5. Highest Cafe-Density Reliable H3 Cells

| H3 Index | Dominant Postcode | Clipped Area (km²) | Cafes | Restaurants | Cafe Density (/km²) | Median Nearest Cafe |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
{top_rows_md}
"""

    METHODOLOGY_PATH.write_text(methodology_md, encoding="utf-8")
    return manifest


if __name__ == "__main__":
    summary = run_h3_pipeline()
    print(json.dumps(summary["reconciliation"], indent=2))
    print(json.dumps(summary["h3_summary"], indent=2))
