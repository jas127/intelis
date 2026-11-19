from pathlib import Path

from app.core.config import settings
from app.main import app
from app.services import hyderabad_service
from fastapi.testclient import TestClient

client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "Intelis API"
    assert payload["datasets_ready"] is True
    assert payload["missing_datasets"] == []
    assert "timestamp" in payload


def test_cors_origins_comma_separated_parsing() -> None:
    from app.core.config import Settings

    s = Settings(cors_origins="https://intelis.vercel.app, http://localhost:3000")
    assert s.cors_origins == ["https://intelis.vercel.app", "http://localhost:3000"]


def test_metadata_endpoint() -> None:
    response = client.get("/api/v1/metadata")
    assert response.status_code == 200
    payload = response.json()
    assert payload["product"] == "Intelis"
    assert payload["default_city"] == "hyderabad"
    assert payload["default_category"] == "cafes-coffee-shops"
    assert payload["cities"][0]["slug"] == "hyderabad"
    assert payload["cities"][0]["data_status"] == "ready"
    category_slugs = [c["slug"] for c in payload["categories"]]
    assert "cafes-coffee-shops" in category_slugs
    assert "restaurants" in category_slugs


def test_hyderabad_summary_endpoint() -> None:
    response = client.get("/api/v1/cities/hyderabad/summary")
    assert response.status_code == 200
    payload = response.json()
    assert payload["city"] == "hyderabad"
    assert payload["total_places"] == 159323
    assert payload["cafes_coffee_shops_count"] == 1237
    assert payload["restaurant_count"] == 6764
    assert payload["food_business_count"] == 12097
    assert len(payload["category_breakdown"]) > 0
    assert payload["data_coverage"]["cafe_classification_disagreements"] == 55


def test_hyderabad_pois_cafes_and_pagination() -> None:
    response = client.get(
        "/api/v1/cities/hyderabad/pois?category=cafes-coffee-shops&limit=25&offset=0"
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["type"] == "FeatureCollection"
    assert payload["metadata"]["total_matching"] == 1237
    assert payload["metadata"]["returned"] == 25
    assert len(payload["features"]) == 25

    first = payload["features"][0]
    assert first["type"] == "Feature"
    assert first["geometry"]["type"] == "Point"
    assert len(first["geometry"]["coordinates"]) == 2
    assert first["properties"]["overture_id"]
    assert first["properties"]["basic_category"] in ("cafe", "coffee_shop")


def test_hyderabad_pois_bbox_and_disagreement_filter() -> None:
    # Central Hyderabad bbox (Jubilee Hills / Banjara Hills / Madhapur area)
    response = client.get(
        "/api/v1/cities/hyderabad/pois"
        "?category=cafes-coffee-shops&bbox=78.38,17.40,78.46,17.46&limit=500"
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["metadata"]["total_matching"] > 0
    assert payload["metadata"]["total_matching"] < 1237
    for feat in payload["features"]:
        lon, lat = feat["geometry"]["coordinates"]
        assert 78.38 <= lon <= 78.46
        assert 17.40 <= lat <= 17.46

    filtered = client.get(
        "/api/v1/cities/hyderabad/pois"
        "?category=cafes-coffee-shops&exclude_disagreements=true&limit=10"
    )
    assert filtered.status_code == 200
    assert filtered.json()["metadata"]["total_matching"] == 1237 - 55


def test_hyderabad_pois_invalid_bbox_returns_400() -> None:
    response = client.get("/api/v1/cities/hyderabad/pois?bbox=invalid")
    assert response.status_code == 400


def test_missing_dataset_returns_503(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(settings, "data_processed_dir", tmp_path)
    hyderabad_service._SUMMARY_CACHE.clear()

    pois_resp = client.get("/api/v1/cities/hyderabad/pois")
    assert pois_resp.status_code == 503

    summary_resp = client.get("/api/v1/cities/hyderabad/summary")
    assert summary_resp.status_code == 503


def test_hyderabad_zones_endpoint() -> None:
    response = client.get(
        "/api/v1/cities/hyderabad/zones?metric=cafe_density_per_km2&limit=1000"
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["type"] == "FeatureCollection"
    assert payload["metadata"]["total_matching"] == 975
    assert payload["metadata"]["returned"] == 975
    assert payload["metadata"]["boundary_metadata"]["h3_resolution"] == 8
    assert "2018" in payload["metadata"]["boundary_metadata"]["vintage_warning"]

    top_feature = payload["features"][0]
    assert top_feature["type"] == "Feature"
    assert top_feature["properties"]["cafe_density_per_km2"] > 0


def test_hyderabad_zone_detail_and_compare_endpoints() -> None:
    zones_resp = client.get("/api/v1/cities/hyderabad/zones?limit=3")
    assert zones_resp.status_code == 200
    top_ids = [f["id"] for f in zones_resp.json()["features"]]
    assert len(top_ids) == 3

    detail_resp = client.get(f"/api/v1/cities/hyderabad/zones/{top_ids[0]}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["zone"]["h3_index"] == top_ids[0]
    assert len(detail["cafes"]) == detail["zone"]["cafe_count"]

    compare_resp = client.get(
        f"/api/v1/cities/hyderabad/compare?zone_ids={','.join(top_ids)}"
    )
    assert compare_resp.status_code == 200
    comp = compare_resp.json()
    assert len(comp["zones"]) == 3
    assert comp["benchmarks"]["reliable_cells_count"] == 878
    assert len(comp["warnings"]) >= 2

    # Error handling checks
    too_many = client.get(
        f"/api/v1/cities/hyderabad/compare?zone_ids={','.join(top_ids)},extra_cell"
    )
    assert too_many.status_code == 400

    unknown = client.get("/api/v1/cities/hyderabad/zones/not_a_real_h3_cell")
    assert unknown.status_code == 404
