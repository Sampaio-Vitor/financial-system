from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.services.price_service import PriceService

router = APIRouter()


@router.post("/update")
async def update_prices(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = PriceService(db, user)
    results = await service.update_all_prices()
    return results
