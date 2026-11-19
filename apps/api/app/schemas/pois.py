from typing import Literal

from pydantic import BaseModel, Field


class GeoJSONPoint(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]


class POIProperties(BaseModel):
    overture_id: str
    primary_name: str | None = None
    basic_category: str | None = None
    taxonomy_primary: str | None = None
    confidence: float | None = None
    address: str | None = None
    locality: str | None = None
    postcode: str | None = None
    website: str | None = None
    phone: str | None = None
    operating_status: str | None = None
    classification_disagreement: bool = False
    classification_disagreement_note: str | None = None


class POIFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    geometry: GeoJSONPoint
    properties: POIProperties


class POICollectionMeta(BaseModel):
    city: str
    category: str
    total_matching: int
    returned: int
    limit: int
    offset: int
    bbox: tuple[float, float, float, float] | None = None


class POIFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[POIFeature]
    metadata: POICollectionMeta


class CategoryBreakdownItem(BaseModel):
    category: str
    count: int
    share_pct: float


class DataCoverageMetadata(BaseModel):
    source_provider: str
    crs: str
    processed_at_utc: str | None = None
    missing_category_count: int
    cafe_classification_disagreements: int
    geographic_extent: dict[str, float] = Field(default_factory=dict)


class CitySummaryResponse(BaseModel):
    city: str
    total_places: int
    cafes_coffee_shops_count: int
    restaurant_count: int
    food_business_count: int
    category_breakdown: list[CategoryBreakdownItem]
    food_category_breakdown: list[CategoryBreakdownItem]
    data_coverage: DataCoverageMetadata
