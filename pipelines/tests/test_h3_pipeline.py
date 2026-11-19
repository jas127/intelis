import json
from pathlib import Path

import geopandas as gpd
import h3
import pandas as pd

from intelis_pipelines.h3_hyderabad import (
    BOUNDARY_GEOJSON,
    H3_RESOLUTION,
    MIN_RELIABLE_AREA_KM2,
    OUT_CELLS_GEOJSON,
    OUT_METRICS_PARQUET,
    OUT_POIS_PARQUET,
    OUT_QUALITY_CSV,
    MANIFEST_PATH,
    compute_nearest_other_cafe_distances_m,
    load_and_validate_study_area,
)


def test_study_area_validation_and_projected_area() -> None:
    study = load_and_validate_study_area(BOUNDARY_GEOJSON)
    assert study["geometry"].is_valid
    # GHMC area is roughly ~620–670 km²
    assert 550.0 < study["area_km2"] < 750.0


def test_h3_outputs_exist_and_reconcile() -> None:
    for path in (
        OUT_CELLS_GEOJSON,
        OUT_METRICS_PARQUET,
        OUT_POIS_PARQUET,
        OUT_QUALITY_CSV,
        MANIFEST_PATH,
    ):
        assert Path(path).exists(), f"Missing expected output: {path}"

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    rec = manifest["reconciliation"]

    assert rec["spatially_unevaluable"] == 0
    assert (
        rec["in_ghmc_boundary_total"] + rec["outside_ghmc_boundary_total"]
        == rec["total_overture_input"]
    )
    assert (
        rec["in_ghmc_boundary_cafes"] + rec["outside_ghmc_boundary_cafes"]
        == 1237
    )
    assert rec["unmatched_in_boundary_records"] == 0

    metrics_df = pd.read_parquet(OUT_METRICS_PARQUET)
    pois_df = pd.read_parquet(OUT_POIS_PARQUET)
    cells_gdf = gpd.read_file(OUT_CELLS_GEOJSON)

    assert len(metrics_df) == len(cells_gdf) == manifest["h3_summary"]["total_intersecting_cells"]
    assert int(metrics_df["total_places_count"].sum()) == rec["in_ghmc_boundary_total"]
    assert int(metrics_df["cafe_count"].sum()) == rec["in_ghmc_boundary_cafes"]
    assert int(metrics_df["food_business_count"].sum()) == rec["in_ghmc_boundary_food"]
    assert len(pois_df) == rec["in_ghmc_boundary_food"]


def test_h3_cell_properties_and_clipping_invariants() -> None:
    metrics_df = pd.read_parquet(OUT_METRICS_PARQUET)
    assert (metrics_df["resolution"] == H3_RESOLUTION).all()
    assert (metrics_df["clipped_area_km2"] > 0).all()
    assert (metrics_df["clipped_area_km2"] <= metrics_df["full_area_km2"] + 1e-4).all()
    assert ((metrics_df["area_coverage_pct"] >= 0) & (metrics_df["area_coverage_pct"] <= 100.01)).all()

    # Low-area cells must have NULL densities so slivers never distort choropleths
    low_area = metrics_df.loc[metrics_df["clipped_area_km2"] < MIN_RELIABLE_AREA_KM2]
    assert low_area["low_area_flag"].all()
    assert low_area["cafe_density_per_km2"].isna().all()
    assert low_area["food_density_per_km2"].isna().all()

    # Every cell index is a valid H3 resolution 8 index
    sample_indices = metrics_df["h3_index"].head(20).tolist()
    for idx in sample_indices:
        assert h3.is_valid_cell(idx)
        assert h3.get_resolution(idx) == H3_RESOLUTION


def test_point_to_cell_and_nearest_cafe_distance() -> None:
    pois_df = pd.read_parquet(OUT_POIS_PARQUET)
    sample = pois_df.head(50)
    for row in sample.itertuples():
        expected_cell = h3.latlng_to_cell(row.latitude, row.longitude, H3_RESOLUTION)
        assert row.h3_index == expected_cell

    # Nearest distance excludes self (> 0 for distinct points)
    import numpy as np

    dists = compute_nearest_other_cafe_distances_m(
        np.array([78.4000, 78.4010, 78.4500]),
        np.array([17.4300, 17.4300, 17.4300]),
    )
    assert len(dists) == 3
    assert 90.0 < dists[0] < 120.0
    assert dists[2] > 4000.0
