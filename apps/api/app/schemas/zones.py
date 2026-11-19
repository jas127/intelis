from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.pois import POIProperties


class BoundaryVintageMetadata(BaseModel):
    source_file: str
    osm_id: str | None = None
    osm_timestamp: str | None = None
    vintage_warning: str
    h3_resolution: int
    projected_crs: str
    min_reliable_area_km2: float


class ZoneMetrics(BaseModel):
    h3_index: str
    resolution: int
    centroid_lon: float
    centroid_lat: float
    dominant_postcode: str | None = None
    dominant_locality: str | None = None
    full_area_km2: float
    clipped_area_km2: float
    area_coverage_pct: float
    low_area_flag: bool
    total_places_count: int
    cafe_count: int
    restaurant_count: int
    food_business_count: int
    cafe_density_per_km2: float | None = None
    food_density_per_km2: float | None = None
    median_nearest_cafe_distance_m: float | None = None
    median_confidence: float | None = None
    high_confidence_count: int
    high_confidence_pct: float | None = None
    data_completeness_pct: float | None = None
    cafe_disagreement_count: int
    exploration_score: float | None = None
    competition_whitespace_score: float | None = None
    food_context_score: float | None = None
    data_reliability_score: float | None = None


class ZoneGeoJSONFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    geometry: dict[str, Any]
    properties: ZoneMetrics


class ZonesCollectionMeta(BaseModel):
    city: str
    category: str
    metric: str
    total_matching: int
    returned: int
    limit: int
    bbox: tuple[float, float, float, float] | None = None
    boundary_metadata: BoundaryVintageMetadata


class ZonesFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[ZoneGeoJSONFeature]
    metadata: ZonesCollectionMeta


class ZoneBusinessItem(POIProperties):
    longitude: float
    latitude: float
    is_food_business: bool
    is_cafe_or_coffee_shop: bool
    nearest_cafe_distance_m: float | None = None


class ZoneDetailResponse(BaseModel):
    city: str
    zone: ZoneMetrics
    cafes: list[ZoneBusinessItem]
    other_food_businesses_count: int
    boundary_metadata: BoundaryVintageMetadata


class CompareBenchmarks(BaseModel):
    reliable_cells_count: int
    median_cafe_density_per_km2: float | None = None
    median_food_density_per_km2: float | None = None
    median_nearest_cafe_distance_m: float | None = None


class ZonesCompareResponse(BaseModel):
    city: str
    zones: list[ZoneMetrics]
    benchmarks: CompareBenchmarks
    warnings: list[str] = Field(default_factory=list)
    boundary_metadata: BoundaryVintageMetadata
