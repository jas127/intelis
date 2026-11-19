from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    service: str
    version: str
    environment: str
    datasets_ready: bool
    missing_datasets: list[str] = Field(default_factory=list)
    timestamp: datetime
