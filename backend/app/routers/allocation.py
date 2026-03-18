from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.allocation_target import AllocationTarget
from app.models.user import User
from app.schemas.allocation import AllocationTargetsUpdate, AllocationTargetResponse

router = APIRouter()


@router.get("", response_model=list[AllocationTargetResponse])
async def get_allocation_targets(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(AllocationTarget).where(AllocationTarget.user_id == user.id)
    )
    return result.scalars().all()


@router.put("", response_model=list[AllocationTargetResponse])
async def update_allocation_targets(
    data: AllocationTargetsUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    total = sum(t.target_pct for t in data.targets)
    if abs(total - Decimal("1.0")) > Decimal("0.001"):
        raise HTTPException(status_code=422, detail=f"Allocation targets must sum to 100% (got {total * 100}%)")

    # Delete existing targets for user
    result = await db.execute(
        select(AllocationTarget).where(AllocationTarget.user_id == user.id)
    )
    for existing in result.scalars().all():
        await db.delete(existing)

    # Create new targets
    new_targets = []
    for t in data.targets:
        target = AllocationTarget(user_id=user.id, asset_class=t.asset_class, target_pct=t.target_pct)
        db.add(target)
        new_targets.append(target)

    await db.commit()
    return new_targets
