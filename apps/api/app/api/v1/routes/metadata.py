from fastapi import APIRouter

from app.schemas.metadata import MetadataResponse
from app.services.metadata_service import get_platform_metadata

router = APIRouter(tags=["metadata"])


@router.get(
    "/metadata",
    response_model=MetadataResponse,
    summary="Supported cities and business categories",
)
def get_metadata() -> MetadataResponse:
    return get_platform_metadata()
