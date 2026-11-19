from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import duckdb

from app.core.config import settings
from app.schemas.zones import (
    BoundaryVintageMetadata,
    CompareBenchmarks,
    ZoneBusinessItem,
    ZoneDetailResponse,
    ZoneGeoJSONFeature,
    ZoneMetrics,
    ZonesCollectionMeta,
    ZonesCompareResponse,
    ZonesFeatureCollection,
)
from app.services.hyderabad_service import DatasetUnavailableError

ALLOWED_METRICS = {
    "cafe_density_per_km2",
    "cafe_count",
    "food_density_per_km2",
    "food_business_count",
    "restaurant_count",
    "median_nearest_cafe_distance_m",
    "median_confidence",
    "data_completeness_pct",
    "exploration_score",
}

_GEOJSON_CACHE: dict[str, tuple[float, list[ZoneGeoJSONFeature]]] = {}
_LOCALITY_CACHE: dict[str, tuple[float, dict[str, str]]] = {}
_GENERIC_LOCALITIES = {"hyderabad", "hyderaba", "हैदराबाद"}


def _load_dominant_localities() -> dict[str, str]:
    """Derive reliable non-generic modal locality per H3 cell from real Overture records."""
    pois_path = settings.data_processed_dir / "hyderabad_h3_pois.parquet"
    if not pois_path.exists():
        return {}
    key = str(pois_path)
    mtime = pois_path.stat().st_mtime
    cached = _LOCALITY_CACHE.get(key)
    if cached and cached[0] == mtime:
        return cached[1]

    p_src = key.replace("'", "''")
    con = duckdb.connect()
    try:
        rows = con.execute(
            f"""
            WITH counts AS (
                SELECT h3_index, TRIM(locality) AS loc, COUNT(*) AS cnt
                FROM read_parquet('{p_src}')
                WHERE locality IS NOT NULL AND TRIM(locality) != ''
                GROUP BY 1, 2
            ),
            ranked AS (
                SELECT
                    h3_index,
                    loc,
                    ROW_NUMBER() OVER (PARTITION BY h3_index ORDER BY cnt DESC, loc ASC) AS rn
                FROM counts
            )
            SELECT h3_index, loc FROM ranked WHERE rn = 1
            """
        ).fetchall()
    finally:
        con.close()

    mapping = {
        str(h3_id): str(loc)
        for h3_id, loc in rows
        if str(loc).strip().lower() not in _GENERIC_LOCALITIES
    }
    _LOCALITY_CACHE[key] = (mtime, mapping)
    return mapping


def _clean_num(value: Any) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else f


def _require_processed(filename: str) -> Path:
    path = settings.data_processed_dir / filename
    if not path.exists():
        raise DatasetUnavailableError(
            f"H3 dataset '{filename}' is not available. "
            "Run the Hyderabad H3 pipeline first."
        )
    return path


def _load_boundary_metadata() -> BoundaryVintageMetadata:
    manifest_path = settings.data_manifests_dir / "h3_hyderabad.json"
    if manifest_path.exists():
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            b = data.get("boundary_reference") or {}
            return BoundaryVintageMetadata(
                source_file=b.get("path", "data/raw/boundaries/ghmc-area.geojson"),
                osm_id=b.get("osm_id"),
                osm_timestamp=b.get("osm_timestamp"),
                vintage_warning=b.get(
                    "vintage_warning",
                    "Historical OpenStreetMap boundary from January 2018; not a current official GHMC boundary.",
                ),
                h3_resolution=int(data.get("h3_resolution", 8)),
                projected_crs=str(data.get("projected_crs", "EPSG:32644")),
                min_reliable_area_km2=float(data.get("min_reliable_area_km2", 0.15)),
            )
        except (OSError, json.JSONDecodeError):
            pass

    return BoundaryVintageMetadata(
        source_file="data/raw/boundaries/ghmc-area.geojson",
        osm_id="relation/7868535",
        osm_timestamp="2018-01-03T13:15:26Z",
        vintage_warning=(
            "Historical OpenStreetMap boundary from January 2018; "
            "not a verified current official GHMC boundary."
        ),
        h3_resolution=8,
        projected_crs="EPSG:32644",
        min_reliable_area_km2=0.15,
    )


