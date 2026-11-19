from fastapi import APIRouter, HTTPException, Query

from app.schemas.opportunities import (
    OpportunitiesListResponse,
    OpportunityDetailResponse,
    SensitivityResponse,
)
from app.schemas.pois import CitySummaryResponse, POIFeatureCollection
from app.schemas.zones import (
    ZoneDetailResponse,
    ZonesCompareResponse,
    ZonesFeatureCollection,
)
from app.services.h3_zones_service import (
    compare_hyderabad_zones,
    get_hyderabad_zone_detail,
    get_hyderabad_zones,
)
from app.services.hyderabad_service import (
    DatasetUnavailableError,
    get_hyderabad_pois,
    get_hyderabad_summary,
)
from app.services.opportunity_service import (
    get_hyderabad_opportunities,
    get_hyderabad_opportunity_detail,
    get_hyderabad_sensitivity,
    validate_weights,
)

router = APIRouter(prefix="/cities/hyderabad", tags=["hyderabad"])


def _parse_bbox(raw_bbox: str | None) -> tuple[float, float, float, float] | None:
    if raw_bbox is None or not raw_bbox.strip():
        return None
    parts = [p.strip() for p in raw_bbox.split(",")]
    if len(parts) != 4:
        raise HTTPException(
            status_code=400,
            detail="bbox must contain 4 comma-separated floats: min_lon,min_lat,max_lon,max_lat",
        )
    try:
        min_lon, min_lat, max_lon, max_lat = (float(p) for p in parts)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="bbox values must be valid numbers.",
        ) from exc

    if min_lon > max_lon or min_lat > max_lat:
        raise HTTPException(
            status_code=400,
            detail="bbox min coordinates must be less than or equal to max coordinates.",
        )
    return (min_lon, min_lat, max_lon, max_lat)


@router.get(
    "/pois",
    response_model=POIFeatureCollection,
    summary="Hyderabad POIs as GeoJSON FeatureCollection",
)
def list_hyderabad_pois(
    category: str = Query(
        default="cafes-coffee-shops",
        description="Category filter (e.g. cafes-coffee-shops, cafe, coffee_shop, restaurants, food-businesses, all)",
    ),
    bbox: str | None = Query(
        default=None,
        description="Optional bounding box filter: min_lon,min_lat,max_lon,max_lat",
    ),
    limit: int = Query(default=1500, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    exclude_disagreements: bool = Query(
        default=False,
        description="Exclude records flagged with basic_category vs taxonomy_primary disagreements",
    ),
) -> POIFeatureCollection:
    parsed_bbox = _parse_bbox(bbox)
    try:
        return get_hyderabad_pois(
            category=category,
            bbox=parsed_bbox,
            limit=limit,
            offset=offset,
            exclude_disagreements=exclude_disagreements,
        )
    except DatasetUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/summary",
    response_model=CitySummaryResponse,
    summary="Verified Hyderabad Overture Places summary metrics",
)
def get_summary() -> CitySummaryResponse:
    try:
        return get_hyderabad_summary()
    except DatasetUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/zones",
    response_model=ZonesFeatureCollection,
    summary="Hyderabad H3 resolution 8 hexagonal zones with verified metrics",
)
def list_hyderabad_zones(
    category: str = Query(default="cafes-coffee-shops"),
    metric: str = Query(
        default="cafe_density_per_km2",
        description="Metric used for ordering/choropleth display",
    ),
    bbox: str | None = Query(
        default=None,
        description="Optional bounding box filter: min_lon,min_lat,max_lon,max_lat",
    ),
    limit: int = Query(default=1000, ge=1, le=1500),
) -> ZonesFeatureCollection:
    parsed_bbox = _parse_bbox(bbox)
    try:
        return get_hyderabad_zones(
            category=category,
            metric=metric,
            bbox=parsed_bbox,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DatasetUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/zones/{h3_index}",
    response_model=ZoneDetailResponse,
    summary="Individual H3 cell metrics and associated cafe records",
)
def get_zone_detail(h3_index: str) -> ZoneDetailResponse:
    try:
        detail = get_hyderabad_zone_detail(h3_index)
    except DatasetUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if detail is None:
        raise HTTPException(
            status_code=404,
            detail=f"H3 cell '{h3_index}' was not found in the Hyderabad study area.",
        )
    return detail


