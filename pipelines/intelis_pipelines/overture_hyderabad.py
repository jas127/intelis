"""Process raw Overture Places GeoJSON for Hyderabad into curated Parquet & CSV outputs.

Generates:
  - data/processed/hyderabad_all_places.parquet
  - data/processed/hyderabad_food_businesses.parquet
  - data/processed/hyderabad_cafes_coffee_shops.parquet
  - data/processed/hyderabad_category_summary.csv
  - data/manifests/overture_hyderabad.json
  - docs/data-quality-report.md

Rules:
  - Never modifies or overwrites data/raw/.
  - Preserves original classification fields and flags disagreements explicitly.
  - Never classifies businesses by name alone.
  - Never deletes potential duplicates; reports them transparently.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_GEOJSON = REPO_ROOT / "data" / "raw" / "overture" / "hyderabad_overture_places.geojson"
PROCESSED_DIR = REPO_ROOT / "data" / "processed"
MANIFEST_PATH = REPO_ROOT / "data" / "manifests" / "overture_hyderabad.json"
REPORT_PATH = REPO_ROOT / "docs" / "data-quality-report.md"

ALL_PLACES_PARQUET = PROCESSED_DIR / "hyderabad_all_places.parquet"
FOOD_PARQUET = PROCESSED_DIR / "hyderabad_food_businesses.parquet"
CAFES_PARQUET = PROCESSED_DIR / "hyderabad_cafes_coffee_shops.parquet"
CATEGORY_SUMMARY_CSV = PROCESSED_DIR / "hyderabad_category_summary.csv"

CAFE_TAXONOMY_VALUES = {"cafe", "coffee_shop"}

ARROW_SCHEMA = pa.schema(
    [
        ("overture_id", pa.string()),
        ("version", pa.int64()),
        ("primary_name", pa.string()),
        ("basic_category", pa.string()),
        ("taxonomy_primary", pa.string()),
        ("taxonomy_root", pa.string()),
        ("taxonomy_hierarchy", pa.list_(pa.string())),
        ("taxonomy_alternates", pa.list_(pa.string())),
        ("confidence", pa.float64()),
        ("longitude", pa.float64()),
        ("latitude", pa.float64()),
        ("address", pa.string()),
        ("locality", pa.string()),
        ("postcode", pa.string()),
        ("website", pa.string()),
        ("phone", pa.string()),
        ("operating_status", pa.string()),
        ("primary_source_dataset", pa.string()),
        ("primary_source_license", pa.string()),
        ("primary_source_update_time", pa.string()),
        ("classification_disagreement", pa.bool_()),
        ("classification_disagreement_note", pa.string()),
        ("is_food_business", pa.bool_()),
        ("is_cafe_or_coffee_shop", pa.bool_()),
    ]
)


def _first_non_empty(values: Any) -> str | None:
    if isinstance(values, list):
        for item in values:
            if isinstance(item, str) and item.strip():
                return item.strip()
    return None


def _extract_row(feature: dict[str, Any]) -> dict[str, Any]:
    props = feature.get("properties") or {}
    geom = feature.get("geometry") or {}
    coords = geom.get("coordinates") if isinstance(geom, dict) else None

    lon: float | None = None
    lat: float | None = None
    if isinstance(coords, list) and len(coords) >= 2:
        try:
            lon = float(coords[0]) if coords[0] is not None else None
            lat = float(coords[1]) if coords[1] is not None else None
        except (TypeError, ValueError):
            lon, lat = None, None

    names = props.get("names") or {}
    primary_name = names.get("primary") if isinstance(names, dict) else None
    if isinstance(primary_name, str):
        primary_name = primary_name.strip() or None

    basic_category = props.get("basic_category")
    taxonomy = props.get("taxonomy") or {}
    taxonomy_primary = taxonomy.get("primary") if isinstance(taxonomy, dict) else None
    hierarchy = taxonomy.get("hierarchy") if isinstance(taxonomy, dict) else None
    hierarchy_list = [str(x) for x in hierarchy] if isinstance(hierarchy, list) else []
    taxonomy_root = hierarchy_list[0] if hierarchy_list else None

    alternates = taxonomy.get("alternates") if isinstance(taxonomy, dict) else None
    alternates_list = [str(x) for x in alternates] if isinstance(alternates, list) else []

    addresses = props.get("addresses") or []
    first_addr = addresses[0] if isinstance(addresses, list) and addresses else {}
    address = first_addr.get("freeform") if isinstance(first_addr, dict) else None
    if isinstance(address, str):
        address = address.replace("\\n", ", ").replace("\n", ", ").strip() or None
    locality = first_addr.get("locality") if isinstance(first_addr, dict) else None
    postcode = first_addr.get("postcode") if isinstance(first_addr, dict) else None

    sources = props.get("sources") or []
    first_src = sources[0] if isinstance(sources, list) and sources else {}
    src_dataset = first_src.get("dataset") if isinstance(first_src, dict) else None
    src_license = first_src.get("license") if isinstance(first_src, dict) else None
    src_update = first_src.get("update_time") if isinstance(first_src, dict) else None

    disagreement = bool(
        basic_category is not None
        and taxonomy_primary is not None
        and basic_category != taxonomy_primary
    )
    disagreement_note = (
        f"basic_category={basic_category} vs taxonomy_primary={taxonomy_primary}"
        if disagreement
        else None
    )

    is_food = taxonomy_root == "food_and_drink"
    is_cafe = (
        basic_category in CAFE_TAXONOMY_VALUES
        or taxonomy_primary in CAFE_TAXONOMY_VALUES
    )

    confidence_raw = props.get("confidence")
    confidence = float(confidence_raw) if confidence_raw is not None else None
    version_raw = props.get("version")
    version = int(version_raw) if version_raw is not None else None

    return {
        "overture_id": feature.get("id"),
        "version": version,
        "primary_name": primary_name,
        "basic_category": basic_category,
        "taxonomy_primary": taxonomy_primary,
        "taxonomy_root": taxonomy_root,
        "taxonomy_hierarchy": hierarchy_list,
        "taxonomy_alternates": alternates_list,
        "confidence": confidence,
        "longitude": lon,
        "latitude": lat,
        "address": address,
        "locality": locality,
        "postcode": postcode,
        "website": _first_non_empty(props.get("websites")),
        "phone": _first_non_empty(props.get("phones")),
        "operating_status": props.get("operating_status"),
        "primary_source_dataset": src_dataset,
        "primary_source_license": src_license,
        "primary_source_update_time": src_update,
        "classification_disagreement": disagreement,
        "classification_disagreement_note": disagreement_note,
        "is_food_business": is_food,
        "is_cafe_or_coffee_shop": is_cafe,
    }


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def stream_geojson_to_parquet(
    source_path: Path, output_parquet: Path, batch_size: int = 25_000
) -> int:
    output_parquet.parent.mkdir(parents=True, exist_ok=True)
    writer = pq.ParquetWriter(output_parquet, ARROW_SCHEMA, compression="zstd")
    buffer: list[dict[str, Any]] = []
    total_rows = 0

    try:
        with source_path.open("r", encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if (
                    not s
                    or s.startswith('{"type": "FeatureCollection"')
                    or s in ("]}", "]")
                ):
                    continue
                if s.endswith(","):
                    s = s[:-1]
                if s.endswith("]}"):
                    s = s[:-2]
                feature = json.loads(s)
                buffer.append(_extract_row(feature))
                total_rows += 1

                if len(buffer) >= batch_size:
                    batch = pa.RecordBatch.from_pylist(buffer, schema=ARROW_SCHEMA)
                    writer.write_batch(batch)
                    buffer.clear()

        if buffer:
            batch = pa.RecordBatch.from_pylist(buffer, schema=ARROW_SCHEMA)
            writer.write_batch(batch)
            buffer.clear()
    finally:
        writer.close()

    return total_rows


def build_curated_outputs_and_reports() -> dict[str, Any]:
    if not RAW_GEOJSON.exists():
        raise FileNotFoundError(f"Raw Overture GeoJSON not found: {RAW_GEOJSON}")

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

    raw_count = stream_geojson_to_parquet(RAW_GEOJSON, ALL_PLACES_PARQUET)

    con = duckdb.connect()
    try:
        all_path = str(ALL_PLACES_PARQUET)
        food_path = str(FOOD_PARQUET)
        cafes_path = str(CAFES_PARQUET)
        summary_csv = str(CATEGORY_SUMMARY_CSV)

        # 1. Filtered Parquet outputs
        con.execute(
            f"""
            COPY (
                SELECT * FROM read_parquet('{all_path}')
                WHERE is_food_business = TRUE
            ) TO '{food_path}' (FORMAT PARQUET, COMPRESSION ZSTD)
            """
        )

        con.execute(
            f"""
            COPY (
                SELECT * FROM read_parquet('{all_path}')
                WHERE is_cafe_or_coffee_shop = TRUE
            ) TO '{cafes_path}' (FORMAT PARQUET, COMPRESSION ZSTD)
            """
        )

        # 2. Category summary CSV
        con.execute(
            f"""
            COPY (
                SELECT
                    COALESCE(taxonomy_root, 'unclassified') AS taxonomy_root,
                    COALESCE(basic_category, 'unclassified') AS basic_category,
                    COALESCE(taxonomy_primary, 'unclassified') AS taxonomy_primary,
                    COUNT(*) AS record_count,
                    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 4) AS pct_of_total,
                    ROUND(AVG(confidence), 4) AS avg_confidence,
                    SUM(CASE WHEN classification_disagreement THEN 1 ELSE 0 END) AS disagreement_count
                FROM read_parquet('{all_path}')
                GROUP BY 1, 2, 3
                ORDER BY record_count DESC, taxonomy_root, basic_category
            ) TO '{summary_csv}' (HEADER, DELIMITER ',')
            """
        )

        # 3. Data-quality metrics via DuckDB
        counts = con.execute(
            f"""
            SELECT
                COUNT(*) AS total_places,
                SUM(CASE WHEN is_food_business THEN 1 ELSE 0 END) AS food_businesses,
                SUM(CASE WHEN is_cafe_or_coffee_shop THEN 1 ELSE 0 END) AS cafes_coffee_shops,
                SUM(CASE WHEN basic_category = 'restaurant' THEN 1 ELSE 0 END) AS restaurants,
                SUM(CASE WHEN primary_name IS NULL OR TRIM(primary_name) = '' THEN 1 ELSE 0 END) AS missing_names,
                SUM(CASE WHEN basic_category IS NULL THEN 1 ELSE 0 END) AS missing_basic_category,
                SUM(CASE WHEN taxonomy_primary IS NULL THEN 1 ELSE 0 END) AS missing_taxonomy_primary,
                SUM(CASE WHEN longitude IS NULL OR latitude IS NULL THEN 1 ELSE 0 END) AS missing_coordinates,
                SUM(CASE WHEN longitude < -180 OR longitude > 180 OR latitude < -90 OR latitude > 90 THEN 1 ELSE 0 END) AS invalid_coordinates,
                SUM(CASE WHEN classification_disagreement THEN 1 ELSE 0 END) AS total_disagreements,
                SUM(CASE WHEN is_cafe_or_coffee_shop AND classification_disagreement THEN 1 ELSE 0 END) AS cafe_disagreements,
                COUNT(*) - COUNT(DISTINCT overture_id) AS duplicate_overture_ids,
                MIN(longitude) AS min_lon,
                MIN(latitude) AS min_lat,
                MAX(longitude) AS max_lon,
                MAX(latitude) AS max_lat
            FROM read_parquet('{all_path}')
            """
        ).fetchone()

        (
            total_places,
            food_businesses,
            cafes_coffee_shops,
            restaurants,
            missing_names,
            missing_basic_category,
            missing_taxonomy_primary,
            missing_coordinates,
            invalid_coordinates,
            total_disagreements,
            cafe_disagreements,
            duplicate_overture_ids,
            min_lon,
            min_lat,
            max_lon,
            max_lat,
        ) = counts

        suspected_dups = con.execute(
            f"""
            WITH grouped AS (
                SELECT
                    LOWER(TRIM(primary_name)) AS norm_name,
                    ROUND(longitude, 4) AS r_lon,
                    ROUND(latitude, 4) AS r_lat,
                    COUNT(*) AS cnt
                FROM read_parquet('{all_path}')
                WHERE primary_name IS NOT NULL
                  AND longitude IS NOT NULL
                  AND latitude IS NOT NULL
                GROUP BY 1, 2, 3
                HAVING COUNT(*) > 1
            )
            SELECT COUNT(*) AS duplicate_groups, COALESCE(SUM(cnt - 1), 0) AS excess_records
            FROM grouped
            """
        ).fetchone()
        dup_groups, dup_excess = suspected_dups

        cafe_suspected_dups = con.execute(
            f"""
            WITH grouped AS (
                SELECT
                    LOWER(TRIM(primary_name)) AS norm_name,
                    ROUND(longitude, 4) AS r_lon,
                    ROUND(latitude, 4) AS r_lat,
                    COUNT(*) AS cnt
                FROM read_parquet('{cafes_path}')
                WHERE primary_name IS NOT NULL
                  AND longitude IS NOT NULL
                  AND latitude IS NOT NULL
                GROUP BY 1, 2, 3
                HAVING COUNT(*) > 1
            )
            SELECT COUNT(*) AS duplicate_groups, COALESCE(SUM(cnt - 1), 0) AS excess_records
            FROM grouped
            """
        ).fetchone()
        cafe_dup_groups, cafe_dup_excess = cafe_suspected_dups

        conf_stats = con.execute(
            f"""
            SELECT
                MIN(confidence),
                QUANTILE_CONT(confidence, 0.25),
                QUANTILE_CONT(confidence, 0.50),
                AVG(confidence),
                QUANTILE_CONT(confidence, 0.75),
                MAX(confidence),
                SUM(CASE WHEN confidence < 0.4 THEN 1 ELSE 0 END),
                SUM(CASE WHEN confidence >= 0.4 AND confidence < 0.7 THEN 1 ELSE 0 END),
                SUM(CASE WHEN confidence >= 0.7 AND confidence < 0.9 THEN 1 ELSE 0 END),
                SUM(CASE WHEN confidence >= 0.9 THEN 1 ELSE 0 END)
            FROM read_parquet('{all_path}')
            """
        ).fetchone()

        top_roots = con.execute(
            f"""
            SELECT COALESCE(taxonomy_root, 'unclassified') AS root, COUNT(*) AS cnt
            FROM read_parquet('{all_path}')
            GROUP BY 1
            ORDER BY cnt DESC
            """
        ).fetchall()

        top_food_cats = con.execute(
            f"""
            SELECT COALESCE(basic_category, 'unclassified') AS cat, COUNT(*) AS cnt
            FROM read_parquet('{food_path}')
            GROUP BY 1
            ORDER BY cnt DESC
            """
        ).fetchall()

        cafe_breakdown = con.execute(
            f"""
            SELECT basic_category, taxonomy_primary, classification_disagreement, COUNT(*) AS cnt
            FROM read_parquet('{cafes_path}')
            GROUP BY 1, 2, 3
            ORDER BY cnt DESC
            """
        ).fetchall()

        source_dist = con.execute(
            f"""
            SELECT
                COALESCE(primary_source_dataset, 'unknown') AS dataset,
                COALESCE(primary_source_license, 'unknown') AS license,
                COUNT(*) AS cnt
            FROM read_parquet('{all_path}')
            GROUP BY 1, 2
            ORDER BY cnt DESC
            """
        ).fetchall()
    finally:
        con.close()

    processed_at = datetime.now(UTC).isoformat()

    manifest = {
        "dataset_id": "overture_hyderabad_places",
        "city": "Hyderabad, Telangana, India",
        "source_provider": "Overture Maps Foundation (Places theme)",
        "source_file": "data/raw/overture/hyderabad_overture_places.geojson",
        "source_size_bytes": RAW_GEOJSON.stat().st_size,
        "source_sha256": _sha256_file(RAW_GEOJSON),
        "licenses_observed": [
            {"dataset": ds, "license": lic, "record_count": int(cnt)}
            for ds, lic, cnt in source_dist
        ],
        "processed_at_utc": processed_at,
        "pipeline_module": "pipelines/intelis_pipelines/overture_hyderabad.py",
        "crs": "EPSG:4326",
        "geographic_extent": {
            "min_longitude": round(float(min_lon), 6),
            "min_latitude": round(float(min_lat), 6),
            "max_longitude": round(float(max_lon), 6),
            "max_latitude": round(float(max_lat), 6),
        },
        "record_counts": {
            "raw_geojson_features": int(raw_count),
            "all_places_parquet": int(total_places),
            "food_businesses_parquet": int(food_businesses),
            "cafes_coffee_shops_parquet": int(cafes_coffee_shops),
            "restaurants_subset": int(restaurants),
        },
        "outputs": {
            "all_places": {
                "path": "data/processed/hyderabad_all_places.parquet",
                "size_bytes": ALL_PLACES_PARQUET.stat().st_size,
            },
            "food_businesses": {
                "path": "data/processed/hyderabad_food_businesses.parquet",
                "size_bytes": FOOD_PARQUET.stat().st_size,
            },
            "cafes_coffee_shops": {
                "path": "data/processed/hyderabad_cafes_coffee_shops.parquet",
                "size_bytes": CAFES_PARQUET.stat().st_size,
            },
            "category_summary": {
                "path": "data/processed/hyderabad_category_summary.csv",
                "size_bytes": CATEGORY_SUMMARY_CSV.stat().st_size,
            },
        },
        "classification_policy": (
            "Cafe and coffee-shop records are selected strictly via Overture "
            "basic_category and taxonomy.primary values ('cafe', 'coffee_shop'), "
            "never by business name alone. Disagreements (e.g., basic_category='cafe' "
            "with taxonomy.primary='internet_cafe') are preserved and flagged."
        ),
    }

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    # Build Markdown Data Quality Report
    (
        c_min,
        c_p25,
        c_p50,
        c_avg,
        c_p75,
        c_max,
        c_lt04,
        c_04_07,
        c_07_09,
        c_ge09,
    ) = conf_stats

    root_rows = "\n".join(
        f"| `{root}` | {cnt:,} | {100.0 * cnt / total_places:.2f}% |"
        for root, cnt in top_roots
    )
    food_rows = "\n".join(
        f"| `{cat}` | {cnt:,} | {100.0 * cnt / food_businesses:.2f}% |"
        for cat, cnt in top_food_cats
    )
    cafe_rows = "\n".join(
        f"| `{bc}` | `{tp}` | {'Yes' if dis else 'No'} | {cnt:,} |"
        for bc, tp, dis, cnt in cafe_breakdown
    )
    source_rows = "\n".join(
        f"| `{ds}` | `{lic}` | {cnt:,} |"
        for ds, lic, cnt in source_dist
    )

    report_md = f"""# Intelis — Hyderabad Overture Places Data Quality Report