def _row_to_zone_metrics(
    props: dict[str, Any], localities: dict[str, str] | None = None
) -> ZoneMetrics:
    h3_id = str(props["h3_index"])
    loc = props.get("dominant_locality")
    if not loc and localities is not None:
        loc = localities.get(h3_id)
    return ZoneMetrics(
        h3_index=h3_id,
        resolution=int(props["resolution"]),
        centroid_lon=float(props["centroid_lon"]),
        centroid_lat=float(props["centroid_lat"]),
        dominant_postcode=props.get("dominant_postcode") or None,
        dominant_locality=loc or None,
        full_area_km2=float(props["full_area_km2"]),
        clipped_area_km2=float(props["clipped_area_km2"]),
        area_coverage_pct=float(props["area_coverage_pct"]),
        low_area_flag=bool(props["low_area_flag"]),
        total_places_count=int(props["total_places_count"]),
        cafe_count=int(props["cafe_count"]),
        restaurant_count=int(props["restaurant_count"]),
        food_business_count=int(props["food_business_count"]),
        cafe_density_per_km2=_clean_num(props.get("cafe_density_per_km2")),
        food_density_per_km2=_clean_num(props.get("food_density_per_km2")),
        median_nearest_cafe_distance_m=_clean_num(
            props.get("median_nearest_cafe_distance_m")
        ),
        median_confidence=_clean_num(props.get("median_confidence")),
        high_confidence_count=int(props.get("high_confidence_count", 0)),
        high_confidence_pct=_clean_num(props.get("high_confidence_pct")),
        data_completeness_pct=_clean_num(props.get("data_completeness_pct")),
        cafe_disagreement_count=int(props.get("cafe_disagreement_count", 0)),
    )


def _load_all_zone_features() -> list[ZoneGeoJSONFeature]:
    geojson_path = _require_processed("hyderabad_h3_cells.geojson")
    cache_key = str(geojson_path)
    mtime = geojson_path.stat().st_mtime
    cached = _GEOJSON_CACHE.get(cache_key)
    if cached and cached[0] == mtime:
        return cached[1]

    raw = json.loads(geojson_path.read_text(encoding="utf-8"))
    localities = _load_dominant_localities()
    features: list[ZoneGeoJSONFeature] = []
    for feat in raw.get("features", []):
        props = feat.get("properties") or {}
        metrics = _row_to_zone_metrics(props, localities)
        features.append(
            ZoneGeoJSONFeature(
                id=metrics.h3_index,
                geometry=feat["geometry"],
                properties=metrics,
            )
        )

    _GEOJSON_CACHE[cache_key] = (mtime, features)
    return features


def get_hyderabad_zones(
    *,
    category: str = "cafes-coffee-shops",
    metric: str = "cafe_density_per_km2",
    bbox: tuple[float, float, float, float] | None = None,
    limit: int = 1000,
) -> ZonesFeatureCollection:
    if metric not in ALLOWED_METRICS:
        raise ValueError(
            f"Unsupported metric '{metric}'. Allowed: {sorted(ALLOWED_METRICS)}"
        )

    all_features = _load_all_zone_features()

    # Attach default exploratory screening scores so choropleth can render exploration_score
    from app.services.opportunity_service import compute_all_opportunity_scores

    scored_rows, _, _ = compute_all_opportunity_scores()
    score_lookup = {r.h3_index: r for r in scored_rows}

    enriched: list[ZoneGeoJSONFeature] = []
    for f in all_features:
        s = score_lookup.get(f.id)
        if s is not None:
            props = f.properties.model_copy(
                update={
                    "exploration_score": s.exploration_score,
                    "competition_whitespace_score": s.competition_whitespace_score,
                    "food_context_score": s.food_context_score,
                    "data_reliability_score": s.data_reliability_score,
                }
            )
            enriched.append(
                ZoneGeoJSONFeature(id=f.id, geometry=f.geometry, properties=props)
            )
        else:
            enriched.append(f)

    filtered = enriched

    if bbox is not None:
        min_lon, min_lat, max_lon, max_lat = bbox
        filtered = [
            f
            for f in filtered
            if min_lon <= f.properties.centroid_lon <= max_lon
            and min_lat <= f.properties.centroid_lat <= max_lat
        ]

    # Sort descending by requested metric (None last) for predictable top-N limits
    filtered = sorted(
        filtered,
        key=lambda f: (
            getattr(f.properties, metric) is not None,
            getattr(f.properties, metric) or -1.0,
            f.properties.h3_index,
        ),
        reverse=True,
    )

    total_matching = len(filtered)
    sliced = filtered[:limit]

    return ZonesFeatureCollection(
        features=sliced,
        metadata=ZonesCollectionMeta(
            city="hyderabad",
            category=category,
            metric=metric,
            total_matching=total_matching,
            returned=len(sliced),
            limit=limit,
            bbox=bbox,
            boundary_metadata=_load_boundary_metadata(),
        ),
    )