@router.get(
    "/compare",
    response_model=ZonesCompareResponse,
    summary="Compare up to three Hyderabad H3 zones side by side",
)
def compare_zones(
    zone_ids: str = Query(
        ...,
        description="Comma-separated list of 1 to 3 H3 cell indices",
    ),
) -> ZonesCompareResponse:
    parsed_ids = []
    for raw in zone_ids.split(","):
        cleaned = raw.strip()
        if cleaned and cleaned not in parsed_ids:
            parsed_ids.append(cleaned)

    if not parsed_ids:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one H3 cell index in zone_ids.",
        )
    if len(parsed_ids) > 3:
        raise HTTPException(
            status_code=400,
            detail="A maximum of 3 H3 zones can be compared at once.",
        )

    try:
        result, missing = compare_hyderabad_zones(parsed_ids)
    except DatasetUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown H3 cell(s) for Hyderabad study area: {', '.join(missing)}",
        )
    return result


@router.get(
    "/opportunities",
    response_model=OpportunitiesListResponse,
    summary="Ranked exploratory market screening candidates for Hyderabad",
)
def list_hyderabad_opportunities(
    w_competition: float = Query(default=40.0, ge=0.0, le=100.0),
    w_food_context: float = Query(default=35.0, ge=0.0, le=100.0),
    w_reliability: float = Query(default=25.0, ge=0.0, le=100.0),
    min_places: int = Query(default=5, ge=1, le=500),
    min_completeness_pct: float = Query(default=0.0, ge=0.0, le=100.0),
    limit: int = Query(default=10, ge=1, le=100),
    sort_by: str = Query(default="exploration_score"),
    include_ineligible: bool = Query(default=False),
) -> OpportunitiesListResponse:
    try:
        weights = validate_weights(w_competition, w_food_context, w_reliability)
        return get_hyderabad_opportunities(
            weights=weights,
            min_places=min_places,
            min_completeness_pct=min_completeness_pct,
            limit=limit,
            sort_by=sort_by,
            include_ineligible=include_ineligible,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DatasetUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/opportunities/sensitivity",
    response_model=SensitivityResponse,
    summary="Compare top candidate rankings across default, equal, and custom weights",
)
def get_opportunities_sensitivity(
    w_competition: float = Query(default=55.0, ge=0.0, le=100.0),
    w_food_context: float = Query(default=30.0, ge=0.0, le=100.0),
    w_reliability: float = Query(default=15.0, ge=0.0, le=100.0),
    min_places: int = Query(default=5, ge=1, le=500),
    min_completeness_pct: float = Query(default=0.0, ge=0.0, le=100.0),
    top_n: int = Query(default=10, ge=3, le=25),
) -> SensitivityResponse:
    try:
        custom = validate_weights(w_competition, w_food_context, w_reliability)
        return get_hyderabad_sensitivity(
            custom_weights=custom,
            min_places=min_places,
            min_completeness_pct=min_completeness_pct,
            top_n=top_n,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DatasetUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/opportunities/{h3_index}",
    response_model=OpportunityDetailResponse,
    summary="Full Exploratory Market Screening Score breakdown for a single H3 cell",
)
def get_opportunity_detail(
    h3_index: str,
    w_competition: float = Query(default=40.0, ge=0.0, le=100.0),
    w_food_context: float = Query(default=35.0, ge=0.0, le=100.0),
    w_reliability: float = Query(default=25.0, ge=0.0, le=100.0),
    min_places: int = Query(default=5, ge=1, le=500),
    min_completeness_pct: float = Query(default=0.0, ge=0.0, le=100.0),
) -> OpportunityDetailResponse:
    try:
        weights = validate_weights(w_competition, w_food_context, w_reliability)
        detail = get_hyderabad_opportunity_detail(
            h3_index,
            weights=weights,
            min_places=min_places,
            min_completeness_pct=min_completeness_pct,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DatasetUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if detail is None:
        raise HTTPException(
            status_code=404,
            detail=f"H3 cell '{h3_index}' was not found in the Hyderabad study area.",
        )
    return detail