**Generated (UTC):** `{processed_at}`  
**Source File:** `data/raw/overture/hyderabad_overture_places.geojson` ({RAW_GEOJSON.stat().st_size / (1024 * 1024):.1f} MB)  
**Manifest:** `data/manifests/overture_hyderabad.json`

---

## 1. Processed Output Record Counts

| Output File | Records | File Size |
| --- | ---: | ---: |
| `data/processed/hyderabad_all_places.parquet` | {total_places:,} | {ALL_PLACES_PARQUET.stat().st_size / (1024 * 1024):.2f} MB |
| `data/processed/hyderabad_food_businesses.parquet` | {food_businesses:,} | {FOOD_PARQUET.stat().st_size / (1024 * 1024):.2f} MB |
| `data/processed/hyderabad_cafes_coffee_shops.parquet` | {cafes_coffee_shops:,} | {CAFES_PARQUET.stat().st_size / 1024:.1f} KB |
| `data/processed/hyderabad_category_summary.csv` | — (aggregated) | {CATEGORY_SUMMARY_CSV.stat().st_size / 1024:.1f} KB |

---

## 2. Completeness & Coordinate Validation

| Check | Count | Share of Total |
| --- | ---: | ---: |
| Missing `primary_name` | {missing_names:,} | {100.0 * missing_names / total_places:.2f}% |
| Missing `basic_category` | {missing_basic_category:,} | {100.0 * missing_basic_category / total_places:.2f}% |
| Missing `taxonomy_primary` | {missing_taxonomy_primary:,} | {100.0 * missing_taxonomy_primary / total_places:.2f}% |
| Missing coordinates (`lon` or `lat` null) | {missing_coordinates:,} | {100.0 * missing_coordinates / total_places:.2f}% |
| Invalid coordinates (outside WGS84 range) | {invalid_coordinates:,} | {100.0 * invalid_coordinates / total_places:.2f}% |