def get_hyderabad_zone_detail(h3_index: str) -> ZoneDetailResponse | None:
    metrics_path = _require_processed("hyderabad_h3_metrics.parquet")
    pois_path = _require_processed("hyderabad_h3_pois.parquet")

    m_src = str(metrics_path).replace("'", "''")
    p_src = str(pois_path).replace("'", "''")

    con = duckdb.connect()
    try:
        rel = con.execute(
            f"SELECT * FROM read_parquet('{m_src}') WHERE h3_index = ?",
            [h3_index],
        )
        cols = [d[0] for d in rel.description]
        row = rel.fetchone()
        if row is None:
            return None
        localities = _load_dominant_localities()
        zone = _row_to_zone_metrics(dict(zip(cols, row)), localities)

        cafe_rows = con.execute(
            f"""
            SELECT
                overture_id, primary_name, basic_category, taxonomy_primary,
                confidence, address, locality, postcode, website, phone,
                operating_status, classification_disagreement,
                classification_disagreement_note, longitude, latitude,
                is_food_business, is_cafe_or_coffee_shop, nearest_cafe_distance_m
            FROM read_parquet('{p_src}')
            WHERE h3_index = ? AND is_cafe_or_coffee_shop = TRUE
            ORDER BY confidence DESC NULLS LAST, overture_id ASC
            LIMIT 100
            """,
            [h3_index],
        ).fetchall()
    finally:
        con.close()

    cafes = [
        ZoneBusinessItem(
            overture_id=str(r[0]),
            primary_name=r[1],
            basic_category=r[2],
            taxonomy_primary=r[3],
            confidence=_clean_num(r[4]),
            address=r[5],
            locality=r[6],
            postcode=r[7],
            website=r[8],
            phone=r[9],
            operating_status=r[10],
            classification_disagreement=bool(r[11]),
            classification_disagreement_note=r[12],
            longitude=float(r[13]),
            latitude=float(r[14]),
            is_food_business=bool(r[15]),
            is_cafe_or_coffee_shop=bool(r[16]),
            nearest_cafe_distance_m=_clean_num(r[17]),
        )
        for r in cafe_rows
    ]

    other_food = max(0, zone.food_business_count - zone.cafe_count)

    return ZoneDetailResponse(
        city="hyderabad",
        zone=zone,
        cafes=cafes,
        other_food_businesses_count=other_food,
        boundary_metadata=_load_boundary_metadata(),
    )


def compare_hyderabad_zones(zone_ids: list[str]) -> tuple[ZonesCompareResponse, list[str]]:
    """Return comparison payload and list of any missing zone IDs."""
    metrics_path = _require_processed("hyderabad_h3_metrics.parquet")
    m_src = str(metrics_path).replace("'", "''")

    con = duckdb.connect()
    try:
        placeholders = ", ".join(["?"] * len(zone_ids))
        rel = con.execute(
            f"SELECT * FROM read_parquet('{m_src}') WHERE h3_index IN ({placeholders})",
            zone_ids,
        )
        cols = [d[0] for d in rel.description]
        rows = rel.fetchall()

        bench_row = con.execute(
            f"""
            SELECT
                COUNT(*) AS reliable_cells,
                QUANTILE_CONT(cafe_density_per_km2, 0.50),
                QUANTILE_CONT(food_density_per_km2, 0.50),
                QUANTILE_CONT(median_nearest_cafe_distance_m, 0.50)
            FROM read_parquet('{m_src}')
            WHERE low_area_flag = FALSE
            """
        ).fetchone()
    finally:
        con.close()

    localities = _load_dominant_localities()
    by_id = {
        str(dict(zip(cols, r))["h3_index"]): _row_to_zone_metrics(
            dict(zip(cols, r)), localities
        )
        for r in rows
    }
    missing = [zid for zid in zone_ids if zid not in by_id]
    ordered_zones = [by_id[zid] for zid in zone_ids if zid in by_id]

    warnings: list[str] = [
        "All H3 cells are clipped to the January 2018 historical OSM GHMC reference boundary.",
        "Competitor counts and densities measure observed Overture supply presence, not demand or revenue.",
    ]
    for z in ordered_zones:
        if z.low_area_flag:
            warnings.append(
                f"Cell {z.h3_index} covers only {z.clipped_area_km2:.3f} km² "
                f"({z.area_coverage_pct:.1f}% of a full hex); density metrics are suppressed to avoid boundary-sliver distortion."
            )
        if z.cafe_disagreement_count > 0:
            warnings.append(
                f"Cell {z.h3_index} includes {z.cafe_disagreement_count} flagged internet_cafe classification disagreement(s)."
            )

    benchmarks = CompareBenchmarks(
        reliable_cells_count=int(bench_row[0]),
        median_cafe_density_per_km2=_clean_num(round(bench_row[1], 2) if bench_row[1] is not None else None),
        median_food_density_per_km2=_clean_num(round(bench_row[2], 2) if bench_row[2] is not None else None),
        median_nearest_cafe_distance_m=_clean_num(round(bench_row[3], 1) if bench_row[3] is not None else None),
    )

    return (
        ZonesCompareResponse(
            city="hyderabad",
            zones=ordered_zones,
            benchmarks=benchmarks,
            warnings=warnings,
            boundary_metadata=_load_boundary_metadata(),
        ),
        missing,
    )
