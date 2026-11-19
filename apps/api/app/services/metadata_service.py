from app.core.config import settings
from app.schemas.metadata import (
    CategoryMetadata,
    CityMetadata,
    MapViewport,
    MetadataResponse,
)


def get_platform_metadata() -> MetadataResponse:
    """Return supported city and business category configuration."""
    cafes_parquet = settings.data_processed_dir / "hyderabad_cafes_coffee_shops.parquet"
    data_status = "ready" if cafes_parquet.exists() else "awaiting_ingestion"

    cities = [
        CityMetadata(
            slug="hyderabad",
            name="Hyderabad",
            state="Telangana",
            country="India",
            status="active",
            viewport=MapViewport(
                center=(78.4867, 17.3850),
                zoom=11.4,
                bbox=(78.2002, 17.2000, 78.7000, 17.6000),
            ),
            data_status=data_status,
        ),
    ]

    categories = [
        CategoryMetadata(
            slug="cafes-coffee-shops",
            name="Cafes & Coffee Shops",
            description=(
                "Specialty coffee roasters, neighbourhood cafes, and quick-service "
                "coffee outlets classified in Overture Places."
            ),
            status="active",
            accent="cobalt",
        ),
        CategoryMetadata(
            slug="restaurants",
            name="Restaurants",
            description=(
                "Full-service and dine-in restaurants across the Hyderabad metro area."
            ),
            status="active",
            accent="coral",
        ),
        CategoryMetadata(
            slug="food-businesses",
            name="All Food & Drink",
            description=(
                "Complete food and beverage ecosystem including cafes, restaurants, "
                "casual eateries, bars, and juice bars."
            ),
            status="active",
            accent="orange",
        ),
    ]

    return MetadataResponse(
        product="Intelis",
        tagline="The Market, Understood.",
        default_city="hyderabad",
        default_category="cafes-coffee-shops",
        cities=cities,
        categories=categories,
    )
