# Intelis — Production Deployment Guide

This guide documents how to deploy **Intelis — The Market, Understood.** as a public portfolio web application with:
- **Frontend (`apps/web`):** Vercel (Next.js App Router)
- **Backend (`apps/api`):** Render (or Railway) Python Web Service (FastAPI + DuckDB)
- **Curated Runtime Data:** ~17.4 MB of pre-processed Parquet & GeoJSON files (no PostgreSQL, Docker, or raw 190 MB GeoJSON required in production).

---

## 1. Production Runtime Data Inventory

The FastAPI backend reads **only** the following curated files at runtime (via DuckDB and JSON):

| Required File | Size | Used By |
| --- | ---: | --- |
| `data/processed/hyderabad_all_places.parquet` | 14.46 MB | `/summary`, `/pois?category=all` |
| `data/processed/hyderabad_food_businesses.parquet` | 901 KB | `/summary`, `/pois?category=restaurants\|food-businesses` |
| `data/processed/hyderabad_cafes_coffee_shops.parquet` | 100 KB | `/metadata`, `/summary`, `/pois?category=cafes-coffee-shops` |
| `data/processed/hyderabad_h3_cells.geojson` | 980 KB | `/zones` |
| `data/processed/hyderabad_h3_metrics.parquet` | 74 KB | `/zones/{id}`, `/compare`, `/opportunities*` |
| `data/processed/hyderabad_h3_pois.parquet` | 896 KB | `/zones/{id}` |
| `data/manifests/overture_hyderabad.json` & `h3_hyderabad.json` | 4.5 KB | Provenance timestamps & boundary metadata |

**Total runtime data footprint:** **~17.4 MB**.

### Files Excluded from Production
- `data/raw/*` (190 MB raw Overture GeoJSON + raw GHMC files) — **never** deployed or committed to Git.
- `data/processed/*.csv` — offline audit reports, not queried by the API.

### Hosting Strategy for Curated Data
Because `data/processed/*` is gitignored by default to keep repositories clean, choose one of two explicit strategies when deploying the backend:
1. **Release Asset / Object Storage Fetch at Build Time (Recommended):** Upload a zipped `intelis-hyderabad-data-v1.tar.gz` (~17 MB) to a GitHub Release or Cloudflare R2 bucket, and extract it into `data/processed/` during the backend host's build command (`curl -fsSL <URL> | tar -xz -C data/processed`).
2. **Scoped Git LFS / Dedicated Data Branch:** Track only the 6 curated files (~17.4 MB total) if you prefer zero external storage dependencies.

---

## 2. Backend Deployment (Render / Railway)

### Recommended Provider: Render Web Service (Python)
- **Root Directory:** Repository root (so `data/processed` and `apps/api` resolve cleanly) or `apps/api` with `INTELIS_DATA_PROCESSED_DIR` set explicitly.
- **Python Version:** `3.12` (set `PYTHON_VERSION=3.12.8` in Render env vars for fastest wheel installs).
- **Build Command:**
  ```bash
  pip install ./apps/api
  ```
- **Start Command:**
  ```bash
  uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --port ${PORT:-8000} --workers 2
  ```
- **Health Check Path:** `/api/v1/health`  
  Returns `status: "ok"` and `datasets_ready: true` when all 6 curated files are readable, or `status: "degraded"` listing any `missing_datasets`.

### Backend Environment Variables

| Variable | Example Value | Required |
| --- | --- | --- |
| `INTELIS_ENV` | `production` | Yes |
| `INTELIS_CORS_ORIGINS` | `https://intelis.vercel.app` | Yes (comma-separated or JSON array) |
| `INTELIS_DATA_PROCESSED_DIR` | `/opt/render/project/src/data/processed` | Optional (if not using default relative path) |
| `INTELIS_DATA_MANIFESTS_DIR` | `/opt/render/project/src/data/manifests` | Optional |

---

## 3. Frontend Deployment (Vercel)

1. Import the GitHub repository in Vercel.
2. Set **Root Directory** to `apps/web`.
3. Framework Preset: **Next.js** (auto-detected).
4. Set Frontend Environment Variables:

| Variable | Example Value | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `https://intelis-api.onrender.com` | Yes (no trailing slash) |
| `NEXT_PUBLIC_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/positron` | Optional (defaults to OpenFreeMap Positron light style) |

5. Deploy, then copy the final Vercel domain (e.g., `https://intelis.vercel.app`) into the backend's `INTELIS_CORS_ORIGINS` variable and redeploy the backend.

---

## 4. Post-Deployment Verification Checklist

1. `GET https://<api-host>/api/v1/health` → `200 OK`, `"status": "ok"`, `"datasets_ready": true`.
2. `GET https://<api-host>/api/v1/cities/hyderabad/summary` → `200 OK`, `"total_places": 159323`, `"cafes_coffee_shops_count": 1237`.
3. `GET https://<api-host>/api/v1/cities/hyderabad/opportunities?limit=10` → `200 OK`, 10 ranked H3 cells.
4. Open `https://<vercel-host>`:
   - Header badge shows **API Connected** (green).
   - **Explore (`/`)**: H3 choropleth & Businesses clusters render on Hyderabad; clicking a cell/marker populates the inspector.
   - **Intelligence (`/intelligence`)**: Weight sliders recalculate Top 10 shortlist & sensitivity table; **Open on Map** flies to the chosen hexagon.
   - **Compare (`/compare`)**: Side-by-side table and 3 ECharts visualisations render cleanly.
   - **Methodology (`/methodology`)**: Loads cleanly with zero console errors.

---

## 5. Cost & Free-Tier Considerations

- **Vercel Hobby Tier (\$0/month):** Suitable for personal/portfolio demos (non-commercial use; generous bandwidth & edge CDN).
- **Render Free Web Service (\$0/month):** Spins down after ~15 minutes of inactivity, causing 30–50 second cold starts on the first API request; 512 MB RAM (sufficient for DuckDB queries over our 14.5 MB Parquet files). Upgrading to Render **Starter (~\$7/month)** eliminates cold starts for live interviews/demos.
- **OpenFreeMap Basemap (\$0/month):** Free public vector tiles for MapLibre GL JS with no API key required; subject to fair-use rate limits.
