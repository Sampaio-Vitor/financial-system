from datetime import datetime, date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.financial_reserve import FinancialReserveEntry, FinancialReserveTarget
from app.models.user import User
from app.schemas.financial_reserve import (
    FinancialReserveCreate,
    FinancialReserveResponse,
    FinancialReserveMonthValue,
    FinancialReserveTargetUpdate,
    FinancialReserveTargetResponse,
)

router = APIRouter()


async def get_reserve_for_month(
    db: AsyncSession, user_id: int, year: int, month: int
) -> FinancialReserveEntry | None:
    """Get the last reserve entry recorded on or before the end of the given month."""
    if month == 12:
        month_end = datetime(year + 1, 1, 1)
    else:
        month_end = datetime(year, month + 1, 1)

    result = await db.execute(
        select(FinancialReserveEntry)
        .where(
            FinancialReserveEntry.user_id == user_id,
            FinancialReserveEntry.recorded_at < month_end,
        )
        .order_by(FinancialReserveEntry.recorded_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.get("", response_model=FinancialReserveMonthValue)
async def get_reserve_value(
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    if not month:
        month = now.strftime("%Y-%m")

    year, m = int(month[:4]), int(month[5:7])
    entry = await get_reserve_for_month(db, user.id, year, m)

    return FinancialReserveMonthValue(
        month=month,
        amount=entry.amount if entry else None,
        entry=FinancialReserveResponse.model_validate(entry) if entry else None,
    )


@router.get("/history", response_model=list[FinancialReserveResponse])
async def list_reserve_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FinancialReserveEntry)
        .where(FinancialReserveEntry.user_id == user.id)
        .order_by(FinancialReserveEntry.recorded_at.desc())
    )
    return [FinancialReserveResponse.model_validate(e) for e in result.scalars().all()]


@router.post("", response_model=FinancialReserveResponse, status_code=status.HTTP_201_CREATED)
async def create_reserve_entry(
    data: FinancialReserveCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = FinancialReserveEntry(
        user_id=user.id,
        amount=data.amount,
        note=data.note,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return FinancialReserveResponse.model_validate(entry)


@router.get("/target", response_model=FinancialReserveTargetResponse)
async def get_reserve_target(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FinancialReserveTarget).where(FinancialReserveTarget.user_id == user.id)
    )
    target = result.scalar_one_or_none()
    return FinancialReserveTargetResponse(
        target_amount=target.target_amount if target else None
    )


@router.put("/target", response_model=FinancialReserveTargetResponse)
async def set_reserve_target(
    data: FinancialReserveTargetUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FinancialReserveTarget).where(FinancialReserveTarget.user_id == user.id)
    )
    target = result.scalar_one_or_none()
    if target:
        target.target_amount = data.target_amount
    else:
        target = FinancialReserveTarget(user_id=user.id, target_amount=data.target_amount)
        db.add(target)
    await db.commit()
    await db.refresh(target)
    return FinancialReserveTargetResponse(target_amount=target.target_amount)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reserve_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(FinancialReserveEntry).where(
            FinancialReserveEntry.id == entry_id,
            FinancialReserveEntry.user_id == user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Reserve entry not found")

    await db.delete(entry)
    await db.commit()
