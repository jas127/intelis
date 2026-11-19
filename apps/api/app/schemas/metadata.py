from typing import Literal

from pydantic import BaseModel, Field


class MapViewport(BaseModel):
    center: tuple[float, float] = Field(
        ..., description="Initial map center as [longitude, latitude] in EPSG:4326"
    )
    zoom: float = Field(..., description="Default MapLibre zoom level")
    bbox: tuple[float, float, float, float] = Field(
        ..., description="City bounding box [minLon, minLat, maxLon, maxLat]"
    )


class CityMetadata(BaseModel):
    slug: str
    name: str
    state: str
    country: str
    status: Literal["active", "planned"]
    viewport: MapViewport
    data_status: Literal["awaiting_ingestion", "ready"]


class CategoryMetadata(BaseModel):
    slug: str
    name: str
    description: str
    status: Literal["active", "planned"]
    accent: Literal["cobalt", "coral", "orange", "lavender", "green"]


class MetadataResponse(BaseModel):
    product: str
    tagline: str
    default_city: str
    default_category: str
    cities: list[CityMetadata]
    categories: list[CategoryMetadata]
