from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.rebalancing import RebalancingResponse
from app.services.rebalancing_service import RebalancingService

router = APIRouter()


@router.get("", response_model=RebalancingResponse)
async def get_rebalancing(
    contribution: Decimal = Query(..., description="Monthly contribution in BRL"),
    top_n: int = Query(10, description="Number of top assets to include"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    service = RebalancingService(db, user)
    return await service.calculate(contribution, top_n)