### Geographic Extent (EPSG:4326)
- **Longitude:** `{min_lon:.6f}°E` to `{max_lon:.6f}°E`
- **Latitude:** `{min_lat:.6f}°N` to `{max_lat:.6f}°N`

---

## 3. Confidence Distribution

| Statistic | Value |
| --- | ---: |
| Minimum | {c_min:.4f} |
| 25th Percentile (P25) | {c_p25:.4f} |
| Median (P50) | {c_p50:.4f} |
| Mean | {c_avg:.4f} |
| 75th Percentile (P75) | {c_p75:.4f} |
| Maximum | {c_max:.4f} |

| Confidence Band | Records | Share |
| --- | ---: | ---: |
| `< 0.40` | {c_lt04:,} | {100.0 * c_lt04 / total_places:.2f}% |
| `0.40 – 0.69` | {c_04_07:,} | {100.0 * c_04_07 / total_places:.2f}% |
| `0.70 – 0.89` | {c_07_09:,} | {100.0 * c_07_09 / total_places:.2f}% |
| `>= 0.90` | {c_ge09:,} | {100.0 * c_ge09 / total_places:.2f}% |

---

## 4. Duplicate Identifiers & Suspected Duplicates

Raw records are preserved intact; suspected duplicates are **not** automatically deleted.

