from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import duckdb

from app.core.config import settings
from app.schemas.pois import (
    CategoryBreakdownItem,
    CitySummaryResponse,
    DataCoverageMetadata,
    GeoJSONPoint,
    POICollectionMeta,
    POIFeature,
    POIFeatureCollection,
    POIProperties,
)


class DatasetUnavailableError(RuntimeError):
    """Raised when required curated Parquet datasets are missing or unreadable."""


_SUMMARY_CACHE: dict[str, tuple[float, CitySummaryResponse]] = {}


def _require_parquet(filename: str) -> Path:
    path = settings.data_processed_dir / filename
    if not path.exists():
        raise DatasetUnavailableError(
            f"Curated dataset '{filename}' is not available. "
            "Run the Hyderabad Overture pipeline first."
        )
    return path


def _select_source_and_filter(category: str) -> tuple[Path, str | None, list[Any]]:
    normalized = category.strip().lower()
    if normalized in ("cafes-coffee-shops", "cafes", "cafes_coffee_shops"):
        return _require_parquet("hyderabad_cafes_coffee_shops.parquet"), None, []
    if normalized in ("cafe", "coffee_shop"):
        return (
            _require_parquet("hyderabad_cafes_coffee_shops.parquet"),
            "basic_category = ?",
            [normalized],
        )
    if normalized in ("restaurants", "restaurant"):
        return (
            _require_parquet("hyderabad_food_businesses.parquet"),
            "basic_category = ?",
            ["restaurant"],
        )
    if normalized in ("food-businesses", "food_businesses", "food_and_drink"):
        return _require_parquet("hyderabad_food_businesses.parquet"), None, []
    if normalized == "all":
        return _require_parquet("hyderabad_all_places.parquet"), None, []

    return (
        _require_parquet("hyderabad_all_places.parquet"),
        "basic_category = ?",
        [normalized],
    )


def get_hyderabad_pois(
    *,
    category: str = "cafes-coffee-shops",
    bbox: tuple[float, float, float, float] | None = None,
    limit: int = 1000,
    offset: int = 0,
    exclude_disagreements: bool = False,
) -> POIFeatureCollection:
    parquet_path, cat_clause, cat_params = _select_source_and_filter(category)

    where_clauses: list[str] = ["longitude IS NOT NULL", "latitude IS NOT NULL"]
    params: list[Any] = []

    if cat_clause:
        where_clauses.append(cat_clause)
        params.extend(cat_params)

    if exclude_disagreements:
        where_clauses.append("classification_disagreement = FALSE")

    if bbox is not None:
        min_lon, min_lat, max_lon, max_lat = bbox
        where_clauses.append("longitude BETWEEN ? AND ?")
        where_clauses.append("latitude BETWEEN ? AND ?")
        params.extend([min_lon, max_lon, min_lat, max_lat])

    where_sql = " AND ".join(where_clauses)
    src = str(parquet_path).replace("'", "''")

    con = duckdb.connect()
    try:
        total_matching = int(
            con.execute(
                f"SELECT COUNT(*) FROM read_parquet('{src}') WHERE {where_sql}",
                params,
            ).fetchone()[0]
        )

        rows = con.execute(
            f"""
            SELECT
                overture_id,
                primary_name,
                basic_category,
                taxonomy_primary,
                confidence,
                longitude,
                latitude,
                address,
                locality,
                postcode,
                website,
                phone,
                operating_status,
                classification_disagreement,
                classification_disagreement_note
            FROM read_parquet('{src}')
            WHERE {where_sql}
            ORDER BY confidence DESC NULLS LAST, overture_id ASC
            LIMIT ? OFFSET ?
            """,
            [*params, limit, offset],
        ).fetchall()
    finally:
        con.close()

    features: list[POIFeature] = []
    for row in rows:
        (
            overture_id,
            primary_name,
            basic_category,
            taxonomy_primary,
            confidence,
            lon,
            lat,
            address,
            locality,
            postcode,
            website,
            phone,
            operating_status,
            disagreement,
            disagreement_note,
        ) = row
        features.append(
            POIFeature(
                id=str(overture_id),
                geometry=GeoJSONPoint(coordinates=(float(lon), float(lat))),
                properties=POIProperties(
                    overture_id=str(overture_id),
                    primary_name=primary_name,
                    basic_category=basic_category,
                    taxonomy_primary=taxonomy_primary,
                    confidence=round(float(confidence), 4)
                    if confidence is not None
                    else None,
                    address=address,
                    locality=locality,
                    postcode=postcode,
                    website=website,
                    phone=phone,
                    operating_status=operating_status,
                    classification_disagreement=bool(disagreement),
                    classification_disagreement_note=disagreement_note,
                ),
            )
        )

    return POIFeatureCollection(
        features=features,
        metadata=POICollectionMeta(
            city="hyderabad",
            category=category,
            total_matching=total_matching,
            returned=len(features),
            limit=limit,
            offset=offset,
            bbox=bbox,
        ),
    )


