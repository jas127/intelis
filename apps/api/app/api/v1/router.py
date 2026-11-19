from fastapi import APIRouter

from app.api.v1.routes import cities, health, metadata

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(metadata.router)
api_router.include_router(cities.router)
