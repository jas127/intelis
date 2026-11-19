from datetime import UTC, datetime

from fastapi import APIRouter

from app.core.config import REQUIRED_RUNTIME_DATASETS, settings
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, summary="Service health check")
def get_health() -> HealthResponse:
    missing = [
        name
        for name in REQUIRED_RUNTIME_DATASETS
        if not (settings.data_processed_dir / name).exists()
    ]
    datasets_ready = len(missing) == 0
    return HealthResponse(
        status="ok" if datasets_ready else "degraded",
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.env,
        datasets_ready=datasets_ready,
        missing_datasets=missing,
        timestamp=datetime.now(UTC),
    )