def get_hyderabad_summary() -> CitySummaryResponse:
    all_parquet = _require_parquet("hyderabad_all_places.parquet")
    food_parquet = _require_parquet("hyderabad_food_businesses.parquet")
    cafes_parquet = _require_parquet("hyderabad_cafes_coffee_shops.parquet")

    cache_key = str(all_parquet)
    mtime = all_parquet.stat().st_mtime
    cached = _SUMMARY_CACHE.get(cache_key)
    if cached and cached[0] == mtime:
        return cached[1]

    all_src = str(all_parquet).replace("'", "''")
    food_src = str(food_parquet).replace("'", "''")
    cafes_src = str(cafes_parquet).replace("'", "''")

    con = duckdb.connect()
    try:
        (
            total_places,
            missing_category_count,
            min_lon,
            min_lat,
            max_lon,
            max_lat,
        ) = con.execute(
            f"""
            SELECT
                COUNT(*),
                SUM(CASE WHEN basic_category IS NULL THEN 1 ELSE 0 END),
                MIN(longitude),
                MIN(latitude),
                MAX(longitude),
                MAX(latitude)
            FROM read_parquet('{all_src}')
            """
        ).fetchone()

        food_count, restaurant_count = con.execute(
            f"""
            SELECT
                COUNT(*),
                SUM(CASE WHEN basic_category = 'restaurant' THEN 1 ELSE 0 END)
            FROM read_parquet('{food_src}')
            """
        ).fetchone()

        cafes_count, cafe_disagreements = con.execute(
            f"""
            SELECT
                COUNT(*),
                SUM(CASE WHEN classification_disagreement THEN 1 ELSE 0 END)
            FROM read_parquet('{cafes_src}')
            """
        ).fetchone()

        root_rows = con.execute(
            f"""
            SELECT COALESCE(taxonomy_root, 'unclassified') AS cat, COUNT(*) AS cnt
            FROM read_parquet('{all_src}')
            GROUP BY 1
            ORDER BY cnt DESC
            """
        ).fetchall()

        food_rows = con.execute(
            f"""
            SELECT COALESCE(basic_category, 'unclassified') AS cat, COUNT(*) AS cnt
            FROM read_parquet('{food_src}')
            GROUP BY 1
            ORDER BY cnt DESC
            """
        ).fetchall()
    finally:
        con.close()

    processed_at_utc: str | None = None
    manifest_path = settings.data_manifests_dir / "overture_hyderabad.json"
    if manifest_path.exists():
        try:
            manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
            processed_at_utc = manifest_data.get("processed_at_utc")
        except (OSError, json.JSONDecodeError):
            processed_at_utc = None

    total_int = int(total_places)
    food_int = int(food_count)

    response = CitySummaryResponse(
        city="hyderabad",
        total_places=total_int,
        cafes_coffee_shops_count=int(cafes_count),
        restaurant_count=int(restaurant_count),
        food_business_count=food_int,
        category_breakdown=[
            CategoryBreakdownItem(
                category=str(cat),
                count=int(cnt),
                share_pct=round(100.0 * int(cnt) / total_int, 2) if total_int else 0.0,
            )
            for cat, cnt in root_rows
        ],
        food_category_breakdown=[
            CategoryBreakdownItem(
                category=str(cat),
                count=int(cnt),
                share_pct=round(100.0 * int(cnt) / food_int, 2) if food_int else 0.0,
            )
            for cat, cnt in food_rows
        ],
        data_coverage=DataCoverageMetadata(
            source_provider="Overture Maps Foundation (Places)",
            crs="EPSG:4326",
            processed_at_utc=processed_at_utc,
            missing_category_count=int(missing_category_count),
            cafe_classification_disagreements=int(cafe_disagreements),
            geographic_extent={
                "min_longitude": round(float(min_lon), 6),
                "min_latitude": round(float(min_lat), 6),
                "max_longitude": round(float(max_lon), 6),
                "max_latitude": round(float(max_lat), 6),
            },
        ),
    )

    _SUMMARY_CACHE[cache_key] = (mtime, response)
    return response
