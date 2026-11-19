import json
import os
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

REQUIRED_RUNTIME_DATASETS = (
    "hyderabad_all_places.parquet",
    "hyderabad_food_businesses.parquet",
    "hyderabad_cafes_coffee_shops.parquet",
    "hyderabad_h3_cells.geojson",
    "hyderabad_h3_metrics.parquet",
    "hyderabad_h3_pois.parquet",
)


def _find_repo_data_dir(sub: str) -> Path:
    # 1. Check if explicitly set via environment variable
    env_override = os.getenv(f"INTELIS_DATA_{sub.upper()}_DIR")
    if env_override:
        return Path(env_override).resolve()

    # 2. Search upward in directory tree from this file
    config_file = Path(__file__).resolve()
    for parent in config_file.parents:
        cand = parent / "data" / sub
        if cand.is_dir():
            return cand

    # 3. Search upward from current working directory
    cwd = Path.cwd().resolve()
    for parent in [cwd, *cwd.parents]:
        cand = parent / "data" / sub
        if cand.is_dir():
            return cand

    # 4. Check standard Render cloud deployment directory (/opt/render/project/src/data/...)
    for r_base in [Path("/opt/render/project/src"), Path("/opt/render/project")]:
        cand = r_base / "data" / sub
        if cand.is_dir():
            return cand

    # Default fallback to 4 levels up
    return (
        config_file.parents[4] / "data" / sub
        if len(config_file.parents) > 4
        else config_file.parent / "data" / sub
    )


class Settings(BaseSettings):
    app_name: str = "Intelis API"
    app_version: str = "0.5.0"
    env: str = "development"
    api_v1_prefix: str = "/api/v1"
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*",
    ]
    data_processed_dir: Path = _find_repo_data_dir("processed")
    data_manifests_dir: Path = _find_repo_data_dir("manifests")

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
