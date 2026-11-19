import json
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[4]

REQUIRED_RUNTIME_DATASETS = (
    "hyderabad_all_places.parquet",
    "hyderabad_food_businesses.parquet",
    "hyderabad_cafes_coffee_shops.parquet",
    "hyderabad_h3_cells.geojson",
    "hyderabad_h3_metrics.parquet",
    "hyderabad_h3_pois.parquet",
)


class Settings(BaseSettings):
    app_name: str = "Intelis API"
    app_version: str = "0.5.0"
    env: str = "development"
    api_v1_prefix: str = "/api/v1"
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    data_processed_dir: Path = REPO_ROOT / "data" / "processed"
    data_manifests_dir: Path = REPO_ROOT / "data" / "manifests"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> list[str]:
        if isinstance(value, list):
            return [str(v).strip() for v in value if str(v).strip()]
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            if raw.startswith("["):
                parsed = json.loads(raw)
                return [str(v).strip() for v in parsed if str(v).strip()]
            return [part.strip() for part in raw.split(",") if part.strip()]
        return []

    model_config = SettingsConfigDict(
        env_prefix="INTELIS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
