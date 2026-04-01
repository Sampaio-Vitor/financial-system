from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_admin_user, get_current_user
from app.models.settings import UserSettings
from app.models.user import User
from app.services.price_service import PriceService

router = APIRouter()


@router.post("/update")
async def update_prices(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_admin_user),
):
    service = PriceService(db, user)
    results = await service.update_all_prices()
    return results


@router.get("/context")
async def get_price_context(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    settings = result.scalar_one_or_none()
    return {
        "usd_brl_rate": float(settings.usd_brl_rate) if settings else None,
        "rate_updated_at": settings.rate_updated_at if settings else None,
    }
