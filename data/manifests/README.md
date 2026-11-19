# Data Manifests

Every real dataset ingested into Intelis must have a tracked provenance manifest in this directory (JSON or YAML) recording:

- Dataset name and provider
- Source URL and license
- Retrieval timestamp
- Geographic scope and CRS
- Transformation script version and notes

No raw data files are committed to Git; manifests ensure every processed Parquet/GeoParquet artefact in `data/processed/` is reproducible and auditable.