- **Duplicate `overture_id` values:** `{duplicate_overture_ids:,}`
- **Suspected duplicate clusters (all places — identical normalized name + coordinates rounded to 4 decimals, ~11 m):** `{dup_groups:,}` groups (`{dup_excess:,}` excess records)
- **Suspected duplicate clusters (cafes & coffee shops subset):** `{cafe_dup_groups:,}` groups (`{cafe_dup_excess:,}` excess records)

---

## 5. Classification Disagreements

Records where `basic_category != taxonomy_primary` (both non-null) are flagged via `classification_disagreement = true` rather than silently overridden.

- **All Hyderabad places with `basic_category != taxonomy_primary`:** `{total_disagreements:,}` (primarily reflects Overture's finer-grained `taxonomy_primary` specialisation relative to `basic_category`).
- **Cafes & coffee shops subset disagreements:** `{cafe_disagreements:,}` records (`basic_category = 'cafe'` vs `taxonomy_primary = 'internet_cafe'`). These are retained and explicitly flagged so downstream analysts can decide whether to include or exclude internet cafes.

### Cafe & Coffee Shop Classification Breakdown

| `basic_category` | `taxonomy_primary` | Flagged Disagreement | Records |
| --- | --- | --- | ---: |
{cafe_rows}

---

## 6. Category Distribution

### Top-Level Taxonomy (`taxonomy_root`)

| Taxonomy Root | Records | Share |
| --- | ---: | ---: |
{root_rows}

### Food & Drink Breakdown (`hyderabad_food_businesses.parquet`)

| `basic_category` | Records | Share of Food |
| --- | ---: | ---: |
{food_rows}

---

## 7. Source Provenance & Licence

Observed primary source records in Overture `properties.sources[0]`:

| Source Dataset | Licence | Records |
| --- | --- | ---: |
{source_rows}
"""

    REPORT_PATH.write_text(report_md, encoding="utf-8")
    return manifest


if __name__ == "__main__":
    result = build_curated_outputs_and_reports()
    print(json.dumps(result["record_counts"], indent=2))
