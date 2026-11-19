# Intelis Data Pipelines

Standalone Python data-engineering package for ingesting, cleaning, spatially joining, and validating real geographic and business datasets into Parquet / GeoParquet artefacts.

## Design Rule

Code in `pipelines/` is **never** imported by `apps/api` route handlers. Pipelines run offline or on a schedule and write validated artefacts to `data/processed/` alongside provenance records in `data/manifests/`.

## Planned Phase 2 Scope

- Hyderabad administrative / ward boundaries (GeoParquet)
- Hyderabad cafes & coffee shops POI extraction from real public sources (e.g., OpenStreetMap / Overture Maps)
- DuckDB + Pandas spatial aggregation and data-quality validation
