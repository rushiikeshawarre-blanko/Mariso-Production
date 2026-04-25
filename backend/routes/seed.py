from fastapi import APIRouter
from services.seed_service import seed_database

router = APIRouter(prefix="/api", tags=["seeds"])

@router.post("/seed", response_model=dict)
async def seed_route():
    """Run development seed data setup."""
    return await seed_database()